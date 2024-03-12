/**
 * CellsLabels renders all text within a CellsSheet.
 *
 * It is responsible for creating and managing CellsTextHash objects, which is
 * an efficient way of batching cells together to reduce the number of
 * geometries sent to the GPU.
 */

import { debugShowHashUpdates, debugShowLoadingHashes } from '@/debugFlags';
import { sheetHashHeight, sheetHashWidth } from '@/gridGL/cells/CellsTypes';
import { debugTimeCheck, debugTimeReset } from '@/gridGL/helpers/debugPerformance';
import { intersects } from '@/gridGL/helpers/intersects';
import { JsRenderCell, SheetInfo } from '@/quadratic-core-types';
import { SheetOffsets, SheetOffsetsWasm } from '@/quadratic-grid-offsets/quadratic_grid_offsets';
import { Point, Rectangle } from 'pixi.js';
import { RenderBitmapFonts } from '../../renderBitmapFonts';
import { renderText } from '../renderText';
import { CellsTextHash } from './CellsTextHash';

// 500 MB maximum memory per sheet before we start unloading hashes (right now
// this is on a per-sheet basis--we will want to change this to a global limit)
const MAX_RENDERING_MEMORY = 1024 * 1024 * 500;

export class CellsLabels {
  sheetId: string;
  sheetOffsets: SheetOffsets;
  last: any;
  bitmapFonts: RenderBitmapFonts;

  // (hashX, hashY) index into cellsTextHashContainer
  cellsTextHash: Map<string, CellsTextHash>;

  // bounds without formatting
  bounds?: Rectangle;

  // row index into cellsTextHashContainer (used for clipping)
  private cellsRows: Map<number, CellsTextHash[]>;

  // set of rows that need updating
  private dirtyRows: Set<number>;

  // keep track of headings that need adjusting during next update tick
  private dirtyColumnHeadings: Map<number, number>;
  private dirtyRowHeadings: Map<number, number>;

  constructor(sheetInfo: SheetInfo, bitmapFonts: RenderBitmapFonts) {
    this.sheetId = sheetInfo.sheet_id;
    const bounds = sheetInfo.bounds_without_formatting;
    if (bounds.type === 'nonEmpty' && bounds.min) {
      const min = bounds.min;
      const max = bounds.max;
      if (min && max) {
        this.bounds = new Rectangle(Number(min.x), Number(min.y), Number(max.x - min.x), Number(max.y - min.y));
      }
    }
    this.sheetOffsets = SheetOffsetsWasm.load(sheetInfo.offsets);
    this.bitmapFonts = bitmapFonts;
    this.cellsTextHash = new Map();

    this.cellsRows = new Map();
    this.dirtyRows = new Set();
    this.dirtyColumnHeadings = new Map();
    this.dirtyRowHeadings = new Map();

    this.createHashes();
  }

  getCellOffsets(x: number, y: number) {
    const screenRect = this.sheetOffsets.getCellOffsets(x, y);
    const rect = new Rectangle(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
    screenRect.free();
    return rect;
  }

  static getHash(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(x / sheetHashWidth),
      y: Math.floor(y / sheetHashHeight),
    };
  }

  private createHash(hashX: number, hashY: number): CellsTextHash | undefined {
    const key = `${hashX},${hashY}`;
    const cellsHash = new CellsTextHash(this, hashX, hashY);
    if (debugShowHashUpdates) console.log(`[CellsTextHash] Creating hash for (${hashX}, ${hashY})`);
    this.cellsTextHash.set(key, cellsHash);
    const row = this.cellsRows.get(hashY);
    if (row) {
      row.push(cellsHash);
    } else {
      this.cellsRows.set(hashY, [cellsHash]);
    }
    return cellsHash;
  }

  createHashes(): boolean {
    debugTimeReset();
    const bounds = this.bounds;
    if (!bounds) return false;
    const xStart = Math.floor(bounds.x / sheetHashWidth);
    const yStart = Math.floor(bounds.y / sheetHashHeight);
    const xEnd = Math.floor((bounds.x + bounds.width) / sheetHashWidth);
    const yEnd = Math.floor((bounds.y + bounds.height) / sheetHashHeight);
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        this.createHash(x, y);
      }
    }
    debugTimeCheck('createHashes');
    return true;
  }

  getHashKey(hashX: number, hashY: number): string {
    return `${hashX},${hashY}`;
  }

  getCellsHash(column: number, row: number, createIfNeeded?: boolean): CellsTextHash | undefined {
    const { x, y } = CellsLabels.getHash(column, row);
    const key = this.getHashKey(x, y);
    let hash = this.cellsTextHash.get(key);
    if (!hash && createIfNeeded) {
      hash = this.createHash(x, y);
    }
    return hash;
  }

  getColumnHashes(column: number): CellsTextHash[] {
    const hashX = Math.floor(column / sheetHashWidth);
    const hashes: CellsTextHash[] = [];
    this.cellsTextHash.forEach((cellsHash) => {
      if (cellsHash.hashX === hashX) {
        hashes.push(cellsHash);
      }
    });
    return hashes;
  }

  getRowHashes(row: number): CellsTextHash[] {
    const hashY = Math.floor(row / sheetHashHeight);
    const hashes: CellsTextHash[] = [];
    this.cellsTextHash.forEach((cellsHash) => {
      if (cellsHash.hashY === hashY) {
        hashes.push(cellsHash);
      }
    });
    return hashes;
  }

  // used for clipping to find neighboring hash - clipping always works from right to left
  // todo: use the new overflowLeft to make this more efficient
  findPreviousHash(column: number, row: number): CellsTextHash | undefined {
    if (!this.bounds) return;
    let hash = this.getCellsHash(column, row);
    while (!hash && column >= this.bounds.x) {
      column--;
      hash = this.getCellsHash(column, row);
    }
    return hash;
  }

  // used for clipping to find neighboring hash
  // todo: use the new overflowRight to make this more efficient
  findNextHash(column: number, row: number): CellsTextHash | undefined {
    if (!this.bounds) return;
    let hash = this.getCellsHash(column, row);
    while (!hash && column <= this.bounds.x + this.bounds.width) {
      column++;
      hash = this.getCellsHash(column, row);
    }
    return hash;
  }

  // this assumes that dirtyRows has a size (checked in calling functions)
  private updateNextDirtyRow(): void {
    const nextRow = this.dirtyRows.values().next().value;
    if (debugShowHashUpdates) console.log(`[CellsTextHash] updateNextDirtyRow for ${nextRow}`);
    this.dirtyRows.delete(nextRow);
    const hashes = this.cellsRows.get(nextRow);
    if (!hashes) throw new Error('Expected hashes to be defined in preload');
    hashes.forEach((hash) => hash.createLabels());
    hashes.forEach((hash) => hash.overflowClip());
    hashes.forEach((hash) => hash.updateBuffers()); // false
  }

  private updateHeadings(): boolean {
    if (!this.dirtyColumnHeadings.size && !this.dirtyRowHeadings.size) return false;

    // todo: sort by visibility

    // hashes that need to update their clipping and buffers
    const hashesToUpdate: Set<CellsTextHash> = new Set();
    this.dirtyColumnHeadings.forEach((delta, column) => {
      const columnHash = Math.floor(column / sheetHashWidth);
      this.cellsTextHash.forEach((hash) => {
        if (hash.hashX === columnHash) {
          if (columnHash < 0) {
            if (hash.adjustHeadings({ column, delta })) {
              hashesToUpdate.add(hash);
            }
          } else {
            if (hash.adjustHeadings({ column, delta })) {
              hashesToUpdate.add(hash);
            }
          }
        }
      });
    });
    this.dirtyColumnHeadings.clear();

    this.dirtyRowHeadings.forEach((delta, row) => {
      const rowHash = Math.floor(row / sheetHashHeight);
      this.cellsTextHash.forEach((hash) => {
        if (hash.hashY === rowHash) {
          if (rowHash < 0) {
            if (hash.adjustHeadings({ row, delta })) {
              hashesToUpdate.add(hash);
            }
          } else {
            if (hash.adjustHeadings({ row, delta })) {
              hashesToUpdate.add(hash);
            }
          }
        }
      });
    });
    this.dirtyRowHeadings.clear();
    hashesToUpdate.forEach((hash) => hash.overflowClip());
    this.cellsTextHash.forEach((hash) => hash.updateBuffers()); // true

    return true;
  }

  // distance from viewport center to hash center
  private hashDistanceSquared(hash: CellsTextHash, viewportCenter: Point): number {
    const viewRectangle = hash.viewRectangle;
    const center = {
      x: viewRectangle.left + viewRectangle.width / 2,
      y: viewRectangle.top + viewRectangle.height / 2,
    };
    return Math.pow(viewportCenter.x - center.x, 2) + Math.pow(viewportCenter.y - center.y, 2);
  }

  // Finds the next dirty hash to render. Also handles unloading of hashes.
  // Note: once the memory limit is reached, the algorithm unloads enough cell hashes
  // until the memory maximum is no longer exceeded.
  private nextDirtyHash(): { hash: CellsTextHash; visible: boolean } | undefined {
    let memory = this.totalMemory();
    let findHashToDelete = memory > MAX_RENDERING_MEMORY;

    const visibleDirtyHashes: CellsTextHash[] = [];
    const notVisibleDirtyHashes: { hash: CellsTextHash; distance: number }[] = [];
    const hashesToDelete: { hash: CellsTextHash; distance: number }[] = [];

    const bounds = renderText.viewport;
    if (!bounds) return;
    const viewportCenter = new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

    this.cellsTextHash.forEach((hash) => {
      if (intersects.rectangleRectangle(hash.viewRectangle, bounds)) {
        if (hash.dirty || hash.dirtyBuffers || !hash.loaded) {
          visibleDirtyHashes.push(hash);
        }
      } else {
        if (hash.dirty || hash.dirtyBuffers || !hash.loaded) {
          notVisibleDirtyHashes.push({ hash, distance: this.hashDistanceSquared(hash, viewportCenter) });
        }
        if (findHashToDelete && hash.loaded) {
          hashesToDelete.push({ hash, distance: this.hashDistanceSquared(hash, viewportCenter) });
        }
      }
    });

    if (!visibleDirtyHashes.length && !notVisibleDirtyHashes.length) {
      return;
    }

    hashesToDelete.sort((a, b) => b.distance - a.distance);

    // if hashes are visible, sort them by y and return the first one
    if (visibleDirtyHashes.length) {
      visibleDirtyHashes.sort((a, b) => a.hashY - b.hashY);
      while (memory > MAX_RENDERING_MEMORY && hashesToDelete.length) {
        hashesToDelete.pop()!.hash.unload();
        memory = this.totalMemory();
      }

      if (debugShowLoadingHashes)
        console.log(
          `[CellsTextHash] rendering visible: ${visibleDirtyHashes[0].hashX}, ${visibleDirtyHashes[0].hashY}`
        );
      return { hash: visibleDirtyHashes[0], visible: true };
    }

    // otherwise sort notVisible by distance from viewport center (by smallest to largest so we can use pop)
    notVisibleDirtyHashes.sort((a, b) => a.distance - b.distance);
    const nextNotVisibleHash = notVisibleDirtyHashes[0];
    if (hashesToDelete.length) {
      while (
        memory > MAX_RENDERING_MEMORY &&
        hashesToDelete.length &&
        // ensure we're not deleting hashes that are closer than the nextNotVisibleHash
        nextNotVisibleHash.distance < hashesToDelete[hashesToDelete.length - 1].distance
      ) {
        hashesToDelete.pop()!.hash.unload();
        memory = this.totalMemory();
      }

      // if the distance of the dirtyHash is greater than the distance of the
      // first hash to delete, then we do nothing. This ensures we're not constantly
      // deleting and rendering hashes at the edges of memory.
      if (hashesToDelete.length && nextNotVisibleHash.distance >= hashesToDelete[hashesToDelete.length - 1].distance)
        return;

      // debugging to find bug in hash unloading
      // let loadedVisibleCount = 0;
      // let loadedNotVisibleCount = 0;
      // this.cellsTextHash.forEach((hash) => {
      //   if (hash.loaded) {
      //     if (intersects.rectangleRectangle(hash.viewRectangle, bounds)) loadedVisibleCount++;
      //     else loadedNotVisibleCount++;
      //   }
      // });
      // console.log({ loadedVisibleCount, loadedNotVisibleCount, hashesToDelete: hashesToDelete.length });

      if (debugShowLoadingHashes) {
        console.log(
          `[CellsTextHash] rendering offscreen: ${nextNotVisibleHash.hash.hashX}, ${nextNotVisibleHash.hash.hashY}`
        );
      }
      return { hash: nextNotVisibleHash.hash, visible: false };
    } else {
      if (debugShowLoadingHashes) {
        console.log(
          `[CellsTextHash] rendering offscreen: ${nextNotVisibleHash.hash.hashX}, ${nextNotVisibleHash.hash.hashY}`
        );
      }
      return { hash: nextNotVisibleHash.hash, visible: false };
    }
  }

  private totalMemory(): number {
    let total = 0;
    this.cellsTextHash.forEach((hash) => (total += hash.totalMemory()));
    return total;
  }

  async update(): Promise<boolean | 'headings' | 'visible'> {
    if (this.updateHeadings()) return 'headings';

    const next = this.nextDirtyHash();
    if (next) {
      await next.hash.update();
      if (debugShowLoadingHashes) console.log(`[CellsTextHash] memory usage: ${Math.round(this.totalMemory())} bytes`);
      return next.visible ? 'visible' : true;
    }

    if (this.dirtyRows.size) {
      this.updateNextDirtyRow();
      return true;
    } else {
      return false;
    }
  }

  // adjust headings without recalculating the glyph geometries
  adjustHeadings(delta: number, column?: number, row?: number): void {
    if (column !== undefined) {
      const existing = this.dirtyColumnHeadings.get(column);
      if (existing) {
        this.dirtyColumnHeadings.set(column, existing + delta);
      } else {
        this.dirtyColumnHeadings.set(column, delta);
      }
    } else if (row !== undefined) {
      const existing = this.dirtyRowHeadings.get(row);
      if (existing) {
        this.dirtyRowHeadings.set(row, existing + delta);
      } else {
        this.dirtyRowHeadings.set(row, delta);
      }
    }
  }

  getCellsContentMaxWidth(column: number): number {
    const hashX = Math.floor(column / sheetHashWidth);
    let max = 0;
    this.cellsTextHash.forEach((hash) => {
      if (hash.hashX === hashX) {
        max = Math.max(max, hash.getCellsContentMaxWidth(column));
      }
    });
    return max;
  }

  completeRenderCells(hashX: number, hashY: number, cells: string): void {
    const renderCells: JsRenderCell[] = JSON.parse(cells);
    const key = this.getHashKey(hashX, hashY);
    let cellsHash = this.cellsTextHash.get(key);
    if (!cellsHash) {
      cellsHash = new CellsTextHash(this, hashX, hashY);
      this.cellsTextHash.set(key, cellsHash);
    }
    const row = this.cellsRows.get(hashY);
    if (row) {
      row.push(cellsHash);
    } else {
      this.cellsRows.set(hashY, [cellsHash]);
    }
    cellsHash.dirty = renderCells;
  }

  setOffsets(column: number | undefined, row: number | undefined, delta: number) {
    if (column !== undefined) {
      const size = this.sheetOffsets.getColumnWidth(column) + delta;
      this.sheetOffsets.setColumnWidth(column, size);
    } else if (row !== undefined) {
      const size = this.sheetOffsets.getRowHeight(row) + delta;
      this.sheetOffsets.setRowHeight(row, size);
    }
    if (delta) {
      this.adjustHeadings(delta, column, row);
    }
  }
}
