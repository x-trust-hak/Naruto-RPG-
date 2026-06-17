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
        // No creds = fresh pairing. Wipe ANY leftover signal keys from
        // previous failed attempts first — this is what prevents Bad MAC.
        const staleCount = await SessionModel.countDocuments({ sessionId });
        if (staleCount > 0) {
            await SessionModel.deleteMany({ sessionId });
            console.log(`[DB] Wiped ${staleCount} stale keys before fresh pairing: ${sessionId}`);
        }
        creds = initAuthCreds();
        // Save creds immediately so they survive the 515 reconnect.
        // Without this, the reconnect finds no creds, wipes signal keys, and
        // starts completely fresh — causing WhatsApp to reject the session.
        try {
            await writeData(creds, 'creds');
            console.log(`[DB] Saved fresh creds for: ${sessionId}`);
        } catch (err) {
            console.error('[DB] Failed to pre-save creds:', err.message);
        }
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
