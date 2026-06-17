// src/redisAuthState.js
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

/**
 * Redis-backed auth state for Baileys (ported from Lady Liya bot)
 * Sessions go to Redis, game data stays in MongoDB
 */
async function useRedisAuthState(redis, phoneNumber) {
    const KEY = `session:${phoneNumber}`;

    async function readData(field) {
        try {
            const val = await redis.hGet(KEY, field);
            if (!val) return null;
            return JSON.parse(val, BufferJSON.reviver);
        } catch {
            return null;
        }
    }

    async function writeData(field, data) {
        await redis.hSet(KEY, field, JSON.stringify(data, BufferJSON.replacer));
    }

    async function removeData(field) {
        await redis.hDel(KEY, field);
    }

    // Load existing creds or start fresh — Redis handles overwrites cleanly
    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let val = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && val) {
                            const { proto } = require('@whiskeysockets/baileys');
                            val = proto.Message.AppStateSyncKeyData.fromObject(val);
                        }
                        data[id] = val;
                    }
                    return data;
                },

                set: async (data) => {
                    for (const [type, ids] of Object.entries(data)) {
                        for (const [id, val] of Object.entries(ids)) {
                            if (val) {
                                await writeData(`${type}-${id}`, val);
                            } else {
                                await removeData(`${type}-${id}`);
                            }
                        }
                    }
                }
            }
        },

        saveCreds: async () => {
            await writeData('creds', creds);
        },

        // Wipe entire session from Redis (used on loggedOut / badSession)
        clearSession: async () => {
            await redis.del(KEY);
            console.log(`[Redis] Cleared session: ${phoneNumber}`);
        }
    };
}

module.exports = { useRedisAuthState };
