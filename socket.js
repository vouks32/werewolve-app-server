import { getUser, saveUser, getAllUsers, getMessages, saveMessage } from './userStorage.js';
import http from 'node:http'
import e from 'express';
import cors from "cors";
import fs from 'fs'
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from "socket.io";

const app = e();
app.use(cors({
    allowedHeaders: "*",
    origin: function (origin, callback) { // allow requests with no origin  // (like mobile apps or curl requests)
        return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- Main Manager ---
export class AppSocket {

    constructor() {
        this.eventsMap = new Map()
        this.eventsMap.set('group-participants.update', [])
        this.eventsMap.set("messages.upsert", [])

        const server = http.createServer(app);

        // *** Use the correct Socket.IO server setup ***
        let _wss = new Server(server, {
            cors: {
                // Set the origin to allow all. You can be more specific later.
                // The client origin is 'http://192.168.1.188:8081'.
                origin: "https://werewolve.share.zrok.io", 
                methods: ["GET", "POST"]
            }
        });
        this.wss = _wss

        // *** Use Socket.IO's 'socket' object instead of 'ws' ***
        this.wss.on('connection', function connection(socket) {
            console.log('Client connected: ' + socket.id);

            // *** Socket.IO uses event names, not a switch statement on message content ***
            socket.on('init', function (data) {
                console.log("init thing")
                try {
                    let players = getAllUsers()
                    let messages = getMessages(Date.now())
                    // Use socket.emit to send to the current client
                    socket.emit('init', { success: true, serverType: 'init', data: { players, messages } });
                } catch (error) {
                    console.log("error fetching data", error)
                    // Use socket.emit to send back an error
                    socket.emit('return', { success: false, serverType: 'return', error, ...data });
                }
            });

            socket.on('inscription', function (data) {
                try {
                    saveUser(data.data)
                    socket.emit('return', { success: true, serverType: 'return', ...data });
                } catch (error) {
                    console.log("error saving user", error)
                    socket.emit('return', { success: false, serverType: 'return', error, ...data });
                }
            });

            socket.on('message', function (data) {
                try {
                    saveMessage(data.data)
                    socket.emit('return', { success: true, serverType: 'return', ...data }); // Send success back to sender
                    
                    // Use this.wss.emit or socket.broadcast.emit for broadcasting
                    // Use 'notification' as the event name
                    socket.broadcast.emit('notification', { serverType: 'notification', ...data }); 
                } catch (error) {
                    console.log("error saving message", error)
                    socket.emit('return', { success: false, serverType: 'return', error, ...data });
                }
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected: ' + socket.id);
            });

        }); // End of wss.on('connection')


        server.listen(80, () => {
            console.log('WSS server listening on port 80');
        });
    }

    // This method is now obsolete for Socket.IO. Use this.wss.emit() or socket.broadcast.emit()
    // For completeness, if you needed a utility, it would look like this:
    broadcastMessage(eventName, message) {
        this.wss.emit(eventName, message);
    }

    on(name, f) {
        let arr = this.eventsMap.get(name) || []
        arr.push(f)
        this.eventsMap.set(name, arr)
    }

}