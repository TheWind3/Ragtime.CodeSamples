//bundle: true


export type Render
  = "hard"
  | "soft"
  | "none"
  ;

/** Настройки одной опции */
export interface OptionSettings {

  /** Значение по умолчанию */
  defaultValue?: string;

  /** Влияние на отрисовку */
  render?: Render;

  /** Тип дочерних настроек */
  nestedOptions?: Function;
}


/** Метаданные набора свойств */
export class Metadata {

  /** Возвращаем метаданные опций по их типу */
  static get(optionsType: Function): Metadata {
    if(!Metadata._all.has(optionsType)) {
      let result = new Metadata();
      let optionsInstance = new (optionsType as any)();
      let optionsPrototype = Object.getPrototypeOf(optionsInstance);
      for(let optionName of Object.keys(optionsInstance)) {
        let optionValue = optionsInstance[optionName];
        if(typeof optionValue !== "function") {
          let settings: OptionSettings = {
            defaultValue:  Metadata.getFeature(optionsPrototype, optionName, "defaultValue"),
            render:        Metadata.getFeature(optionsPrototype, optionName, "render") || "hard",
            nestedOptions: Metadata.getFeature(optionsPrototype, optionName, "nestedOptions"),
          };
          if(settings.defaultValue === undefined)
            settings.defaultValue = optionValue
          result._items.set(optionName, settings);
        }
      }
      Metadata._all.set(optionsType, result);
    }
    return Metadata._all.get(optionsType);
  }

  /** Задаем настройки свойства */
  static setup(prototype: any, optionName: string, settings: OptionSettings) {
    if(!Metadata._settings.has(prototype))
      Metadata._settings.set(prototype, new Map<string, OptionSettings>());
    let typeSettings = Metadata._settings.get(prototype);

    let oldSettings = typeSettings.get(optionName) || {};
    let newSettings = {
      ...oldSettings,
      ...(settings || {})
    };
    typeSettings.set(optionName, newSettings);
  }

  /** Получаем описание свойства, анализируя иерархию свойств */
  private static getFeature(prototype: any, optionsName: string, feature: keyof OptionSettings): any {
    if(!prototype)
      return undefined;
    let settings: OptionSettings = undefined;
    let typeSettings = Metadata._settings.get(prototype);
    if(typeSettings !== undefined) 
      settings = typeSettings.get(optionsName);
    if(settings === undefined || settings[feature] === undefined)
      return Metadata.getFeature(Object.getPrototypeOf(prototype), optionsName, feature);
    else
      return settings[feature];
  }

  /** Свойство существует? */
  has(optionName: string): boolean {
    return this._items.has(optionName);
  }

  /** Возвращаем настройки по имени опции */
  get(optionName: string): OptionSettings {
    return this._items.get(optionName) || {};
  }

  /** Список имен свойств (только верхнего уровня) */
  get names() {
    return this._items.keys();
  }

  /** Получаем полный список путей, включая вложенные опции */
  getPaths(): Set<string> {
    if(!this._paths) {
      this._paths = new Set<string>();
      for(let name of this._items.keys()) {
        this._paths.add("." + name);
        let settings = this._items.get(name);
        if(settings.nestedOptions) {
          for(let nestedPath of Metadata.get(settings.nestedOptions).getPaths())
            this._paths.add("." + name + nestedPath);
        }
      }
    }
    return this._paths;
  }
  private _paths: Set<string>;

  /** Настройки свойств */
  private _items = new Map<string, OptionSettings>();

  /** Готовые метаданные */
  private static _all = new Map<Function, Metadata>();

  /** Заданные настройки опций */
  private static _settings = new Map<any, Map<string, OptionSettings>>(); // ключ - прототип
}
