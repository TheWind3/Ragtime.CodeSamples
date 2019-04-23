namespace Ragtime.DataService {
  using System;
  using Newtonsoft.Json;
  using Newtonsoft.Json.Linq;
  using StackExchange.Profiling;
  using Ragtime.Serialization;
  using static Utils;


  /// <summary>Поддержка сериализации</summary>
  public class Serializer {

    /// <summary>Надо ли профилировать сериализацию</summary>
    public bool ProfilingEnabled;

    /// <summary>Читаем обязательное значение</summary>
    public T GetValue<T>(JObject values, string name) {
      using(ProfileGetValue(typeof(T), name)) {
        return GetJToken(values, name, true).ToObject<T>(ReadOnly);
      }
    }

    /// <summary>Читаем обязательное значение</summary>
    public object GetValue(JObject values, string name, Type type) {
      using(ProfileGetValue(type, name)) {
        return GetJToken(values, name, true).ToObject(type, ReadOnly);
      }
    }

    /// <summary>Читаем необязательное значение</summary>
    public T TryGetValue<T>(JObject values, string name) {
      using(ProfileGetValue(typeof(T), name)) {
        var t = GetJToken(values, name, false);
        return t == null ? default(T) : t.ToObject<T>(ReadOnly);
      }
    }

    /// <summary>Читаем необязательное значение</summary>
    public object TryGetValue(JObject values, string name, Type type) {
      using(ProfileGetValue(type, name)) {
        var t = GetJToken(values, name, false);
        return t == null ? Ragtime.Utils.Default(type) : t.ToObject(type, ReadOnly);
      }
    }

    /// <summary>Десериализация значения</summary>
    public T GetValue<T>(JToken value, string unimportantName) where T : class {
      using(ProfileGetValue(typeof(T), unimportantName)) {
        return value?.ToObject<T>(ReadOnly);
      }
    }

    /// <summary>Десериализация значения</summary>
    public object GetValue(JToken value, Type type, string unimportantName) {
      using(ProfileGetValue(type, unimportantName)) {
        return value?.ToObject(type, ReadOnly);
      }
    }

    /// <summary>Читаем значение</summary>
    private JToken GetJToken(JObject values, string name, bool required) {
      JToken t;
      if(values.TryGetValue(name, out t))
        return t;
      else {
        if(required)
          throw new OperationError("58BB591148F5", $"Value not found: {name}");
        return null;
      }
    }

    /// <summary>Начинаем профилирование GetValue</summary>
    private CustomTiming ProfileGetValue(Type type, string name) {
      return
        ProfilingEnabled
        ? MiniProfiler.Current.CustomTimingIf("Serialization", $"GetValue(${FriendlyTypeName.Get(type)} {name})", 1m, "In")
        : null;
    }

    /// <summary>Сериализуем объект</summary>
    public void Serialize(JsonWriter writer, object value, SerializerSettings settings = null) {
      var timing =
        ProfilingEnabled
        ? MiniProfiler.Current.CustomTimingIf("Serialization", $"Serialize({FriendlyTypeName.Get(value?.GetType()) ?? "null"} value)", 1m, "Out")
        : null;
      using(timing) {
        Ragtime.Serialization.Service.Serialize(value, writer, settings);
      }
    }

    /// <summary>Возвращаем сериализатор для чтения</summary>
    private JsonSerializer ReadOnly => Cached(ref _ReadOnly, () => {
      return Ragtime.Serialization.Service.GetSerializer(
        new SerializerSettings(
          depth:         SerializationDepth.Full,
          presentations: false,
          @readonly:     true
        ),
        Serialization.Phase.Serialize);
    });
    private JsonSerializer _ReadOnly;
  }
}
