/* eslint-disable @typescript-eslint/no-unused-vars */
import { Box } from '@mui/system';
import { SheetController } from '../../../grid/controller/sheetController';
import { colors } from '../../../theme/colors';
import { Tab, Tabs } from '@mui/material';
import { useCallback, useState } from 'react';
import { SheetBarRename } from './SheetBarRename';
import { useLocalFiles } from '../../contexts/LocalFiles';

interface Props {
  sheetController: SheetController;
}

export const SheetBar = (props: Props): JSX.Element => {
  const { sheetController } = props;

  // rename sheet
  const localFiles = useLocalFiles()
  const [isRenaming, setIsRenaming] = useState<number | false>(false);
  const onRenameSheet = useCallback((name?: string) => {
    if (name) {
      sheetController.sheet.rename(name);
      localFiles.save();
    }
    setIsRenaming(false);
  }, [localFiles, sheetController.sheet]);

  // activate sheet
  const [activeSheet, setActiveSheet] = useState(sheetController.current);
  const changeSheet = useCallback(
    (_, value: number | 'create') => {
      if (value === 'create') {
        sheetController.addSheet();
        setActiveSheet(sheetController.current);
      } else {
        sheetController.current = value;
        setActiveSheet(sheetController.current);
      }
    },
    [sheetController]
  );

  return (
    <div
      onContextMenu={(event) => {
        // Disable right-click
        event.preventDefault();
      }}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderTop: `1px solid ${colors.mediumGray}`,
        color: colors.darkGray,
        bottom: 0,
        width: '100%',
        backdropFilter: 'blur(1px)',
        display: 'flex',
        justifyContent: 'space-between',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        fontFamily: 'sans-serif',
        fontSize: '0.7rem',
        userSelect: 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          height: '1.5rem'
        }}
      >
        <Tabs
          value={activeSheet}
          onChange={changeSheet}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="select sheet control"
          sx={{ height: '1.5rem', fontSize: '14px' }}
        >
          {sheetController.sheets.map((sheet, index) => (
            <Tab
              key={index}
              value={index}
              label={isRenaming === index ? <SheetBarRename
                key={index}
                value={sheet.name}
                onUpdate={onRenameSheet}
              /> : sheet.name}
              onDoubleClick={(e) => {
                setIsRenaming(index);
                e.stopPropagation();
              }}
              sx={{
                height: '1.5rem',
                padding: 0,
                textAlign: 'center',
                textTransform: 'none',
                marginRight: '1rem'
              }}
            />
          ))}
          <Tab value={'create'} label="+" style={{ width: '1rem' }} />
        </Tabs>
      </Box>
    </div>
  );
};
