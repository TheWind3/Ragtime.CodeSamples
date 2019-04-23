//bundle:true

import { Observables } from "Ragtime.Types";
import { Element } from "./Element";


/** Публичный интерфес списка элемента разметки */
export interface IElements<T = any> extends Iterable<T> {
  /*
    АРХИТЕКТОРУ
    Методы для управления списком (добавить, удалить, переместить) в этом интерфейсе спроектированы не просто так.
    Прикладному программисту предоставляется возможность добавить новый элемент в список или переместить существующий (append, insertAt, insertAfter).
    Метод remove не включен сознательно: чтобы удалить элемент из списка программист должен вызвать метод element.remove(), что приведет к его удалению и dispose()
    Причина такого решения - борьба с потерей памяти и необходимость вызывать dispose().
  */

  /** Индекс элемента, или -1 */
  indexOf(item: T): number;

  /** Число элементов */
  readonly length: number;

  /** Получаем элемент */
  at(index: number): T;

  /** Добавляем элемент(ы) в конец списка */
  append(...items: T[]): void;

  /** Добавляем элемент на указанное место */
  insertAt(item: T, index: number): void;

  /** Добавляем элемент после указанного, или в конец списка */
  insertAfter(item: T, after: any): void;

  /** Удаляем все элементы */
  clear(): void

  /** Включаем слежение за опциями элементов */
  watchOptions(): void;

  /** Что-то изменилось? */
  readonly modified: boolean;

  /** Список элементов изменился? */
  readonly listModified: boolean;

  /** Опции элементов изменились? */
  readonly optionsModified: boolean;

  /** Возвращаем элементы указанного типа */
  ofType<C>(type: new () => C): C[];

  /** Возвращаем сырые данные */
  getData(): any[];
}


/** Базовый класс списка элементов разметки */
export class ElementsBase {

  constructor(owner: Element, items: Observables<Iterable<any>>) {
    this._owner = owner;
    this._owner.addRelatives(this);
    this.suspend();
    try {
      this.setData(items);
    }
    finally {
      this.resume();
    }
  }

  public getData(): any[] {
    return this._data || [];
  }

  public setData(value: Observables<Iterable<any>>) {
    let data: Iterable<any>;
    if(this._subscription) {
      this._subscription.dispose();
      this._subscription = undefined;
    }
    if(ko.isObservable(value)) {
      data = value();
      this._subscription = value.subscribe((newData: any[]) => {
        if(!this.disposed)
          this.setFlatData(newData)
      });
    }
    else
      data = (value as Iterable<any>);
    this.setFlatData(data);
  }

  private setFlatData(data: Iterable<any>) {
    let value = Array.from(data || []);
    if(!this._data.length && !value.length)
      return;
    while(this.length > 0)
      this.removeAt(0, true); // remove and dispose
    this._data = [];
    this.append(...value);
  }

  indexOf(item: any) {
    return this._data.indexOf(item);
  }

  at(index: number): any {
    return this._data[index];
  }

  get length() {
    return this._data.length;
  }

  remove(item: any, dispose?: boolean) {
    this.removeAt(this.indexOf(item), dispose);
  }

  removeAt(index: number, dispose?: boolean) {
    let removed = this._data.splice(index, 1);
    if(removed.length === 1) {
      let item = removed[0];
      if(item instanceof Element) {
        item._parent = undefined;
        item.whenModified.remove(this._optionsWatcher);
        if(dispose)
          item.dispose();
      }
      this.listModified = true;
      this.setModified(true);
    }
  }

  append(...items: any[]) {
    for(let item of items)
      this.insertAt(item, this._data.length);
  }

  insertAfter(item: any, after: any) {
    let index = this.indexOf(after);
    if(index < 0)
      index = this._data.length;
    this.insertAt(item, index);
  }

  insertAt(item: any, index: number) {
    let itemAsMarkupElement = item instanceof Element ? item : null;

    // Удаляем элемент у предыдущего родителя. 
    if(itemAsMarkupElement) {
      itemAsMarkupElement.errorIfDisposed();
      itemAsMarkupElement.whenModified.remove(this._optionsWatcher);
      let oldParent = itemAsMarkupElement._parent;
      if(oldParent) {
        let oldIndex = oldParent.children.indexOf(item);
        if(oldParent === this._owner) {
          if(oldIndex === index)
            return; // Оказывается, мы пытаемся добавить этот же элемент на его же место
          else if(oldIndex < index)
            index -= 1; // после удаления старого элемента новый элемент "сдвинется" назад
        }
        if(oldParent._children)
          oldParent._children.removeAt(oldIndex);
      }
    }

    // Добавляем элемент к текущему родителю
    this._data.splice(index, 0, item);

    // Устанавливаем элементу нового родителя
    if(itemAsMarkupElement) {
      itemAsMarkupElement._parent = this._owner;
      if(this._watchOptions)
        itemAsMarkupElement.whenModified.add(this._optionsWatcher);
    }

    // Оповещаем хозяина об изменении
    this.listModified = true;
    this.setModified(true);
  }

  clear(): void {
    while(this.length > 0) 
      this.removeAt(0, true);
  }

  dispose() {
    if(this._subscription) {
      this._subscription.dispose();
      this._subscription = undefined;
    }
    this.forEachMarkupElement(e => e.dispose());
    this._disposed = true;
  }

  public get disposed() {
    return this._disposed;
  }
  private _disposed: boolean;

  /** Включаем слежение за опциями элементов */
  watchOptions() {
    if(!this.disposed) {
      this._watchOptions = true;
      this.forEachMarkupElement(_ => _.whenModified.add(this._optionsWatcher));
    }
  }
  private _watchOptions: boolean;

  /** Обработчик изменения опций элементов */
  private _optionsWatcher = () => {
    if(!this.disposed) {
      this._optionsModified = true;
      this.setModified(true);
    }
  };

  /** Что-то изменилось? */
  get modified(): boolean {
    return this._modified;
  }
  private _modified = false;

  /** Флаг "Состав элементов изменился" */
  get listModified(): boolean {
    return !!this._listModified;
  }
  set listModified(value: boolean) {
    if(!this._suspended && !this.disposed)
      this._listModified = value;
  }
  private _listModified: boolean;

  /** Флаг "Опции элементов изменились" */
  get optionsModified(): boolean {
    return !!this._optionsModified;
  }
  private _optionsModified: boolean;

  /** Устанавливаем флаг изменений */
  public setModified(value: boolean) {
    if(this._suspended || this.disposed)
      return;
    value = !!value;
    if(value === this._modified)
      return;
    this._modified = value;
    if(value) {
      this._owner.setModified(true);
    }
    else {
      this.listModified = false;
      this._optionsModified = false;
      if(this._watchOptions) 
        this.forEachMarkupElement(_ => _.setModified(false));
    }
  }

  /** Перестаем оповещать об изменениях */
  private suspend() {
    this._suspended += 1;
  }

  /** Начинаем оповещать об изменениях */
  private resume() {
    this._suspended -= 1;
  }


  /** Выполняем действие над каждым элементов, который является MarkupElement-ом */
  private forEachMarkupElement(action: (e: Element) => void) {
    for(let child of this._data) {
      if(child instanceof Element)
        action(child);
    }
  }

  /** Возвращаем элементы указанного типа */
  ofType<T>(type: new () => T): T[] {
    return this._data.filter(_ => _ instanceof type);
  }

  [Symbol.iterator]() {
    return this._data[Symbol.iterator]();
  }

  protected _data: any[] = [];
  private _owner: Element;
  private _subscription: KnockoutSubscription;
  private _suspended = 0;
}


/** Список детей элементов разметки */
export class Elements extends ElementsBase implements IElements {
  [Symbol.iterator]() {
    return this._data[Symbol.iterator]();
  }
}


/** Список одинаковых элементов разметки */
export class TypedElements<T> extends ElementsBase implements IElements<T> {
  [Symbol.iterator](): IterableIterator<T> {
    return this._data[Symbol.iterator]();
  }
}
