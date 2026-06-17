// src/dbAuthState.js
const mongoose = require('mongoose');
const { proto, BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

const AuthSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    key:       { type: String, required: true },
    value:     { type: String, required: true }
});
AuthSessionSchema.index({ sessionId: 1, key: 1 }, { unique: true });

const SessionModel =
    mongoose.models.AuthSession ||
    mongoose.model('AuthSession', AuthSessionSchema);

async function useMongoDBAuthState(sessionId) {

    const writeData = async (data, key) => {
        try {
            const stringified = JSON.stringify(data, BufferJSON.replacer);
            await SessionModel.findOneAndUpdate(
                { sessionId, key },
                { value: stringified },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('[DB] Error writing auth state:', err.message);
        }
    };

    const readData = async (key) => {
        try {
            const doc = await SessionModel.findOne({ sessionId, key });
            if (!doc) return null;
            return JSON.parse(doc.value, BufferJSON.reviver);
        } catch (err) {
            console.error('[DB] Error reading auth state:', err.message);
            return null;
        }
    };

    const removeData = async (key) => {
        try {
            await SessionModel.deleteOne({ sessionId, key });
        } catch (err) {
            console.error('[DB] Error deleting auth state:', err.message);
        }
    };

    // Load existing creds from DB, or init fresh ones
    let creds = await readData('creds');
    if (!creds) {
        // No creds saved yet — check if there are ANY keys for this session.
        // If there are signal keys but no creds, it means a previous pairing
        // attempt failed mid-way. Wipe those stale keys so they don't cause
        // "Bad MAC" errors. But if there are NO keys at all, it's a brand new
        // session — just init fresh creds without wiping anything.
        const existingKeyCount = await SessionModel.countDocuments({ sessionId });
        if (existingKeyCount > 0) {
            try {
                await SessionModel.deleteMany({ sessionId });
                console.log(`[DB] Wiped ${existingKeyCount} stale keys for: ${sessionId}`);
            } catch (err) {
                console.error('[DB] Error wiping stale keys:', err.message);
            }
        }
        creds = initAuthCreds();
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (value) {
                                if (type === 'app-state-sync-key') {
                                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                }
                                data[id] = value;
                            }
                        })
                    );
                    return data;
                },

                // FIX: Only allow key writes when the session is authenticated.
                // We expose a setter so bot.js can flip the gate after 'open'.
                set: async (data) => {
                    // This is called by Baileys internally with signal keys.
                    // We write them only if the session is already registered/open.
                    // The bot.js sets isAuthenticated = true before saveCreds() on 'open'.
                    // Signal keys during the pairing handshake MUST be persisted so
                    // WhatsApp can verify the device — but ONLY those keys, not stale ones.
                    // Solution: always write signal keys (they're needed for the handshake),
                    // but the creds themselves are only written via saveCreds() after 'open'.
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            if (value == null) {
                                await removeData(`${type}-${id}`);
                            } else {
                                await writeData(value, `${type}-${id}`);
                            }
                        }
                    }
                }
            }
        },

        saveCreds: async () => {
            await writeData(creds, 'creds');
        },

        // Exposed so bot.js can nuke a broken session before retrying
        clearSession: async () => {
            try {
                await SessionModel.deleteMany({ sessionId });
                console.log(`[DB] Cleared all keys for session: ${sessionId}`);
            } catch (err) {
                console.error('[DB] Error clearing session:', err.message);
            }
        }
    };
}

module.exports = { useMongoDBAuthState, SessionModel };
