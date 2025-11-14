import { getUser, saveUser, getAllUsers, getMessages, saveMessage } from './userStorage.js';
import http from 'node:http';
import { URL, URLSearchParams } from 'node:url';

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
        
        this.server = http.createServer(this.handleRequest.bind(this));
        
        // Cleanup interval for stale connections
        this.cleanupInterval = setInterval(this.cleanupStaleConnections.bind(this), 30000);
        
        this.server.listen(80, () => {
            console.log('Long polling server listening on port 80');
        });
        
        // Error handling for server
        this.server.on('error', (error) => {
            console.error('Server error:', error);
        });
    }

    handleRequest(req, res) {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        
        try {
            switch (pathname) {
                case '/init':
                    this.handleInit(req, res, url);
                    break;
                case '/inscription':
                    this.handleInscription(req, res, url);
                    break;
                case '/message':
                    this.handleMessage(req, res, url);
                    break;
                case '/poll':
                    this.handlePoll(req, res, url);
                    break;
                case '/health':
                    this.handleHealth(req, res);
                    break;
                case '/users':
                    this.handleGetUsers(req, res, url);
                    break;
                default:
                    this.sendError(res, 404, 'Endpoint not found');
            }
        } catch (error) {
            console.error('Request handling error:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    async handleInit(req, res, url) {
        if (req.method !== 'GET') {
            this.sendError(res, 405, 'Method not allowed');
            return;
        }

        try {
            const clientId = this.generateClientId();
            const players = getAllUsers();
            const messages = getMessages(Date.now() - 3600000); // Last hour
            
            this.sendSuccess(res, {
                clientId,
                players,
                messages,
                serverType: 'init'
            });
        } catch (error) {
            console.error('Init error:', error);
            this.sendError(res, 500, 'Failed to initialize', { error: error.message });
        }
    }

    async handleInscription(req, res, url) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Method not allowed');
            return;
        }

        try {
            const body = await this.parseRequestBody(req);
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

    async handleMessage(req, res, url) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Method not allowed');
            return;
        }

        try {
            const body = await this.parseRequestBody(req);
            if (!body || !body.data) {
                this.sendError(res, 400, 'Missing message data');
                return;
            }

            // Validate required fields
            if (!body.data.id || !body.data.content) {
                this.sendError(res, 400, 'Message missing required fields');
                return;
            }

            saveMessage(body.data);
            
            // Add to message queue for polling clients
            const notification = {
                serverType: 'notification',
                type: 'message',
                data: body.data,
                timestamp: Date.now()
            };
            this.messageQueue.push(notification);
            
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

    async handleGetUsers(req, res, url) {
        if (req.method !== 'GET') {
            this.sendError(res, 405, 'Method not allowed');
            return;
        }

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

    handlePoll(req, res, url) {
        if (req.method !== 'GET') {
            this.sendError(res, 405, 'Method not allowed');
            return;
        }

        const clientId = url.searchParams.get('clientId');
        const timeout = parseInt(url.searchParams.get('timeout')) || 30000; // Default 30 seconds
        const since = parseInt(url.searchParams.get('since')) || 0;

        if (!clientId) {
            this.sendError(res, 400, 'clientId parameter required');
            return;
        }

        // Check for immediate messages
        const recentMessages = this.getMessageSince(since);
        if (recentMessages.length > 0) {
            this.sendSuccess(res, {
                serverType: 'poll',
                messages: recentMessages,
                timestamp: Date.now()
            });
            return;
        }

        // Store the pending request
        const timer = setTimeout(() => {
            this.handlePollTimeout(clientId);
        }, timeout);

        this.pendingRequests.set(clientId, {
            res,
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

    handlePollTimeout(clientId) {
        const pending = this.pendingRequests.get(clientId);
        if (pending) {
            this.sendSuccess(pending.res, {
                serverType: 'poll',
                messages: [],
                timestamp: Date.now(),
                status: 'timeout'
            });
            this.pendingRequests.delete(clientId);
        }
    }

    notifyPendingClients(notification) {
        const clientsToRemove = [];
        
        for (const [clientId, pending] of this.pendingRequests.entries()) {
            try {
                this.sendSuccess(pending.res, {
                    serverType: 'poll',
                    messages: [notification],
                    timestamp: Date.now()
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

    parseRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(new Error('Invalid JSON body'));
                }
            });
            req.on('error', reject);
        });
    }

    sendSuccess(res, data) {
        try {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({
                success: true,
                ...data
            }));
        } catch (error) {
            console.error('Error sending success response:', error);
        }
    }

    sendError(res, code, message, additionalData = {}) {
        try {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = code;
            res.end(JSON.stringify({
                success: false,
                error: message,
                ...additionalData
            }));
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