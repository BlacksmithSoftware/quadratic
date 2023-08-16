import React, { useEffect } from 'react';
import { EditorInteractionState } from '../../../atoms/editorInteractionStateAtom';
import { SheetController } from '../../../grid/controller/SheetController';
import { useGlobalSnackbar } from '../../../ui/contexts/GlobalSnackbar';
import { useLocalFiles } from '../../../ui/contexts/LocalFiles';
import { useClearAllFormatting } from '../../../ui/menus/TopBar/SubMenus/useClearAllFormatting';
import { useFormatCells } from '../../../ui/menus/TopBar/SubMenus/useFormatCells';
import { useGetSelection } from '../../../ui/menus/TopBar/SubMenus/useGetSelection';
import { useGridSettings } from '../../../ui/menus/TopBar/SubMenus/useGridSettings';
import { PixiApp } from '../../pixiApp/PixiApp';
import { Size } from '../../types/size';
import { keyboardCell } from './keyboardCell';
import { keyboardClipboard } from './keyboardClipboard';
import { keyboardPosition } from './keyboardPosition';
import { keyboardSelect } from './keyboardSelect';
import { keyboardUndoRedo } from './keyboardUndoRedo';
import { keyboardViewport } from './keyboardViewport';

interface IProps {
  editorInteractionState: EditorInteractionState;
  setEditorInteractionState: React.Dispatch<React.SetStateAction<EditorInteractionState>>;
  app: PixiApp;
  sheetController: SheetController;
}

export const pixiKeyboardCanvasProps: { headerSize: Size } = { headerSize: { width: 0, height: 0 } };

export const useKeyboard = (props: IProps): { onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void } => {
  const { editorInteractionState, setEditorInteractionState, app, sheetController } = props;
  const { format } = useGetSelection(sheetController.sheet);
  const { changeBold, changeItalic } = useFormatCells(sheetController);
  const { clearAllFormatting } = useClearAllFormatting(sheetController);
  const { presentationMode, setPresentationMode } = useGridSettings();
  const { currentFileId } = useLocalFiles();
  const { addGlobalSnackbar } = useGlobalSnackbar();

  useEffect(() => {
    const keyDownWindow = (event: KeyboardEvent): void => {
      if (app.settings.input.show) return;

      if (
        keyboardViewport({
          event,
          editorInteractionState,
          setEditorInteractionState,
          sheet: sheetController.sheet,
          clearAllFormatting,
          changeBold,
          changeItalic,
          format,
          pointer: app.pointer,
          presentationMode,
          setPresentationMode,
          app,
          currentFileId,
        })
      ) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', keyDownWindow);
    return () => window.removeEventListener('keydown', keyDownWindow);
  }, [
    app,
    changeBold,
    changeItalic,
    clearAllFormatting,
    currentFileId,
    editorInteractionState,
    format,
    presentationMode,
    setEditorInteractionState,
    setPresentationMode,
    sheetController.sheet,
  ]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (app.settings.input.show) return;

    if (
      keyboardClipboard({
        event,
        sheet_controller: props.sheetController,
        app: props.app,
        addGlobalSnackbar,
      }) ||
      keyboardUndoRedo(event, props.sheetController) ||
      keyboardSelect({
        event,
        viewport: app?.viewport,
        sheet: props.sheetController.sheet,
      })
    )
      return;

    if (keyboardPosition({ event, sheet: sheetController.sheet })) return;

    // Prevent these commands if "command" key is being pressed
    if (event.metaKey || event.ctrlKey) {
      return;
    }

    if (
      keyboardCell({
        sheet_controller: props.sheetController,
        event,
        editorInteractionState,
        setEditorInteractionState,
      })
    )
      return;
  };

  return {
    onKeyDown,
  };
};
