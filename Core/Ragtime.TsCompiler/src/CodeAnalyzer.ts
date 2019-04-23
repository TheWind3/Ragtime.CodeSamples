import ts = require("typescript");
import { Compiler } from "./Compiler";
import { BuildError } from "./BuildError";
import { Manifest } from "./Manifest";
import { FormExplorer } from "./FormExplorer";
import { WidgetExplorer } from "./WidgetExplorer";
import { ReportExplorer } from "./ReportExplorer";
import { CommandExplorer } from "./CommandExplorer";
import { VisualizerExplorer } from "./VisualizerExplorer";
import { ClassInfoExplorer } from "./ClassInfoExplorer";
import { ContentFilesExplorer } from "./ContenFilesExplorer";
import { RegistryExplorer } from "./RegistryExporer";
import { getModifiedTime } from "./Utils";


export class CodeAnalyzer {
  private _compiler: Compiler;
  private _success: boolean;

  constructor(compiler: Compiler) {
    this._compiler = compiler;
  }

  run(): boolean {
    this._success = true;
    for(let file of this._compiler.sourceFiles) {
      this.exploreFile(file);
    }
    return this._success;
  }

  private get checker() { return this._compiler.checker; }

  private exploreFile(fileName: string): void {
    if(fileName.toLowerCase().startsWith("node_modules"))
      return;

    var manifestFileName = "obj\\.ragtime\\" + fileName + ".manifest";
    if(ts.sys.fileExists(manifestFileName)) {
      let sourceFileDate = getModifiedTime(fileName);
      let manifestFileDate = getModifiedTime(manifestFileName);
      if(manifestFileDate > sourceFileDate) 
        return;
    }

    let file = this._compiler.program.getSourceFile(fileName);
    if(file == null)
      return;

    let manifest: Manifest = {};

    let formExplorer = new FormExplorer(this._compiler, fileName);
    let widgetExplorer = new WidgetExplorer(this._compiler, fileName);
    let reportExplorer = new ReportExplorer(this._compiler, fileName);
    let commandExplorer = new CommandExplorer(this._compiler, fileName);
    let visualizerExplorer = new VisualizerExplorer(this._compiler, fileName);
    let itemModelExplorer = new ClassInfoExplorer(this._compiler, fileName, "ITEM_MODEL");
    let itemFormExtensionExplorer = new ClassInfoExplorer(this._compiler, fileName, "ITEM_FORM_EXTENSION");
    let contentFilesExplorer = new ContentFilesExplorer(this._compiler, fileName);
    let registryExplorer = new RegistryExplorer(this._compiler, fileName);

    function exploreNodes(nodes: ts.NodeArray<ts.Statement>, parentNames: string[]) {
      for(let node of nodes || []) {
        manifest.forms = add(manifest.forms, formExplorer.run(node, parentNames));
        manifest.widgets = add(manifest.widgets, widgetExplorer.run(node));
        manifest.reportHandlers = add(manifest.reportHandlers, reportExplorer.run(node));
        manifest.commands = add(manifest.commands, commandExplorer.run(node));
        manifest.visualizers = add(manifest.visualizers, visualizerExplorer.run(node, parentNames));
        manifest.itemModels = add(manifest.itemModels, itemModelExplorer.run(node));
        manifest.itemFormExtensions = add(manifest.itemFormExtensions, itemFormExtensionExplorer.run(node));
        manifest.contentFiles = add(manifest.contentFiles, contentFilesExplorer.run(node));
        manifest.taggedClasses = addMany(manifest.taggedClasses, registryExplorer.run(node, parentNames));

        if(node.kind == ts.SyntaxKind.ModuleDeclaration) {
          let moduleDeclaration = node as ts.ModuleDeclaration;
          let body = moduleDeclaration.body as ts.ModuleBlock;
          if(body.kind == ts.SyntaxKind.ModuleBlock)
            exploreNodes(body.statements, [...parentNames, moduleDeclaration.name.text]);
        }
      }
    }

    exploreNodes(file.statements, []);
    var hasErrors
      = formExplorer.hasErrors 
      || widgetExplorer.hasErrors 
      || reportExplorer.hasErrors 
      || commandExplorer.hasErrors
      || itemModelExplorer.hasErrors
      || itemFormExtensionExplorer.hasErrors
      || contentFilesExplorer.hasErrors
      || registryExplorer.hasErrors
    ;
    if(hasErrors)
      this._success = false;

    manifest.files = add(manifest.files, { name: fileName, isModule: ts.isExternalModule(file) });
    ts.sys.writeFile(manifestFileName, JSON.stringify(manifest, null, 2));
  }
}


/** Добавляем элемент к массиву. Создаем, если надо, массив и возвращаем его */
function add<T>(data: T[], item: T): T[] {
  if(item) {
    data = data || [];
    data.push(item);
  }
  return data;
}

/** Добавляем элементы к массиву. Создаем, если надо, массив и возвращаем его */
function addMany<T>(data: T[], items: T[]): T[] {
  if(items && items.length) {
    data = data || [];
    data.push(...items);
  }
  return data;
}
