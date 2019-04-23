namespace Ragtime.DataService {
  using System;


  /// <summary>Этим атрибутом помечаем методы, которые должны быть известны DataService-у</summary>
  [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
  public class MethodAttribute: Attribute {

    public MethodAttribute() {
    }

    public MethodAttribute(string name) {
      Name = name;
    }

    /// <summary>Имя метода</summary>
    public string Name;

    /// <summary>Выполнять метод в контексте БД?</summary>
    public bool UseDb = true;

    /// <summary>Имя базы данных</summary>
    public string DbName = "Main";
  }
}
