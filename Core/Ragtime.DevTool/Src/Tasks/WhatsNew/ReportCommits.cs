namespace Ragtime.DevTool {
  using System.Xml.Serialization;
  using System.Collections.Generic;
  using System.Linq;
  using System.Threading.Tasks;
  using System.IO;


  /// <summary>Обработчик: отсылаем информацию о коммитах в WhatsNew</summary>
  public class ReportCommits : BuildTask {
    public override string Name => "report-commits";

    protected override async Task Execute() {
      var @params = new ParamsDto {
        Site    = new SiteDto { Url = Options.Site, Description = Options.SiteDescription, Interactive = Options.SiteInteractive },
        Product = new ProductDto { Description = $"{Options.Product} {Options.Version}" },
        Tasks   = GetTasks(),
      };
      await Send(@params);
    }

    /// <summary>Конструируем список задач, которые надо отправить в ПФ</summary>
    private TaskDto[] GetTasks() {
      var tasks = new List<TaskDto>();
      tasks.AddRange(CommitsFile.GetCommits().Select(TaskDto.FromCommit));
      foreach(var unit in Project.GetReferencedUnits()) {
        var commits = unit.Manifest?.Commits;
        if(commits != null)
          tasks.AddRange(commits.Select(TaskDto.FromCommit));
      }

      // Если одна и та же задача участвовала в нескольких коммитах, в результат попадет самая последняя
      var result = new Dictionary<string, TaskDto>();
      foreach(var task in tasks.OrderBy(_ => _.Date))
        result[task.Id] = task;
      return result.Values.ToArray();
    }

    /// <summary>Отправляем результат в ПФ</summary>
    private async Task Send(ParamsDto @params) {
      var client = await ProductFactory.WhatsNewService.Connect();
      using(var writer = new StringWriter()) {
        new XmlSerializer(typeof(ParamsDto)).Serialize(writer, @params);
        await client.SetDataAsync(writer.ToString());
      }
    }


    [XmlRoot("SetDataParams")]
    public class ParamsDto {
      public SiteDto Site;

      public ProductDto Product;

      [XmlElement("Task")]
      public TaskDto[]  Tasks;
    }

    public class ProductDto {
      [XmlAttribute]
      public string Description;
    }

    public class SiteDto {
      [XmlAttribute]
      public string Url;

      [XmlAttribute]
      public string Description;

      [XmlAttribute]
      public bool Interactive;
    }

    public class TaskDto {
      [XmlAttribute]
      public string Id;

      [XmlAttribute]
      public string Date;

      public static TaskDto FromCommit(Ragtime.Unit.Commit c) => new TaskDto { Id = c.TaskId, Date = c.Date };
    }
  }
}
