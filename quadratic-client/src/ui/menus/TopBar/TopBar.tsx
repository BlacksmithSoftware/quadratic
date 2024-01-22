import { Switch } from '@/shadcn/ui/switch';
import { cn } from '@/shadcn/utils';
import { Box, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { useRecoilValue } from 'recoil';
import { hasPermissionToEditFile } from '../../../actions';
import { editorInteractionStateAtom } from '../../../atoms/editorInteractionStateAtom';
import { electronMaximizeCurrentWindow } from '../../../helpers/electronMaximizeCurrentWindow';
import { isEmbed } from '../../../helpers/isEmbed';
import { isElectron } from '../../../utils/isElectron';
import { DataMenu } from './SubMenus/DataMenu';
import { FormatMenu } from './SubMenus/FormatMenu/FormatMenu';
import { NumberFormatMenu } from './SubMenus/NumberFormatMenu';
import { QuadraticMenu } from './SubMenus/QuadraticMenu';
import { useGridSettings } from './SubMenus/useGridSettings';
import { TopBarFileMenu } from './TopBarFileMenu';
import { TopBarShareButton } from './TopBarShareButton';
import { TopBarUsers } from './TopBarUsers';
import { TopBarZoomMenu } from './TopBarZoomMenu';

export const TopBar = () => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const editorInteractionState = useRecoilValue(editorInteractionStateAtom);
  const { permissions } = editorInteractionState;
  const { showCellTypeOutlines, setShowCellTypeOutlines } = useGridSettings();
  return (
    <Box
      onContextMenu={(event) => {
        // Disable right-click
        event.preventDefault();
      }}
      sx={{
        backgroundColor: 'rgba(255, 255, 255)',
        // px: theme.spacing(1),
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        gap: theme.spacing(1),
        border: theme.palette.divider,
        borderWidth: '0 0 1px 0',
        borderStyle: 'solid',
        height: theme.spacing(6),
        ...(isElectron()
          ? {
              paddingLeft: '4.5rem',
              // this allows the window to be dragged in Electron
              WebkitAppRegion: 'drag',
            }
          : {}),
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
          alignItems: 'stretch',
          color: theme.palette.text.primary,
          ...(isDesktop ? { flexBasis: '30%' } : {}),
        }}
      >
        <QuadraticMenu />
        {hasPermissionToEditFile(permissions) && isDesktop && (
          <>
            <DataMenu />
            <FormatMenu />
            <NumberFormatMenu />
          </>
        )}
      </div>

      <TopBarFileMenu />

      <div
        style={{
          // @ts-expect-error
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: theme.spacing(),
          color: theme.palette.text.primary,
          ...(isDesktop ? { flexBasis: '30%' } : {}),
        }}
      >
        {isDesktop && !isEmbed && (
          <>
            <Tooltip title={`Code cell outlines ${showCellTypeOutlines ? 'visible' : 'hidden'}`}>
              <Switch className={cn('br-0')} checked={showCellTypeOutlines} onCheckedChange={setShowCellTypeOutlines} />
            </Tooltip>
            <TopBarUsers />
            <TopBarShareButton />
          </>
        )}
        <TopBarZoomMenu />
      </div>
    </Box>
  );
};
