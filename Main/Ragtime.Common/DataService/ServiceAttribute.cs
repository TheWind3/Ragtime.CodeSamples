namespace Ragtime.DataService {
  using System;


  /// <summary>Этим атрибутом помечаем классы, которые реализуют обработчики DataService-а</summary>
  [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
  public class ServiceAttribute: Attribute {

    public ServiceAttribute() {
    }

    public ServiceAttribute(string name) {
      Name = name;
    }

    /// <summary>Имя сервиса</summary>
    public string Name;
  }
}
