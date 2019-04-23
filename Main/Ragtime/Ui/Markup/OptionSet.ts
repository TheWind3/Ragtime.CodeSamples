//bundle: true

import { IOption, Options } from "./Options";
import { Metadata } from "./Metadata";


/** 
* Набор опций
* Внимание архитектору: этот класс неизменяемый, то есть сам не может добавить или удалить опции. Не надо это ломать.
*/
export class OptionSet implements Iterable<IOption> {

  constructor(options: Map<string, IOption>) {
    this._options = options || new Map();
  }

  [Symbol.iterator]() {
    return this._options.values();
  }

  /** Возвращаем новый OptionSet, в котором содержатся только те опции, о которых знает optionsType */
  public ofType(optionsType: Function): OptionSet {
    let result = new Map<string, IOption>();
    let metadata = Metadata.get(optionsType);
    let paths = metadata.getPaths();
    for(let option of this)
      if(paths.has(option.path))
        result.set(option.path, option);
    return new OptionSet(result);
  }

  /** В наборе имеется указання опция? Возвращаем ее или null */
  public has(option: IOption): IOption {
    return this._options.has(option.path) ? option : null;
  }

  /** Набор имеет хотя бы одну из указанных опций? */
  public hasAny(...options: IOption[]) {
    for(let option of options) {
      if(this._options.has(option.path))
        return true;
    }
    return false;
  }

  /** Набор состоит только из указанных опций? */
  public hasOnly(...options: IOption[]) {
    let paths = new Set(options.map(_ => _.path));
    for(let path of this._options.keys()) {
      if(!paths.has(path[0]))
        return false;
    }
    return true;
  }

  public get isEmpty(): boolean {
    return this._options.size == 0;
  }

  /** Если в наборе есть опции, у которых render != "none", вернем true */
  public shouldRender(): boolean {
    for(let option of this) {
      if(option.render !== "none")
        return true;
    }
    return false;
  }

  /** SoftRender можно делать, если в наборе только soft-render свойства */
  public canDoSoftRender(): boolean {
    for(let option of this) {
      if(option.render == "hard")
        return false;
    }
    return true;
  }

  private _options: Map<string, IOption>;
}
