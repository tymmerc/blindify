import { Server as SocketIOServer } from "socket.io";

export let io: SocketIOServer;

export function initSocket(server: any, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  });
  return io;
}
