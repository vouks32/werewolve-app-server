import { WebSocketServer } from 'ws';
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
    methods: ["GET", "POST", "PUT", "DELETE"]
}));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- Main Manager ---
export class AppSocket {

    constructor() {
        this.eventsMap = new Map()
        this.eventsMap.set('group-participants.update', [])
        this.eventsMap.set("messages.upsert", [])

        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*'); // Or '*'
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // Add allowed methods
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Add allowed headers

            if (req.method === 'OPTIONS') {
                res.writeHead(204); // Respond to preflight requests
                res.end();
                return;
            }
        });

        let _wss = new Server(server, {
            cors: {
                allowedHeaders: "*",
                origin: function (origin, callback) { // allow requests with no origin  // (like mobile apps or curl requests)
                    return callback(null, true);
                },
                methods: ["GET", "POST", "PUT", "DELETE"]
            }
        });
        this.wss = _wss

        this.wss.on('connection', function connection(ws) {
            console.log('Client connected');

            ws.on('message', function message(raw) {
                const data = JSON.parse(raw)
                switch (data.type) {
                    case 'init':
                        console.log("init thing")
                        try {
                            let players = getAllUsers()
                            let messages = getMessages(Date.now())
                            ws.send(JSON.stringify({ success: true, serverType: 'init', data: { players, messages } }));
                        } catch (error) {
                            console.log("error saving user", error)
                            ws.send(JSON.stringify({ success: false, serverType: 'return', error, ...data }));
                        }
                        break;

                    case 'inscription':
                        try {
                            saveUser(data.data)
                            ws.send(JSON.stringify({ success: true, serverType: 'return', ...data }));
                        } catch (error) {
                            console.log("error saving user", error)
                            ws.send(JSON.stringify({ success: false, serverType: 'return', error, ...data }));
                        }
                        break;

                    case 'message':
                        try {
                            saveMessage(data.data)
                            ws.send(JSON.stringify({ success: true, serverType: 'return', ...data }));
                            _wss.clients.forEach(client => {
                                // Ensure the client is open and optionally, not the sender
                                if (client.readyState === WebSocket.OPEN && client !== ws) {
                                    client.send(JSON.stringify({ serverType: 'notification', ...data }));
                                }
                            });
                        } catch (error) {
                            console.log("error saving user", error)
                            ws.send(JSON.stringify({ success: false, serverType: 'return', error, ...data }));

                        }
                        break;

                    default:
                        break;
                }
                //console.log('received: %s', data);
                // Echo back the received message
            });

            ws.on('close', () => {
                console.log('Client disconnected');
            });


            //ws.send('Welcome to the WebSocket server!');
        });

        server.listen(80, () => {
            console.log('WSS server listening on port 80');
        });
    }

    broadcastMessage(message, senderWs = null) {
        this.wss.clients.forEach(client => {
            // Ensure the client is open and optionally, not the sender
            if (client.readyState === WebSocket.OPEN && client !== senderWs) {
                client.send(message);
            }
        });
    }

    on(name, f) {
        let arr = this.eventsMap.get(name) || []
        arr.push(f)
        this.eventsMap.set(name, arr)
    }

}