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
const SessionModel = mongoose.model('AuthSession', AuthSessionSchema);

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

    // 1. Fetch or initialize the root structural baseline execution credentials block
    let creds = await readData('creds');
    if (!creds) {
        const { initAuthCreds } = require('@whiskeysockets/baileys');
        creds = initAuthCreds();
        await writeData(creds, 'creds');
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
