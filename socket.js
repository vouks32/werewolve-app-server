import { WebSocketServer } from 'ws';
import { getUser, saveUser, getAllUsers, getMessages, saveMessage } from './userStorage.js';
import http from 'node:http'
import e from 'express';
import cors from "cors";
import fs from 'fs'
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from "socket.io";


const app = express();
app.use(cors({ origin: "*" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- Main Manager ---
export class AppSocket {

    constructor() {
        this.eventsMap = new Map()
        this.eventsMap.set('group-participants.update', [])
        this.eventsMap.set("messages.upsert", [])

        const server =  http.createServer(app);

        let _wss = new Server(server, {
            cors: {
              origin: "*",
              methods: ["GET", "POST"]
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