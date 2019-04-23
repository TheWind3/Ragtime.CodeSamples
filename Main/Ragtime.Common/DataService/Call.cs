namespace Ragtime.DataService {
  using System;
  using System.Runtime.CompilerServices;
  using System.Collections.Generic;
  using Newtonsoft.Json.Linq;
  using Ragtime.Serialization;
  using static Ragtime.Utils;


  /// <summary>Элемент запрос к DataService</summary>
  public class Call {

    /// <summary>Контекст запроса</summary>
    public Context Context;

    /// <summary>Идентификатор (он же номер)</summary>
    public int Id;

    /// <summary>Имя сервиса</summary>
    public string Service;

    /// <summary>Имя метода</summary>
    public string Method;

    /// <summary>Объект-контекст</summary>
    public JObject This;

    /// <summary>Параметры запроса</summary>
    public JObject Args;

    /// <summary>Требуется подключение к БД?</summary>
    public bool UseDb;

    /// <summary>Имя БД</summary>
    public string DbName;

    /// <summary>Дополнительные данные</summary>
    public Dictionary<string, object> Tags => Cached(ref _Tags, () => new Dictionary<string, object>());
    private Dictionary<string, object> _Tags;

    /// <summary>Получаем значение объекта-контекста, или null</summary>
    public T GetThis<T>() where T : class => (T)Context.Serializer.GetValue(This, typeof(T), "This");

    /// <summary>Получаем значение объекта-контекста, или null</summary>
    public object GetThis(Type type) => Context.Serializer.GetValue(This, type, "This");

    /// <summary>Получаем обязательное значение параметра</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public T GetParam<T>(string name) => Context.Serializer.GetValue<T>(Args, name);

    /// <summary>Получаем обязательное значение параметра</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public object GetParam(string name, Type type) => Context.Serializer.GetValue(Args, name, type);

    /// <summary>Получаем необязательное значение параметра</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public T TryGetParam<T>(string name) => Context.Serializer.TryGetValue<T>(Args, name);

    /// <summary>Получаем необязательное значение параметра</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public object TryGetParam(string name, Type type) => Context.Serializer.TryGetValue(Args, name, type);

    /// <summary>Параметр имеется?</summary>
    public bool HasParam(string name) {
      JToken x;
      return Args.TryGetValue(name, out x);
    }

    /// <summary>Получаем необязательное значение параметра</summary>
    public T TryGetParam<T>(string name, Func<T> ifNotFound) => HasParam(name) ? GetParam<T>(name) : ifNotFound();

    /// <summary>Заявляем о новом значении объекта-контекста (This)</summary>
    public void SetThis(object value, bool directMode = false) {
      OperationError.ThrowIf(_ThisSet, "497859522B45", "Illegal call to SetThis()");
      _ThisSet = true;
      Context.WriteThis(value, new SerializerSettings( direct: directMode));
    }
    internal bool _ThisSet;

    /// <summary>Заявляем о состоянии модели (ModelState)</summary>
    public void SetModelState(object value, bool directMode = false) {
      OperationError.ThrowIf(_ModelStateSet, "DDC8AC74F926", "Illegal call to SetModelState()");
      _ModelStateSet = true;
      Context.WriteModelState(value, new SerializerSettings(direct: directMode));
    }
    internal bool _ModelStateSet;

    /// <summary>Заявляем о результате вызова (return value)</summary>
    public void SetResult(object value, bool directMode = false) {
      SetResult(value, new SerializerSettings(direct: directMode));
    }

    /// <summary>Заявляем о результате вызова (return value)</summary>
    public void SetResult(object value, SerializerSettings settings) {
      OperationError.ThrowIf(_ResultSet, "96041023D542", "Illegal call to SetResult()");
      _ResultSet = true;
      Context.WriteResult(value, settings);
    }
    internal bool _ResultSet;
  }
}
