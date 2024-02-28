/**
 * Messages between Core web worker and Render web worker.
 */

import { JsRenderCell, SheetInfo } from '@/quadratic-core-types';

export interface RenderCoreRequestRenderCells {
  type: 'renderCoreRequestRenderCells';
  id: number;
  sheetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoreRenderCells {
  type: 'coreRenderRenderCells';
  id: number;
  cells: JsRenderCell[];
}

export type SheetRenderMetadata = {
  offsets: string;
  bounds?: { x: number; y: number; width: number; height: number };
};

export interface CoreRenderSheetInfo {
  type: 'coreRenderSheetInfo';
  sheetInfo: SheetInfo[];
}

export interface CoreRenderCompleteRenderCells {
  type: 'coreRenderCompleteRenderCells';
  sheetId: string;
  hashX: number;
  hashY: number;
  cells: string;
}

export type CoreRenderMessage = CoreRenderCells | CoreRenderSheetInfo | CoreRenderCompleteRenderCells;

export type RenderCoreMessage = RenderCoreRequestRenderCells;
