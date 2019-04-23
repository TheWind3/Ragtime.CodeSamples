//summary: Командный интерфейс
//alias:   Ragtime.Application.CommandInterface

import { IMap } from "Ragtime.Types";
import * as AppCommand from "Ragtime.AppCommand";


/** Элемент меню */
export interface MenuItem {
  beginGroup?: boolean;
  closeMenuOnClick?: boolean;
  disabled?: boolean;
  icon?: string;
  selected?: boolean;
  items?: MenuItem[];
  text?: string;
  visible?: boolean;
  execute?: Function;
  id?: string;
}



/** Описание командного интерфейса (способа организации команд) */
export class CommandInterface {

  /** Задаем папку */
  folder(title: string, init: (folder: Folder) => void): CommandInterface {
    let f = new CiFolder();
    this._folders.push(f);
    f.title(title);
    init(f);
    return this;
  }

  theRestFolder(): CommandInterface {
    this._theRestFolderEnabled = true;
    return this;
  }

  /** Задаем спец. меню приложения */
  appMenu(title: string, icon: string | null, items: () => MenuItem[]): CommandInterface {
    this.appMenuTitle = title || "Приложение";
    this.appMenuIcon = icon || "far fa-sun";
    this._appMenuItems = items || (() => []);
    return this;
  }

  /** Конструируем меню */
  getMenu(commands: AppCommand.Commands): MenuItem[] {
    this._used = {};
    let result: MenuItem[] = [];
    let add = (item: MenuItem) => { if(item) result.push(item); }
    for(let folder of this._folders)
      add(this._fromFolder(commands, folder));
    if(this._theRestFolderEnabled)
      add(this._fromFolder(commands, this._theRestFolder(commands)));
    this._used = undefined;
    return result;
  }

  appMenuTitle: string;
  appMenuIcon: string;
  getAppMenu(): MenuItem[] {
    return this._appMenuItems();
  }

  private _fromFolder(commands: AppCommand.Commands, folder: CiFolder): MenuItem {
    if(!folder)
      return null;
    let result: MenuItem = {
      text: folder._title,
      icon: folder._icon,
      items: [],
    };
    let beginGroup = false;
    for(let rule of folder._items) {
      let item: MenuItem;
      if(rule instanceof CiCommand)
        item = this._fromCommand(commands.find(rule.id));
      else if(rule instanceof CiFolder) {
        item = this._fromFolder(commands, rule);
      }
      else if(rule instanceof CiSeparator)
        beginGroup = true;
      if(item) {
        item.beginGroup = beginGroup;
        beginGroup = false;
        result.items.push(item);
      }
    }
    return result.items.length > 0 ? result : null;
  }

  private _fromCommand(command: AppCommand.Command): MenuItem {
    let result: MenuItem;
    if(command) {
      this._used[command.id] = command;
      if(!command.hidden()) {
        result = {
          text: command.text(),
          icon: command.icon(),
          disabled: command.disabled(),
          closeMenuOnClick: true,
          execute: () => command.execute(),
          id: command.id
        };
      }
    }
    return result;
  }

  private _theRestFolder(commands: AppCommand.Commands): CiFolder {
    let result = new CiFolder();
    result.title("Прочее");
    for(let command of commands) {
      if(!this._used[command.id])
        result.command(command.id);
    }
    return result._items.length > 0 ? result : null;
  }

  private _folders: CiFolder[] = [];
  private _appMenuItems: () => MenuItem[];
  private _used: IMap<AppCommand.Command>;
  private _theRestFolderEnabled: boolean;
}

/** Группа команд */
export interface Folder {
  /** Задаем заголовок */
  title(value: string): Folder;

  /** Задаем иконку */
  icon(value: string): Folder;

  /** Добавляем сепаратор */
  separator(): Folder;

  /** Добавляем команду */
  command(id: string): Folder;

  /** Добавляем вложенную группу */
  folder(title: string, init: (folder: Folder) => void): Folder;
}

class CiFolder implements Folder {

  title(value: string): Folder {
    this._title = value;
    return this;
  }
  _title: string;

  icon(value: string): Folder {
    this._icon = value;
    return this;
  }
  _icon: string;

  separator(): Folder {
    this._items.push(new CiSeparator());
    return this;
  }

  command(id: string): Folder {
    this._items.push(new CiCommand(id));
    return this;
  }

  folder(title: string, init: (folder: Folder) => void): Folder {
    let folder = new CiFolder();
    this._items.push(folder);
    folder.title(title);
    init(folder);
    return this;
  }

  _items: CiItem[] = [];
}

class CiSeparator {
}

class CiCommand {
  constructor(public id: string) { }
}

type CiItem = CiCommand | CiFolder | CiSeparator;
