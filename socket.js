import { WebSocketServer } from 'ws';
import { getUser, saveUser, getAllUsers, getMessages, saveMessage } from './userStorage.js';
import http from 'node:http'
import e from 'express';
import cors from "cors";

// --- Main Manager ---
export class AppSocket {
    constructor() {
        this.eventsMap = new Map()
        this.eventsMap.set('group-participants.update', [])
        this.eventsMap.set("messages.upsert", [])

        this.wss = new WebSocketServer({ port: 80 });

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
                            this.broadcastMessage(JSON.stringify({ serverType: 'notification', ...data }), ws)
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
                console.log('Client disconnected', ws.url);
            });

            //ws.send('Welcome to the WebSocket server!');
        });

        console.log('WebSocket server is running on ws://localhost:80');
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