//summary: Низкоуровневый протокол взаимодействия между клиентской стороной (браузером) и сервером 
//alias:   Ragtime.DataService
//bundle:  true

import { IMap } from "Ragtime.Types";
import { TypedCallbacks as Callbacks } from "Ragtime.Callbacks";


/** Описание ошибки */
export interface Fault {

  /** Сообщение */
  message: string;

  /** Дополнительные сведения */
  details?: string;

  /** Внутренняя ошибка или предназначена пользователю ? */
  isInternal?: boolean;

  /** Код ошибки */
  errorId?: string;
}


/** Результат вызова */
export interface CallResult {

  /** Контекст (то есть this), если имеется */
  context?: any;

  /** Визуальное состояние модели (набор флагов enabled, visible, etc) */
  modelState?: any;

  /** Непосредственно результат вызова */
  result?: any;
}



/** Сигнатура обработчика *Request */
export type RequestHandler = (request: Request) => any;

/** Сигнатура обработчика *Response */
export type ResponseHandler = (response: Response) => any;

/** Сигнатура обработчика *Fault */
export type FaultHandler = (fault: Fault) => any;


/** Регистрируем обработчик, который будет вызываться перед вызовом сервера */
export function addBeforeRequest(handler: RequestHandler) {
  beforeRequest.add(handler);
}
var beforeRequest = new Callbacks<RequestHandler>();

/** Регистрируем обработчик, который будет вызываться сразу после получения ответа от сервера */
export function addAfterResponse(handler: ResponseHandler) {
  afterResponse.add(handler);
}
var afterResponse = new Callbacks<ResponseHandler>();

/** Регистрируем обработчик, который будет вызываться после вызова сервера - неважно, успешного или нет */
export function addAfterRequest(handler: RequestHandler) {
  afterRequest.add(handler);
}
var afterRequest = new Callbacks<RequestHandler>();

/** Регистрируем обработчик, который будет вызываться при ошибке */
export function addWhenFault(handler: FaultHandler) {
  whenFault.add(handler);
}
var whenFault = new Callbacks<FaultHandler>();


/** Вызываем сервер без контекста (вызов "статического" метода) */
export function call<Result = any>(service: string, method: string, args: any, background: boolean = null): Promise<Result> {
  let runNow = !batched;
  if(!batched)
    beginBatch();
  let result = newCall(service, method, null, args, _ => batched.push(_), background);
  if(runNow)
    sendBatch();
  return new Promise<Result>((resolve, reject) => {
    result.then(
      _ => resolve(_.result),
      _ => reject(_));
  });
}

/** Вызываем сервер с контекстом (вызов "метода экземпляра") */
export function callWithContext(service: string, method: string, context: any, args: any, background: boolean = null): Promise<CallResult> {
  let runNow = !batched;
  if(!batched)
    beginBatch();
  let result = newCall(service, method, context, args, _ => batched.push(_), background);
  if(runNow)
    sendBatch();
  return result;
}

/** Вызываем сервер отложенно. Вызов будет сделан либо вместе с первым неотложенным вызовом, либо при вызове batch-а */
export function postponeCall<Result>(service: string, method: string, args: any, priority: boolean = false, background: boolean = null): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    let add 
      = priority 
        ? (_: Call) => postponed.splice(0,0,_) 
        : (_: Call) => postponed.push(_)
      ;
    newCall(service, method, null, args, add, background).then(
      _ => resolve(_.result),
      _ => reject(_));
  });
}
  
/** Начинаем пакет. После вызоваэтого метода ни один вызов DataService-а не пойдет на сервер до момента вызова sendBatch */
export function beginBatch(background: boolean = null) {
  if(!batched)
    batched = [];
  if(background !== null)
    defaultBackground = background;
}

/** Выполняем тело в контексте пакета */
export async function batch(body: () => any): Promise<void> {
  beginBatch();
  try {
    body();
  }
  finally {
    await sendBatch();
  }
}

/** Отправляем накопленный пакет на сервер */
export async function sendBatch(): Promise<void> {
  let done: (value?: any) => any;
  let result = new Promise<void>((resolve, reject) => done = resolve);

  let request: Request = {
    timezoneOffset: new Date().getTimezoneOffset(),
    items: null,
    background: false,
  };

  request.items = (batched || []).concat(postponed);
  request.background = request.items.every(_ => _.background);
  beforeRequest.fire(request); // Это довольно важно - вызвать эти обработчики здесь. Допускаю, что какие-то из этих обработчиков вызовут postponeCall() или call().

  request.items = (batched || []).concat(postponed);
  request.background = request.items.every(_ => _.background);

  let cbcks = callbacks;
  batched = null;
  postponed = [];
  callbacks = {};
  defaultBackground = false;

  try {
    let fetchResult = await fetch("/$data", {
      method: "POST",
      cache: "no-cache",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      credentials: "include",
    });

    if(fetchResult.ok) {
      let response: Response = await fetchResult.json();
      afterResponse.fire(response);
      if(response.fault) {
        handleError(response.fault, request.background);
        return;
      }
      try {
        for(let item of response.items) {
          let call = cbcks[item.callId];
          if(call) {
            if(!item.fault) {
              delete item.callId;
              call.resolve(item);
            }
            else {
              call.reject(item.fault.message);
              if(!call.background)
                whenFault.fire(item.fault);
            }
            try {
              await call.promise;
            }
            catch {
            }
          }
        }
      }
      finally {
        done();
        afterRequest.fire(request);
      }
    }

    else 
      handleError(createFault(fetchResult.status, fetchResult.statusText, await fetchResult.text()), request.background);
  }
  catch(e) {
    handleError(createFault(0, "Неожиданная ошибка", e.message), request.background);
  }

  return result;


  async function handleError(fault: Fault, background: boolean) {
    try {
      for(let id in cbcks) {
        let callback = cbcks[id];
        callback.reject(null);
        try {
          await callback.promise;
        }
        catch {
        }
      }
      if(!background)
        whenFault.fire(fault);
    }
    finally {
      done();
      afterRequest.fire(request);
    }
  }
}


/** Dto пачки */
export interface Request {

  /** Часовой пояс */
  timezoneOffset: number;

  /** Id приложения */
  appInstanceId?: string;

  /** Пользователь (зашифрованный токен) */
  user?: string;

  /** Данные сессии профилирования */
  profilingSession?: any;

  /** Вызовы */
  items: Call[];

  /** Фоновый вызов: о ходе вызова пользователя не оповещаем */
  background: boolean;
}

/** Вызовы */
export interface Call {
  id: number;
  service: string;
  method: string;
  context: any;
  args: any;
  background: boolean,
}

export interface Response {
  authenticated: boolean;
  dbUnderMaintenance: boolean;
  items: Answer[];
  fault: Fault;
}

interface Answer {
  callId: number;
  context: any;
  result: any;
  fault: Fault;
}

interface Callback {
  promise?: Promise<CallResult>;
  resolve?: (value?: any) => any;
  reject?:  (value?: any) => any;
  background?: boolean;
}

/** Создаем новый запрос и помещаем его в список "list" */
function newCall(service: string, method: string, context: any, args: any, add: (call: Call) => any, background: boolean): Promise<CallResult> {
  if(typeof(background) !== "boolean")
    background = defaultBackground;
  let call: Call = {
    id: Object.keys(callbacks).length + 1,
    service,
    method,
    context,
    args,
    background
  };
  add(call);

  let callback: Callback = {};
  callbacks[call.id] = callback;
  callback.promise = new Promise<any>((resolve, reject) => {
    callback.resolve = resolve;
    callback.reject  = reject;
  });
  callback.background = background;
  return callback.promise;
}

export function createFault(status: number, statusText: string, responseText: string): Fault {
  let result: Fault = null;
  if(statusText && statusText != "error") {
    result = {
      message: "Произошла неожиданная ошибка: " + statusText,
    }
  }
  if(!result) {
    if(responseText) {
      try {
        result = JSON.parse(responseText) as Fault;
      }
      catch(e) {
      }
    }
  }
  if(!result) {
    result = {
      message: responseText,
    };
    if(!result.message)
      result.message = "Произошла неожиданная ошибка: " + status;
  }
  return result;
}


/** Список вызовов, которые ожидают передачи в пачке */
var batched: Call[] = null;

var defaultBackground: boolean = false;

/** Список отложенных вызовов */
var postponed: Call[] = [];

/** Список ответов */
var callbacks: IMap<Callback> = {};
