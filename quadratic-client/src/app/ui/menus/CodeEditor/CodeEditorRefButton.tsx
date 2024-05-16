import { editorInteractionStateAtom } from '@/app/atoms/editorInteractionStateAtom';
import { events } from '@/app/events/events';
import { sheets } from '@/app/grid/controller/Sheets';
import { TooltipHint } from '@/app/ui/components/TooltipHint';
import { insertCellRef } from '@/app/ui/menus/CodeEditor/insertCellRef';
import AddLocationIcon from '@mui/icons-material/AddLocation';
import { IconButton } from '@mui/material';
import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';

export const CodeEditorRefButton = () => {
  const editorInteractionState = useRecoilValue(editorInteractionStateAtom);

  const [disabled, setDisabled] = useState(true);
  useEffect(() => {
    const checkDisabled = () => {
      setDisabled(
        editorInteractionState.selectedCell.x === sheets.sheet.cursor.originPosition.x &&
          editorInteractionState.selectedCell.y === sheets.sheet.cursor.originPosition.y &&
          editorInteractionState.selectedCellSheet === sheets.sheet.id &&
          !sheets.sheet.cursor.multiCursor
      );
    };
    events.on('cursorPosition', checkDisabled);
    return () => {
      events.off('cursorPosition', checkDisabled);
    };
  });

  return (
    <div className="code-editor-ref-button">
      <TooltipHint title="Insert cell reference" placement="bottom">
        <span>
          <IconButton disabled={disabled} size="small" onClick={() => insertCellRef(editorInteractionState)}>
            <AddLocationIcon fontSize="small" />
          </IconButton>
        </span>
      </TooltipHint>
    </div>
  );
};
