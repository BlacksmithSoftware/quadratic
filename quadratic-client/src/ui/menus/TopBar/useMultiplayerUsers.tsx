import { multiplayer } from '@/multiplayer/multiplayer';
import { useEffect, useState } from 'react';

export interface SimpleMultiplayerUser {
  sessionId: string;
  userId: string;
  firstName: string;
  lastName: string;
  picture: string;
  color: number;
}

export const useMultiplayerUsers = (): SimpleMultiplayerUser[] => {
  const [users, setUsers] = useState<SimpleMultiplayerUser[]>([]);

  useEffect(() => {
    setUsers(multiplayer.getUsers());
    const handleUpdate = (e: any) => setUsers(e.detail);
    window.addEventListener('multiplayer-update', handleUpdate);
    return () => window.removeEventListener('multiplayer-update', handleUpdate);
  }, []);

  return users;
};
