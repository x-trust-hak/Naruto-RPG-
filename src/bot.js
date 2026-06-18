// src/bot.js
const {
    makeWASocket,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const { useMongoDBAuthState } = require('./dbAuthState');
const User = require('../models/User');

const connections = new Map();

// =============================================================================
//  MAIN BOT LAUNCHER
// =============================================================================
async function startBot(phoneNumber, socket = null) {

    // ── Tear down existing socket before creating a new one ───────────────────
    const existingConn = connections.get(phoneNumber);
    if (existingConn) {
        console.log(`♻️ Closing existing socket for ${phoneNumber}`);
        try { existingConn.ev.removeAllListeners(); } catch {}
        try { existingConn.end(); } catch {}
        connections.delete(phoneNumber);
    }

    const { state, saveCreds, clearSession } = await useMongoDBAuthState(phoneNumber);
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
    console.log(`✅ Socket created for ${phoneNumber} | registered=${conn.authState.creds.registered}`);

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
                console.log(`🗑️ [PURGING] ${phoneNumber} logged out. Clearing session...`);
                try {
                    await clearSession();
                    await User.deleteOne({ phoneId: `${phoneNumber}@s.whatsapp.net` });
                } catch (e) { console.error('[BOT] Purge error:', e.message); }
                if (socket) socket.emit('logged-out');

            } else if (reason === DisconnectReason.badSession) {
                console.log(`⚠️ [BAD SESSION] Clearing session for ${phoneNumber}...`);
                await clearSession();
                setTimeout(() => startBot(phoneNumber, socket), 3000);

            } else {
                console.log(`🔄 [RECONNECTING] ${phoneNumber} in 10s...`);
                try { await saveCreds(); } catch {}
                setTimeout(() => startBot(phoneNumber, null), 10000);
            }
        }
    });

    // ── Creds: always save on update ──────────────────────────────────────────
    conn.ev.on('creds.update', saveCreds);

    // ── Messages: pass to case.js ─────────────────────────────────────────────
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;

            const m = chatUpdate.messages[0];
            if (!m.message) return;

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

            console.log(`[MSG] from=${from} fromMe=${m.key.fromMe} botNumber=${phoneNumber} text=${cleanText}`);

            // Normalize LID format (@lid) to standard JID (@s.whatsapp.net)
            // WhatsApp sometimes sends messages with LID instead of phone JID
            const normalizedFrom = from.endsWith('@lid')
                ? `${phoneNumber}@s.whatsapp.net`
                : from;

            // Block echoed fromMe EXCEPT owner messaging their own bot number
            if (m.key.fromMe && normalizedFrom !== `${phoneNumber}@s.whatsapp.net`) return;

            if (!cleanText) return;

            await require('./case')(conn, normalizedFrom, cleanText, phoneNumber);

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
    console.log('🔍 [STARTUP] Scanning MongoDB for saved sessions...');
    try {
        const { SessionModel } = require('./dbAuthState');
        const credDocs   = await SessionModel.find({ key: 'creds' }, { sessionId: 1 });
        const sessionIds = [...new Set(credDocs.map(d => d.sessionId))];

        if (sessionIds.length === 0) {
            console.log('ℹ️ No saved sessions found. Awaiting new pairings.');
            return;
        }

        console.log(`🌀 Restoring ${sessionIds.length} session(s) from MongoDB...`);
        for (const phoneId of sessionIds) {
            console.log(`🔄 Restoring: ${phoneId}`);
            await startBot(phoneId, null);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log('✅ Session restore complete.');
    } catch (err) {
        console.error('❌ RECOVERY ERROR:', err);
    }
}

module.exports = { startBot, restoreAllSessions, connections };
