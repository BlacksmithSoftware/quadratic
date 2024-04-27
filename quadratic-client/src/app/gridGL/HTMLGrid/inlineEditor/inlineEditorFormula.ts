import { events } from '@/app/events/events';
import { sheets } from '@/app/grid/controller/Sheets';
import { inlineEditorHandler } from '@/app/gridGL/HTMLGrid/inlineEditor/inlineEditorHandler';
import { pixiApp } from '@/app/gridGL/pixiApp/PixiApp';
import { SheetPosTS } from '@/app/gridGL/types/size';
import { getA1Notation } from '@/app/gridGL/UI/gridHeadings/getA1Notation';
import { ParseFormulaReturnType } from '@/app/helpers/formulaNotation';
import { parseFormula } from '@/app/quadratic-rust-client/quadratic_rust_client';
import { colors } from '@/app/theme/colors';
import { extractCellsFromParseFormula } from '@/app/ui/menus/CodeEditor/useEditorCellHighlights';
import * as monaco from 'monaco-editor';
import { editor } from 'monaco-editor';

class InlineEditorFormula {
  private insertingCells?: { value: string; position: number };
  private decorations?: editor.IEditorDecorationsCollection;

  constructor() {
    events.on('cursorPosition', this.cursorMoved);
  }

  async cellHighlights(
    location: SheetPosTS,
    formula: string,
    model: editor.ITextModel,
    inlineEditor: editor.IStandaloneCodeEditor
  ) {
    const parsed = (await parseFormula(formula, location.x, location.y)) as ParseFormulaReturnType;
    if (parsed) {
      pixiApp.highlightedCells.fromFormula(parsed, { x: location.x, y: location.y }, location.sheetId);

      const extractedCells = extractCellsFromParseFormula(parsed, { x: location.x, y: location.y }, location.sheetId);
      const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
      const cellColorReferences = new Map<string, number>();

      extractedCells.forEach((value, index) => {
        const { cellId, span } = value;
        const startPosition = model.getPositionAt(span.start);

        const cellColor =
          cellColorReferences.get(cellId) ?? cellColorReferences.size % colors.cellHighlightColor.length;
        cellColorReferences.set(cellId, cellColor);

        // we need to +1 since we removed the `=` character from the formula
        const range = new monaco.Range(
          startPosition.lineNumber,
          startPosition.column + 1,
          startPosition.lineNumber,
          startPosition.column + 1 + span.end - span.start
        );

        // decorations color the cell references in the editor
        newDecorations.push({
          range,
          options: {
            stickiness: 1,
            inlineClassName: `cell-reference-${cellColorReferences.get(cellId)}`,
          },
        });

        const editorCursorPosition = inlineEditor.getPosition();

        if (editorCursorPosition && range.containsPosition(editorCursorPosition)) {
          pixiApp.highlightedCells.setHighlightedCell(index);
        }
      });

      // update the cell references in the editor
      if (this.decorations) {
        this.decorations.clear();
        this.decorations.set(newDecorations);
      } else {
        this.decorations = inlineEditor.createDecorationsCollection(newDecorations);
      }
    } else {
      this.decorations?.clear();
      pixiApp.highlightedCells.clear();
    }
  }

  clearDecorations() {
    this.decorations?.clear();
    pixiApp.highlightedCells.clear();
  }

  private removeInsertingCells() {
    if (!this.insertingCells) return;
    const { value, position } = this.insertingCells;
    const model = inlineEditorHandler.getModel();
    const range = new monaco.Range(1, position, 1, position + value.length);
    model.applyEdits([{ range, text: '' }]);
  }

  private insertInsertingCells(a1Notation: string) {
    this.removeInsertingCells();
    const model = inlineEditorHandler.getModel();
    const column = inlineEditorHandler.getCursorColumn();
    const value = a1Notation;
    const range = new monaco.Range(1, column, 1, column);
    model.applyEdits([{ range, text: value }]);
    this.insertingCells = { value, position: column };
  }

  private cursorMoved = () => {
    if (inlineEditorHandler.isEditingFormula()) {
      const cursor = sheets.sheet.cursor;
      if (cursor.multiCursor) {
        const startLocation = cursor.multiCursor.originPosition;
        const start = getA1Notation(startLocation.x, startLocation.y);
        const endLocation = cursor.multiCursor.terminalPosition;
        const end = getA1Notation(endLocation.x, endLocation.y);
        this.insertInsertingCells(`${start}:${end}`);
      } else {
        const location = cursor.originPosition;
        const a1Notation = getA1Notation(location.x, location.y);
        this.insertInsertingCells(a1Notation);
      }
    }
  };
}

export const inlineEditorFormula = new InlineEditorFormula();
