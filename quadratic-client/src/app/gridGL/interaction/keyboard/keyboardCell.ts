import { SheetCursor } from '@/app/grid/sheet/SheetCursor';
import { inlineEditorHandler } from '@/app/gridGL/HTMLGrid/inlineEditor/inlineEditorHandler';
import { quadraticCore } from '@/app/web-workers/quadraticCore/quadraticCore';
import { hasPermissionToEditFile } from '../../../actions';
import { EditorInteractionState } from '../../../atoms/editorInteractionStateAtom';
import { sheets } from '../../../grid/controller/Sheets';
import { pixiAppSettings } from '../../pixiApp/PixiAppSettings';
import { doubleClickCell } from '../pointer/doubleClickCell';
import { isAllowedFirstChar } from './keyboardCellChars';

function inCodeEditor(editorInteractionState: EditorInteractionState, cursor: SheetCursor): boolean {
  if (!editorInteractionState.showCodeEditor) return false;
  const cursorPosition = cursor.cursorPosition;
  const selectedX = editorInteractionState.selectedCell.x;
  const selectedY = editorInteractionState.selectedCell.y;

  // selectedCell is inside single cursor
  if (selectedX === cursorPosition.x && selectedY === cursorPosition.y) {
    return true;
  }

  // selectedCell is inside multi-cursor
  if (cursor.multiCursor?.some((cursor) => cursor.contains(selectedX, selectedY))) {
    return true;
  }
  return false;
}

export async function keyboardCell(options: {
  event: React.KeyboardEvent<HTMLElement>;
  editorInteractionState: EditorInteractionState;
  setEditorInteractionState: React.Dispatch<React.SetStateAction<EditorInteractionState>>;
}): Promise<boolean> {
  const { event, editorInteractionState, setEditorInteractionState } = options;

  const sheet = sheets.sheet;
  const cursor = sheet.cursor;
  const cursorPosition = cursor.cursorPosition;

  const hasPermission = hasPermissionToEditFile(editorInteractionState.permissions);

  if (event.key === 'Tab') {
    // move single cursor one right
    const delta = event.shiftKey ? -1 : 1;
    cursor.changePosition({
      keyboardMovePosition: {
        x: cursorPosition.x + delta,
        y: cursorPosition.y,
      },
      cursorPosition: {
        x: cursorPosition.x + delta,
        y: cursorPosition.y,
      },
    });
    event.preventDefault();
  }

  if (event.key === 'Enter') {
    if (!inlineEditorHandler.isEditingFormula()) {
      const column = cursorPosition.x;
      const row = cursorPosition.y;
      const code = await quadraticCore.getCodeCell(sheets.sheet.id, column, row);
      if (code) {
        doubleClickCell({ column: Number(code.x), row: Number(code.y), language: code.language, cell: '' });
      } else {
        const cell = await quadraticCore.getEditCell(sheets.sheet.id, column, row);
        doubleClickCell({ column, row, cell });
      }
      event.preventDefault();
    }
  }

  // Don't allow actions beyond here for certain users
  if (!hasPermission) {
    return false;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    if (inCodeEditor(editorInteractionState, cursor)) {
      if (!pixiAppSettings.unsavedEditorChanges) {
        setEditorInteractionState((state) => ({
          ...state,
          waitingForEditorClose: undefined,
          showCodeEditor: false,
          mode: undefined,
        }));
      } else {
        pixiAppSettings.addGlobalSnackbar?.('You can not delete a code cell with unsaved changes', {
          severity: 'warning',
        });
        return true;
      }
    }
    // delete a range or a single cell, depending on if MultiCursor is active
    quadraticCore.deleteCellValues(sheets.getRustSelection(), sheets.getCursorPosition());
  }

  if (event.key === '/') {
    const x = cursorPosition.x;
    const y = cursorPosition.y;
    const cell = await quadraticCore.getRenderCell(sheets.sheet.id, x, y);
    if (cell?.language) {
      if (editorInteractionState.showCodeEditor) {
        // Open code editor, or move change editor if already open.
        setEditorInteractionState({
          ...editorInteractionState,
          showCellTypeMenu: false,
          waitingForEditorClose: {
            selectedCell: { x: x, y: y },
            selectedCellSheet: sheets.sheet.id,
            mode: cell.language,
            showCellTypeMenu: false,
            initialCode: undefined,
          },
        });
      } else {
        setEditorInteractionState({
          ...editorInteractionState,
          showCellTypeMenu: false,
          selectedCell: { x: x, y: y },
          selectedCellSheet: sheets.sheet.id,
          mode: cell.language,
          showCodeEditor: true,
          initialCode: undefined,
        });
      }
    } else if (editorInteractionState.showCodeEditor) {
      // code editor is already open, so check it for save before closing
      setEditorInteractionState({
        ...editorInteractionState,
        waitingForEditorClose: {
          showCellTypeMenu: true,
          selectedCell: { x: x, y: y },
          selectedCellSheet: sheets.sheet.id,
          mode: 'Python',
          initialCode: undefined,
        },
      });
    } else {
      // just open the code editor selection menu
      setEditorInteractionState({
        ...editorInteractionState,
        showCellTypeMenu: true,
        selectedCell: { x: x, y: y },
        selectedCellSheet: sheets.sheet.id,
        mode: undefined,
        initialCode: undefined,
      });
    }
    event.preventDefault();
  }

  if (isAllowedFirstChar(event.key)) {
    const cursorPosition = cursor.cursorPosition;
    const code = await quadraticCore.getCodeCell(sheets.sheet.id, cursorPosition.x, cursorPosition.y);

    // open code cell unless this is the actual code cell. In this case we can overwrite it
    if (code && (Number(code.x) !== cursorPosition.x || Number(code.y) !== cursorPosition.y)) {
      doubleClickCell({ column: Number(code.x), row: Number(code.y), language: code.language, cell: '' });
    } else {
      pixiAppSettings.changeInput(true, event.key);
    }
    event.preventDefault();
  }

  return false;
}
