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
            console.error('[DB] Write error:', err.message);
        }
    };

    const readData = async (key) => {
        try {
            const doc = await SessionModel.findOne({ sessionId, key });
            if (!doc) return null;
            return JSON.parse(doc.value, BufferJSON.reviver);
        } catch (err) {
            console.error('[DB] Read error:', err.message);
            return null;
        }
    };

    const removeData = async (key) => {
        try {
            await SessionModel.deleteOne({ sessionId, key });
        } catch (err) {
            console.error('[DB] Delete error:', err.message);
        }
    };

    const clearSession = async () => {
        try {
            await SessionModel.deleteMany({ sessionId });
            console.log(`[DB] Cleared all keys for session: ${sessionId}`);
        } catch (err) {
            console.error('[DB] Clear session error:', err.message);
        }
    };

    // Load existing creds
    let creds = await readData('creds');

    if (!creds) {
        // No creds found. Check how many keys exist:
        // - 0 keys = brand new session, safe to init fresh
        // - >0 keys = leftover from a failed pairing attempt, wipe them first
        // IMPORTANT: only wipe if we are sure this is NOT a mid-reconnect.
        // We detect mid-reconnect by checking if signal keys exist (they would
        // have been written during the pairing handshake already).
        const staleCount = await SessionModel.countDocuments({ sessionId });
        if (staleCount > 0) {
            // Has signal keys but no creds = broken/incomplete pairing
            // Wipe everything so Bad MAC never happens
            await SessionModel.deleteMany({ sessionId });
            console.log(`[DB] Wiped ${staleCount} stale keys before fresh pairing: ${sessionId}`);
        }
        creds = initAuthCreds();
        // Pre-save creds immediately so reconnects find them and skip the wipe
        try {
            await writeData(creds, 'creds');
            console.log(`[DB] Pre-saved fresh creds for: ${sessionId}`);
        } catch (err) {
            console.error('[DB] Failed to pre-save creds:', err.message);
        }
    } else {
        console.log(`[DB] Loaded existing creds for: ${sessionId}`);
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
                set: async (data) => {
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
        clearSession
    };
}

module.exports = { useMongoDBAuthState, SessionModel };
