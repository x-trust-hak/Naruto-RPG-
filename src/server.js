// src/server.js
require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const mongoose = require('mongoose');
const { startBot, restoreAllSessions, connections } = require('./bot');
const User    = require('../models/User');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/narutorpg')
    .then(async () => {
        console.log('🍃 MongoDB Connected.');
        startPassiveRegenLoop();
        // ✅ FIX: Restore previously-paired sessions on every server boot
        await restoreAllSessions();
    })
    .catch(err => console.error('MongoDB connection error:', err));

// ── Passive Regen Loop ────────────────────────────────────────────────────────
function startPassiveRegenLoop() {
    console.log('⏱️ Passive Regen Engine started.');
    setInterval(async () => {
        try {
            const players = await User.find({ registrationStep: 'COMPLETED' });
            for (const player of players) {
                let updated = false;
                if (player.chakra.current < player.chakra.max) {
                    player.chakra.current = Math.min(player.chakra.max, player.chakra.current + 10);
                    updated = true;
                }
                if (player.hp.current < player.hp.max) {
                    player.hp.current = Math.min(player.hp.max, player.hp.current + 25);
                    updated = true;
                }
                if (updated) await player.save();
            }
        } catch (err) {
            console.error('Passive regen error:', err);
        }
    }, 60000);
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
const startTime = Math.floor(Date.now() / 1000);

io.on('connection', (socket) => {
    console.log('🌐 Frontend client connected');

    const statsInterval = setInterval(() => {
        // Only count sockets that are fully open (readyState 1 = OPEN)
        const activeSessions = [...connections.values()].filter(
            c => c?.ws?.readyState === 1
        ).length;
        socket.emit('stats', {
            active: activeSessions,
            max: 100,
            uptime: Math.floor(Date.now() / 1000) - startTime,
            maintenanceMode: false
        });
    }, 3000);

    socket.on('request-code', async (phoneNumber) => {
        if (!phoneNumber) {
            return socket.emit('error', 'Phone number is required.');
        }

        const cleanPhone = phoneNumber.replace('+', '').replace(/\s/g, '').trim();

        if (!/^\d{7,15}$/.test(cleanPhone)) {
            return socket.emit('error', 'Invalid phone number format. Use country code + number (e.g. 2347041560392).');
        }

        // ✅ FIX: If this phone is already connected, tell the frontend immediately
        if (connections.has(cleanPhone)) {
            const existing = connections.get(cleanPhone);
            if (existing?.ws?.readyState === 1) {
                return socket.emit('connected', 'Session already active.');
            }
            // Dead socket lingering — remove it so startBot can create a fresh one
            connections.delete(cleanPhone);
        }

        try {
            await startBot(cleanPhone, socket);
        } catch (err) {
            console.error('[SERVER] startBot error:', err);
            socket.emit('error', 'Failed to start pairing. Please try again.');
        }
    });

    socket.on('disconnect', () => {
        clearInterval(statsInterval);
        console.log('🌐 Frontend client disconnected');
    });
});

// ── Health Endpoint ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'alive', usersOnline: connections.size });
});

// ── Self-Ping (Render free tier keep-alive) ───────────────────────────────────
if (process.env.SELF_URL) {
    setInterval(() => {
        const https = require('https');
        https.get(`${process.env.SELF_URL}/health`, res => res.resume())
             .on('error', e => console.log('Heartbeat missed:', e.message));
    }, 180000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
