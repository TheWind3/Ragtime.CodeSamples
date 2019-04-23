namespace Ragtime.DevTool {
  using System;
  using System.IO;
  using static Ragtime.Utils;


  public partial class Program {
    public static Program Current;

    public static int Main(string[] args) {
      Current = new Program();
      return Current.Run(args);
    }

    private int Run(string[] args) {
      Success = true;

      try {
        if(args.Length == 0)
          throw new BuildError("Имя файла параметров не указано");
        var optionsFile = new FileInfo(args[0]);
        if(!optionsFile.Exists)
          throw new BuildError($"Файл не найден: {optionsFile.FullName}");

        Options = Options.Create(optionsFile, args);

        if(Options.Has("project")) { 
          Project.Current = new Project(
            path:              Options.Mandatory("project"),
            assemblyPath:      Options.Optional("assembly"),
            objDirectory:      Options.Mandatory("obj"),
            references:        Options.References,
            projectReferences: Options.List("project-references"),
            packageReferences: Options.PackageReferences,
            debug:             Options.Debug
          );
        }

        OutputFileBase = Path.ChangeExtension(optionsFile.FullName, null) + ".output";
        Log.SetFile(Path.ChangeExtension(optionsFile.FullName, ".log"));

        Clean(optionsFile.Directory);
        foreach(var action in Options.Actions) {
          switch(action) {

            case "unit-before-compile":
              if(CheckReferences()) {
                Run<PrepareGenerated>();
                Run<CodeAnalisys>();
                Run<GenerateCs>();
                Run<CollectResourceRefs>();
              }
              break;

            case "unit-after-compile":
              if(CheckReferences()) {
                Run<GenerateTs>();
                Run<GenerateMetadataManifests>();
                Run<ExtractDecorators>();
                Run<PrepareTs>();
                if(Run<CompileTs>().Modified) {
                  Run<ComposeTsOutput>();
                  Run<PostBuildTs>();
                }
                Run<CompileResources>();
                Run<CompileDocumentation>();

                if(Options.ReportCommits) {
                  Run<AnalyzeCommits>();
                  Run<ReportCommits>();
                }

                if(Options.GetWhatsNew)
                  Run<GenerateWhatsNewManifest>();

                Run<ComposeUnitManifest>();
                Run<CopyReferencedExtrafiles>();
                Run<StoreContentFiles>();
              }
              break;

            case "before-clean":
              Run<BeforeClean>();
              break;

            case "web-after-build":
              if(CheckReferences()) {
                if(Options.ReportCommits) {
                  Run<AnalyzeCommits>();
                  Run<ReportCommits>();
                }
                if(Options.GetWhatsNew)
                  Run<GenerateWhatsNewManifest>();
                Run<ComposeUnitManifest>();
                Run<ComposeWebApplication>();
              }
              break;

            case "desktop-after-build":
              if(CheckReferences()) {
                Run<ComposeUnitManifest>();
                Run<ComposeDesktopApplication>();
              }
              break;

            case "db-before-compile":
              if(CheckReferences()) {
                Run<GenerateDb>();
                Run<ComposeUnitManifest>();
              }
              break;
          }
        }
      }

      catch(Exception e) {
        Success = false;
        HandleError(e);
      }

      finally {
        Project.Current.Close();
        Project.Current = null;
        Log.Write();
      }

      return Success ? 0 : 1;
    }

    private void HandleError(Exception e) {
      switch(e) {
        case AggregateException x:
          x.Handle(_ => {
            HandleError(_);
            return true;
          });
          break;

        case BuildError x:
          ReportError(x);
          break;

        default:
          HandleError(new BuildError(e));
          break;
      }
    }

    private void Clean(DirectoryInfo directory) {
      var pattern = Path.GetFileName(OutputFileBase) + ".*";
      foreach(var file in directory.GetFiles(pattern)) 
        DeleteFile(file.FullName);
    }

    /// <summary>Проверяем, что все references существуют</summary>
    private bool CheckReferences() {
      foreach(var fileName in Options.References) {
        if(!File.Exists(fileName)) {
          Log.Add("CheckCanRun()", $"False. File not found: {fileName}");
          return false;
        }
      }
      return true;
    }

    /// <summary>Выполняем обработчик</summary>
    private T Run<T>() where T: BuildTask, new() {
      if(!Success)
        return null;

      var task = new T();
      try {
        if(!task.Run())
          Success = false;
        return task;
      }
      catch {
        Success = false;
        throw;
      }
    }

    /// <summary>Опции</summary>
    public Options Options { get; private set; }

    /// <summary>Полное имя output-файла без расширения</summary>
    public string OutputFileBase { get; private set; }

    /// <summary>Директория программы</summary>
    public string Directory => Cached(ref _Directory, () => Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location));
    private string _Directory;

    /// <summary>Возвращаем полный путь к файлу из директории программы</summary>
    public string GetFilePath(string name) => Path.Combine(Directory, name);

    /// <summary>Возвращаем содержимое файла из директории программы</summary>
    public string GetFileText(string name) => File.ReadAllText(GetFilePath(name));

    /// <summary>Выводим сообщение об ошибке</summary>
    public void ReportError(BuildError x) {
      if(!x.HasOrigin)
        x.Origin = "Ragtime.Unit built tool";
      if(x.Category == null)
        x.Category = "Error";
      if(x.Text == null)
        x.Text = "Произошла неожиданная ошибка";
      Console.Error.WriteLine(x.ToString());
      Log.Add("ERROR", $"{x.ToString()}\n{x.Details}");
    }

    private bool Success;
  }
}
