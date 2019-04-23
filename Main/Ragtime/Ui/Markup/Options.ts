//bundle: true

import { Observables, Observable, IMap } from "Ragtime.Types";
import * as Error from "Ragtime.Error";
import { Metadata, Render } from "./Metadata";
import { OptionSet } from "./OptionSet";


/** Хозяин */
export interface IOwner {

  /** Флаг изменений */
  setModified(value: boolean, option?: IOption): void;

  /** Деструктор вызван? */
  disposed: boolean;
}


/** Публичные методы списка опций */
export interface IMethods<T = any> {

  /** Возвращаем все имена */
  getNames(): string[];

  /** Возвращаем опцию по имени */
  byName<O>(name: string): IOption<O>;

  /** Изменились ли какие-то значения с момента последнего сброса? */
  isModified(): boolean;

  /** Возвращаем измененные свойства */
  getModified(): OptionSet;

  /** Устанавливаем сырые данные (тем же способом, что и в конструкторе) */
  setData(data: any, modified: boolean): void;

  /** Устанавливаем сырые данные только тем свойствам, которые не присвоены */
  setDefaultData(data: Observables<T>): void;

  /** Возвращаем сырые данные */
  getData(): any;

  /** Возвращаем плоские данные */
  getValues(): T;
}


/** Публичный интерфейс списка опций */
export type IOptions<T = any> =
  {
    /** Для каждого элемента из T - свое свойство */
    readonly [Name in keyof T]-?: IOption<T[Name]>
  }
  &
  IMethods<T>
  ;


/** Значение одной опции */
export interface IOption<T = any> {

  /** Имя */
  readonly name: string;

  /** Путь относительно элемента-владельца */
  readonly path: string;

  /** Значение - всегда плоское */
  value: T;

  /** Устанавливаем значение, с возможностью отказаться от оповещения об изменении */
  setValue(value: T, modified?: boolean, force?: boolean): void;

  /** То же самое, что setValue, но ничего не делаем, если value === undefined */
  assignValue(value: T, modified?: boolean): void;

  /** Сырое значение */
  data: Observable<T>;

  /** Вложенные опции */
  readonly options: IOptions<T>;

  /** Значение (всегда observable) */
  readonly observable: KnockoutObservable<T>;

  /** Значение для свойства задано явно или по умолчанию? */
  readonly hasValue: boolean;

  /** Имеет ли свойство явно заданное значение? */
  readonly hasExplicitValue: boolean;

  /** Свойство изменилось (с момента последнего сброса)? */
  readonly modified: boolean;

  /** Настройка render? */
  readonly render: Render;
}


/**
 * Реализация опции
 * Класс не предназначен для использования прикладным программистом.
*/
export class Option<T = any> implements IOption<T> {

  constructor(owner: Options, name: string) {
    this._owner = owner;
    this.name = name;
  }

  readonly name: string;

  get path(): string {
    return this._owner.__path + "." + this.name;
  }

  get value(): T {
    return this._owner.__getValue(this.name);
  }

  set value(value: T) {
    this._owner.__setValue(this.name, value, true, false);
  }

  setValue(value: T, modified: boolean, force: boolean): void {
    this._owner.__setValue(this.name, value, modified, force);
  }

  assignValue(value: T, modified?: boolean, force?: boolean): void {
    if(value !== undefined)
      this.setValue(value, modified, force);
  }

  get data(): Observable<T> {
    return this._owner.__getData(this.name);
  }

  set data(value: Observable<T>) {
    this._owner.__setData(this.name, value, true);
  }

  get observable(): KnockoutObservable<T> {
    return this._owner.__getObservable(this.name);
  }

  get hasValue() {
    return this._owner.__hasValue(this.name);
  }

  get hasExplicitValue(): boolean {
    return this._owner.__hasExplicitValue(this.name);
  }

  get modified(): boolean {
    return this._owner.__getModified(this.name);
  }

  get render(): Render {
    return this._owner.__getRender(this.name);
  }

  get options(): IOptions<T> {
    return this._owner.__getNestedOptions(this.name) as any;
  }

  private _owner: Options;
}


/**
 * Набор значений опций.
 * Не предназначен для использования прикладным программистом.
 */
export class Options {
  /*
  РАЗРАБОТЧИКУ
    - Методы этого класса начинаются с двойного подчеркивания (__). Зачем?
      Экземляр этого класса будет содержать члены - ссылки на опции, которые определит прикладной программист.
      Двойное подчеркиваение должно предотвратить конфликт имен
  */

  /**
   * Создаем экземпляр опций
   * @param optionsType Тип шаблона опций. Шаблон опций - это класс, в котором описаны допустимые опции.
   * @param data        Данные
   */
  static create(owner: IOwner, path: string, optionsType: Function, data: any) {
    let type: any = Options.getType(optionsType);
    return new type(owner, path, data);
  }

  constructor(owner: IOwner, path: string, data: any) {
    this.__owner = owner;
    this.__path = path;
    this.setData(data, false);
  }

  /** 
  * Освобождаем
  * ВАЖНО:
  *   dispose() удаляет подписки на события, но не удаляет сами данные и вложенные опции.
  *   Полную очистку хотелось бы сделать, но не получилось.
  *   Причина - в том, что к свойствам control-ов могут обратиться (и обращаются!) после закрытия формы (а закрытие формы и вызывает dispose)
  */
  public __dispose() {
    this.__forEachBinding(binding => {
      if(binding.nestedOptions)
        binding.nestedOptions.__dispose();
      if(binding.subscription) {
        binding.subscription.dispose();
        binding.subscription = undefined;
      }
      if(binding.notifySubscription) {
        binding.notifySubscription.dispose();
        binding.notifySubscription = undefined;
      }
    })
    this.setModified(false);
    this.__disposed = true;
  }

  /** Устанавливаем новые значения данных. Информацию о подписчиках сохраняем */
  public setData(data: any, modified: boolean) {
    data = data || {};
    if(Options.areValuesEqual(this.__data, data))
      return;

    // Мы устанавливаем новые данные, и поэтому надо уничтожить все подписки на старые данные
    this.__forEachBinding(binding => {
      if(binding.subscription) {
        binding.subscription.dispose();
        binding.subscription = undefined;
      }
    });

    this.__data = data;

    // Включаем слежение
    for(let name of Object.keys(this.__data)) {
      if(this.__known(name))
        this.__watch(name, modified);
    }
  }

  /** Возвращаем сырые данные */
  public getData() {
    return this.__data;
  }

  /** То же саоме, что и setData, только ничего не делаем с уже присвоенными данными */
  public setDefaultData(data: any) {
    if(data) {
      for(let name in data) {
        if(this.__data[name] === undefined)
          this.__setData(name, data[name], false);
      }
    }
  }

  /** Возвращаем сырые данные указанного поля */
  public __getData(name: string) {
    return this.__data[name];
  }

  /** Устанавливаем сырые данные указанного поля */
  public __setData(name: string, value: any, modified: boolean) {
    this.__data[name] = value;
    if(this.__known(name)) 
      this.__watch(name, modified);
  }

  /** Возвращаем плоские данные */
  public getValues() {
    let result: any = {};
    for(let name of this.getNames()) {
      result[name] = this.__getValue(name);
    }
    return result;
  }

  /**
   * Устанавливаем значение свойства
   * @param name     Имя свойства
   * @param value    Новое значение. Может быть как плоским, так и observable. observable будет развернуто (ko.unwrap)
   * @param modify   Возбуждать ли событие modified?
   * @param force    Установить значение, даже если оно не менялось
  */
  public __setValue(name: string, value: any, modify: boolean, force: boolean) {
    let newValue = ko.unwrap(value);

    let oldValue = this.__getValue(name);
    let modified = !Options.areValuesEqual(oldValue, newValue);
    if(!force && !modified)
      return;

    let rawValue = this.__data[name];
    let isObservable = ko.isObservable(rawValue);
    let binding = this.__tryGetBinding(name);

    if(!isObservable) {
      this.__data[name] = newValue;
      if(modify && this.__known(name))
        this.__markNameAsModified(name);
      if(binding) {
        if(binding.notify)
          binding.notify(newValue);
        if(binding.nestedOptions)
          binding.nestedOptions.setData(newValue, true);
      }
    }

    else if(ko.isWriteableObservable(rawValue)) {
      if(binding && !modify)
        binding.modifyLock += 1;
      try {
        if(modified)
          rawValue(newValue);
        else
          rawValue.notifySubscribers();
      }
      finally {
        if(binding && !modify)
          binding.modifyLock -= 1;
      }
    }

    else
      Error.Operation.log("932198D67F6D", `Options.setValue(${name}): не удалось: !isWriteableObservable`);
  }

  /** Получаем значение свойства */
  public __getValue(name: string): any {
    let result = ko.unwrap(this.__data[name]);
    if(result === undefined) {
      if(!this.__hasExplicitValue(name))
        result = this.__metadata.get(name).defaultValue;
    }
    return result;
  }

  /** Получаем значение вложенных свойств */
  public __getNestedOptions(name: string): Options {
    let binding = this.__tryGetBinding(name);
    let result = binding && binding.nestedOptions;
    Error.Operation.throwIf(!result, "0DE7D5BB3B62", `Для свойства ${name} вложенные опции не настроены`);
    return result;
  }

  /** Получаем значение флага изменений */
  public __getModified(name: string): boolean {
    return this.__modified && this.__modified.has(name);
  }

  /** Получаем значение Render */
  public __getRender(name: string): Render {
    return this.__metadata.get(name).render;
  }

  /** Получаем список имен */
  public getNames(): Iterable<string> {
    return this.__metadata.names;
  }

  /** Получаем опцию по имени */
  public byName<T = any>(name: string): Option<T> {
    return new Option<T>(this, name);
  }

  /** Изменились ли какие-то значения с момента последнего сброса? */
  public isModified(): boolean {
    return !!this.__modified;
  }

  /** Возвращаем измененные свойства. Свойства doNotTrack не возвращаются */
  public getModified(): OptionSet {
    return new OptionSet(this.__modified);
  }

  /** Установка флага изменений */
  public setModified(value: boolean, option?: IOption) {
    if(value) 
      this.__markAsModified(option);
    else {
      this.__forEachBinding(_ => _.nestedOptions && _.nestedOptions.setModified(false));
      this.__modified = undefined;
    }
  }

  /** Деструктор вызван? */
  public get disposed(): boolean {
    return this.__disposed;
  }
  private __disposed: boolean;

  /** Явное значение задано? */
  public __hasExplicitValue(name: string) {
    return this.__data[name] !== undefined;
  }

  /** Явное значение задано? */
  public __hasValue(name: string) {
    return this.__hasExplicitValue(name) || (this.__metadata.get(name).defaultValue !== undefined);
  }


  /** Получаем observable для свойства */
  public __getObservable(name: string): KnockoutObservable<any> {
    // Пояснения по коду
    //   Как видно, мы всегда создаем отдельный observable, даже если исходное значение было observable.
    //   Это делается специально для того, чтобы поддержать возможность вызвать setData несколько раз
    // Леонид Белоусов, 2017-сен-02
    let binding = this.__getBinding(name);
    if(!binding.notify) {
      binding.notify = ko.observable(this.__getValue(name));
      binding.notifySubscription = binding.notify.subscribe(newValue => this.__setValue(name, newValue, true, false));
    }
    return binding.notify;
  }

  /** Сбрасываем флаги изменений */
  public __notModified() {
    this.__modified = undefined;
  }

  /** Настраиваем слежение за изменением значения свойства */
  private __watch(name: string, modified: boolean) {
    let value = this.__data[name];

    // Подписку на старые данные удаляем (если она была)
    let binding = this.__tryGetBinding(name);
    if(binding && binding.subscription) {
      binding.subscription.dispose();
      binding.subscription = undefined;
    }

    // Подписываемся на новые данные
    if(ko.isSubscribable(value)) {
      if(!this.disposed) {
        let source = value as KnockoutSubscribable<any>;
        if(!binding)
          binding = this.__getBinding(name);
        binding.subscription = source.subscribe(newValue => {
          if(this.disposed)
            return;
          if(!binding.modifyLock && this.__known(name))
            this.__markNameAsModified(name);
          if(binding.notify)
            binding.notify(newValue);
          if(binding.nestedOptions)
            binding.nestedOptions.setData(newValue, modified);
        });
      }
    }

    if(modified)
      this.__markNameAsModified(name);

    // Создаем вложенные опции
    let nestedOptionsType = this.__metadata.get(name).nestedOptions;
    if(nestedOptionsType) {
      if(!binding)
        binding = this.__getBinding(name);
      if(!binding.nestedOptions)
        binding.nestedOptions = Options.create(this, this.__path + "." + name, nestedOptionsType, ko.unwrap(value));
    }

    // Обрабатываем ситуацию, когда __watch вызывается повторно (не в первый раз). К этому моменту у нас могут быть подписчики и вложенные свойства
    if(!binding)
      binding = this.__tryGetBinding(name);
    if(binding) {
      let newValue = ko.unwrap(value);
      if(binding.notify)
        binding.notify(newValue);
      if(binding.nestedOptions)
        binding.nestedOptions.setData(newValue, modified);
    }
  }

  /** Выдаем информацию о привязке. Если надо - создаем */
  private __getBinding(name: string) {
    if(!this.__bindings)
      this.__bindings = new Map<string, Binding>();
    let result = this.__bindings.get(name);
    if(!result) {
      result = {
        modifyLock: 0,
      }
      this.__bindings.set(name, result);
    }
    return result;
  }

  /** Выдаем информацию о привязке. Если не нашли - undefined */
  private __tryGetBinding(name: string) {
    return this.__bindings && this.__bindings.get(name);
  }

  /** Это известное свойство? */
  private __known(name: string) {
    return this.__metadata.has(name);
  }

  /** Метаданные набора свойств */
  private get __metadata(): Metadata {
    return (this.constructor as any)._metadata;
  }

  /** Добавляем name в список изменившихся опций и оповещаем хозяина об изменении */
  private __markNameAsModified(name: string) {
    this.__markAsModified(this.byName(name));
  }

  /** Добавляем name в список изменившихся опций и оповещаем хозяина об изменении */
  private __markAsModified(option: IOption) {
    if(this.disposed)
      return;
    if(!this.__modified)
      this.__modified = new Map<string, IOption>();
    this.__modified.set(option.path, option);
    this.__owner.setModified(true, option);
  }

  /** Выполняем действие для каждой привязки */
  private __forEachBinding(action: (b: Binding) => void) {
    if(this.__bindings) {
      for(let name of Object.keys(this.__bindings)) {
        action(this.__bindings.get(name));
      }
    }
  }


  /** Путь относительно элемента-владельца */
  public readonly __path: string;

  /** Элемент разметки */
  private readonly  __owner: IOwner;

  /** Данные в том виде, как они были переданы. Плоские данные могут быть перемешаны с observable */
  private __data: any;

  /** Привязки (информация о слежении) */
  private __bindings: Map<string, Binding>;

  /** Список изменившихся свойств. Ключ: путь. Выражение !!__modified является флагом наличия изменений (modified) */
  private __modified: Map<string, IOption>;


  /** Конструируем (если надо) и возвращаем тип опций для указанного шаблона */
  private static getType(optionsType: Function) {
    if(!Options._types.has(optionsType)) {
      let result = class extends Options {
        static _metadata: Metadata;
      };
      result._metadata = Metadata.get(optionsType);
      for(let name of result._metadata.names) {
        Object.defineProperty(result.prototype, name, {
          enumerable: true,
          configurable: false,
          get: function () { return new Option(this, name); }
        });
      }
      Options._types.set(optionsType, result);
    }
    return Options._types.get(optionsType);
  }

  private static areValuesEqual(a: unknown, b: unknown): boolean {
    if(!Array.isArray(a))
      return a === b;
    else {
      if(!Array.isArray(b))
        return false;
      if(a.length !== b.length)
        return false;
      for(let i = 0; i < a.length; i++) {
        if(!Options.areValuesEqual(a[i], b[i]))
          return false;
      }
      return true;
    }
  }

  // Сконструированные типы. Ключ: тип шаблона
  private static _types = new Map<Function, Function>(); 
}


/** Информация о привязке значения */
interface Binding {
  /** Наша подписка на изменение указанного нам значения */
  subscription?: KnockoutSubscription;

  /** Подписчики на наши значения */
  notify?: KnockoutObservable<any>;

  /** Подписка notify на изменение своего значения */
  notifySubscription?: KnockoutSubscription;

  /** Запрет на оповещение нашего owner-а (элемент разметки) */
  modifyLock?: number;

  /** Вложенные опции */
  nestedOptions?: Options;
}
