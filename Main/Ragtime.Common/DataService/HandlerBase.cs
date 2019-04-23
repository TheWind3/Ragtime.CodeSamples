namespace Ragtime.DataService {
  using System;
  using System.Runtime.CompilerServices;


  /// <summary>Базовый класс для написания обработчиков DataService-а</summary>
  public abstract class HandlerBase {

    /// <summary>Это такая псевдо-ссылка: "Только что записанная сущность"</summary>
    protected static readonly Guid JustWrittenRef = Guid.Parse("00000000-0000-0000-0000-000000000001");

    /// <summary>Доступ к короткому кешу</summary>
    protected static T Cached<T>(Guid typeId, Guid @ref, string name, Func<T> get) {
      var key = CacheKey(typeId, @ref, name);
      object result = MemoryCache.Get(key);
      if(result == null) {
        if(@ref == JustWrittenRef)
          result = null;
        else
          result = Cache(key, get());
      }
      return (T)result;
    }

    /// <summary>Помещаем элемент в короткий кеш. Возвращаем этот же элемент</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    protected static T Cache<T>(Guid typeId, Guid @ref, string name, T value) {
      return Cache(CacheKey(typeId, @ref, name), value);
    }

    /// <summary>Помещаем элемент в короткий кеш. Возвращаем этот же элемент</summary>
    private static T Cache<T>(string key, T value) {
      MemoryCache.Remove(key);
      if(value != null) {
        MemoryCache.Set(key, e => {
          e.Value = value;
          e.AbsoluteExpiration = DateTimeOffset.Now.AddSeconds(60); 
        });
      }
      return value;
    }

    /// <summary>Вычисляем ключ кеша</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static string CacheKey(Guid typeId, Guid @ref, string name) {
      var appId = Context.Current?.AppInstanceId ?? "?";
      return $"{appId}-{typeId}-{@ref}-{name}";
    }
  }
}
