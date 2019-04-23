//summary: Управление внешним видом приложения
//alias:   Ragtime.Layout

import * as DevExpress from "dx";
import { IMap } from "Ragtime.Types";
import * as Form from "./Forms/Form";
import * as Application from "./Application";
import * as AppCommand from "./AppCommand/AppCommand";


/** Внешний вид приложения */
export abstract class Layout {

  /** Наследник должен вернуть разметку */
  protected abstract getMainView(): HTMLElement;

  /** Наследник должен показать инициализировать ViewPort */
  protected abstract initViewPort(viewPort: HTMLElement): void;

  /** Наследник должен показать и активировать форму немодально */
  protected abstract showFormModeless(formInfo: FormInfo, options: Form.ShowOptions): void;

  /** Наследник должен показать форму модально */
  protected abstract showFormModal(formInfo: FormInfo, options: Form.ShowOptions): Promise<void>;

  /** Наследник должен вывести форму на передний план */
  protected abstract focusModelessForm(formInfo: FormInfo): void;

  /** Наследник должен закрыть немодальную форму */
  protected abstract closeModelessForm(formInfo: FormInfo): void;

  /** Наследник должен закрыть модальную форму */
  protected abstract closeModalForm(formInfo: FormInfo): void;

  /** Наследник должен вернуть элемент содержимого */
  protected abstract getMarkup(formInfo: FormInfo): JQuery;

  /** OBSOLETE: Наследник должен отобразить команды формы */
  protected abstract renderFormCommands(formInfo: FormInfo): void;

  /** Наследник должен перерисовать layout */
  protected abstract refresh(): void;

  /** Наследник может инициализировать свой экземпляр FormInfo */
  protected initFormInfo(formInfo: FormInfo): void {
    formInfo.subscriptions.push(formInfo.focused.subscribe((newValue) => { this.onFocusedChanged(formInfo, newValue); }));
    formInfo.subscriptions.push(...Form.watchParams(formInfo.form, this.updateAddress.bind(this)));
  }

  /** Наследник может очистить свой экземпляр FormInfo */
  protected disposeFormInfo(formInfo: FormInfo): void {
    formInfo.form.dispose();
    for(let s of formInfo.subscriptions)
      s.dispose();
    delete formInfo.subscriptions;
  }

  /** Инициализация */
  initialize(): void {
    let viewPort = document.createElement("div");
    viewPort.classList.add("dx-viewport");
    this.initViewPort(viewPort);
    document.body.appendChild(viewPort);

    let element = this.getMainView();
    viewPort.appendChild(element);

    Application.user().beforeLogout.add(() => this.closeAllForms(f => !f.behaviorOptions.allowAnonymousUser));
    Application.user().afterUpdate.add(() => this.refresh());
    AppCommand.enabled.subscribe(() => this.refresh()); // подписка пусть живет до конца приложения

    window.onhashchange = () => this.showFormFromAddress();
  }

  /** Возвращаем viewPort приложения */
  get viewPort(): JQuery {
    return (DevExpress as any).viewPort();
  }

  /** Возвращаем описание формы, или null */
  getFormInfo(form: Form.Form): FormInfo {
    return this._formById[form._id];
  }

  /** Возвращаем разметку формы. Никогда не null, но можем вернуть пустой jQuery-объект */
  getFormMarkup(form: Form.Form): JQuery {
    let info = this._formById[form._id];
    if(!info)
      return $();
    else
      return this.getMarkup(info) || $();
  }

  /** Форма показывается ? */
  isFormShown(form: Form.Form) {
    return !!(this._formById[form._id]);
  }

  /** Возвращаем активную форму, или null */
  getFocusedForm(): Form.Form {
    let result = this.findForm(_ => _.focused());
    return result ? result.form : null;
  }

  /** Возвращаем промис, который разрешися, когда форма закроется, или null */
  getFormResult(form: Form.Form) {
    let info  = this._formById[form._id];
    return info ? info.result : null;
  }

  /** Форма находится на верхушке стека форм? */
  isTopLevelForm(form: Form.Form) {
    let child = this.findForm(_ => _.opener && _.opener.form === form);
    return !child;
  }

  /** Показываем форму, указанную в адресной строке браузера */
  async showFormFromAddress() {
    let hash = window.location.hash;
    if(hash) {
      let iQ = hash.indexOf("?");
      if(iQ < 0)
        iQ = hash.length;
      let path = hash.substring(1, iQ);
      let params: IMap<string> = {};
      for(let param of hash.substring(iQ + 1).split("&").map(_ => _.split("="))) {
        if(param.length === 2)
          params[decodeURIComponent(param[0])] = decodeURIComponent(param[1]);
      }
      let form = await Form.getByPath(path, params);

      if(!form.behaviorOptions.allowAnonymousUser) {
        let user = Application.user();
        if(!user.isAuthenticated) {
          if(!(await user.login()))
            return;
        }
      }

      form.show(); // await не нужен !
    }
    else
      this.updateAddress();
  }

  /** Показываем форму */
  async showForm(form: Form.Form, options: Form.ShowOptions): Promise<boolean> {
    let targetInfo = new FormInfo(form);
    this._formById[form._id] = targetInfo;
    this.initFormInfo(targetInfo);
    let focusedInfo = this.findForm(_ => _.focused());
    targetInfo.modal = options.modal;
    if(!options.root)
      targetInfo.opener = focusedInfo;

    await form.beforeShow.fireAsync();

    let promise: Promise<void> = null;
    if(targetInfo.modal) 
      promise = this.showFormModal(targetInfo, options);
    else 
      this.showFormModeless(targetInfo, options);

    this.renderFormCommands(targetInfo);
    if(focusedInfo)
      focusedInfo.focused(false);
    targetInfo.focused(true);
    this.onActivate(targetInfo);
    this.updateAddress();

    if(promise)
      await promise;
    
    targetInfo.$markup.bind('keypress', e => targetInfo.form.whenKeyPress.fire({ jQueryEvent: e, element: targetInfo.$markup, component: targetInfo.form }))
    return targetInfo.result;
  }

  /** Открываем форму в новом окне */
  spawnForm(form: Form.Form) {
    let location = this.getFormLocation(this._formById[form._id], true);
    window.open(location, "_blank");
    this.closeForm(form, false);
  }

  /** Выводим форму на передний план. Возвращаем результат формы (form.result) */
  focusForm(form: Form.Form): Promise<boolean> {
    let focusedInfo = this.findForm(_ => _.focused());
    let targetInfo = this._formById[form._id];
    if(targetInfo.modal) {
      if(!this.isTopLevelForm(form))
        targetInfo = null;
    }
    else 
      this.focusModelessForm(targetInfo);
    if(focusedInfo && focusedInfo !== targetInfo)
      focusedInfo.focused(false);
    if(targetInfo) {
      targetInfo.focused(true);
      if(!targetInfo.modal) {
        if(!focusedInfo || (!focusedInfo.modal && focusedInfo != targetInfo))
          this.onActivate(targetInfo);
      }
    }
    this.updateAddress();
    return (targetInfo && targetInfo.result) || Promise.resolve(false);
  }

  /** Закрываем форму. Форма обязана существовать */
  closeForm(form: Form.Form, result: boolean): void {
    let targetInfo = this._formById[form._id];
    let opener = targetInfo.opener;
    let wasFocused = targetInfo.focused();

    delete this._formById[targetInfo.form._id];
    this.forAllForms(_ => _.opener = null, _ => _.opener === targetInfo);

    targetInfo.focused(false);
    if(targetInfo.modal)
      this.closeModalForm(targetInfo);
    else
      this.closeModelessForm(targetInfo);
    targetInfo.setResult(!!result);

    this.disposeFormInfo(targetInfo);

    if(wasFocused) {
      if(opener)
        this.focusForm(opener.form);
      else {
        let lastOpened = this.findLastOpened();
        if(lastOpened)
          this.focusForm(lastOpened.form);
      }
    }

    this.updateAddress();
  }

  /** Закрываем все формы. Если закрыть не удалось - возвращаем false */
  async closeAllForms(filter?: (form: Form.Form) => boolean): Promise<boolean> {
    if(!filter)
      filter = f => true;
    for(let id in this._formById) {
      let form = this._formById[id].form;
      if(filter(form)) {
        if(!(await form.close(false)))
          return false
      }
    }
    return true;
  }

  /** Возвращаем формы */
  getForms(inOrder?: boolean): FormInfo[] {
    let result = Object.keys(this._formById).map(_ => this._formById[_]);
    if(inOrder)
      result.sort((a, b) => a.order - b.order);
    return result;
  }

  /** Возвращаем количество открытых форм */
  getFormCount() {
    return Object.keys(this._formById).length;
  }

  theme: Theme = {
    defaultSpacing: 2.5,
  }

  /** Ищем первую форму, удовлетворяющую условию */
  findForm(predicate: (info: FormInfo) => boolean): FormInfo {
    return Object.keys(this._formById).map(_ => this._formById[_]).find(predicate);
  }

  /** Возвращаем последнюю открытую форму, или null */
  findLastOpened() {
    return Object.keys(this._formById).reduce((result, id) => {
      let f = this._formById[id];
      if(!result)
        return f;
      else
        return f.order > result.order ? f : result;
    }, null as FormInfo);
  }

  /** Для всех форм, удовлетворяющих условию, выполняем действие */
  private forAllForms(action: (info: FormInfo) => void, predicate?: (info: FormInfo) => boolean) {
    predicate = predicate || (() => true);
    Object.keys(this._formById).map(_ => this._formById[_]).filter(predicate).forEach(action);
  }

  private onFocusedChanged(formInfo: FormInfo, newValue: boolean): void {
    if(newValue)
      formInfo.form._onFocus();
    else
      formInfo.form._onBlur();
  }

  private onActivate(formInfo: FormInfo) {
    formInfo.form._onActivate(!formInfo.wasActive);
    formInfo.wasActive = true;
  }

  /** Обновляем адресную строку браузера */
  private updateAddress(now?: boolean) {
    if(!now) {
      clearTimeout(this._updateAddressTimeout);
      let self = this;
      this._updateAddressTimeout = setTimeout(() => self.updateAddress(true), 10);
    }
    else {
      let getLocationFrom = this.findForm(_ => _.focused());
      while(getLocationFrom) {
        if(!getLocationFrom.modal)
          break;
        getLocationFrom = getLocationFrom.opener;
      }
      history.replaceState({}, "", this.getFormLocation(getLocationFrom, false));
    }
  }
  private _updateAddressTimeout: number;

  /** Вычисляем адрес переданной формы */
  private getFormLocation(formInfo: FormInfo, full: boolean) {
    let result: string[] = [];
    let address = Form.getAddress(formInfo ? formInfo.form : null);
    let location = window.location;
    if(full) {
      result.push(location.protocol);
      result.push("//");
      result.push(location.hostname);
      if(location.port) {
        result.push(":");
        result.push(location.port);
      }
    }
    result.push(location.pathname);
    result.push("#");
    if(address.path) {
      result.push(address.path);
      address.params = address.params || {};
      let paramNames = Object.keys(address.params);
      if(paramNames.length > 0) {
        result.push("?");
        result.push(paramNames.map(name => encodeURIComponent(name) + "=" + encodeURIComponent(address.params[name])).join("&"));
      }
    }
    return result.join("");
  }

  /** Зарегистрированные формы */
  private _formById: { [id: string]: FormInfo } = {};
}


/** Описание формы */
export class FormInfo {

  constructor(form: Form.Form) {
    this.form = form;
    this.order = ++FormInfo._lastOrder;
    this.result = new Promise((resolve, reject) => { this.setResult = resolve; });
  }

  form: Form.Form;
  modal: boolean;
  focused = ko.observable(false);
  wasActive = false;
  opener: FormInfo;
  $markup: JQuery;

  order: number;
  private static _lastOrder: number = 0;

  result: Promise<boolean>;
  setResult: (value?: boolean) => any;

  subscriptions: KnockoutSubscription[] = [];
}


/** Визуальные настройки приложения */
export interface Theme {

  /** Расстояние между элементами по умолчанию в пикселях */
  defaultSpacing: number;
}
