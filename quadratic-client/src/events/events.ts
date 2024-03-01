import { JsRenderFill, SheetInfo } from '@/quadratic-core-types';
import EventEmitter from 'eventemitter3';

export interface EventTypes {
  undoRedo: {
    undo: boolean;
    redo: boolean;
  };

  addSheet: {
    sheetId: string;
    name: string;
    order: string;
  };

  deleteSheet: {
    sheetId: string;
    user: boolean;
  };

  sheetInfo: {
    sheetInfo: SheetInfo[];
  };

  sheetInfoUpdate: {
    sheetInfo: SheetInfo;
  };

  sheetFills: {
    sheetId: string;
    fills: JsRenderFill[];
  };

  changeSheet: {};

  setCursor: {
    cursor: string;
  };
}

export const events = new EventEmitter<EventTypes>();
