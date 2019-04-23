namespace Ragtime.DevTool {
  using System;
  using System.Collections.Generic;
  using System.IO;
  using IO = System.IO;
  using System.Linq;
  using static Ragtime.Utils;


  /// <summary>Опции программы</summary>
  public class Options {

    /// <summary>Если true, то мы строим приложение (то есть то, что будем запускать)</summary>
    public bool Application { get; private set; }

    /// <summary>Главный модуль приложения</summary>
    public string TsMain { get; private set; }

    /// <summary>Список запрошенных действий</summary>
    public string[] Actions { get; private set; }

    /// <summary>Список сборок, на которые мы ссылаемся</summary>
    public string[] References { get; private set; }

    /// <summary>Список пакетов, на которые мы ссылаемся</summary>
    public string[] PackageReferences { get; private set; }

    /// <summary>Файлы метаданных</summary>
    public MetadataFile[] MetadataFiles => Cached(ref _MetadataFiles, () => List("metadata").Select(_ => new MetadataFile(Project.Current, _)).ToArray());
    private MetadataFile[] _MetadataFiles;

    /// <summary>C#-исходники</summary>
    public List<PermanentFile> Compile {
      get => Cached(ref _Compile, () => List("compile").Select(_ => new PermanentFile(Project.Current, _)).ToList());
      set => _Compile = value;
    }
    private List<PermanentFile> _Compile;

    /// <summary>TS-исходники</summary>
    public List<PermanentFile> TypescriptCompile {
      get => Cached(ref _TypescriptCompile, () => List("typescript-compile").Select(_ => new PermanentFile(Project.Current, _)).ToList());
      set => _TypescriptCompile = value;
    }
    private List<PermanentFile> _TypescriptCompile;

    /// <summary>Исходные файлы документации</summary>
    public List<PermanentFile> DocumentationFiles {
      get => Cached(ref _DocFiles, () => List("documentation").Select(_ => new PermanentFile(Project.Current, _)).ToList());
      set => _DocFiles = value;
    }
    private List<PermanentFile> _DocFiles;

    /// <summary>Файлы дополнительных ветвей иерархии документации</summary>
    public List<PermanentFile> HierarchyFiles {
      get => Cached(ref _HierarchyFiles, () => List("hierarchy").Select(_ => new PermanentFile(Project.Current, _)).ToList());
      set => _HierarchyFiles = value;
    }
    private List<PermanentFile> _HierarchyFiles;

    /// <summary>Список Content</summary>
    public string[] Content { get; private set; }

    /// <summary>Директория результатов компиляции (необязательно)</summary>
    public string TsOutput { get; private set; }

    /// <summary>Признак работы в режиме отладки</summary>
    public bool Debug;

    /// <summary>Построение в режиме релиза?</summary>
    public bool ReleaseBuild;

    /// <summary>Продукт</summary>
    public string Product;

    /// <summary>Версия приложения</summary>
    public string Version;

    /// <summary>Площадка развертывания</summary>
    public string Site;

    /// <summary>Описание площадки развертывания</summary>
    public string SiteDescription;

    /// <summary>Площадки развертывания - интерактивна? Веб-приложение, например, интерактивно</summary>
    public bool SiteInteractive;

    /// <summary>Отсылать ли в багтрекер информацию о закрытых задачах</summary>
    public bool ReportCommits;

    /// <summary>Запрашивать ли у багтрекера WhatsNew</summary>
    public bool GetWhatsNew;

    /// <summary>Сырые значения</summary>
    private Dictionary<string, string[]> _Data;

    /// <summary>Возвращаем скалярное значение обязательной опции</summary>
    public string Mandatory(string name) {
      if(!_Data.TryGetValue(name, out var result) || result.Length == 0)
        throw new Exception($"Not found: {name}");
      return result[0];
    }

    /// <summary>Возвращаем скалярное значение необязательной опции</summary>
    public string Optional(string name) {
      if(!_Data.TryGetValue(name, out var result) || result.Length == 0)
        return null;
      else
        return result[0];
    }

    /// <summary>Возвращаем скалярное значение необязательной опции</summary>
    public bool OptionalBool(string name) {
      if(!_Data.TryGetValue(name, out var result) || result.Length == 0)
        return false;
      else
        return result[0].eq("true");
    }


    /// <summary>Возвращаем массив значений необязательной опции. Никогда не null</summary>
    public string[] List(string name) {
      if(!_Data.TryGetValue(name, out var result))
        result = new string[0];
      return result;
    }

    /// <summary>Значение опции существует?</summary>
    public bool Has(string name) => _Data.ContainsKey(name);


    /// <summary>Читаем опции из файла</summary>
    public static Options Create(FileInfo file, string[] args) {

      var debug = false;
      if(args.Length > 1 && args[1].ToLower() == "debug")
        debug = true;

      var result = new Options();
      result._Data = Parse(IO.File.ReadAllLines(file.FullName)).ToDictionary(_ => _.Name, _ => _.Values, StringComparer.InvariantCultureIgnoreCase);

      result.Debug = debug;
      result.ReleaseBuild = result.Optional("configuration").eq("release");

      result.Application       = result.OptionalBool("application");
      result.Actions           = result.List("action");
      result.References        = result.List("references");
      result.PackageReferences = result.List("package-references");

      // Список Content - это только "прямые" файлы, без учета ссылок (link)
      result.Content = result.List("content");

      result.TsOutput = result.Optional("ts-output");
      result.TsMain   = result.Optional("ts-main");

      result.Product = result.Optional("product");
      result.Version = result.Optional("version");
      result.Site = result.Optional("site");
      result.SiteDescription = result.Optional("site-description");
      result.SiteInteractive = result.OptionalBool("site-interactive");
      result.ReportCommits = result.OptionalBool("report-commits");
      result.GetWhatsNew = result.OptionalBool("get-whats-new");

      return result;

      // Читаем содержимое файла, возвращаем пары (ИмяОпции: СтрокиЗначения)
      IEnumerable<(string Name, string[] Values)> Parse(IEnumerable<string> lines) {
        string name = null;
        var values = new List<string>();
        foreach(var line in lines.Select(_ => _.Trim())) {
          if(line.StartsWith("--")) {
            if(name != null)
              yield return (name, values.ToArray());
            name = line.Substring(2).ToLower();
            values = new List<string>();
          }
          else {
            if(line != "")
              values.Add(line);
          }
        }
        if(name != null)
          yield return (name, values.ToArray());
      }
    }
  }
}
