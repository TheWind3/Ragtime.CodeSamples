namespace Ragtime.DevTool {
  using System.IO;
  using System.Collections.Generic;
  using System.Linq;


  /// <summary>Работа с внутренним файлом коммитов</summary>
  public class CommitsFile {

    /// <summary>Возвращаем путь к файлу. Файл не обязан существовать</summary>
    public static string GetPath() { 
      return Path.Combine(Project.Current.ObjDirectory, Project.Current.Name + ".manifest-commits");
    }

    /// <summary>Возвращаем Id последнего commit-а, или null</summary>
    public static string GetLastCommitId() {
      var filePath = GetPath();
      if(!File.Exists(filePath))
        return null;

      string lastLine = null;
      using(var fs = File.OpenRead(filePath)) {
        byte b;
        fs.Position = fs.Length;
        while(fs.Position > 0) {
          fs.Position--;
          b = (byte)fs.ReadByte();
          if(b == '\n')
            break;
          fs.Position--;
        }
        byte[] bytes = new byte[fs.Length - fs.Position];
        fs.Read(bytes, 0, bytes.Length);
        lastLine = System.Text.Encoding.UTF8.GetString(bytes);
      }

      return ParseLine(lastLine)?.Id;
    }

    /// <summary>Добавляем в конец файла указанные элементы. Возвращаем true, если файл изменился</summary>
    public static bool Append(IEnumerable<Item> commits) {
      if(commits == null)
        return false;

      var modified = false;
      using(var fs = new FileStream(GetPath(), FileMode.Append))
      using(var file = new StreamWriter(fs)) {
        foreach(var commit in commits) {
          modified = true;
          file.WriteLine();
          file.Write(commit.Id); file.Write(",");
          file.Write(commit.Date); file.Write(",");
          file.Write(commit.TaskId);
        }
      }
      return modified;
    }

    /// <summary>Возвращаем фрагмент манифеста, или null</summary>
    public static Ragtime.Unit.Commit[] GetCommits() {
      var path = GetPath();
      if(!File.Exists(path))
        return null;
      return File.ReadLines(path).Select(ParseLine).Where(_ => _ != null).ToArray();
    }

    /// <summary>Парсим строку файла *.manifest-commits, или null</summary>
    private static Item ParseLine(string value) {
      var parts = value?.Split(',') ?? new string[3];
      if(string.IsNullOrWhiteSpace(parts[0]))
        return null;
      else {
        return new CommitsFile.Item {
          Id = parts[0],
          Date = parts[1],
          TaskId = parts[2],
        };
      }
    }

    public class Item : Ragtime.Unit.Commit {
      public string Id;
    }
  }
}