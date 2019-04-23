/*
1. Этот файл разработан так, чтобы быть включенным непосредственно в клиентский проект. Он содержит все, чтобы избавить клиентский проект от лишних зависимостей.
2. Проект Ragtime не использует этот файл, просто компилирует, чтобы проверить хотя бы на дым.
*/
namespace Ragtime.DataService {
  using System;
  using System.Threading.Tasks;
  using System.Collections.Generic;
  using System.Net;
  using System.IO;
  using Newtonsoft.Json;
  using Newtonsoft.Json.Linq;
  using Newtonsoft.Json.Serialization;


  /// <summary>Клиент для доступа к веб-приложению Ragtime</summary>
  public partial class Client {


    /// <summary>Описание ошибки</summary>
    public class Fault {

      /// <summary>Сообщение</summary>
      [JsonProperty("message")]
      public string Message;

      /// <summary>Дополнительные сведения</summary>
      [JsonProperty("details")]
      public string Details;

      /// <summary>Внутренняя ошибка или предназначена пользователю?</summary>
      [JsonProperty("isInternal")]
      public bool IsInternal;

      /// <summary> Код ошибки </summary>
      [JsonProperty("errorId")]
      public string ErrorId;
    }


    /// <summary>Делегат событий</summary>
    public delegate void Notification();


    /// <summary>Ошибка вызова</summary>
    public class FaultException: Exception {
      public FaultException(Fault fault) : base(fault.Message) {
        Fault = fault;
      }

      /// <summary>Подробности ошибки</summary>
      public readonly Fault Fault;
    }

    public event Notification OnStartRequest;
    public event Notification OnEndRequest;


    /// <summary>Адрес сервера (без пути). Например, http://some-server.com</summary>
    public string ServerAddress {
      get { return _ServerAddress; }
      set {
        if(value != null) {
          value = value.Trim();
          while(value.EndsWith("/"))
            value = value.Substring(0, value.Length-1);
          if(value == "")
            value = null;
        }
        _ServerAddress = value;
      }
    }
    private string _ServerAddress;

    public string ProxyAddress;
    public string ProxyUserName;
    public string ProxyPassword;

    /// <summary>Идентификатор приложения. Генерируется автоматически, но можно задать и явно</summary>
    public Guid AppInstanceId;

    /// <summary>Токен авторизации</summary>
    public string User;

    /// <summary>Вызываем сервер</summary>
    public Task<T> Call<T>(string service, string method, object context, object args) {
      bool runNow;
      lock(_Lock) {
        runNow = _Batch == null;
        if(_Batch == null)
          BeginBatch();
        var result = NewCall<T>(service, method, context, args);
        if(runNow)
          Forget(SendBatch());
        return result;
      }
    }

    /// <summary>Вызываем сервер</summary>
    public Task<T> Call<T>(string service, string method, object args) {
      return Call<T>(service, method, null, args);
    }

    /// <summary>Вызываем сервер</summary>
    public Task Call(string service, string method, object context, object args) {
      return Call<object>(service, method, context, args);
    }

    /// <summary>Вызываем сервер</summary>
    public Task Call(string service, string method, object args) {
      return Call<object>(service, method, null, args);
    }

    /// <summary>Начинаем пакет. После вызоваэтого метода ни один вызов DataService-а не пойдет на сервер до момента вызова sendBatch</summary>
    public void BeginBatch() {
      if(_Batch == null)
        _Batch = new List<DataService.Client.CallDto>();
    }

    /// <summary>Отправляем накопленный пакет на сервер</summary>
    public async Task SendBatch() {
      Dictionary<int, Callback> callbacks;
      CallDto[] batch;

      lock(_Lock) {
        if(AppInstanceId == Guid.Empty)
          AppInstanceId = Guid.NewGuid();

        callbacks = _Callbacks;
        _Callbacks = new Dictionary<int, Callback>();

        batch = _Batch.ToArray();
        _Batch = null;
      }

      try {
        var httpRequest = CreateDataRequest();
        using(var stream = httpRequest.GetRequestStream())
        using(var sWriter = new StreamWriter(stream))
        using(var jWriter = new JsonTextWriter(sWriter)) {
          var request = new RequestDto() {
            timezoneOffset = -(int)DateTimeOffset.Now.Offset.TotalMinutes,
            appInstanceId  = AppInstanceId.ToString(),
            user           = User,
            items          = batch,
          };
          Serializer.Serialize(jWriter, request);
          jWriter.Flush();
        }

        HttpWebResponse response;
        OnStartRequest?.Invoke();
        try {
          response = await httpRequest.GetResponseAsync() as HttpWebResponse;
        }
        finally {
          OnEndRequest?.Invoke();
        }

        if(response.StatusCode != HttpStatusCode.OK) {
          var e = new Exception($"Сервер по адресу {ServerAddress} вернул ошибку {response.StatusCode}: {response.StatusDescription}");
          foreach(var id in callbacks.Keys) {
            callbacks[id].Answer.SetException(e);
            callbacks.Remove(id);
          }
        }

        using(var stream = response.GetResponseStream())
        using(var sReader = new StreamReader(stream))
        using(var jReader = new JsonTextReader(sReader)) {
          ParseResponse(JToken.ReadFrom(jReader) as JObject, callbacks);
        }
      }

      catch(Exception e) {
        foreach(var callback in callbacks.Values)
          callback.Answer.SetException(e);
      }

      finally {
        foreach(var callback in callbacks.Values) {
          // Этот код не должен исполняться: к этому моменту список callbacks должен быть пуст
          callback.Answer.SetException(new Exception("Неожиданная ошибка"));
        }
      }
    }

    /// <summary>Получаем поток указанного BLOB-а</summary>
    public async Task<Stream> GetBlob(Guid id) {
      var request = CreateBlobRequest(id);
      var response = await request.GetResponseAsync();
      return response.GetResponseStream();
    }

    /// <summary>Создаем новый запрос и помещаем его в список "list"</summary>
    private Task<T> NewCall<T>(string service, string method, object context, object args) {
      var call = new CallDto() {
        id      = _Callbacks.Count + 1,
        service = service,
        method  = method,
        context = context,
        args    = args,
      };
      _Batch.Add(call);

      var callback = new Callback<T>();
      _Callbacks[call.id] = callback;
      return callback.Result;
    }

    private HttpWebRequest CreateDataRequest() {
      if(ServerAddress == null)
        throw new Exception("Адрес сервера не указан");

      var result = WebRequest.Create(ServerAddress + "/$data") as HttpWebRequest;
      result.UserAgent = "Ragtime.DataService.Client";
      result.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
      result.Proxy = GetProxy();
      result.Timeout = 60 * 5 * 1000;
      result.Method = "POST";
      result.ContentType = "application/json; charset=utf-8";

      return result;
    }

    private HttpWebRequest CreateBlobRequest(Guid id) {
      if(ServerAddress == null)
        throw new Exception("Адрес сервера не указан");

      var result = WebRequest.Create($"{ServerAddress}/ragtime/blob?id={id}") as HttpWebRequest;
      result.UserAgent = "Ragtime.DataService.Client";
      result.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
      result.Proxy = GetProxy();
      result.Timeout = 60 * 5 * 1000;
      result.Method = "GET";

      return result;
    }

    private IWebProxy GetProxy() {
      if(_HasProxy == null) {
        if(ProxyAddress != null) {
          _HasProxy = true;
          _Proxy = new WebProxy(ProxyAddress);
          if(ProxyUserName != null)
            _Proxy.Credentials = new NetworkCredential(ProxyUserName, ProxyPassword);
        }
        else {
          _HasProxy = false;
          _Proxy = HttpWebRequest.DefaultWebProxy;
        }
      }
      return _Proxy;
    }
    private bool?     _HasProxy;
    private IWebProxy _Proxy;

    private void Forget(Task task) {
      // Ну да, ничего не делаем. Forget же...
    }

    private void ParseResponse(JObject root, Dictionary<int, Callback> callbacks) {
      if(root.TryGetValue("fault", out var jRootFault)) {
        var fault = jRootFault.ToObject<Fault>(Serializer);
        foreach(var callback in callbacks.Values)
          callback.Answer.SetException(new FaultException(fault));
        return;
      }

      root.TryGetValue("authenticated", out var authenticated);
      if(!(bool)authenticated)
        User = null;

      if(root.TryGetValue("items", out var items)) {
        foreach(JObject item in items as JArray) {
          var callId = (int)item["callId"];

          Callback callback;
          if(callbacks.TryGetValue(callId, out callback)) {
            if(item.TryGetValue("fault", out var jCallFault)) {
              var fault = jCallFault.ToObject<Fault>(Serializer);
              callback.Answer.SetException(new FaultException(fault));
            }
            else {
              if(item.TryGetValue("result", out var result)) {
                callback.Answer.SetResult(result);
              }
              else
                callback.Answer.SetResult(null);
            }
            callbacks.Remove(callId);
          }
        }
      }
    }


    /// <summary>Список вызовов, ожидающих передачи</summary>
    private List<CallDto> _Batch;

    /// <summary>Ответы на вызовы Call(). Ключ: CallId</summary>
    private Dictionary<int, Callback> _Callbacks = new Dictionary<int, Callback>();

    /// <summary>Точка блокировки</summary>
    private object _Lock = new object();


    /// <summary>Информация о вызове (нетипизированная)</summary>
    private class Callback {

      /// <summary>Сюда мы поместим ответ от сервера</summary>
      public readonly TaskCompletionSource<JToken> Answer = new TaskCompletionSource<JToken>();
    }


    /// <summary>Информация о вызове (типизированная)</summary>
    private class Callback<T>: Callback {

      /// <summary>Эта задача разрешится, как только получит ответ от сервера и десериализует его</summary>
      public Task<T> Result { get; private set; }

      public Callback() {
        Result = Task.Run<T>(async () => {
          var data = await Answer.Task;
          if(data == null)
            return default(T);
          else
            return data.ToObject<T>(Client.Serializer);
        });
      }
    }


    /// <summary>Dto запроса</summary>
    private class RequestDto {

      /// <summary>Часовой пояс</summary>
      public long timezoneOffset;

      /// <summary>Id приложения</summary>
      public string appInstanceId;

      /// <summary>Токен авторизации</summary>
      public string user;

      /// <summary>Вызовы</summary>
      public CallDto[] items;
    }

    /// <summary>Вызов (элемент пачки)</summary>
    private class CallDto {
      public int id;
      public string service;
      public string method;
      public object context;
      public object args;
    }
  }


  partial class Client {

    private static JsonSerializer Serializer => new JsonSerializer() { ContractResolver = ContractResolver.Instance };

    private class ContractResolver: DefaultContractResolver {
      public static ContractResolver Instance = new ContractResolver();

      protected override JsonConverter ResolveContractConverter(Type objectType) {
        foreach(var c in _Converters)
          if(c.CanConvert(objectType))
            return c;
        return null;
      }
      private static JsonConverter[] _Converters = new JsonConverter[] {
        new GuidConverter(),
      };
    }

    private class GuidConverter: JsonConverter {
      public override bool CanConvert(Type objectType) {
        return objectType == typeof(Guid);
      }
      public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer) {
        if(!Guid.TryParse((string)reader.Value, out var result))
          result = Guid.Empty;
        return result;
      }
      public override void WriteJson(JsonWriter writer, object _value, JsonSerializer serializer) => writer.WriteValue(_value);
    }
  }
}
