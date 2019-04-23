namespace Ragtime.DevTool {
  using System;
  using System.IO;
  using System.Linq;
  using System.Collections.Generic;
  using System.Xml.Serialization;
  using System.Threading.Tasks;


  /// <summary>Обработчик: генерация WhatsNew</summary>
  public class GenerateWhatsNewManifest : BuildTask {
    public override string Name => "generate-whatsnew-manifest";

    protected override async Task Execute() {
      var pfItems = await GetItems();
      var whatsNew = new List<Unit.WhatsNewItem>();
      foreach(var pfItem in pfItems) {
        var item = new Unit.WhatsNewItem {
          Id       = pfItem.Id,
          Product  = pfItem.Product,
          Categoty = pfItem.Category,
          Title    = pfItem.Title,
          Text     = pfItem.Text,
        };
        if(pfItem.Tasks == null || pfItem.Tasks.Length == 0)
          item.Date = DateTime.Now;
        else {
          item.Date  = pfItem.Tasks.Select(_ => _.Date).OrderByDescending(_ => _).First();
          item.Tasks = pfItem.Tasks.Select(_ => _.Id).ToArray();
        }
        whatsNew.Add(item);
      }

      var filePath = Path.Combine(Project.ObjDirectory, Project.Name + ".manifest-whats-new");
      await new TextFile<Unit.Manifest>(Project, filePath).Write(new Unit.Manifest { WhatsNew = whatsNew.ToArray() });
    }

    /// <summary>Запрашиваем информацию у ПФ</summary>
    private async Task<ItemDto[]> GetItems() {
      var client = await ProductFactory.WhatsNewService.Connect();
      var xml = (await client.GetItemsAsync(Options.Site)).Body.@return;
      var result = new XmlSerializer(typeof(ResultDto)).Deserialize(new StringReader(xml)) as ResultDto;
      return result?.Items ?? new ItemDto[0];
    }


#pragma warning disable 0649
    [XmlRoot("GetItemsResult")]
    public class ResultDto {
      [XmlElement("Item")]
      public ItemDto[] Items;
    }

    public class ItemDto {

      [XmlAttribute]
      public string Id;

      [XmlElement("Task")]
      public TaskDto[] Tasks;

      [XmlElement]
      public string Product;

      [XmlElement]
      public string Category;

      [XmlElement]
      public string Title;

      [XmlElement]
      public string Text;
    }

    public class TaskDto {
      [XmlAttribute]
      public string Id;

      [XmlAttribute]
      public DateTime Date;
    }
  }
#pragma warning restore 0649
}
