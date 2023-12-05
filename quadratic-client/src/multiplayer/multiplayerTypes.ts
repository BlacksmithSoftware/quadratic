export interface MessageMouseMove {
  type: 'MouseMove';
  session_id: string;
  file_id: string;
  x?: number | null;
  y?: number | null;
}

export interface ReceiveEnterRoom {
  type: 'Room';
  room: {
    users: Record<
      string,
      {
        session_id: string;
        user_id: string;
        first_name: string;
        last_name: string;
        image: string;
      }
    >;
  };
}

export interface MessageChangeSelection {
  type: 'ChangeSelection';
  session_id: string;
  file_id: string;
  selection: string;
}

export interface SendEnterRoom {
  type: 'EnterRoom';
  session_id: string;
  user_id: string;
  file_id: string;
  first_name: string;
  last_name: string;
  image: string;
}

export interface MessageTransaction {
  type: 'Transaction';
  session_id: string;
  file_id: string;
  operations: string;
}

export type ReceiveMessages = MessageMouseMove | ReceiveEnterRoom | MessageChangeSelection | MessageTransaction;
