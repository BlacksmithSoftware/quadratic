import { Container, Rectangle } from 'pixi.js';
import { Sheet } from '../../grid/sheet/Sheet';
import { PixiApp } from '../pixiApp/PixiApp';
import { pixiAppEvents } from '../pixiApp/PixiAppEvents';
import { Coordinate } from '../types/size';
import { CellsSheet } from './CellsSheet';

export class CellsSheets extends Container<CellsSheet> {
  private app: PixiApp;
  private current?: CellsSheet;

  constructor(app: PixiApp) {
    super();
    this.app = app;
  }

  async create(): Promise<void> {
    this.removeChildren();
    for (const sheet of this.app.sheet_controller.sheets) {
      const child = this.addChild(new CellsSheet(sheet));
      await child.preload();
    }
    this.show(this.app.sheet_controller.sheet.id);
  }

  async addSheet(id: string): Promise<void> {
    const sheet = this.app.sheet_controller.sheets.find((sheet) => sheet.id === id);
    if (!sheet) {
      throw new Error('Expected to find new sheet in cellSheet');
    }
    const cellsSheet = this.addChild(new CellsSheet(sheet));
    await cellsSheet.preload();
    this.show(sheet.id);
  }

  show(id: string): void {
    this.children.forEach((child) => {
      if (child.sheet.id === id) {
        if (this.current?.sheet.id !== child?.sheet.id) {
          this.current = child;
          child.show(this.app.viewport.getVisibleBounds());
          pixiAppEvents.loadViewport();
        }
      } else {
        child.hide();
      }
    });
  }

  cull(bounds: Rectangle): void {
    if (!this.current) throw new Error('Expected current to be defined in CellsSheets');
    this.current.show(bounds);
  }

  changed(options: {
    sheet?: Sheet;
    column?: number;
    row?: number;
    cells?: Coordinate[];
    labels: boolean;
    background: boolean;
  }): void {
    const sheet = options.sheet ?? this.app.sheet;

    const cellsSheet = this.children.find((search) => search.sheet.id === sheet.id);
    if (!cellsSheet) throw new Error('Expected to find cellsSheet in changed');
    cellsSheet.changed({
      cells: options.cells,
      column: options.column,
      row: options.row,
      labels: options.labels,
      background: options.background,
    });
  }

  // this updates the first dirty CellsSheet, always starting with the current sheet
  update(): void {
    if (!this.current) throw new Error('Expected current to be defined in CellsSheets');
    if (this.current.update()) return;
    for (const child of this.children) {
      if (this.current !== child) {
        if (child.update()) return;
      }
    }
  }
}
