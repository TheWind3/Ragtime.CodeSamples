namespace Ragtime.DataService {
  using System;
  using System.IO;
  using System.Collections.Generic;
  using System.Reflection;
  using Newtonsoft.Json;
  using Newtonsoft.Json.Linq;
  using StackExchange.Profiling;
  using Ragtime;


  /// <summary>Делегат обработчика, связанного с запросом</summary>
  public delegate void RequestHandler(Context context);

  /// <summary>Делегат обработчика, связанного с вызовом</summary>
  public delegate void CallHandler(Call call);

  /// <summary>Делегат обработчика ошибки</summary>
  public delegate void FaultHandler(Call call, Fault fault);


  /// <summary>Центральная точка доступа к DataService</summary>
  public partial class Service {
    public static event RequestHandler BeforeRequest;
    public static event RequestHandler AfterRequest;
    public static event RequestHandler OnAuthenticate;
    public static event RequestHandler BeforeCalls;
    public static event RequestHandler AfterCalls;
    public static event CallHandler    BeforeCall;
    public static event CallHandler    AfterCall;
    public static event FaultHandler   OnFault;


    /// <summary>Обработка запроса</summary>
    [Trace]
    public void ProcessRequest(Uri url, Stream requestStream, Stream responseStream) {
      JObject data; // Входные данные запроса
      using(var streamReader = new StreamReader(requestStream))
      using(var jsonReader = new JsonTextReader(streamReader)) {
        data = JObject.Load(jsonReader);
      }

      using(var streamWriter = new StreamWriter(responseStream))
      using(var response = new JsonTextWriter(streamWriter)) {
        var context = new Context(url, data, response);
        Context._Current.Value = context;

        try {
          BeforeRequest?.Invoke(context);
          try {
            response.WriteStartObject();

            try {
              OnAuthenticate?.Invoke(context);

              BeforeCalls?.Invoke(context);
              response.WritePropertyName("items");
              response.WriteStartArray();
              foreach(var call in ParseCalls(context, data))
                ProcessCall(call);
              response.WriteEndArray();
              AfterCalls?.Invoke(context);
            }
            catch(Exception e) {
              var fault = CreateFault(e);
              OnFault?.Invoke(null, fault);
              response.WritePropertyName("fault");
              new JsonSerializer().Serialize(response, fault);
            }

            response.WriteEndObject();
          }
          finally {
            AfterRequest?.Invoke(context);
          }
        }
        finally {
          Context._Current.Value = null;
        }
      }
    }

    /// <summary>Преобразуем граф сущностей в граф Dto</summary>
    public static Dto ConvertToDto<Entity, Dto>(Entity entity) {
      byte[] serialized;
      using(var stream = new MemoryStream())
      using(var sWriter = new StreamWriter(stream))
      using(var jWriter = new JsonTextWriter(sWriter)) {
        var serializer = new Serializer();
        serializer.Serialize(jWriter, entity);
        jWriter.Flush();
        serialized = stream.ToArray();
      }
      using(var stream = new MemoryStream(serialized))
      using(var sReader = new StreamReader(stream))
      using(var jReader = new JsonTextReader(sReader)) {
        var serializer = new JsonSerializer();
        serializer.NullValueHandling = NullValueHandling.Ignore;
        serializer.ObjectCreationHandling = ObjectCreationHandling.Replace;
        return serializer.Deserialize<Dto>(jReader);
      }
    }

    private IEnumerable<Call> ParseCalls(Context context, JObject data) {
      JToken t;
      if(data.TryGetValue("items", out t)) {
        var items = (JArray)t;
        if(items != null) {
          foreach(JObject item in items) {
            yield return new Call() {
              Context = context,
              Id      = (int)item.GetValue("id"),
              Service = (string)item.GetValue("service"),
              Method  = (string)item.GetValue("method"),
              This    = TryGetObject(item, "context"),
              Args    = TryGetObject(item, "args", () => new JObject()),
            };
          }
        }
      }
    }

    private JObject TryGetObject(JObject item, string name, Func<JObject> defaultValue = null) {
      if(defaultValue == null)
        defaultValue = () => null;
      JToken result;
      if(item.TryGetValue(name, out result))
        switch(result.Type) {
          case JTokenType.Object:
            return (JObject)result;
          case JTokenType.Null:
          case JTokenType.Undefined:
            return defaultValue();
          default:
            throw new OperationError("4B5EA4CB4045", "Bad object");
        }
      else
        return defaultValue();
    }

    [Trace]
    private void ProcessCall(Call call) {
      using(MiniProfiler.Current.Step($"DataService.Call: {call.Method}")) {
        var response = call.Context.Response;
        response.WriteStartObject();
        try {
          response.WritePropertyName("callId");
          response.WriteValue(call.Id);

          OperationError.ThrowIf(call.Service.IsNullOrEmpty(), "96BE5D403F53", "Service is not assigned");
          OperationError.ThrowIf(call.Method.IsNullOrEmpty(), "B02A9051FE28", "Method is not assigned");
          if(!_Handlers.TryGetValue(HandlerKey(call.Service, call.Method), out var handler)) 
            OperationError.Throw("18D03BA89AC3", $"Handler not found: {call.Service}/{call.Method}");

          call.DbName = handler.DbName;
          call.UseDb = handler.UseDb;
          BeforeCall?.Invoke(call);
          try {
            handler.Value(call);
          }
          finally {
            AfterCall?.Invoke(call);
          }
        }
        catch(Exception e) {
          var fault = CreateFault(e);
          OnFault?.Invoke(call, fault);
          response.WritePropertyName("fault");
          new JsonSerializer().Serialize(response, fault);
        }
        finally {
          response.WriteEndObject();
        }
      }
    }
    private static void ProcessCallTrace(Call call, Trace.Record r) => r.Text = $"{call.Id}:{call.Service}/{call.Method}";

    private Fault CreateFault(Exception e) {
      var fault = new Fault();

      if(e is TargetInvocationException)
        e = (e as TargetInvocationException).InnerException;
      if(e is AggregateException)
        e = (e as AggregateException).Flatten().InnerExceptions[0];

      if(!(e is ApplicationError)) {
        fault.IsInternal = true;
        fault.Message = "Произошла неожиданная ошибка";
        if(e is OperationError)
          fault.ErrorId = (e as OperationError).ErrorId;

#if DEBUG
        fault.Message = fault.Message + ": " + e.Message;
        fault.Details = e.ToString();
#endif
      }
      else /* e is ApplicationError*/ {
        fault.Message = e.Message;
        fault.Details = (e as ApplicationError).Details;
        fault.ErrorId = (e as ApplicationError).ErrorId;
      }

      return fault;
    }
  }
}
