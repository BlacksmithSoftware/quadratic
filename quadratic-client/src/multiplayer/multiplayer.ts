import { authClient, parseDomain } from '@/auth';
import { debugShowMultiplayer } from '@/debugFlags';
import { grid } from '@/grid/controller/Grid';
import { sheets } from '@/grid/controller/Sheets';
import { offline } from '@/grid/controller/offline';
import { pixiApp } from '@/gridGL/pixiApp/PixiApp';
import { pixiAppSettings } from '@/gridGL/pixiApp/PixiAppSettings';
import { SheetPos } from '@/gridGL/types/size';
import { pythonWebWorker } from '@/web-workers/pythonWebWorker/python';
import { User } from '@auth0/auth0-spa-js';
import { v4 as uuid } from 'uuid';
import { MULTIPLAYER_COLORS } from './multiplayerCursor/multiplayerColors';
import {
  Heartbeat,
  MessageUserUpdate,
  MultiplayerUser,
  ReceiveCurrentTransaction,
  ReceiveEnterRoom,
  ReceiveMessages,
  ReceiveRoom,
  ReceiveTransaction,
  ReceiveTransactions,
  SendEnterRoom,
  SendGetTransactions,
  SendTransaction,
} from './multiplayerTypes';

const UPDATE_TIME = 1000 / 30;
const HEARTBEAT_TIME = 1000 * 15;
const RECONNECT_AFTER_ERROR_TIMEOUT = 1000 * 5;

export class Multiplayer {
  private websocket?: WebSocket;
  private state: 'not connected' | 'connecting' | 'connected' | 'waiting to reconnect';
  private sessionId;
  private room?: string;
  private user?: User;
  private anonymous?: boolean;
  private jwt?: string | void;

  // messages pending a reconnect
  private waitingForConnection: { (value: unknown): void }[] = [];

  // queue of items waiting to be sent to the server on the next tick
  private userUpdate: MessageUserUpdate;
  private lastTime = 0;
  private lastHeartbeat = 0;

  // next player's color index
  private nextColor = 0;

  // users currently logged in to the room
  users: Map<string, MultiplayerUser> = new Map();

  constructor() {
    this.state = 'not connected';
    this.sessionId = uuid();
    this.userUpdate = { type: 'UserUpdate', session_id: this.sessionId, file_id: '', update: {} };
  }

  private async getJwt() {
    this.jwt = await authClient.getToken();
  }

  private async addJwtCookie(force: boolean = false) {
    if (force || !this.jwt) {
      await this.getJwt();

      if (this.jwt) {
        let domain = parseDomain(window.location.host);
        document.cookie = `jwt=${this.jwt}; path=/; domain=${domain};`;
      }
    }
  }

  private async init() {
    if (this.state === 'connected') return;

    if (!this.anonymous) {
      await this.addJwtCookie();
    }

    return new Promise((resolve) => {
      if (this.state === 'connecting' || this.state === 'waiting to reconnect') {
        this.waitingForConnection.push(resolve);
        return;
      }

      this.state = 'connecting';
      this.websocket = new WebSocket(import.meta.env.VITE_QUADRATIC_MULTIPLAYER_URL);
      this.websocket.addEventListener('message', this.receiveMessage);

      this.websocket.addEventListener('close', this.reconnect);
      this.websocket.addEventListener('error', this.reconnect);

      this.websocket.addEventListener('open', () => {
        console.log('[Multiplayer] websocket connected.');
        this.state = 'connected';
        this.waitingForConnection.forEach((resolve) => resolve(0));
        resolve(0);
        this.waitingForConnection = [];
        this.lastHeartbeat = Date.now();
        window.addEventListener('change-sheet', this.sendChangeSheet);
      });
    });
  }

  private reconnect = () => {
    if (this.state === 'waiting to reconnect') return;
    console.log(`[Multiplayer] websocket closed. Reconnecting in ${RECONNECT_AFTER_ERROR_TIMEOUT / 1000}s...`);
    this.state = 'waiting to reconnect';
    setTimeout(async () => {
      this.state = 'not connected';
      await this.init();
      if (this.room) {
        // need the room to rejoin, but clear it so enterFileRoom succeeds
        const room = this.room;
        this.room = undefined;
        await this.enterFileRoom(room, this.user);
      }
    }, RECONNECT_AFTER_ERROR_TIMEOUT);
  };

  // multiplayer for a file
  async enterFileRoom(file_id: string, user?: User, anonymous?: boolean) {
    this.anonymous = anonymous;
    if (!user?.sub) throw new Error('User must be defined to enter a multiplayer room.');
    this.userUpdate.file_id = file_id;
    await this.init();
    this.user = user;
    // ensure the user doesn't join a room twice
    if (this.room === file_id) return;
    this.room = file_id;
    const enterRoom: SendEnterRoom = {
      type: 'EnterRoom',
      session_id: this.sessionId,
      user_id: user.sub,
      file_id,
      sheet_id: sheets.sheet.id,
      selection: sheets.getMultiplayerSelection(),
      first_name: user.given_name ?? '',
      last_name: user.family_name ?? '',
      email: user.email ?? '',
      image: user.picture ?? '',
      cell_edit: {
        active: pixiAppSettings.input.show,
        text: pixiAppSettings.input.value ?? '',
        cursor: pixiAppSettings.input.cursor ?? 0,
        code_editor: pixiAppSettings.editorInteractionState.showCodeEditor,
      },
      x: 0,
      y: 0,
      visible: false,
      viewport: pixiApp.saveMultiplayerViewport(),
      code_running: JSON.stringify(pythonWebWorker.getCodeRunning()),
    };
    this.websocket!.send(JSON.stringify(enterRoom));
    if (debugShowMultiplayer) console.log(`[Multiplayer] Joined room ${file_id}.`);
  }

  // called by Update.ts
  async update() {
    if (this.state !== 'connected') return;
    const now = performance.now();
    if (now - this.lastTime < UPDATE_TIME) return;

    if (Object.keys(this.userUpdate.update).length > 0) {
      this.websocket!.send(JSON.stringify(this.userUpdate));
      this.userUpdate.update = {};
      this.lastHeartbeat = now;
    }
    this.lastTime = now;
    if (now - this.lastHeartbeat > HEARTBEAT_TIME) {
      const heartbeat: Heartbeat = {
        type: 'Heartbeat',
        session_id: this.sessionId,
        file_id: this.room!,
      };
      this.websocket!.send(JSON.stringify(heartbeat));
      if (debugShowMultiplayer) console.log('[Multiplayer] Sending heartbeat...');
      this.lastHeartbeat = now;
    }
  }

  // used to pre-populate useMultiplayerUsers.tsx
  getUsers(): MultiplayerUser[] {
    return Array.from(this.users.values());
  }

  // whether a multiplayer user is already editing a cell
  cellIsBeingEdited(x: number, y: number, sheetId: string): boolean {
    for (const player of this.users.values()) {
      if (player.sheet_id === sheetId && player.cell_edit.active && player.parsedSelection) {
        if (player.parsedSelection.cursor.x === x && player.parsedSelection.cursor.y === y) {
          return true;
        }
      }
    }
    return false;
  }

  //#region send messages
  //-------------------------

  private getUserUpdate(): MessageUserUpdate {
    if (!this.userUpdate) {
      this.userUpdate = {
        type: 'UserUpdate',
        session_id: this.sessionId,
        file_id: this.room!,
        update: {},
      };
    }
    return this.userUpdate;
  }

  async sendMouseMove(x?: number, y?: number) {
    const userUpdate = this.getUserUpdate().update;
    if (x === undefined || y === undefined) {
      userUpdate.visible = false;
    } else {
      userUpdate.x = x;
      userUpdate.y = y;
      userUpdate.visible = true;
    }
  }

  async sendSelection(selection: string) {
    const userUpdate = this.getUserUpdate().update;
    userUpdate.selection = selection;
  }

  sendChangeSheet = () => {
    const userUpdate = this.getUserUpdate().update;
    userUpdate.sheet_id = sheets.sheet.id;
  };

  sendCellEdit(text: string, cursor: number, codeEditor: boolean, bold?: boolean, italic?: boolean) {
    const userUpdate = this.getUserUpdate().update;
    userUpdate.cell_edit = {
      text,
      cursor,
      active: true,
      code_editor: codeEditor,
      bold,
      italic,
    };
  }

  sendEndCellEdit() {
    const userUpdate = this.getUserUpdate().update;
    userUpdate.cell_edit = {
      text: '',
      cursor: 0,
      active: false,
      code_editor: false,
    };
  }

  sendViewport(viewport: string) {
    const userUpdate = this.getUserUpdate().update;
    userUpdate.viewport = viewport;
  }

  sendCodeRunning(sheetPos: SheetPos[]) {
    const userUpdate = this.getUserUpdate().update;
    userUpdate.code_running = JSON.stringify(sheetPos);
  }

  async sendTransaction(id: string, operations: string) {
    await this.init();
    const message: SendTransaction = {
      type: 'Transaction',
      id,
      session_id: this.sessionId,
      file_id: this.room!,
      operations,
    };
    if (this.websocket?.OPEN) {
      this.websocket!.send(JSON.stringify(message));
      if (debugShowMultiplayer) console.log(`[Multiplayer] Sent transaction ${id}.`);
    }
  }

  sendGetTransactions(min_sequence_num: bigint) {
    const message: SendGetTransactions = {
      type: 'GetTransactions',
      session_id: this.sessionId,
      file_id: this.room!,
      min_sequence_num,
    };
    if (debugShowMultiplayer) console.log(`[Multiplayer] Requesting transactions starting from ${min_sequence_num}.`);
    this.websocket!.send(JSON.stringify(message));
  }

  //#endregion

  //#region receive messages
  //-------------------------

  // updates the React hook to populate the Avatar list
  private receiveUsersInRoom(room: ReceiveRoom) {
    const remaining = new Set(this.users.keys());
    for (const user of room.users) {
      if (user.session_id !== this.sessionId) {
        let player = this.users.get(user.session_id);
        if (player) {
          player.first_name = user.first_name;
          player.last_name = user.last_name;
          player.image = user.image;
          player.sheet_id = user.sheet_id;
          player.selection = user.selection;
          player.parsedSelection = user.selection ? JSON.parse(user.selection) : undefined;
          remaining.delete(user.session_id);
          if (debugShowMultiplayer) console.log(`[Multiplayer] Updated player ${user.first_name}.`);
        } else {
          player = {
            session_id: user.session_id,
            file_id: user.file_id,
            user_id: user.user_id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            image: user.image,
            sheet_id: user.sheet_id,
            selection: user.selection,
            parsedSelection: user.selection ? JSON.parse(user.selection) : undefined,
            cell_edit: user.cell_edit,
            x: 0,
            y: 0,
            color: this.nextColor,
            visible: false,
            index: this.users.size,
            viewport: user.viewport,
            code_running: user.code_running,
            parsedCodeRunning: user.code_running ? JSON.parse(user.code_running) : [],
          };
          this.users.set(user.session_id, player);
          this.nextColor = (this.nextColor + 1) % MULTIPLAYER_COLORS.length;
          if (debugShowMultiplayer) console.log(`[Multiplayer] Player ${user.first_name} entered room.`);
        }
      }
    }
    remaining.forEach((sessionId) => {
      if (debugShowMultiplayer) console.log(`[Multiplayer] Player ${this.users.get(sessionId)?.first_name} left room.`);
      this.users.delete(sessionId);
    });
    window.dispatchEvent(new CustomEvent('multiplayer-update', { detail: this.getUsers() }));
    pixiApp.multiplayerCursor.dirty = true;
  }

  private receiveUserUpdate(data: MessageUserUpdate) {
    // this eventually will not be necessarily
    if (data.session_id === this.sessionId) return;
    const player = this.users.get(data.session_id);

    // it's possible we get the UserUpdate before the EnterRoom response. No big deal if we do.
    if (!player) return;

    if (data.file_id !== this.room) {
      throw new Error("Expected file_id to match room before receiving a message of type 'MouseMove'");
    }
    const update = data.update;

    if (update.x !== null && update.y !== null) {
      player.x = update.x;
      player.y = update.y;
      if (player.sheet_id === sheets.sheet.id) {
        window.dispatchEvent(new CustomEvent('multiplayer-cursor'));
      }
    }

    if (update.visible !== undefined) {
      player.visible = update.visible;
    }

    if (update.sheet_id) {
      if (player.sheet_id !== update.sheet_id) {
        player.sheet_id = update.sheet_id;
        window.dispatchEvent(new CustomEvent('multiplayer-change-sheet'));
        if (player.sheet_id === sheets.sheet.id) {
          pixiApp.multiplayerCursor.dirty = true;
          window.dispatchEvent(new CustomEvent('multiplayer-cursor'));
        }
      }
    }

    if (update.selection) {
      player.selection = update.selection;
      player.parsedSelection = player.selection ? JSON.parse(player.selection) : undefined;
      if (player.sheet_id === sheets.sheet.id) {
        pixiApp.multiplayerCursor.dirty = true;
      }
    }

    if (update.cell_edit) {
      player.cell_edit = update.cell_edit;
      if (player.parsedSelection) {
        // hide the label if the player is editing the cell
        pixiApp.cellsSheets.showLabel(
          player.parsedSelection.cursor.x,
          player.parsedSelection.cursor.y,
          player.sheet_id,
          !player.cell_edit.active
        );
      }
      window.dispatchEvent(
        new CustomEvent('multiplayer-cell-edit', {
          detail: {
            ...update.cell_edit,
            playerColor: MULTIPLAYER_COLORS[player.color],
            sessionId: data.session_id,
            sheetId: player.sheet_id,
            cell: player.parsedSelection?.cursor,
          },
        })
      );
      pixiApp.multiplayerCursor.dirty = true;
    }

    if (update.viewport) {
      player.viewport = update.viewport;
      if (pixiAppSettings.editorInteractionState.follow === player.session_id) {
        pixiApp.loadMultiplayerViewport(JSON.parse(player.viewport));
      }
    }

    if (update.code_running) {
      player.code_running = update.code_running;
      player.parsedCodeRunning = JSON.parse(update.code_running);

      // trigger changes in CodeRunning.tsx
      dispatchEvent(new CustomEvent('python-change'));
    }
  }

  // Receives a new transaction from the server
  private receiveTransaction(data: ReceiveTransaction) {
    if (data.file_id !== this.room) {
      throw new Error("Expected file_id to match room before receiving a message of type 'Transaction'");
    }
    grid.multiplayerTransaction(data.id, data.sequence_num, data.operations);
    offline.markTransactionSent(data.id);
  }

  // Receives a collection of transactions to catch us up based on our sequenceNum
  private receiveTransactions(data: ReceiveTransactions) {
    grid.receiveMultiplayerTransactions(data.transactions);
  }

  // Receives the current transaction number from the server when entering a room.
  // Note: this may be different than the one provided by the api as there may be unsaved Transactions.
  private receiveEnterRoom(data: ReceiveEnterRoom) {
    if (data.file_id !== this.room) {
      throw new Error("Expected file_id to match room before receiving a message of type 'EnterRoom'");
    }
    grid.receiveSequenceNum(data.sequence_num);
  }

  // Called during a heartbeat from the server to verify we're at the correct sequenceNum
  private receiveCurrentTransaction(data: ReceiveCurrentTransaction) {
    grid.receiveSequenceNum(data.sequence_num);
  }

  receiveMessage = (e: { data: string }) => {
    const data = JSON.parse(e.data) as ReceiveMessages;
    const { type } = data;
    if (type === 'UsersInRoom') {
      this.receiveUsersInRoom(data);
    } else if (type === 'UserUpdate') {
      this.receiveUserUpdate(data);
    } else if (type === 'Transaction') {
      this.receiveTransaction(data);
    } else if (type === 'Transactions') {
      this.receiveTransactions(data);
    } else if (type === 'EnterRoom') {
      this.receiveEnterRoom(data);
    } else if (type === 'CurrentTransaction') {
      this.receiveCurrentTransaction(data);
    } else if (type === 'Error') {
      console.warn(`[Multiplayer] Error`, data.error);
    } else if (type !== 'Empty') {
      console.warn(`Unknown message type: ${type}`);
    }
  };
}

export const multiplayer = new Multiplayer();

window.sendTransaction = multiplayer.sendTransaction.bind(multiplayer);
