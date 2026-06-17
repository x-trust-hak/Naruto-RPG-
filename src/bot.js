// src/bot.js
const {
    makeWASocket,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const { createClient } = require('redis');
const { useRedisAuthState } = require('./redisAuthState');
const User = require('../models/User');

// ── Redis singleton ───────────────────────────────────────────────────────────
let redisClient;

async function getRedis() {
    if (redisClient) return redisClient;

    redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
            reconnectStrategy: (attempts) => Math.min(attempts * 100, 3000)
        }
    });

    redisClient.on('error', (err) => console.error('[Redis] Error:', err.message));
    redisClient.on('connect', () => console.log('✅ Redis connected'));
    redisClient.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

    await redisClient.connect();
    return redisClient;
}

// ── Active connections ────────────────────────────────────────────────────────
const connections = new Map();

// =============================================================================
//  MAIN BOT LAUNCHER
// =============================================================================
async function startBot(phoneNumber, socket = null) {
    const redis = await getRedis();

    // ── Tear down existing socket before creating a new one ───────────────────
    const existingConn = connections.get(phoneNumber);
    if (existingConn) {
        console.log(`♻️ Closing existing socket for ${phoneNumber}`);
        try { existingConn.ev.removeAllListeners(); } catch {}
        try { existingConn.end(); } catch {}
        connections.delete(phoneNumber);
    }

    const { state, saveCreds, clearSession } = await useRedisAuthState(redis, phoneNumber);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
    });

    connections.set(phoneNumber, conn);
    console.log(`✅ Socket created for ${phoneNumber}`);

    // ── Pairing code (new sessions only) ──────────────────────────────────────
    if (!conn.authState.creds.registered && phoneNumber && socket) {
        setTimeout(async () => {
            try {
                let code = await conn.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`[BOT] Pairing code for ${phoneNumber}: ${code}`);
                socket.emit('pairing-code', code);
            } catch (err) {
                console.error('[BOT] Pairing code error:', err.message);
                socket.emit('error', 'Failed to generate pairing code. Please try again.');
            }
        }, 3000);
    }

    // ── Connection lifecycle ───────────────────────────────────────────────────
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`✅ [CONNECTED] ${phoneNumber} authenticated!`);
            await saveCreds();
            try { await conn.sendPresenceUpdate('available'); } catch {}
            if (socket) socket.emit('connected');

            try {
                await conn.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
                    text: `🦊 *Naruto RPG connected!* ⚡ System online.\n\nType \`!start\` to begin or \`!menu\` to see all commands!`
                });
            } catch (e) {
                console.error(`[BOT] Boot DM failed:`, e.message);
            }
        }

        else if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`🔌 [DISCONNECTED] ${phoneNumber} | Code: ${reason}`);
            connections.delete(phoneNumber);

            if (reason === DisconnectReason.loggedOut) {
                console.log(`🗑️ [PURGING] ${phoneNumber} logged out. Clearing Redis session...`);
                try {
                    await clearSession();
                    await User.deleteOne({ phoneId: `${phoneNumber}@s.whatsapp.net` });
                } catch (e) { console.error('[BOT] Purge error:', e.message); }
                if (socket) socket.emit('logged-out');

            } else if (reason === DisconnectReason.badSession) {
                console.log(`⚠️ [BAD SESSION] Clearing Redis session for ${phoneNumber}...`);
                await clearSession();
                setTimeout(() => startBot(phoneNumber, socket), 3000);

            } else {
                console.log(`🔄 [RECONNECTING] ${phoneNumber} in 5s...`);
                try { await saveCreds(); } catch {}
                setTimeout(() => startBot(phoneNumber, null), 5000);
            }
        }
    });

    // ── Creds: always save on update ──────────────────────────────────────────
    conn.ev.on('creds.update', saveCreds);

    // ── Messages: pass everything to case.js ──────────────────────────────────
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;

            const m = chatUpdate.messages[0];
            if (!m.message) return;

            // Block echoed fromMe EXCEPT owner messaging their own bot number
            if (m.key.fromMe && m.key.remoteJid !== `${phoneNumber}@s.whatsapp.net`) return;

            const from = m.key.remoteJid;

            const text =
                m.message.conversation ||
                m.message.extendedTextMessage?.text ||
                m.message.imageMessage?.caption ||
                m.message.videoMessage?.caption ||
                m.message.buttonsResponseMessage?.selectedButtonId ||
                m.message.templateButtonReplyMessage?.selectedId ||
                '';

            const cleanText = text.trim();
            if (!cleanText) return;

            console.log(`[MSG] from=${from} text=${cleanText}`);

            // Hand off to case.js
            await require('./case')(conn, from, cleanText, phoneNumber);

        } catch (err) {
            console.error('❌ [BOT] Message error:', err);
        }
    });

    return conn;
}

// =============================================================================
//  RESTORE ALL SAVED SESSIONS ON STARTUP
// =============================================================================
async function restoreAllSessions() {
    console.log('🔍 [STARTUP] Scanning Redis for saved sessions...');
    try {
        const redis = await getRedis();
        const keys  = await redis.keys('session:*');

        if (keys.length === 0) {
            console.log('ℹ️ No saved sessions found. Awaiting new pairings.');
            return;
        }

        console.log(`🌀 Restoring ${keys.length} session(s) from Redis...`);
        for (const key of keys) {
            const phoneNumber = key.replace('session:', '');
            const hasCreds    = await redis.hExists(key, 'creds');
            if (!hasCreds) {
                console.log(`⚠️ Skipping ${phoneNumber} — no creds`);
                continue;
            }
            console.log(`🔄 Restoring: ${phoneNumber}`);
            await startBot(phoneNumber, null);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log('✅ Session restore complete.');
    } catch (err) {
        console.error('❌ RECOVERY ERROR:', err);
    }
}

module.exports = { startBot, restoreAllSessions, connections, getRedis };
