import { Rectangle } from 'pixi.js';
import { isEditorOrAbove } from '../../../actions';
import { EditorInteractionState } from '../../../atoms/editorInteractionStateAtom';
import { sheetController } from '../../../grid/controller/SheetController';
import { pixiAppEvents } from '../../pixiApp/PixiAppEvents';
import { isAllowedFirstChar } from './keyboardCellChars';

export function keyboardCell(options: {
  event: React.KeyboardEvent<HTMLElement>;
  editorInteractionState: EditorInteractionState;
  setEditorInteractionState: React.Dispatch<React.SetStateAction<EditorInteractionState>>;
}): boolean {
  const { event, editorInteractionState, setEditorInteractionState } = options;

  const cursor = sheetController.sheet.cursor;
  const cursorPosition = cursor.cursorPosition;

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

  // Don't allow actions beyond here for certain users
  if (!isEditorOrAbove(editorInteractionState.permission)) {
    return false;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    // delete a range or a single cell, depending on if MultiCursor is active
    sheetController.sheet.deleteCells(
      new Rectangle(
        cursor.originPosition.x,
        cursor.originPosition.y,
        cursor.terminalPosition.x - cursor.originPosition.x,
        cursor.terminalPosition.y - cursor.originPosition.y
      )
    );
    event.preventDefault();
  }

  if (event.key === 'Enter') {
    const x = cursorPosition.x;
    const y = cursorPosition.y;
    const cell = sheetController.sheet.getRenderCell(x, y);
    if (cell) {
      if (cell.language) {
        const mode = cell.language === 'Python' ? 'PYTHON' : cell.language === 'Formula' ? 'FORMULA' : undefined;
        if (!mode) throw new Error(`Unhandled cell.language ${cell.language} in keyboardCell`);
        // Open code editor, or move code editor if already open.
        setEditorInteractionState({
          ...editorInteractionState,
          showCellTypeMenu: false,
          showCodeEditor: true,
          selectedCell: { x: x, y: y },
          mode,
        });
      } else {
        // open single line
        pixiAppEvents.changeInput(true, cell.value);
      }
    } else {
      pixiAppEvents.changeInput(true);
    }
    event.preventDefault();
  }

  if (event.key === '/' || event.key === '=') {
    const x = cursorPosition.x;
    const y = cursorPosition.y;
    const cell = sheetController.sheet.getRenderCell(x, y);
    if (cell) {
      if (cell.language) {
        const mode = cell.language === 'Python' ? 'PYTHON' : cell.language === 'Formula' ? 'FORMULA' : undefined;
        if (!mode) throw new Error(`Unhandled cell.language ${cell.language} in keyboardCell`);

        // Open code editor, or move code editor if already open.
        setEditorInteractionState({
          ...editorInteractionState,
          showCellTypeMenu: false,
          showCodeEditor: true,
          selectedCell: { x: x, y: y },
          mode,
        });
      } else {
        // Open cell input for editing text
        pixiAppEvents.changeInput(true, cell.value);
      }
    } else {
      // Open cell type menu, close editor.
      setEditorInteractionState({
        ...editorInteractionState,
        showCellTypeMenu: true,
        showCodeEditor: false,
        selectedCell: { x: x, y: y },
        mode: 'PYTHON',
      });
    }
    event.preventDefault();
  }

  if (isAllowedFirstChar(event.key)) {
    pixiAppEvents.changeInput(true, event.key);
    event.preventDefault();
  }

  return false;
}
