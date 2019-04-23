//summary: Формы и методы управления формами
//alias:   Ragtime.Form

import linq from "linq";

import { IMap, FORM } from "Ragtime.Types";
import { loadClass } from "Ragtime.Misc";
import { TypedCallbacks as Callbacks } from "Ragtime.Callbacks";
import { ICommandHost, Command, Options as CommandOptions } from "Ragtime.Command";
import * as Error from "Ragtime.Error";
import * as Dialog from "Ragtime.Dialog";
import * as ComponentState from "Ragtime.ComponentState";

import { IModelHost } from "Ragtime.ViewModel";

import { EventEventArgs, IControlHost } from "Ragtime.Ui";
import { Control } from "Ragtime.Ui.Control";

import { IItemForm } from "Ragtime.RefObject.ItemForm";
import { IFolderForm } from "Ragtime.RefObject.FolderForm";
import { ILookupForm } from "Ragtime.RefObject.LookupForm";
import * as RefObject from "Ragtime.RefObject";

import * as Application from "../Application";
import { IListForm } from "./ListForm";


/** Базовый класс формы */
export abstract class Form implements IModelHost, ICommandHost, IControlHost, FORM {

  constructor() {
    this.__id = ++Form._lastId;
    this.whenActivate.add((isNew: boolean) => {
      this.onActivate(isNew);
      if(isNew)
        this.onShow();
    });
    this.whenActivate.add((isNew: boolean) => {
      if(isNew)
        ComponentState.retrieveState(this);
    });
    this.whenFocus.add(() => this.onFocus());
    this.whenBlur.add(() => this.onBlur());
    this.whenKeyPress.add((e: EventEventArgs) => this.onKeyPress(e));
  }

  /** Освобождаем ресурсы */
  dispose() {
    this.whenDispose.fire();
    this.whenDispose.clear();
    this.disposeSubscriptions();
    this.whenClose.clear();
    this.whenFocus.clear();
    this.whenBlur.clear();
    this.whenKeyPress.clear();
    this.beforeShow.clear();
    this.whenActivate.clear();
    this.whenActivateOnce.clear();
  }

  /** Дополнительные обработчики закрытия */
  readonly whenClose = new Callbacks<() => Promise<void>>();

  /** Дополнительные обработчики - деструкторы */
  readonly whenDispose = new Callbacks();

  /** Заголовок */
  title = ko.observable("");

  /** Иконка */
  icon = ko.observable("");

  /** Путь (часть адреса). Отображается в адресной строке, является глобально уникальным идентификатором. Если не указан явно - вычисляется автоматически (на этапе компиляции) */
  path: string;

  /** Приоритет. Помогает выбрать форму в том случае, если две формы оказались по одному и тому же пути  */
  priority: string;

  /** Использовать флаг modified? */
  trackModified: boolean;

  /** Настройки модальной формы */
  modalOptions: ModalOptions = {};

  /** Настройки поведения */
  behaviorOptions: BehaviorOptions = {};


  /** Признак "Содержит несохраненные данные" */
  public readonly modified = ko.computed({
    read: () => {
      if(!this._modified)
        this._modified = ko.observable(false);
      return this._modified();
    },
    write: (value: boolean) => { 
      if(this.trackModified) {
        if(value !== this._modified()) {
          this._modified(value); 
          this._modified.notifySubscribers(value);
        }
      }
    },
  });
  private _modified: KnockoutObservable<boolean>;

  /** Признак "Только для чтения". Внимание! Тип этого признака - Observable! */
  get readOnly(): KnockoutObservable<boolean> {
    if(!this._readOnly)
      this._readOnly = ko.observable(false);
    return this._readOnly
  }
  set readOnly(value: KnockoutObservable<boolean>) {
    this.subscribe(value, _ => this.readOnly(value()));
  }
  private _readOnly: KnockoutObservable<boolean>;

  /** Наследник обязан вернуть шаблон содержимого */
  abstract getContent(): JSX.Element;

  /** Наследник реализует этот метод для записи данных формы. Возвращает признак успешности записи */
  async write(): Promise<boolean> {
    this.modified(false);
    return true;
  }

  /** Находит другую такую же форму с переданными параметрами. Если какие-то параметры не переданы - значения будут взяты из параметров этой формы */
  getAnotherOpened(params: IMap<string> = {}): Form {
    var mergedParams: IMap<string> = {};
    var thisParams = ((this as any).params as IMap<string>) || {};
    Object.keys(thisParams).forEach(k => mergedParams[k] = k in params ? params[k] : thisParams[k]);
    return findByAddress({ path: this.path, params: mergedParams });
  }
  
  /** Показываем форму. Форма покажется модально или немодально (зависит от behaviorOptions) Результат разрешится, когда форма закроется */
  async show(options?: ShowOptions): Promise<boolean> {
    if(!options || !('modal' in options) || typeof(options.modal) !== 'boolean') {
      options = options || {};
      var thereAreModals = !!Application.layout.findForm(_ => _.modal);
      if(thereAreModals)
        options.modal = true;
    }

    if(Application.layout.isFormShown(this))
      return Application.layout.focusForm(this);

    if(!options.modal) {
      if(options.reuse === undefined)
        options.reuse = this.behaviorOptions.preferReuse;
      if(options.reuse) {
        var openedForm = findByAddress(getAddress(this));
        if(openedForm)
          return Application.layout.focusForm(openedForm);
      }
    }

    if(options.modal === undefined)
      options.modal = !!this.behaviorOptions.preferModal;
    if(options.modal) {
      options.modal = true;
      options.root = false;
      return Application.layout.showForm(this, options);
    }
    else {
      options.modal = false;
      return Application.layout.showForm(this, options);
    }
  }

  /** Показываем форму немодально. Результат разрешится, когда форма закроется */
  async showModeless(options?: ShowOptions) {
    options = options || {};
    options.modal = false;
    return this.show(options);
  }

  /** Показываем форму модально. Результат разрешится, когда форма закроется */
  async showModal(options?: ShowOptions): Promise<boolean> {
    options = options || {};
    options.modal = true;
    options.root = false;
    return this.show(options);
  }

  /** Показываем форму в отдельной вкладке браузера */
  async spawn(options?: ShowOptions): Promise<boolean> {
    if(this.modified()) {
      await Dialog.showInfo("Нужно сохранить изменения в форме, прежде чем Вы сможете открыть ее в новом окне.");
      return false;
    }
    if(!(await this.canClose()))
      return false;
    Application.layout.spawnForm(this);
    return true;
  }

  /** Закрываем форму, указывая результат */
  async close(result?: boolean): Promise<boolean> {
    if(result === undefined || result === null)
      result = false;
    if(result !== true)
      result = false;

    let info = Application.layout.getFormInfo(this);
    if(!info)
      return true;
    if(info.modal && !Application.layout.isTopLevelForm(this))
      return false;
    if(await this.canClose()) {
      await this.whenClose.fireAsync();
      Application.layout.closeForm(this, result);
      afterClose.fire(this);
      return true;
    }
    else
      return false;
  }

  /** Наследник может переопределить этот метод, чтобы вмешаться в процесс закрытия формы */
  async canClose(): Promise<boolean> {
    if(!this.modified())
      return true;

    var action = await Dialog.choice("Подтверждение", "Форма содержит несохраненные данные. Что надо сделать?", [
      { value: "save", text: "Сохранить и закрыть" },
      { value: "doNotSave", text: "Не сохранять, закрыть" },
      { value: "cancel", text: "Не закрывать" },
    ]);

    let result = true;
    if(action === "cancel")
      result = false;
    else {
      if(action !== "doNotSave") {
        result = await this.write();
        if(result)
          this.modified(false);
      }
    }
    return result;
  }

  /** Перемещаем форму на передний план */
  async focus() {
    Application.layout.focusForm(this);
  }

  /** Эта форма активна? */
  get focused() {
    return Application.layout.getFocusedForm() === this;
  }

  /** Возвращаем промис, который разрешится, когда форма закроется. Если форма не открыта, возвращаем разрешенный промис */
  get result(): Promise<boolean> {
    let result = Application.layout.getFormResult(this);
    result = result || Promise.resolve(false);
    return result;
  }

  /**
   * Обработчик активации формы
   * @param isNew если true, то форма только что создана
   */
  onActivate(isNew: boolean): void { }
  readonly whenActivateOnce = new Callbacks();
  readonly whenActivate = new Callbacks<(isNew: boolean) => any>();

  /** Вызывается асинхронно перед тем, как форма будет показана */
  readonly beforeShow = new Callbacks<() => Promise<void>>();

  /** Вызывается, когда форма показывается первый раз Эквивалентно onActivate(true) */
  onShow(): void { }

  /** Вызывается, когда форма выходит на передний план */
  onFocus(): void { }
  readonly whenFocus = new Callbacks();

  /** Вызывается, когда форма уходит с переднего плана */
  onBlur(): void { }
  readonly whenBlur = new Callbacks();

  /** Вызывается, когда на форме где угодно нажата клавиша */
  onKeyPress(e: EventEventArgs): void { }
  readonly whenKeyPress = new Callbacks<(e: EventEventArgs) => any>();

  /** Уникальный идентификатор экземпляра */
  get _id(): number { return this.__id; }
  private __id: number;
  private static _lastId = 0;

  /** Метод вызывается, когда форма открывается первый раз или когда выбирается вкладка с немодальной формой. Для внутреннего использования, не вызывай напрямую */
  _onActivate(isNew: boolean): void {
    this.whenActivateOnce.fire();
    this.whenActivateOnce.clear();
    this.whenActivate.fire(isNew);
  }

  /** Метод вызывается, когда форма перемещается на передний план. Для внутреннего использования, не вызывай напрямую */
  _onFocus(): void {
    this.whenFocus.fire();
  }

  /** Метод вызывается, когда форма уходит с переднего плана. Для внутреннего использования, не вызывай напрямую */
  _onBlur(): void {
    this.whenBlur.fire();
  }

  /** Регистрация команды (реализация интерфейса ICommandHost) */
  addCommand(command: Command) {
  }

  /** Реализация интерфейса IControlHost */
  handleInteractiveEvent<T>(handler: () => T): Promise<T> {
    return Promise.resolve(handler && handler());
  }

  /** Стандартная команда "Сохранить" */
  cmdSave = new Command(this, {
    id: "save", text: "Сохранить", icon: "fas fa-save", hideText: true, accessKey: "Ctrl+S",
    disabled: ko.pureComputed(() => !this.modified()),
    handler: () => this.write()
  });

  /** Стандартная команда "Сохранить и закрыть" */
  cmdSaveAndClose = new Command(this, {
    id: "saveAndClose", text: ko.pureComputed(() => this.modified() ? "Сохранить и закрыть" : "Закрыть"), 
    icon: ko.pureComputed(() => this.modified() ? "fas fa-save" : "fas fa-times"),
    handler: async () => { 
      let ok = true;
      if(this.modified())
        ok = await this.write();
      if(ok)
        await this.close(true); 
    }
  });

  /** Сохраняем произвольные данные состояния в контексте формы */
  public storeState(key: string, value: any): void {
    if('localStorage' in window && window['localStorage'] !== null)
      localStorage[this.stateKey(key)] = JSON.stringify(value);
  }

  /** Получаем данные, сохраненные ранее вызовом storeState() */
  public retrieveState(key: string): any {
    if('localStorage' in window && window['localStorage'] !== null) {
      let result = localStorage[this.stateKey(key)];
      return !!result ? JSON.parse(result) : null;
    }
  }

  /** Конструируем ключ для методов storeState, retrieveState */
  private stateKey(key: string) {
    return key = `${this.path || "*"}&${key || ""}`;
  }

  /** Утилитный метод: подписываемся на изменение. Подписка будет отменена при разрушении формы*/
  protected subscribe<T>(value: KnockoutSubscribable<T>, handler: (value: T) => any) {
    if(ko.isObservable(value)) {
      if(!this._subscriptions)
        this._subscriptions = [];
      this._subscriptions.push(value.subscribe(handler));
    }
  }
  private disposeSubscriptions() {
    if(this._subscriptions) {
      for(let s of this._subscriptions)
        s.dispose();
      this._subscriptions = null;
    }
  }
  private _subscriptions: KnockoutSubscription[];

  /** Указанный компонент лежит на форме? */
  public owns(component: any): boolean {
    if(!component)
      return false;
    let $myElement = Application.layout.getFormMarkup(this);
    if(!$myElement.length)
      return false;
    let myElement = $myElement.get(0);
    let element: HTMLElement;
    if(component instanceof Control) 
      element = component.element;
    while(element) {
      if(element === myElement)
        return true;
      element = element.parentElement;
    }
    return false;
  }
}


/** Настройки открываемого окна */
export interface ShowOptions {

  /** Открывать окно модально? */
  modal?: boolean;

  /** Это окно - корень иерархии окон? */
  root?: boolean;

  /** Найти такое же открытое окно и показать его */
  reuse?: boolean;
}


/** Настройки модального окна */
export interface ModalOptions {

  /** Открывать окно на полный экран */
  fullScreen?: boolean;

  /** Ширина */
  width?: any;

  /** Ограничение по ширине */
  maxWidth?: any;

  /** Высота */
  height?: any;

  /** Ограничение по высоте */
  maxHeight?: any;
  

  /** Не показывать заголовок */
  hideCaption?: boolean;

  /** Не показывать кнопку закрытия */
  hideCloseButton?: boolean;

  /** Можно менять размер ? */
  resizeEnabled?: boolean;
}


/** Настройки поведения формы */
export interface BehaviorOptions {

  /** Окно может выдеть неавторизованный пользователь */
  allowAnonymousUser?: boolean;

  /** show() будет открывать окно модально */
  preferModal?: boolean;

  /** show() будет искать такую же открытую форму */
  preferReuse?: boolean;
}


/** Роль (предназначение) формы. Внимание! Числа лучше не менять. */
export const enum FormRole {

  /** Форма общего вида */
  None = 0,

  /** Форма элемента */
  Item = 1,

  /** Форма списка */
  List = 2,

  /** Форма поиска */
  Lookup = 3,

  /** Форма папки */
  Folder = 4,
}


/** Описание формы. Обязано быть согласовано с Ragtime.Unit.Form */
export interface Info {

  /** Путь (часть адреса) */
  path: string;

  /** Имя модуля, в котором располагается форма */
  moduleName: string;

  /** Имя класса */
  className: string;

  /** Список параметров */
  params: ParamInfo[];

  /** Идентификатор типа метаданных */
  typeId?: string,

  /** Роль формы (т.е. ее предназначение) */
  role?: FormRole,

  /** Приоритет. Если есть несколько форм с одинаковыми параметрами, то будет выбрана с бОльшим приоритетом */
  priority?: number,
}


/** Параметр формы. Обязано быть согласовано с Ragtime.Client.FormParam */
export interface ParamInfo {
  name: string;
  type: string;
}


/** Регистрируем форму */
export function register(info: Info) {
  let path = info.path.toLocaleLowerCase();
  if(!info.priority)
    info.priority = 0;
  let oldInfo = formsByPath.get(path);
  if(!oldInfo || oldInfo.priority <= info.priority)
    formsByPath.set(path, info);
  if(info.typeId) {
    var key = info.typeId.toLowerCase();
    if(!formsByTypeId.has(key))
      formsByTypeId.set(key, []);
    formsByTypeId.get(key).push(info);
  }
}

/** Создаем и возвращаем форму по ее пути */
export async function getByPath(path: string, params?: IMap<string>): Promise<Form> {
  let info = formsByPath.get((path || "").toLocaleLowerCase());
  if(!info)
    Error.Operation.throw("39B5E3854FBB", "Форма не найдена. Путь: " + path);
  let formType = await load(info);
  let form = new formType() as Form;
  if(params) {
    let args = (info.params || []).map(_ => parseParameter(params[_.name], _.type));
    let setParams = (form as any).setParams as Function;
    if(setParams)
      form.whenActivateOnce.add(() => setParams.apply(form, args));
  }
  return form;
}

/** Форма показывается? */
export function shown(form: Form) {
  return Application.layout.isFormShown(form);
}

/** Создаем и возвращаем форму элемента */
export async function getItem(typeId: string): Promise<IItemForm> {
  let info = getInfo(typeId, FormRole.Item);
  let formType = await load(info);
  return new formType();
}

/** Создаем и возвращаем форму папки */
export async function getFolder(typeId: string): Promise<IFolderForm> {
  let info = getInfo(typeId, FormRole.Folder);
  let formType = await load(info);
  return new formType();
}

/** Существуют формы хотя бы в одной из указанных ролей? */
export function exists(typeId: string, ...roles: FormRole[]): boolean {
  return linq(formsByTypeId.get(typeId) || []).any(info => roles.indexOf(info.role) >= 0);
}

/** Создаем (или переиспользуем открытую) и показываем форму элемента, а также дожидаемся её закрытия */
export async function showItem(typeId: string, ref: string, options: ShowOptions = {}): Promise<{ form: IItemForm, result: boolean }> {
  let form = await getItem(typeId);
  if(options.reuse === undefined)
    options.reuse = true; // По соглашению, все формы элемента не должны открываться несколько раз

  let result: boolean;
  let oldForm = form.getAnotherOpened({ ref: ref });

  if(options.reuse && oldForm) 
    result = await Application.layout.focusForm(oldForm);
  else {
    await form.get(ref);
    result = await form.show(options);
  }
  return {
    form: (oldForm || form) as IItemForm,
    result: result
  };
}

/** Создаем и показываем форму папки */
export async function showFolder(typeId: string, ref: string): Promise<void> {
  let form = await getFolder(typeId);
  await form.get(ref);
  await form.show();
}

/** Создаем и показываем форму элемента или папки */
export async function showItemOrFolder(typeId: string, ref: string) {
  let dto = await RefObject.get(typeId, ref);
  if(dto.IsFolder) {
    let form = await getFolder(typeId);
    form.get(dto);
    await form.show();
  }
  else {
    let form = await getItem(typeId);
    form.get(dto);
    await form.show();
  }
}

/** Создаем и возвращаем форму поиска */
export async function getLookup(typeId: string): Promise<ILookupForm> {
  let info = getInfo(typeId, FormRole.Lookup);
  let formType = await load(info);
  return new formType() as ILookupForm;
}

/** Создаем и возвращаем форму списка */
export async function getList(typeId: string): Promise<IListForm> {
  let info = getInfo(typeId, FormRole.List);
  let formType = await load(info);
  return (new formType() as IListForm);
}

/** Загружаем модуль формы, возвращаем тип формы */
async function load(info: Info) {
  return loadClass(info.moduleName, info.className);
}

/** Получаем адрес формы: путь и параметры. Адрес предназначер для отображения в адресной строке */
export function getAddress(form: Form): { path: string, params: IMap<string> } {
  let result = {
    path: "",
    params: {} as IMap<string>,
  };
  if(form) {
    result.path = form.path || "";
    let info = formsByPath.get(result.path.toLocaleLowerCase());
    if(info && info.params) {
      let paramValues = (form as any)["params"] || {};
      for(let paramInfo of info.params) {
        let p = encodeParameter(ko.unwrap(paramValues[paramInfo.name]), paramInfo.type);
        if(p !== undefined)
          result.params[paramInfo.name] = p;
      }
    }
  }
  return result;
}

/** Ищем уже открытую форму с таким же адресом, как и переданная не открытая. Если не найдена - null. */
export function findByAddress(addr: {path: string, params: IMap<string> }): Form {
  let mergeAddr = (addr: { path: string, params: IMap<string> }) => {
    return addr.path + '?' + Object.keys(addr.params).sort().map(k => encodeURIComponent(k) + "=" + encodeURIComponent(addr.params[k])).join('&');
  }

  let thisAddr = mergeAddr(addr);
  var formInfo = Application.layout.findForm(_ => mergeAddr(getAddress(_.form)) === thisAddr);
  return formInfo ? formInfo.form : null;
}

/** Подписываемся на изменение параметров */
export function watchParams(form: Form, handler: () => any): KnockoutSubscription[] {
  let result: KnockoutSubscription[] = [];
  if(form) {
    let path = form.path || "";
    let info = formsByPath.get(path.toLocaleLowerCase());
    if(info && info.params) {
      let formParams = (form as any)["params"] || {};
      for(let paramInfo of info.params) {
        let param = formParams[paramInfo.name];
        if(param && param.subscribe)
          result.push(param.subscribe(handler));
      }
    }
  }
  return result;
}


/** Событие: Форма закрылась */
export const afterClose = new Callbacks<(form: Form) => void>();


/** Парсим значение параметра формы */
function parseParameter(value: string, type: string): any {
  if(value === undefined || value === null)
    return value;
  switch(type) {
    case "boolean":
      return !!value;
    case "number":
      return parseFloat(value);
    case "string":
      return value;
    default:
      return value;
  }
}

/** Кодируем значение параметра формы */
function encodeParameter(value: any, type: string): string {
  if(value === undefined || value === null)
    return undefined;
  switch(type) {
    case "string":
      return value;
    case "boolean":
      return (!!value) + "";
    case "number":
    default:
      return value + "";
  }
}

/** Зарегистрированные формы. Ключ - path */
var formsByPath = new Map<string, Info>();

/** Зарегистрированные формы. Ключ - MetadataTypeId, значение - список описаний */
var formsByTypeId = new Map<string, Info[]>();

/** Ищем форму */
function getInfo(typeId: string, role: FormRole): Info {
  let results = (formsByTypeId.get((typeId || "").toLowerCase()) || []).filter(_ => _.role === role);
  Error.Operation.throwIf(results.length == 0, "BB341FE7D163", "Form not found");
  return results.reduce((a, b) => a.priority > b.priority ? a : b);
}
