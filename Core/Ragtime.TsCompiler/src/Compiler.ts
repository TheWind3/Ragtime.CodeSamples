import ts = require("typescript");
import { Options } from "./Options";
import { BuildError } from "./BuildError";
import { defined } from "./Utils";

export class Compiler {

  constructor(options: Options) {
    this.projectDirectory = options.scalar("project-directory");
    this.unitName = options.scalar("unit-name");
    this.objDirectory = options.scalar("obj");
    this.outputDirectory = options.scalar("output");
    this.metadataFiles = options.list("metadata");
    this.sourceFiles = options.list("sources");

    let compilerOptions = this.createOptions();
    this.rootDirectory = compilerOptions.rootDir;
    this.program = ts.createProgram(this.sourceFiles, compilerOptions);
    this.checker = this.program.getTypeChecker();
  }

  /** Директория проекта */
  readonly projectDirectory: string;

  /** Корневая директория ts-файлов */
  readonly rootDirectory: string;

  /** Имя Ragtime-unit-а */
  readonly unitName: string;

  /** Директория результатов компиляции */
  readonly outputDirectory: string;

  /** Директория obj */
  readonly objDirectory: string;

  /** Список файлов метаданных */
  readonly metadataFiles: string[];

  /** Список исходный файлов */
  readonly sourceFiles: string[];

  public readonly program: ts.Program;
  public readonly checker: ts.TypeChecker;

  /** Проверяем код до генерации */
  preEmit(): boolean {
    return this.processDiagnostics(ts.getPreEmitDiagnostics(this.program));
  }

  /** Генерируем код */
  emit(): boolean {
    let result = this.program.emit();
    return this.processDiagnostics(result.diagnostics);
  }

  /** Формируем опции ts-компилятора */

  private createOptions(): ts.CompilerOptions {
    let parseConfigHost: ts.ParseConfigHost = {
      useCaseSensitiveFileNames: false,
      readDirectory: (rootDir: string, extensions: ReadonlyArray<string>, excludes: ReadonlyArray<string> | undefined, includes: ReadonlyArray<string>, depth?: number) => [""],
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
    };

    let result = ts.parseJsonSourceFileConfigFileContent(ts.parseJsonText("tsconfig.json", ts.sys.readFile("tsconfig.json")), parseConfigHost, this.projectDirectory).options;

    function ifNotDefined(option: any, value: any) {
      if(option === null || option === undefined)
        return value;
      else
        return option;
    }

    result.jsx = ts.JsxEmit.React;
    result.outDir = this.outputDirectory;
    result.noEmitOnError = true;
    result.moduleResolution = ts.ModuleResolutionKind.NodeJs;
    result.noEmit = false;
    result.experimentalDecorators = true;

    result.rootDir = ifNotDefined(result.rootDir, this.projectDirectory);
    result.module = ifNotDefined(result.module, ts.ModuleKind.ESNext);
    result.target = ifNotDefined(result.target, ts.ScriptTarget.ES2017);
    result.noFallthroughCasesInSwitch = ifNotDefined(result.noFallthroughCasesInSwitch, true);
    result.noImplicitAny = ifNotDefined(result.noImplicitAny, true);
    result.noImplicitReturns = ifNotDefined(result.noImplicitReturns, true);
    result.allowUnreachableCode = ifNotDefined(result.allowUnreachableCode, true);
    result.skipDefaultLibCheck = ifNotDefined(result.skipDefaultLibCheck, true);
    result.skipLibCheck = ifNotDefined(result.skipLibCheck, true);
    result.noEmitHelpers = ifNotDefined(result.noEmitHelpers, true);
    result.importHelpers = ifNotDefined(result.importHelpers, true);
    result.experimentalDecorators = ifNotDefined(result.experimentalDecorators, true);
    result.allowJs = ifNotDefined(result.allowJs, false);
    result.checkJs = ifNotDefined(result.checkJs, false);
    result.allowUnreachableCode = ifNotDefined(result.allowUnreachableCode, true);
    result.alwaysStrict = ifNotDefined(result.alwaysStrict, true);

    return result;
  }

  /** Обработка диагностики. Возвращаем false, если встретились ошибки */
  private processDiagnostics(diagnostics: Iterable<ts.Diagnostic>): boolean {
    let result = true;
    for(let d of diagnostics || []) {
      let message = new BuildError();

      message.category = ts.DiagnosticCategory[d.category];
      message.text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      message.code = d.code.toString();

      if(d.file) {
        let { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        message.origin = d.file.fileName;
        let position: string;
        if(defined(line)) {
          position = (line + 1).toString();
          if(defined(character))
            position = position + "," + (character + 1);
        }
        if(position)
          message.origin = message.origin + `(${position})`;
      }

      if(d.category == ts.DiagnosticCategory.Error)
        result = false;
      message.report();
    }
    return result;
  }
}
