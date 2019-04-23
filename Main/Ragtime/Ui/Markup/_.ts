//alias: Ragtime.Ui.Markup
//summary: Работа с разметкой
//bundle:true

import { IOption, IOptions, Options } from "./Options";
import { CreateHandler, ModificationHandler, DisposeHandler, ElementOptions, Element } from "./Element";
import { IElements, Elements, TypedElements } from "./Elements";
import { Metadata, OptionSettings } from "./Metadata";
import { OptionSet } from "./OptionSet";

export {
  IOption, IOptions, Options, 
  CreateHandler, ModificationHandler, DisposeHandler, ElementOptions, Element,
  IElements, Elements, TypedElements,
  OptionSet,
};


/**
* Настройка опций
* @param type  Тип опций
* @param setup Значения настроек
* @param names Список имен опций
*/
export function setup<T>(type: new () => T, settings: OptionSettings, ...names: (keyof T)[]): void {
  for(let name of names)
    Metadata.setup((type as any).prototype, name.toString(), settings);
}

/**
* Указываем, что мы будем следить не только за опциями, которые есть в типе T, но и за некоторыми "дочерними" опциями
* @param type  Тип опций
* @param name  Имя "родительской" опции
* @param setup Значения настроек
* @param names Список имен опций
*
* Человеческим языком говоря, это функция для следующего:
* Пусть среди опций присутствует какой-то сложный объект (например, Command),
* и нам хочется следить не только за сменой самой команды, но и за сменой ее свойств (например, disabled и icon)
* В этом случаем мы скажем примерно следующее:
* known(
*   Options,            // Это тип наших опций
*   "command",          // Это имя свойства наших опций, у которых есть интересные нам вложенные свойства
*   {
*      disabled: { render: "soft" },
*      icon:     { render: "soft" },
*   }
* );
*/
export function known<T, N extends keyof T>(type: new () => T, name: N, settings: {[name in keyof T[N]]?: OptionSettings }): void {
  let nestedOptionsType = class {
    constructor() {
      for(let optionName in settings)
        (this as any)[optionName] = undefined;
    }
  };
  Metadata.setup((type as any).prototype, name.toString(), { nestedOptions: nestedOptionsType });
  for(let optionName in settings)
    Metadata.setup((nestedOptionsType as any).prototype, optionName, settings[optionName]);
}
