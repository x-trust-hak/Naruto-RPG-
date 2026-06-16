// src/dbAuthState.js
const mongoose = require('mongoose');
const { proto } = require('@whiskeysockets/baileys');
const { BufferJSON } = require('@whiskeysockets/baileys');

// Flexible inline schema handling session state key-value mapping variables safely
const AuthSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: String, required: true }
});
AuthSessionSchema.index({ sessionId: 1, key: 1 }, { unique: true });

// Check if model already exists to prevent OverwriteModelError during hot-reloads
const SessionModel = mongoose.models.AuthSession || mongoose.model('AuthSession', AuthSessionSchema);

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
            console.error('Error writing auth state down:', err);
        }
    };

    const readData = async (key) => {
        try {
            const doc = await SessionModel.findOne({ sessionId, key });
            if (!doc) return null;
            return JSON.parse(doc.value, BufferJSON.reviver);
        } catch (err) {
            console.error('Error reading auth state key:', err);
            return null;
        }
    };

    const removeData = async (key) => {
        try {
            await SessionModel.deleteOne({ sessionId, key });
        } catch (err) {
            console.error('Error deleting data row:', err);
        }
    };

    // 1. Fetch existing credentials from DB
    let creds = await readData('creds');
    
    // 2. FIXED: If they don't exist, initialize them purely in memory.
    // DO NOT write them to MongoDB yet!
    if (!creds) {
        const { initAuthCreds } = require('@whiskeysockets/baileys');
        creds = initAuthCreds();
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (value) {
                            if (type === 'app-state-sync-key') {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            if (value === null) {
                                await removeData(`${type}-${id}`);
                            } else {
                                // This will be safely intercepted by the write guard in your updated bot.js
                                await writeData(value, `${type}-${id}`);
                            }
                        }
                    }
                }
            }
        },
        saveCreds: async () => {
            await writeData(creds, 'creds');
        }
    };
}

module.exports = { useMongoDBAuthState, SessionModel };

