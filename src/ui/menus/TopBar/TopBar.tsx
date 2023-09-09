import { ManageSearch } from '@mui/icons-material';
import { Box, IconButton, InputBase, Typography, useTheme } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { editorInteractionStateAtom } from '../../../atoms/editorInteractionStateAtom';
import { IS_READONLY_MODE } from '../../../constants/appConstants';
import { ROUTES } from '../../../constants/routes';
import { electronMaximizeCurrentWindow } from '../../../helpers/electronMaximizeCurrentWindow';
import { focusGrid } from '../../../helpers/focusGrid';
import { KeyboardSymbols } from '../../../helpers/keyboardSymbols';
import { colors } from '../../../theme/colors';
import { isElectron } from '../../../utils/isElectron';
import { TooltipHint } from '../../components/TooltipHint';
import { useFileContext } from '../../contexts/FileContext';
import CodeOutlinesSwitch from './CodeOutlinesSwitch';
import { DataMenu } from './SubMenus/DataMenu';
import { FormatMenu } from './SubMenus/FormatMenu/FormatMenu';
import { NumberFormatMenu } from './SubMenus/NumberFormatMenu';
import { QuadraticMenu } from './SubMenus/QuadraticMenu';
import { useGridSettings } from './SubMenus/useGridSettings';
import { ZoomDropdown } from './ZoomDropdown';

export const TopBar = () => {
  const [editorInteractionState, setEditorInteractionState] = useRecoilState(editorInteractionStateAtom);
  const { name, renameFile } = useFileContext();
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const theme = useTheme();
  const settings = useGridSettings();
  // const { user } = useAuth0();

  return (
    <div
      onContextMenu={(event) => {
        // Disable right-click
        event.preventDefault();
      }}
      style={{
        backgroundColor: 'rgba(255, 255, 255)',
        color: colors.darkGray,
        //@ts-expect-error
        WebkitAppRegion: 'drag', // this allows the window to be dragged in Electron
        paddingLeft: isElectron() ? '4.5rem' : theme.spacing(2),
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        paddingRight: theme.spacing(2),
        border: colors.mediumGray,
        borderWidth: '0 0 1px 0',
        borderStyle: 'solid',
      }}
      onDoubleClick={(event) => {
        // if clicked (not child clicked), maximize window. For electron.
        if (event.target === event.currentTarget) electronMaximizeCurrentWindow();
      }}
    >
      <div
        style={{
          //@ts-expect-error
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <QuadraticMenu />
        {!IS_READONLY_MODE && (
          <>
            <DataMenu />
            <FormatMenu />
            <NumberFormatMenu />
          </>
        )}
      </div>

      {IS_READONLY_MODE ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          <Typography
            variant="body2"
            fontFamily={'sans-serif'}
            color={colors.mediumGray}
            style={{ whiteSpace: 'nowrap', marginLeft: '1rem' }}
          >
            Read only
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: '1',
            visibility: { sm: 'hidden', xs: 'hidden', md: 'visible' },
          }}
        >
          {isRenaming ? (
            <FileRename setIsRenaming={setIsRenaming} currentFilename={name} renameCurrentFile={renameFile} />
          ) : (
            <>
              <Typography
                variant="body2"
                color={theme.palette.text.disabled}
                sx={{
                  '&:hover a': { color: theme.palette.text.primary },
                  '&::after': { content: '"/"', mx: theme.spacing(1) },
                }}
              >
                <Link to={ROUTES.MY_FILES} reloadDocument style={{ textDecoration: 'none' }}>
                  My files
                </Link>
              </Typography>
              <Typography
                onClick={() => {
                  setIsRenaming(true);
                }}
                variant="body2"
                color={colors.darkGray}
                style={{
                  display: 'block',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  // this is a little bit of a magic number for now, but it
                  // works and truncates at an appropriate, proportional size
                  maxWidth: '25vw',
                }}
              >
                {name}
              </Typography>
            </>
          )}

          {/* <KeyboardArrowDown fontSize="small" style={{ color: colors.darkGray }}></KeyboardArrowDown> */}
        </Box>
      )}
      <div
        style={{
          // @ts-expect-error
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '1rem',
        }}
      >
        {!IS_READONLY_MODE && (
          <>
            {/* {user !== undefined && (
              <AvatarGroup>
                <Avatar
                  sx={{
                    bgcolor: colors.quadraticSecondary,
                    width: 24,
                    height: 24,
                    fontSize: '0.8rem',
                  }}
                  alt={user?.name}
                  src={user?.picture}
                >
                  {user?.name && user?.name[0]}
                </Avatar>
              </AvatarGroup>
            )} */}
            <TooltipHint title={`${settings.showCellTypeOutlines ? 'Hide' : 'Show'} code cell outlines`}>
              <CodeOutlinesSwitch
                onClick={() => {
                  settings.setShowCellTypeOutlines(!settings.showCellTypeOutlines);
                  focusGrid();
                }}
                checked={settings.showCellTypeOutlines}
              />
            </TooltipHint>
            <TooltipHint title="Command palette" shortcut={KeyboardSymbols.Command + 'P'}>
              <IconButton
                onClick={() => {
                  setEditorInteractionState({
                    ...editorInteractionState,
                    showCommandPalette: true,
                  });
                  focusGrid();
                }}
              >
                <ManageSearch />
              </IconButton>
            </TooltipHint>
          </>
        )}
        <ZoomDropdown />
      </div>
    </div>
  );
};

function FileRename({
  currentFilename,
  renameCurrentFile,
  setIsRenaming,
}: {
  currentFilename: string;
  renameCurrentFile: Function;
  setIsRenaming: Function;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // When user selects input, highlight it's contents
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setSelectionRange(0, inputRef.current.value.length);
    }
  }, []);

  return (
    <InputBase
      onKeyUp={(e) => {
        if (e.key === 'Enter') {
          inputRef.current?.blur();
          focusGrid();
        } else if (e.key === 'Escape') {
          if (inputRef.current) {
            inputRef.current.value = currentFilename;
            inputRef.current.blur();
          }
          focusGrid();
        }
      }}
      onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
        setIsRenaming(false);
        const value = inputRef.current?.value;

        // Don't allow empty file names
        if (value === '' || (value && value.trim() === '')) {
          return;
        }

        // Don't do anything if the name didn't change
        if (value === currentFilename) {
          return;
        }

        renameCurrentFile(value);
      }}
      defaultValue={currentFilename}
      inputRef={inputRef}
      autoFocus
      inputProps={{ style: { textAlign: 'center' } }}
      sx={{ fontSize: '.875rem', color: colors.darkGray, width: '100%' }}
    />
  );
}
