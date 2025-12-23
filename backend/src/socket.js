"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
function initSocket(server, allowedOrigins) {
    exports.io = new socket_io_1.Server(server, {
        cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    });
    return exports.io;
}
