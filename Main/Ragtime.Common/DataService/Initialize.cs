
namespace Ragtime.DataService {
  using System;
  using System.Linq;
  using System.Reflection;
  using System.Collections.Concurrent;
  using Ragtime.Metadata;
  using Ragtime.Client;


  partial class Service {

    /// <summary>Точка инициализации при старте приложения</summary>
    [Trace]
    public static void Initialize(Ragtime.Runtime.Unit unit) {
      foreach(var type in unit.NamedTypes)
        InitializeType(type);
    }
    private static void InitializeTrace(Ragtime.Runtime.Unit unit, Trace.Record r) => r.Text = unit.Name;

    [Trace]
    private static void InitializeType(Type type) {
      string serviceName = null;

      var aService = type.GetCustomAttributes<ServiceAttribute>().FirstOrDefault();
      if(aService != null) {
        serviceName = aService.Name;
        if(serviceName == null)
          serviceName = type.FullName;
      }
      else
        serviceName = Metadata.Cataloque.GetItem<Item>(type, false)?.GetMetadataObject()?.FullName;

      if(serviceName != null)
        InitializeService(type, serviceName);
    }
    private static void InitializeTypeTrace(Type type, Trace.Record r) => r.Text = type.FullName;

    // Инициализация сервиса
    [Trace]
    private static void InitializeService(Type type, string serviceName) {
      foreach(var method in type.GetMethods(BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)) {
        foreach(var attribute in method.GetCustomAttributes()) {
          if(attribute is MethodAttribute aMethod)
            InitializeMethod(serviceName, method, aMethod);
          if(attribute is UiAttribute aUi)
            InitializeUiMethod(type, serviceName, method, aUi);
        }
      }
    }
    private static void InitializeServiceTrace(Type type, string serviceName, Trace.Record r) => r.Text = serviceName;

    // Инициализация метода, помеченного [Method]
    [Trace]
    private static void InitializeMethod(string serviceName, MethodInfo method, MethodAttribute attribute) {
      var methodName = attribute.Name;
      if(methodName == null)
        methodName = method.Name;

      _Handlers[HandlerKey(serviceName, methodName)] = new Handler {
        UseDb  = attribute.UseDb,
        DbName = attribute.DbName,
        Value  = ValidCallHandler(serviceName, methodName, (CallHandler)Delegate.CreateDelegate(typeof(CallHandler), method))
      };
    }
    private static void InitializeMethodTrace(string serviceName, MethodInfo method, MethodAttribute attribute, Trace.Record r) => r.Text = $"{serviceName}/{method.Name}";

    // Инициализация метода, помеченного [Ui]
    [Trace]
    private static void InitializeUiMethod(Type type, string serviceName, MethodInfo method, UiAttribute attribute) {
      CallHandler handler = (Call call) => {
        var methodParameters = method.GetParameters();
        object[] parameters = new object[methodParameters.Length];
        for(int i = 0; i < methodParameters.Length; i++)
          parameters[i] = call.TryGetParam(methodParameters[i].Name, methodParameters[i].ParameterType);

        object result;
        object @this = null;
        if(method.IsStatic)
          result = method.Invoke(null, parameters);
        else {
          @this = call.GetThis(type);
          result = method.Invoke(@this, parameters);
        }

        if(method.ReturnType != null)
          call.SetResult(result);
        if(@this != null)
          call.SetThis(@this);
      };

      _Handlers[HandlerKey(serviceName, method.Name)] = new Handler {
        UseDb  = attribute.UseDb,
        DbName = attribute.DbName,
        Value  = ValidCallHandler(serviceName, method.Name, handler)
      };
    }
    private static void InitializeUiMethodTrace(Type type, string serviceName, MethodInfo method, UiAttribute attribute, Trace.Record r) => r.Text = $"{serviceName}/{method.Name}";

    // Проверям, что value != null
    private static CallHandler ValidCallHandler(string serviceName, string method, CallHandler value) => value ?? throw new OperationError("100ACEC03664", $"Bad handler: {serviceName}/{method}");


    private struct Handler {
      public bool        UseDb;
      public string      DbName;
      public CallHandler Value;
    }

    private static string HandlerKey(string service, string method) => $"{service}/{method}";
    private static ConcurrentDictionary<string, Handler> _Handlers = new ConcurrentDictionary<string, Handler>();
  }
}
