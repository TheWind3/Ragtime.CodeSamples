namespace Ragtime.DataService {
  using System;
  using System.Threading;
  using Newtonsoft.Json;
  using Newtonsoft.Json.Linq;
  using Ragtime.Serialization;


  /// <summary>Контекст запроса</summary>
  public class Context {

    internal Context(Uri url, JObject request, JsonTextWriter response) {
      Url = url;
      Request = request;
      Response = response;
      var timezoneOffset = TryGetValue(request, "timezoneOffset", _ => (int)_);
      Offset = TimeSpan.FromMinutes(-timezoneOffset);
      Moment = GetNow(this);
      AppInstanceId = TryGetValue(request, "appInstanceId", _ => (string)_);
      Serializer = new Serializer();
    }

    /// <summary>Уникальный идентификатор</summary>
    public readonly Guid Id = Guid.NewGuid();

    /// <summary>Адрес запроса</summary>
    public readonly Uri Url;

    /// <summary>Момент начала запроса</summary>
    public readonly DateTimeOffset Moment;

    /// <summary>Текущая астрономическая дата (с временной зоной клиента)</summary>
    public DateTimeOffset Now => GetNow(this);

    /// <summary>Временная зона на клиенте</summary>
    public readonly TimeSpan Offset;

    /// <summary>Идентификатор экземпляра приложения</summary>
    public readonly string AppInstanceId;

    /// <summary>Данные запроса</summary>
    public readonly JObject Request;

    /// <summary>Поток ответа</summary>
    public readonly JsonTextWriter Response;

    /// <summary>Сериализатор (инструмент для работы с Json)</summary>
    public readonly Serializer Serializer;

    /// <summary>Записываем в выходной поток результат запроса</summary>
    internal void WriteResult(object value, SerializerSettings settings) {
      Response.WritePropertyName("result");
      try {
        if(value == null)
          Response.WriteNull();
        else
          Serializer.Serialize(Response, value, settings);
      }
      catch {
        Response.WriteNull();
        throw;
      }
    }

    /// <summary>Записываем в выходной поток объект-контекст (aka This)</summary>
    internal void WriteThis(object value, SerializerSettings settings) {
      Response.WritePropertyName("context");
      try {
        if(value == null)
          Response.WriteNull();
        else 
          Serializer.Serialize(Response, value, settings);
      }
      catch {
        Response.WriteNull();
        throw;
      }
    }

    /// <summary>Записываем в выходной поток состояние модели (aka ModelState)</summary>
    internal void WriteModelState(object value, SerializerSettings settings) {
      Response.WritePropertyName("modelState");
      try {
        if(value == null)
          Response.WriteNull();
        else
          Serializer.Serialize(Response, value, settings);
      }
      catch {
        Response.WriteNull();
        throw;
      }
    }

    /// <summary>Текущий запрос</summary>
    public static Context Current => _Current.Value;
    internal static readonly AsyncLocal<Context> _Current = new AsyncLocal<Context>();

    /// <summary>Aстрономическая дата начала текущего запроса (если таковой имеется), или просто текущая астрономическая UTC-дата</summary>
    public static DateTimeOffset GetMoment() => GetNow(Current);

    /// <summary>Текущая астрономическая дата. Если есть текущий запрос - то установлена временная зона клиента</summary>
    public static DateTimeOffset GetNow() => GetNow(Current);

    /// <summary>Текущая астрономическая дата у которой, возможно, выставлена временная зона клиента запроса</summary>
    private static DateTimeOffset GetNow(Context context) {
      if(context != null)
        return new DateTimeOffset(DateTime.SpecifyKind(DateTime.UtcNow + context.Offset, DateTimeKind.Unspecified), context.Offset);
      else
        return DateTimeOffset.UtcNow;
    }


    private static T TryGetValue<T>(JObject data, string name, Func<JToken, T> convert) {
      if(data.TryGetValue(name, out var result)) {
        if(result.Type == JTokenType.Null || result.Type == JTokenType.Undefined)
          return default(T);
        else
          return convert(result);
      }
      else
        return default(T);
    }
  }
}
