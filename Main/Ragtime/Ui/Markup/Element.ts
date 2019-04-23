//bundle:true

import * as Error from "Ragtime.Error";
import { Observables, IDisposable } from "Ragtime.Types";
import { TypedCallbacks as Callbacks } from "Ragtime.Callbacks";
import { Option, Options, IOption, IOptions } from "./Options";
import { IElements, Elements } from "./Elements";
import { setup } from "./_";


/** Сигнатура обработчика создания */
export type CreateHandler = (element: any) => void;

/** Сигнатура обработчика изменения */
export type ModificationHandler = () => void;

/** Сигнатура обработчика очистки */
export type DisposeHandler = () => void;


/** Опции элемена */
export class ElementOptions {
  onCreate?: CreateHandler = undefined;

  constructor() {
    setup(ElementOptions, { render: "none" }, "onCreate");
  }
}


/** Элемент разметки */
export abstract class Element {

  /**
   * Конструктор
   * @param options     Опции.
   * @param children    Дочерние элементы
   * @param optionsType Тип шаблона опций.
   */
  constructor(options: Observables<ElementOptions>, children: any[], optionsType: Function) {
    this._options = Options.create(this, "", optionsType || ElementOptions, options || {});
    this._children = new Elements(this, children || []);

    let onCreate = ko.unwrap<CreateHandler>(options && options.onCreate);
    onCreate && onCreate(this);
  }

  /** Деструктор */
  dispose() {
    this.whenDispose.fire();
    this.whenDispose.clear();

    if(this._extension && this._extension.dispose)
      this._extension.dispose();
    this._extension = undefined;

    for(let r of this._relatives || []) 
      r.dispose();

    this._parent = undefined;

    if(this._options) 
      this._options.__dispose();

    this.whenModified.clear();
    this._disposed = true;
  }

  /** Элемент разрушен? */
  public get disposed() {
    return !!this._disposed;
  }
  private _disposed: boolean;

  /** Проверяем, что элемент не разрушен, ругаемся */
  public errorIfDisposed() {
    Error.Operation.throwIf(this.disposed, "466127CB20B4", "MarkupElement: disposed");
  }

  /** Подписки на очистку */
  public readonly whenDispose = new Callbacks<DisposeHandler>();

  /** Подписки на изменение */
  public readonly whenModified = new Callbacks<ModificationHandler>();

  /** Утилитный метод: слушаем observable, отписываемся при dispose */
  public subscribe(value: KnockoutObservable<any>, handler: (newValue: any) => void): void {
    if(!this.disposed) {
      let subscription = value.subscribe(handler);
      this.whenDispose.add(() => subscription.dispose());
    }
  }

  /** Возвращаем флаг изменений */
  public get modified(): boolean {
    return this._modified;
  }

  /** Оповещаем об изменении */
  public setModified(value: boolean) {
    value = !!value;
    if(value === this._modified)
      return;
    this._modified = value;
    if(value)
      this.whenModified.fire();
    else {
      this._options.setModified(false);
      for(let r of this._relatives)
        r.setModified(false);
      this._modified = false;
    }
  }
  private _modified = false;

  /** Значение опций */
  protected get options(): any {
    return this._options as any;
  }
  private _options: Options;

  /** Дочерние элементы */
  public get children(): IElements {
    return this._children;
  }
  /** Не для публичного использования! Опасно! */
  public _children: Elements;

  /** Родительский элемент */
  public get parent(): Element {
    return this._parent;
  }
  /** Не для публичного использования! Опасно! */
  public _parent: Element;

  /** Регистрируем ветку с родственниками */
  public addRelatives(branch: Elements) {
    this._relatives.push(branch);
  }
  private _relatives: Elements[] = [];

  /** Возвращаем родственников */
  public get relatives(): Iterable<Elements> {
    return this._relatives[Symbol.iterator]();
  }

  /** Удаляем текущий элемент из списка детей родителя и вызываем для него dispose(). После вызова этого метода использовать элемент больше нельзя */
  public remove() {
    if(this.disposed)
      return;
    if(this._parent && this._parent._children) 
      this._parent._children.remove(this, true); // remove and dispose
  }

  /** Удаляем текущий элемент из списка детей родителя, но dispose() для него не вызываем. Программист должен сам в конце концов вызвать dispose() для этого элемента */
  public detach() {
    if(this._parent && this._parent._children)
      this._parent._children.remove(this, false); 
  }

  /**
   * Создаем и возвращаем объект-расширение для хранения приватных свойств
   * @param type Тип класса,  которые надо расширить
   * @typeParam T: Тип расширения
   * @typeParam O: Тип хозяина
   * Механизм расширений позволяет системному программисту не публиковать приватные члены и методы, видимые прикладному программисту.
   */
  public extend<E>(type: new (owner: Element) => E): E {
    if(this._extension && this._extension.dispose)
      this._extension.dispose;
    this._extension = new type(this) as IDisposable;
    return this._extension as E;
  }

  /** Возвращаем расширение */
  public getExtension<E>(): E {
    return this._extension as E;
  }

  /** Выполняем указанное действие с расширением */
  public withExtension<E>(action: (e: E) => void): E {
    if(this._extension)
      action(this._extension as E);
    return this._extension as E;
  }

  private _extension: IDisposable;
}
