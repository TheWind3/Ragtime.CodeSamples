//summary: Форма, работа с которой основана на описании блоков
//alias:   Ragtime.BlockForm

import { Observable, Async } from "Ragtime.Types";
import * as Form from "Ragtime.Form";
import { Control } from "Ragtime.Ui.Control";
import { Panel, Options as PanelOptions } from "Ragtime.Ui.Panel";
import { NavPanel, Tab } from "Ragtime.Ui.NavPanel";
import { CommandPanel } from "Ragtime.Ui.CommandPanel";
import { Separator } from "Ragtime.Ui.Separator";


/** Тип блока содержимого */
export const enum BlockType {

  /** Важная информация. Будет видна всегда. Обычно в качестве такой информации выступают номер и дата документа */
  Important = 0,

  /** Основная информация. Будет размещена на вкладке "Главное". Обычно в качестве такой информации выступают основные поля головы документа */
  Main = 1,

  /** Информация документа. Каждый Regular-блок будет размещен на своей вкладке. Обычно в качестве Regular-блока выступают табличные части документа */
  Regular = 2,

  /** То же самое, что Regular, но блок будет конструироваться каждый раз при переключении на вкладку. Обычно Nav-блоки отображают связанную информацию: подчиненные документы, прицепленные файлы, записи журнала, и т д  */
  Extra = 3,
}


/** Блок содержимого */
export interface Block {

  /** Необязательный идентификатор. Используется, например, в методе selectBlock() */
  id?: string;

  /** Тип блока */
  type: BlockType;

  /** Заголовок */
  caption?: Observable<string>;

  /** Иконка */
  icon?: Observable<string>;

  /** Блоки с одной группой будут располагаться рядом. Между группами будет отступ. Имя группы не выводится, но используется при сортировке */
  group?: string;

  /** Желаемый порядковый номер внутри группы */
  order?: number; 

  /** Ярлык блока скрыт? */
  hidden?: Observable<boolean>;

  /** Номер в порядке предоставления. Прикладной программист не должен заполнять этот номер, он используется для внутренних целей */
  _n?: number;

  /** Разметка */
  markup(): Async<JSX.Element | Control>;

  /** Дополнительная разметка (после основной) */
  footerMarkup?: (JSX.Element | Control)[];

  /** Вызывается после активации */
  afterShow?(): void;

  /** Вызывается перед скрытием */
  beforeHide?(): void;

  /** Любая доп. информация */
  tag?: any;

  /** Можно закрыть? */
  canClose?: boolean;

  /** Вызывается перед удалением */
  beforeClose?(): void;
}


/** Форма, работа с которой основана на описании блоков */
export abstract class BlockForm extends Form.Form {
  protected _navPanel: NavPanel;

  /** Показываем первый блок */
  selectFirstBlock() {
    this._navPanel.selectFirstTab();
  }

  /** Показываем блок с указанным id */
  selectBlock(id: string) {
    this._navPanel.getTab(id).options.selected.value = true;
  }

  getContent(): JSX.Element | Control {
    return (
      <Panel fullSize>
        {this.getCommandPanel()}
        {this.getMainContent()}
      </Panel>
    ) as Control;
  }

  /** Конструируем основное содержимое формы */
  protected getMainContent(): JSX.Element | Control {
    let blocks
      = [...this.getPredefinedBlocks(), ...this.getBlocks()]
        // Выкидываем пустые ссылки
        .filter(_ => !!_)

        // Велим наследникам доопределить блок
        .map(_ => this.completeBlock(_))
        .filter(_ => !!_)

        // Нумеруем в порядке предоставления
        .map((_, n) => { _._n = n; return _; })
        
        // Проставляем неуказанные группы. Имя группы по умолчанию - это численное представление ее типа, умноженное на 100
        .map((_) => { if(!_.group || _.group == "") _.group = _.type + "00"; return _; }) 

        // Проставляем неуказанный порядок внутри группы
        .map((_) => { if(_.order === undefined) _.order = 0; return _; })
    ;

    blocks.sort((a, b) => {
      let result = (a.group || "").localeCompare(b.group || "");
      if(result == 0)
        result = a.order - b.order;
      if(result == 0)
        result = a._n - b._n;
      return result;
    });

    let importantBlock
      = blocks.filter(_ => _.type == BlockType.Important).slice(-1)[0];

    let tabs: any[] = [];
    let lastGroup: string;
    for(let block of blocks.filter(_ => _.type != BlockType.Important)) {
      let blockGroup = block.group || "";
      let tab = this.constructTab(block);
      if(tab) {
        if(lastGroup === undefined)
          lastGroup = blockGroup;
        if(blockGroup !== lastGroup)
          tabs.push(new Separator());
        tabs.push(tab);
        lastGroup = blockGroup;
      }
    }

    return (
      <Panel flexGrow={1}>
        {importantBlock ? importantBlock.markup() : null}
        {this._navPanel = new NavPanel({id: "blocks", flexGrow: 1, margin: false }, tabs)}
      </Panel>
    ) as Control;
  }

  /** Возвращаем "зашитые" блоки содержимого */
  protected * getPredefinedBlocks(): Iterable<Block> {
  }

  /** Возвращаем блоки содержимого */
  protected * getBlocks(): Iterable<Block> {
  }

  /** Конструируем панель команд. Допускается вернуть null */
  protected getCommandPanel(): CommandPanel {
    return null;
  }

  /** Наследник может доопределить блок */
  protected completeBlock(block: Block): Block {
    return block;
  }

  /** Конструируем вкладку */
  protected constructTab(block: Block): JSX.Element {
    let text: Observable<string>;
    let icon: Observable<string>;
    let hidden: Observable<boolean>;
    let getContent: () => Async<Control>;
    let children: any[] = null;

    switch(block.type) {
      case BlockType.Main:
        text = block.caption || "Основные реквизиты";
        icon = block.icon || "fas fa-file-alt";
        hidden = block.hidden || ko.observable(false);
        children = [block.markup(), ...(block.footerMarkup || [])];
        break;
      case BlockType.Regular:
        text = block.caption || "(данные)";
        icon = block.icon || "far fa-file";
        hidden = block.hidden || ko.observable(false);
        children = [block.markup(), ...(block.footerMarkup || [])];
        break;
      case BlockType.Extra:
        text = block.caption || "(дополнительно)";
        icon = block.icon || "fas fa-tag";
        hidden = block.hidden || ko.observable(false);
        getContent = () => block.markup() as Async<Control>;
        break;
      default:
        return null;
    }

    return new Tab({
      id: block.id,
      text: text,
      icon: icon,
      getContent: getContent,
      afterShow: block.afterShow,
      beforeHide: block.beforeHide,
      canClose: block.canClose,
      beforeClose: block.beforeClose,
      hidden: hidden,
    }, children);
  }
}
