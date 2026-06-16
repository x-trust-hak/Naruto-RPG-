// src/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const { startBot, connections } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Connect Mongo Engine Directly Before Opening Interface Ports
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/narutorpg')
.then(() => console.log("🍃 MongoDB Cluster Pipeline Synchronized Successfully."))
.catch(err => console.error("Cluster synchronization fault caught:", err));

io.on('connection', (socket) => {
    console.log('Admin Interface Client Attached');

    socket.on('request-code', async (phoneNumber) => {
        if (!phoneNumber) {
            return socket.emit('error', 'Phone alignment payload configuration omitted.');
        }
        try {
            // Clean out formatting inconsistencies and append standard JID extensions identifiers
            const cleanPhone = phoneNumber.replace('+', '').trim();
            await startBot(cleanPhone, socket);
        } catch (err) {
            console.error(err);
            socket.emit('error', 'Critical operational loop breakdown in pairing routine.');
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: "alive", code: 200, usersOnline: connections.size });
});

// Auto-awake keep alive tracking configuration for Render hosting containers
if (process.env.SELF_URL) {
    setInterval(() => {
        const https = require('https');
        https.get(`${process.env.SELF_URL}/health`, (res) => res.resume())
        .on('error', (e) => console.log("Heartbeat missed context target:", e.message));
    }, 180000); // Trigger ping frame loops every 3 minutes
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server operating cleanly along target port route ${PORT}`);
});
      
