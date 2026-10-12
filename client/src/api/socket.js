import { io } from 'socket.io-client';

const resolveSocketUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/';
  const trimmed = envUrl.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/api$/, '') || '/';
};

const SOCKET_URL = resolveSocketUrl();

let socket = null;

export const connectSocket = (token) => {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    auth: { token }
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
