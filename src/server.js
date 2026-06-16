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

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/narutorpg')
.then(() => console.log("🍃 MongoDB Cluster Pipeline Synchronized Successfully."))
.catch(err => console.error("Cluster synchronization fault caught:", err));

// Tracking Server Start Time for the Frontend Uptime Counter
const startTime = Math.floor(Date.now() / 1000);

io.on('connection', (socket) => {
    console.log('Admin Interface Client Attached');

    // Continuous 3-second heartbeat to update the frontend dashboard slots/uptime
    const statsInterval = setInterval(() => {
        socket.emit('stats', {
            active: connections.size,
            max: 100,
            uptime: Math.floor(Date.now() / 1000) - startTime,
            maintenanceMode: false
        });
    }, 3000);

    socket.on('request-code', async (phoneNumber) => {
        if (!phoneNumber) {
            return socket.emit('error', 'Phone alignment payload configuration omitted.');
        }
        try {
            const cleanPhone = phoneNumber.replace('+', '').trim();
            await startBot(cleanPhone, socket);
        } catch (err) {
            console.error(err);
            socket.emit('error', 'Critical operational loop breakdown in pairing routine.');
        }
    });

    socket.on('disconnect', () => {
        clearInterval(statsInterval);
    });
});

app.get('/health', (req, res) => {
    res.json({ status: "alive", code: 200, usersOnline: connections.size });
});

if (process.env.SELF_URL) {
    setInterval(() => {
        const https = require('https');
        https.get(`${process.env.SELF_URL}/health`, (res) => res.resume())
        .on('error', (e) => console.log("Heartbeat missed:", e.message));
    }, 180000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server operating cleanly along target port route ${PORT}`);
});
