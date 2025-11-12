import { WebSocketServer } from 'ws';
import { getUser, saveUser } from './userStorage.js';
import http from 'node:http'

// --- Main Manager ---
export class AppSocket {
    constructor() {
        this.eventsMap = new Map()
        this.eventsMap.set('group-participants.update', [])
        this.eventsMap.set("messages.upsert", [])


        const hostname = '127.0.0.1'; // Localhost
        const port = 3000; // Choose a port number

        // Create the HTTP server
        const server = http.createServer((req, res) => {
            // Set the response header
            res.writeHead(200, { 'Content-Type': 'text/plain' });

            // Send the response body
            res.end('Hello, World!\n');
        });

        // Start the server and listen on the specified port and hostname
        server.listen(port, hostname, () => {
            console.log(`Server running at http://${hostname}:${port}/`);
        });




        this.wss = new WebSocketServer({ port: 8088 });

        this.wss.on('connection', function connection(ws) {
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
                            ws.send(JSON.stringify({ success: false, serverType: 'return', error, ...data }));
                        }
                        break;

                    case 'message':
                        try {
                            ws.send(JSON.stringify({ success: true, serverType: 'return', ...data }));
                        } catch (error) {
                            console.log("error saving user", error)
                            ws.send(JSON.stringify({ success: false, serverType: 'return', error, ...data }));
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

        console.log('WebSocket server is running on ws://localhost:8088');
    }

    on(name, f) {
        let arr = this.eventsMap.get(name) || []
        arr.push(f)
        this.eventsMap.set(name, arr)
    }

}