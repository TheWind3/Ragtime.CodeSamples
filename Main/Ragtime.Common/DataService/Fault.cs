namespace Ragtime.DataService {
  using Newtonsoft.Json;


  /// <summary>Информация об ошибке на сервере</summary>
  public class Fault {

    /// <summary>Текст сообщения</summary>
    [JsonProperty("message")]
    public string Message;

    /// <summary>Дополнительные сведения</summary>
    [JsonProperty("details", NullValueHandling = NullValueHandling.Ignore)]
    public string Details;

    /// <summary>Внутренняя ошибка или предназначена пользователю ?</summary>
    [JsonProperty("isInternal")]
    public bool IsInternal;

    /// <summary>Код ошибки</summary>
    [JsonProperty("errorId", NullValueHandling = NullValueHandling.Ignore)]
    public string ErrorId;
  }
}
