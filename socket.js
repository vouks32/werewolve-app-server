import { WebSocketServer } from 'ws';
import { getUser, saveUser } from './userStorage';

// --- Main Manager ---
export class AppSocket {
    constructor() {
        this.eventsMap = new Map()
        this.eventsMap.set('group-participants.update', [])
        this.eventsMap.set("messages.upsert", [])

        this.wss = new WebSocketServer({ port: 8088 });

        wss.on('connection', function connection(ws) {
            console.log('Client connected');

            ws.on('message', function message(raw) {
                const data = JSON.parse(raw)
                switch (data.type) {
                    case 'inscription':
                        try {
                            saveUser(data.data)
                            ws.send(JSON.stringify({ success: true, serverType: 'return', ...data }));
                        } catch (error) {
                            console.log("error saving user", error)
                            ws.send(JSON.stringify({ success: false,serverType : 'return', error, ...data }));
                        }
                        break;

                    case 'message':
                        try {
                            ws.send(JSON.stringify({ success: true, serverType: 'return', ...data }));
                        } catch (error) {
                            console.log("error saving user", error)
                            ws.send(JSON.stringify({ success: false, serverType : 'return', error, ...data }));
                        }
                        break;

                    default:
                        break;
                }
                console.log('received: %s', data);
                // Echo back the received message
            });

            ws.on('close', () => {
                console.log('Client disconnected');
            });

            ws.send('Welcome to the WebSocket server!');
        });

        console.log('WebSocket server is running on ws://localhost:8080');
    }

    on(name, f) {
        let arr = this.eventsMap.get(name) || []
        arr.push(f)
        this.eventsMap.set(name, arr)
    }

}