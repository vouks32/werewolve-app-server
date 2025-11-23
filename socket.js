import { getUser, saveUser, getAllUsers, getMessages, saveMessage, getStickers } from './userStorage.js';
import express, { text } from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import http from "http";
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';
import multer from 'multer';
import { fancyTransform } from './TextConverter.js';



function htmlDecode(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}


const games = [
    {
        id: '0',
        tag: '!werewolve',
        name: 'Loup Garou',
        icon: '🐺',
        color: '#eee'
    }, {
        id: '1',
        tag: '!pendu',
        name: 'Pendu',
        icon: '☠️',
        color: '#eee'

    }, {
        id: '2',
        tag: '!quizfr',
        name: 'Quiz FR',
        icon: '🇫🇷',
        color: '#eee'

    },
];


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOADS = path.join(__dirname, "../audio");
const STICKERS = path.join(__dirname, "./Stickers");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS);

// Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS),
    filename: (req, file, cb) => {
        cb(null, file.originalname);  // ← Use the filename sent by the client
    },
});


const upload = multer({ storage });


// 51.20.105.210
// --- Main Manager ---
export class AppSocket {
    constructor() {
        this.eventsMap = new Map();
        this.eventsMap.set('group-participants.update', []);
        this.eventsMap.set("messages.upsert", []);

        // Store pending long polling requests
        this.pendingRequests = new Map(); // key: clientId, value: { res, timer, timestamp }
        this.clientCounter = 0;
        this.messageQueue = []; // Store messages for clients that poll

        // Create Express app
        this.app = express();

        this.app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, skip_zrok_interstitial");
            if (req.method === "OPTIONS") {
                return res.sendStatus(200);
            }
            next();
        });


        // Configure CORS to allow all origins
        this.app.use(cors({
            allowedHeaders: "*",
            origin: function (origin, callback) {
                callback(null, true)
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));

        // Parse JSON bodies
        this.app.use(express.json());

        // Set up routes
        this.setupRoutes();

        // Cleanup interval for stale connections
        this.cleanupInterval = setInterval(this.cleanupStaleConnections.bind(this), 30000);

        // Start the server

        this.server = this.app.listen(3001, () => {
            console.log('Express long polling server listening on port 3001');
        });

        // Error handling for server
        this.server.on('error', (error) => {
            console.error('Server error:', error);
        });
    }

    setupRoutes() {
        // Define routes
        this.app.get('/init', this.handleInit.bind(this));
        this.app.post('/inscription', this.handleInscription.bind(this));
        this.app.post('/message', this.handleMessage.bind(this));
        this.app.get('/poll', this.handlePoll.bind(this));
        this.app.get('/health', this.handleHealth.bind(this));
        this.app.get('/users', this.handleGetUsers.bind(this));
        this.app.get('/socket.io', this.handleGetUsers.bind(this));
        this.app.get('/', (req, res) => {
            res.json({ server: "running", ok: true });
        });

        this.app.post("/audio", upload.single("audio"), this.handleAudioMessage.bind(this));

        // Serve the latest audio file
        this.app.get("/audio", (req, res) => {

            const id = req.query.id || 'x'
            const filePath = path.join(UPLOADS, id);

            if (!fs.existsSync(filePath)) {
                return res.status(404).send("No audio found");
            }
            res.setHeader("Content-Type", "audio/ogg");
            res.sendFile(filePath);
        });

        // Serve the latest audio file
        this.app.get("/sticker", (req, res) => {

            const id = req.query.id || 'x'
            const filePath = path.join(STICKERS, id);

            if (!fs.existsSync(filePath)) {
                return res.status(404).send("No sticker found");
            }
            res.setHeader("Content-Type", "image/webp");
            res.sendFile(filePath);
        });

        // Handle undefined routes

        // Error handling middleware
        this.app.use(this.handleErrors.bind(this));
    }

    async handleInit(req, res) {
        try {
            const clientId = this.generateClientId();
            const players = getAllUsers();
            const stickers = getStickers();
            const messages = getMessages(Date.now()); // Last hour
            const onlineUsers = this.pendingRequests.entries().map(e => e[1].number)
            this.sendSuccess(res, {
                clientId,
                players,
                messages,
                onlineUsers,
                stickers,
                games,
                serverType: 'init'
            });
        } catch (error) {
            console.error('Init error:', error);
            this.sendError(res, 500, 'Failed to initialize', { error: error.message });
        }
    }

    async handleInscription(req, res) {
        try {
            const body = req.body;
            if (!body || !body.data) {
                this.sendError(res, 400, 'Missing data in request');
                return;
            }

            saveUser(body.data);

            // Notify all clients about user list update
            const userUpdateNotification = {
                serverType: 'notification',
                type: 'users-update',
                data: getAllUsers(),
                timestamp: Date.now()
            };
            this.messageQueue.push(userUpdateNotification);
            this.notifyPendingClients(userUpdateNotification);

            this.sendSuccess(res, {
                success: true,
                serverType: 'return',
                type: 'inscription',
                data: body.data
            });
        } catch (error) {
            console.error('Inscription error:', error);
            this.sendError(res, 500, 'Failed to save user', { error: error.message });
        }
    }

    async handleAudioMessage(req, res) {
        try {
            let body = req.body;
            console.log('audio', body.data)
            let data = JSON.parse(body.data)
            if (!body || !data) {
                this.sendError(res, 400, 'Missing message data');
                return;
            }

            // Validate required fields
            if (!data.key.id || data.status !== 'sending') {
                console.log(data)
                this.sendError(res, 400, 'Message missing or wrong required fields');
                return;
            }

            data.status = "sent"
            saveMessage(data);

            // Add to message queue for polling clients
            const notification = {
                serverType: 'notification',
                type: 'message',
                data: data,
                timestamp: Date.now()
            };
            this.messageQueue.push(notification);

            // Notify all pending poll requests
            this.notifyPendingClients(notification);

            this.sendSuccess(res, {
                success: true,
                serverType: 'return',
                type: 'message',
                data: data
            });
        } catch (error) {
            console.error('Message error:', error);
            this.sendError(res, 500, 'Failed to save message', { error: error.message });
        }
    }

    async handleMessage(req, res) {
        try {
            let body = req.body;
            if (!body || !body.data) {
                this.sendError(res, 400, 'Missing message data');
                return;
            }

            // Validate required fields
            if (!body.data.key.id || body.data.status !== 'sending') {
                console.log(body.data)
                this.sendError(res, 400, 'Message missing or wrong required fields');
                return;
            }

            body.data.status = "sent"
            body.data.key.remoteJid = body.data.key.remoteJid ? body.data.key.remoteJid : "werewolve-111"
            saveMessage(body.data);

            // Add to message queue for polling clients
            const notification = {
                serverType: 'notification',
                type: 'message',
                data: body.data,
                timestamp: Date.now()
            };
            this.messageQueue.push(notification);

            // sent to games
            this.call_event('messages.upsert', body.data)

            // Notify all pending poll requests
            this.notifyPendingClients(notification);

            this.sendSuccess(res, {
                success: true,
                serverType: 'return',
                type: 'message',
                data: body.data
            });
        } catch (error) {
            console.error('Message error:', error);
            this.sendError(res, 500, 'Failed to save message', { error: error.message });
        }
    }

    async sendMessage(remoteJid, message = { text: "", mentions: [] }, extra = { quoted: null }) {
        try {
            if (message.delete) return
            let msg = {
                key: {
                    id: 'server' + '-' + Date.now(),
                    senderNumber: remoteJid,
                    name: 'Bot 🐺',
                    isBot: true,
                    color: "#333"
                },
                type: "text",
                message: {
                    caption: message.text || message.caption,
                    mentions: message.mentions,
                    quotedMessage: extra.quoted
                },
                status: 'sent',
                time: Date.now()
            }

            saveMessage(msg);

            // Add to message queue for polling clients
            const notification = {
                serverType: 'notification',
                type: 'message',
                data: msg,
                to: remoteJid.startsWith('werewolve') ? null : remoteJid,
                timestamp: Date.now()
            };
            this.messageQueue.push(notification);

            // Notify all pending poll requests
            this.notifyPendingClients(notification);

            /*this.sendSuccess(res, {
                success: true,
                serverType: 'return',
                type: 'message',
                data: body.data
            });*/
        } catch (error) {
            console.error('Message error:', error);
            this.sendError(res, 500, 'Failed to save message', { error: error.message });
        }
    }

    async handleGetUsers(req, res) {
        try {
            const players = getAllUsers();
            this.sendSuccess(res, {
                players,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Get users error:', error);
            this.sendError(res, 500, 'Failed to get users', { error: error.message });
        }
    }

    handlePoll(req, res) {
        const clientId = req.query.clientId;
        const number = req.query.clientNumber;
        const timeout = parseInt(req.query.timeout) || 30000; // Default 30 seconds
        const since = parseInt(req.query.since) || 0;

        if (!clientId) {
            this.sendError(res, 400, 'clientId parameter required');
            return;
        }

        // Notify all clients about user list update

        // Check for immediate messages
        let recentMessages = this.getMessageSince(since) || [];
        let onlineUsers = []
        for (const [clientId, pending] of this.pendingRequests.entries()) {
            onlineUsers.push(pending.number)
        }

        if (recentMessages.length > 0) {
            this.sendSuccess(res, {
                serverType: 'poll',
                messages: recentMessages,
                timestamp: Date.now(),
                onlineUsers
            });
            return;
        }

        // Store the pending request
        const timer = setTimeout(() => {
            this.handlePollTimeout(clientId);
        }, timeout);

        this.pendingRequests.set(clientId, {
            res,
            number,
            timer,
            timestamp: Date.now()
        });

        // Set timeout for the request
        req.on('close', () => {
            this.cleanupClient(clientId);
        });
    }

    handleHealth(req, res) {
        this.sendSuccess(res, {
            status: 'healthy',
            pendingClients: this.pendingRequests.size,
            timestamp: Date.now()
        });
    }

    handleNotFound(req, res) {
        this.sendError(res, 404, 'Endpoint not found');
    }

    handleErrors(error, req, res, next) {
        console.error('Unhandled error:', error);
        this.sendError(res, 500, 'Internal server error');
    }

    handlePollTimeout(clientId) {
        const pending = this.pendingRequests.get(clientId);
        if (pending) {
            let onlineUsers = []
            for (const [clientId, pending] of this.pendingRequests.entries()) {
                onlineUsers.push(pending.number)
            }
            this.sendSuccess(pending.res, {
                serverType: 'poll',
                messages: [],
                timestamp: Date.now(),
                status: 'timeout',
                onlineUsers
            });
            this.pendingRequests.delete(clientId);
        }
    }

    notifyPendingClients(notification) {
        const clientsToRemove = [];
        let onlineUsers = []
        for (const [clientId, pending] of this.pendingRequests.entries()) {
            onlineUsers.push(pending.number)
        }
        for (const [clientId, pending] of this.pendingRequests.entries()) {
            try {
                this.sendSuccess(pending.res, {
                    serverType: 'poll',
                    messages: [notification],
                    timestamp: Date.now(),
                    onlineUsers
                });
                clearTimeout(pending.timer);
                clientsToRemove.push(clientId);
            } catch (error) {
                console.error('Error notifying client:', clientId, error);
                clientsToRemove.push(clientId);
            }
        }

        // Remove notified clients
        clientsToRemove.forEach(clientId => {
            this.pendingRequests.delete(clientId);
        });
    }

    getMessageSince(timestamp) {
        return this.messageQueue.filter(msg => msg.timestamp > timestamp);
    }

    cleanupStaleConnections() {
        const now = Date.now();
        const staleTimeout = 35000; // 35 seconds

        for (const [clientId, pending] of this.pendingRequests.entries()) {
            if (now - pending.timestamp > staleTimeout) {
                console.log('Cleaning up stale connection:', clientId);
                this.sendError(pending.res, 408, 'Connection timeout');
                clearTimeout(pending.timer);
                this.pendingRequests.delete(clientId);
            }
        }

        // Cleanup old messages (keep last 1000 messages or last hour)
        const oneHourAgo = Date.now() - 3600000;
        this.messageQueue = this.messageQueue.filter(msg =>
            msg.timestamp > oneHourAgo
        ).slice(-1000);
    }

    cleanupClient(clientId) {
        const pending = this.pendingRequests.get(clientId);
        if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(clientId);
        }
    }

    generateClientId() {
        return `client_${++this.clientCounter}_${Date.now()}`;
    }

    sendSuccess(res, data) {
        try {
            res.status(200).json({
                success: true,
                ...data
            });
        } catch (error) {
            console.error('Error sending success response:', error);
        }
    }

    sendError(res, code, message, additionalData = {}) {
        try {
            res.status(code).json({
                success: false,
                error: message,
                ...additionalData
            });
        } catch (error) {
            console.error('Error sending error response:', error);
        }
    }

    // Keep for compatibility with existing code
    on(name, f) {
        let arr = this.eventsMap.get(name) || [];
        arr.push(f);
        this.eventsMap.set(name, arr);
    }

    call_event(name, data) {
        let arr = this.eventsMap.get(name) || [];
        arr.forEach(_function => {
            _function(data)
        });
    }

    groupMetadata(groupJid) {
        const players = getAllUsers()
        return { participants: players }
    }

    async groupParticipantsUpdate(groupJid, jidArray, action = 'promote') {
        let userarr = []
        for (let i = 0; i < jidArray.length; i++) {
            const jid = jidArray[i];
            let user = getUser(jid)
            userarr.push(user)
            user.admin = action == "Promote" ? true : false
            saveUser(user)
        }
        return await sock.sendMessage(remoteJid, {
            text: fancyTransform(htmlDecode(
                'Les joueurs actuel ont été ' + (action == "Promote" ? "ajoutés" : "retiré") + ' admin:\n\n' + userarr.map(u => '- ' + u.username).join('\n')
            ) + (message.length > 300 ? '\n\n𝐯𝐨𝐮𝐤𝐬 𝐛𝐨𝐭' : "")), mentions: []
        }, { quoted: null })
    }

    // Cleanup method
    destroy() {
        clearInterval(this.cleanupInterval);
        for (const [clientId, pending] of this.pendingRequests.entries()) {
            clearTimeout(pending.timer);
            try {
                if (!pending.res.finished) {
                    pending.res.end(); // Close pending responses
                }
            } catch (error) {
                // Ignore errors during cleanup
            }
        }
        this.pendingRequests.clear();

        if (this.server) {
            this.server.close();
        }
    }
}

// Alternative: Simple Express app export for direct use
export function createApp() {
    const appSocket = new AppSocket();
    return appSocket.app;
}

// If this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    new AppSocket();
}