import debounce from 'lodash.debounce';
import { Rectangle } from 'pixi.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../../../grid/sheet/Sheet';
import { Coordinate } from '../../../../gridGL/types/size';
import { CellFormatSummary, FormattingSummary } from '../../../../quadratic-core/types';
import { FORMAT_SELECTION_EVENT } from './useFormatCells';

interface Results {
  start: Coordinate;
  end: Coordinate;
  multiCursor: boolean;
  formatPrimaryCell: CellFormatSummary | undefined;
  formatSummary: FormattingSummary | undefined;
  rectangle: Rectangle;
}

export const useGetSelection = (sheet: Sheet): Results => {
  const cursor = sheet.cursor;

  // used to trigger a new format calculation after a format change (see useFormatCells.ts)
  const [trigger, setTrigger] = useState(0);
  const setTriggerCallback = useCallback(() => {
    setTrigger((trigger) => trigger + 1);
  }, []);

  useEffect(() => {
    const throttled = debounce(setTriggerCallback);
    window.addEventListener(FORMAT_SELECTION_EVENT, throttled);
    window.addEventListener('cursor-position', throttled);
    return () => {
      window.removeEventListener(FORMAT_SELECTION_EVENT, throttled);
      window.removeEventListener('cursor-position', throttled);
    };
  }, [setTriggerCallback]);

  return useMemo(() => {
    let start: Coordinate, end: Coordinate;
    if (cursor.multiCursor) {
      start = cursor.multiCursor.originPosition;
      end = cursor.multiCursor.terminalPosition;
    } else {
      start = cursor.cursorPosition;
      end = cursor.cursorPosition;
    }
    return {
      start,
      end,
      multiCursor: !!cursor.multiCursor,
      formatPrimaryCell: sheet.getCellFormatSummary(start.x, start.y),
      formatSummary: sheet.getFormattingSummary(new Rectangle(start.x, start.y, end.x - start.x, end.y - start.y)),
      rectangle: new Rectangle(start.x, start.y, end.x - start.x, end.y - start.y),
    };

    // this is needed for trigger to cause a useMemo change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trigger,
    cursor.multiCursor,
    cursor.multiCursor?.originPosition,
    cursor.multiCursor?.terminalPosition,
    cursor.cursorPosition,
    sheet.grid,
  ]);
};
