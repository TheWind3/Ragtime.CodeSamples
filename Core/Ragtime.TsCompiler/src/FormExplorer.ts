import ts = require("typescript");
import { Compiler } from "./Compiler";
import { Form } from "./Manifest";
import { BuildError } from "./BuildError";
import { isExported, isAbstract, isClassLike, getPropValue, getTsName } from "./Utils";

/** Попробовать выяснить роль этой формы, имея один из классов-предков. Нерекурсивно */
function roleByDeclaration(symbol: ts.Symbol): number | undefined {
  let implemenations = (ts as any).getClassImplementsHeritageClauseElements(symbol.declarations[0]) as ts.Node[];
  if(implemenations) {
    for(let interfaceRef of implemenations) {
      switch(interfaceRef.getText()) {
        case "FORM": return 0; // None
        case "ITEM_FORM": return 1; // Item
        case "LIST_FORM": return 2; // List
        case "LOOKUP_FORM": return 3; // Lookup
        case "FOLDER_FORM": return 4; // Folder
      }
    }
  }
}

/** Попробовать получить typeId, назначенный форме, имея один из классов-предков. Нерекурсивно */
function typeIdByDeclaration(type: ts.BaseType): string | undefined {
  for(let typeArg of(type as ts.TypeReference).typeArguments || []) {
    if(typeArg.flags & ts.TypeFlags.StringLiteral) {
      return (typeArg as ts.LiteralType).value as string;
    }
  }
}

/** Получить список всех базовых типов формы, от менее абстрактного к более абстрактному */
function formBaseTypes(type: ts.Type, result: ts.BaseType[] = []): ts.BaseType[] {
  if(!isClassLike(type))
    return result;
  let b = (type.getBaseTypes() || [])[0];
  if(!b)
    return result;
  result.push(b);
  return formBaseTypes(b, result);
}

/** Получить typeId, имея type формы */
export function formTypeId(type: ts.Type): string | undefined {
  return [type].concat(formBaseTypes(type)).map(typeIdByDeclaration).find(_ => !!_) || null;
}

export class FormExplorer {
  private readonly compiler: Compiler;
  private readonly fileName: string;
  private readonly moduleName: string;
  private result: Form;

  public hasErrors = false;

  constructor(compiler: Compiler, fileName: string) {
    this.compiler = compiler;
    this.fileName = fileName;
    this.moduleName = compiler.unitName + "/" + getTsName(fileName);
  }

  public run(node: ts.Statement, parentNames: string[]): Form {
    if(node.kind != ts.SyntaxKind.ClassDeclaration || !isExported(node) || isAbstract(node))
      return null;

    let formClass = node as ts.ClassDeclaration;
    let formSymbol = this.compiler.checker.getSymbolAtLocation(formClass.name);

    this.result = {
      moduleName: this.moduleName,
      className: [...parentNames, formClass.name.text].join("."),
      params: [],
    };

    this.exploreClass(node, formSymbol);

    if(this.result.role === undefined)
      return null;

    if(!this.result.path)
      this.result.path = this.moduleName + "/" + formClass.name.text;

    return this.result;
  }

  private exploreClass(node: ts.Node, symbol: ts.Symbol) {
    if(!symbol)
      return;
      
    if(this.result.role === undefined)
      this.result.role = roleByDeclaration(symbol);

    let type = this.compiler.checker.getDeclaredTypeOfSymbol(symbol);
    if(!isClassLike(type))
      return;

    // Исследуем информацию о наследовании
    let baseType = (type.getBaseTypes() || [])[0];
    if(baseType) {
      this.exploreClass(node, baseType.symbol);
      if(this.result.role === undefined)
        return;

      // Пытаемся получить TypeId
      if(!this.result.typeId)
        this.result.typeId = typeIdByDeclaration(baseType);
    }

    if(this.result.role === undefined)
      return;

    let pathSymbol = symbol.members.get("path" as ts.__String);
    if(pathSymbol) {
      let pathValue = getPropValue<string>(pathSymbol);
      if(!pathValue) {
        if(pathSymbol.valueDeclaration && pathSymbol.valueDeclaration.kind === ts.SyntaxKind.PropertyDeclaration) {
          let valueDeclaration = pathSymbol.valueDeclaration as ts.PropertyDeclaration;
          if(valueDeclaration.type && valueDeclaration.type.kind == ts.SyntaxKind.UnionType) {
            let typeDeclaration = valueDeclaration.type as ts.UnionOrIntersectionTypeNode;
            for(let itemType of typeDeclaration.types) {
              if(itemType.kind === ts.SyntaxKind.LiteralType) {
                pathValue = ((itemType as ts.LiteralTypeNode).literal as ts.StringLiteral).text;
                break;
              }
            }
          }
        }
      }
      if(pathValue)
        this.result.path = pathValue;
    }

    let prioritySymbol = symbol.members.get("priority" as ts.__String);
    if(!prioritySymbol) 
      this.result.priority = 0; // Да это сделано не случайно: приоритет не наследуется. Леонид Белоусов, 2016-ноя-30
    else
      this.result.priority = getPropValue(prioritySymbol, _ => parseInt(_));

    // Определяем параметры (params)
    let paramsSymbol = symbol.members.get("params" as ts.__String);
    if(paramsSymbol) {
      this.result.params = [];
      let paramsType = this.compiler.checker.getTypeAtLocation(paramsSymbol.valueDeclaration);
      let paramsMembers = paramsType.getSymbol().members;
      let memberNames = Array.from(paramsMembers.keys() as any) as ts.__String[];
      for(let memeberName of memberNames) {
        let paramSymbol = paramsMembers.get(memeberName);
        let location = ts.getLineAndCharacterOfPosition(node.getSourceFile(), paramSymbol.declarations[0].pos);
        let paramType = this.compiler.checker.getTypeOfSymbolAtLocation(paramSymbol, paramSymbol.valueDeclaration);
        let typeName = paramType ? this.compiler.checker.typeToString(paramType) : null;
        if(typeName.indexOf("KnockoutObservable<") < 0)
          this.error(`'params.${paramSymbol.name}' должен быть типа 'KnockoutObservable'`, location);
        if(typeName === "KnockoutObservable<Guid>")
          this.result.params.push({ name: paramSymbol.name, type: "Guid" });
        else if(typeName === "KnockoutObservable<boolean>")
          this.result.params.push({ name: paramSymbol.name, type: "boolean" });
        else if(typeName === "KnockoutObservable<number>")
          this.result.params.push({ name: paramSymbol.name, type: "number" });
        else if(typeName === "KnockoutObservable<string>")
          this.result.params.push({ name: paramSymbol.name, type: "string" });
        else {
          this.result.params.push({ name: paramSymbol.name, type: "any" });
          this.error(`'params.${paramSymbol.name}' имеет неверный тип. Допустимые типы: Guid|number|boolean|string.`, location);
        }
      }

      // Проверяем, что для заданных параметров существует правильный метод setParams
      let isGoodSetParams = false;
      let setParamsSymbol = symbol.members.get("setParams" as ts.__String);
      if(setParamsSymbol) {
        isGoodSetParams = true;
        if(setParamsSymbol.flags & ts.SymbolFlags.Method) {
          let declaration = setParamsSymbol.valueDeclaration as ts.MethodDeclaration;
          let iParam = 0;
          for(let param of declaration.parameters || []) {
            let paramTypeName: string = null;
            let paramType = this.compiler.checker.getTypeAtLocation(param.type);
            if(paramType.symbol && this.compiler.checker.getFullyQualifiedName(paramType.symbol) === "DevExpress.data.Guid")
              paramTypeName = "Guid";
            else if(paramType.flags & ts.TypeFlags.Boolean)
              paramTypeName = "boolean";
            else if(paramType.flags & ts.TypeFlags.NumberLike)
              paramTypeName = "number";
            else if(paramType.flags & ts.TypeFlags.StringLike)
              paramTypeName = "string";
            if(iParam >= this.result.params.length || paramTypeName != this.result.params[iParam].type)
              isGoodSetParams = false;
            iParam += 1;
          }
        }
      }
      if(!isGoodSetParams) {
        // TODO: влючить обратно
        //let location = ts.getLineAndCharacterOfPosition(node.getSourceFile(), symbol.declarations[0].pos);
        //errors.push({
        //  type: ts.DiagnosticCategory.Error,
        //  text: "setParams() method not found or has bad signature",
        //  file: file.name,
        //  line: location.line,
        //  col: location.character,
        //});
      }
    }
  }

  private error(text: string, location: ts.LineAndCharacter): void {
    BuildError.report(text, this.fileName, location);
    this.hasErrors = true;
  }
}
