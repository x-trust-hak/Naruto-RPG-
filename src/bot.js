// src/bot.js
const {
    makeWASocket,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const mongoose = require('mongoose');
const { useMongoDBAuthState } = require('./dbAuthState');
const User = require('../models/User');
const { GRAPHICS, prepareImagePayload } = require('./mediaEngine');

const connections = new Map();
const activeExams = new Map();
const activeFights = new Map();

const BRAND = {
    dev: "Devtrust",
    ownerJid: "2347041560392@s.whatsapp.net",
    billingSupportNumber: "2347041560392",
    moniepointDetails: "🏦 Moniepoint MFB\n🔢 Acc No: 7074435901\n👤 Name: Praise Philip Jacob"
};

const VILLAGE_GROUPS = {
    'Leaf':  'https://chat.whatsapp.com/ExampleLeafGroupLink',
    'Sand':  'https://chat.whatsapp.com/ExampleSandGroupLink',
    'Mist':  'https://chat.whatsapp.com/ExampleMistGroupLink',
    'Cloud': 'https://chat.whatsapp.com/ExampleCloudGroupLink',
    'Stone': 'https://chat.whatsapp.com/ExampleStoneGroupLink'
};

const CLANS = [
    { name: 'Nara',     rarity: 'Common',    desc: '🧠 +10% Tactical Advantage' },
    { name: 'Akimichi', rarity: 'Common',    desc: '🍖 +20% Base Vitality HP' },
    { name: 'Hyuga',    rarity: 'Rare',      desc: '👁️ Byakugan: 15% Crit penetration' },
    { name: 'Aburame',  rarity: 'Rare',      desc: '🪲 Parasitic Chakra Drain' },
    { name: 'Uzumaki',  rarity: 'Epic',      desc: '🌀 Monstrous Vitality Pools' },
    { name: 'Uchiha',   rarity: 'Legendary', desc: '🔴 Sharingan Evasion Matrix' }
];

function rollClan() {
    const r = Math.random() * 100;
    if (r < 3.0)  return CLANS.find(c => c.name === 'Uchiha');
    if (r < 12)   return CLANS.find(c => c.name === 'Uzumaki');
    if (r < 35)   return CLANS[Math.random() > 0.5 ? 2 : 3];
    return CLANS[Math.random() > 0.5 ? 0 : 1];
}

// =============================================================================
//  MAIN BOT LAUNCHER  (mirrors the proven Lady Liya bot pattern)
// =============================================================================
async function startBot(phoneNumber, socket = null) {

    // ── Tear down any existing socket before making a new one ─────────────────
    // Prevents duplicate listener loops on Render restarts
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
        browser: Browsers.ubuntu('Chrome'),  // same browser as working bot
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
    });

    connections.set(phoneNumber, conn);
    console.log(`✅ Socket created for ${phoneNumber}`);

    // ── Pairing code: only for new/unregistered sessions ──────────────────────
    const isNewPairing = !conn.authState.creds.registered;

    if (isNewPairing && phoneNumber && socket) {
        // 3s delay lets Noise handshake complete before requesting code
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
        // No forced timeout kill - connection.update manages socket lifecycle
    }

    // ── Connection lifecycle ───────────────────────────────────────────────────
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`✅ [CONNECTED] ${phoneNumber} authenticated!`);
            await saveCreds();
            if (socket) socket.emit('connected');

            try {
                await conn.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
                    text: `🦊 *Naruto RPG connected!* ⚡ System online.\n\nType \`!start\` to begin your ninja journey!`
                });
            } catch (e) {
                console.error(`[BOT] Boot DM failed for ${phoneNumber}:`, e.message);
            }
        }

        else if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`🔌 [DISCONNECTED] ${phoneNumber} | Code: ${reason}`);
            connections.delete(phoneNumber);

            if (reason === DisconnectReason.loggedOut) {
                console.log(`🗑️ [PURGING] ${phoneNumber} logged out. Cleaning DB...`);
                try {
                    await clearSession();
                    await User.deleteOne({ phoneId: `${phoneNumber}@s.whatsapp.net` });
                } catch (e) { console.error('[BOT] Purge error:', e.message); }
                if (socket) socket.emit('logged-out');

            } else if (reason === DisconnectReason.badSession) {
                console.log(`⚠️ [BAD SESSION] Wiping corrupt session for ${phoneNumber}...`);
                await clearSession();
                setTimeout(() => startBot(phoneNumber, socket), 3000);

            } else {
                console.log(`🔄 [RECONNECTING] ${phoneNumber} in 5s...`);
                // Save creds before reconnecting so they survive the restart
                try { await saveCreds(); } catch {}
                setTimeout(() => startBot(phoneNumber, null), 5000);
            }
        }
    });

    // ── Creds: always save on update (no auth gate — same as working bot) ──────
    conn.ev.on('creds.update', saveCreds);

    // =========================================================================
    //  MESSAGES HANDLER
    // =========================================================================
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;

            const m = chatUpdate.messages[0];
            if (!m.message || m.key.fromMe) return;

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
            const lowerText = cleanText.toLowerCase();
            if (!cleanText) return;

            let user = await User.findOne({ phoneId: from });

            // ── Trivia answer ─────────────────────────────────────────────────
            if (activeExams.has(from)) {
                const examData = activeExams.get(from);
                activeExams.delete(from);

                if (cleanText.toLowerCase() === examData.correctAnswer) {
                    user.rank = examData.nextRank;
                    user.ryo += examData.rewardRyo;
                    user.chakra.max += 30;
                    user.hp.max += 100;
                    user.chakra.current = user.chakra.max;
                    user.hp.current = user.hp.max;
                    await user.save();
                    return await conn.sendMessage(from, {
                        text: `🎉 *PROMOTION EXAM PASSED!*\n\n🎖️ *New Rank:* ${user.rank}\n💰 *Bonus:* +${examData.rewardRyo} Ryo\n💪 +30 Max Chakra | +100 Max HP`
                    });
                } else {
                    return await conn.sendMessage(from, {
                        text: `❌ *EXAM FAILURE*\n\n📝 Correct answer: *${examData.correctAnswer.toUpperCase()}*\n\n_Train harder and try again!_`
                    });
                }
            }

            // ── PVP Arena ─────────────────────────────────────────────────────
            if (activeFights.has(from)) {
                const fight = activeFights.get(from);
                if (fight.turn === from) {
                    const isP1 = from === fight.p1.jid;
                    const attacker = isP1 ? fight.p1 : fight.p2;
                    const defender = isP1 ? fight.p2 : fight.p1;
                    const attackerDb = isP1 ? user : await User.findOne({ phoneId: defender.jid });
                    const defenderDb = isP1 ? await User.findOne({ phoneId: defender.jid }) : user;

                    let damageDealt = 0, chakraCost = 0, usedAction = '';

                    if (lowerText === '!strike') {
                        damageDealt = Math.floor(Math.random() * 16) + 15;
                        usedAction = 'launched a dagger strike';
                    } else if (lowerText === '!jutsu') {
                        chakraCost = 25;
                        if (attackerDb.chakra.current < chakraCost) {
                            return await conn.sendMessage(from, { text: '❌ *CHAKRA DEPLETED!* Use `!strike` instead.' });
                        }
                        damageDealt = Math.floor(Math.random() * 31) + 50;
                        usedAction = `unleashed *[${attackerDb.equippedJutsu[0] || 'Basic Jutsu'}]*`;
                    }

                    if (usedAction) {
                        let flavor = '';
                        if (attacker.clan === 'Hyuga' && Math.random() < 0.15) {
                            damageDealt = Math.floor(damageDealt * 1.5);
                            flavor += '🎯 *CRITICAL HIT!* Byakugan pierced vital chakra pathways!\n';
                        }
                        if (defender.clan === 'Uchiha' && Math.random() < 0.15) {
                            damageDealt = 0;
                            flavor += '🔴 *EVADE!* Sharingan anticipated the attack!\n';
                        }

                        attackerDb.chakra.current = Math.max(0, attackerDb.chakra.current - chakraCost);
                        defenderDb.hp.current = Math.max(0, defenderDb.hp.current - damageDealt);
                        await attackerDb.save(); await defenderDb.save();
                        fight.turn = defender.jid;

                        if (defenderDb.hp.current <= 0) {
                            activeFights.delete(fight.p1.jid);
                            activeFights.delete(fight.p2.jid);
                            attackerDb.ryo += 800; attackerDb.xp += 40;
                            defenderDb.hp.current = 1;
                            defenderDb.ryo = Math.max(0, defenderDb.ryo - 300);
                            await attackerDb.save(); await defenderDb.save();
                            return await conn.sendMessage(from, {
                                text: `🏆 *KO! DUEL FINISHED!*\n\n🥇 *WINNER:* ${attacker.name}\n💀 *LOSER:* ${defender.name}\n\n💰 Winner: +800 Ryo & +40 XP\n📉 Loser: -300 Ryo`
                            });
                        }

                        return await conn.sendMessage(from, {
                            text: `⚔️ *COMBAT REPORT*\n\n👤 ${attacker.name} ${usedAction}\n${flavor}📉 Damage: ${damageDealt}\n\n❤️ ${attacker.name}: ${attackerDb.hp.current} HP\n❤️ ${defender.name}: ${defenderDb.hp.current} HP\n\n👉 @${defender.jid.split('@')[0]}'s turn! (\`!strike\` or \`!jutsu\`)`,
                            mentions: [defender.jid]
                        });
                    }
                }
            }

            // ── Registration: awaiting name ───────────────────────────────────
            if (user && user.registrationStep === 'AWAITING_NAME') {
                if (cleanText.length < 3 || cleanText.length > 16 || cleanText.startsWith('!')) {
                    return await conn.sendMessage(from, { text: '❌ Invalid name! Use 3–16 characters, no commands.' });
                }
                const rolledClan = rollClan();
                const randomVillage = ['Leaf', 'Sand', 'Mist', 'Cloud', 'Stone'][Math.floor(Math.random() * 5)];

                user.username = cleanText;
                user.village = randomVillage;
                user.clan = rolledClan.name;
                user.bloodlineRarity = rolledClan.rarity;
                user.registrationStep = 'COMPLETED';
                await user.save();

                const groupInvite = VILLAGE_GROUPS[randomVillage] || 'Contact Admin for Group Entry';
                const welcomeCard =
                    `🍃 *WELCOME TO THE SHINOBI WORLD* 🍃\n\n` +
                    `✅ Registered as *Ninja ${user.username}*!\n\n` +
                    `🏡 *Village:* Hidden ${randomVillage} Village\n` +
                    `🩸 *Clan:* ${rolledClan.name} (${rolledClan.rarity})\n` +
                    `🧬 *Passive:* _${rolledClan.desc}_\n\n` +
                    `🎖 *Starting Rank:* Academy Student\n` +
                    `💰 Ryo: 1,000 | 💎 Gems: 5\n\n` +
                    `🏯 *Village Group:*\n👉 ${groupInvite}\n\n` +
                    `_Type \`!profile\` to view your card!_`;

                const villageImgKey = `VILLAGE_${randomVillage.toUpperCase()}`;
                return await conn.sendMessage(from,
                    prepareImagePayload(GRAPHICS[villageImgKey] || GRAPHICS.WELCOME_BANNER, welcomeCard)
                );
            }

            // ── !start ────────────────────────────────────────────────────────
            if (lowerText === '!start') {
                if (user) {
                    return await conn.sendMessage(from, { text: `❌ Already registered in Hidden ${user.village} Village!` });
                }
                user = new User({ phoneId: from, registrationStep: 'AWAITING_NAME' });
                await user.save();
                return await conn.sendMessage(from,
                    prepareImagePayload(GRAPHICS.WELCOME_BANNER,
                        "📜 *THE HOKAGE'S SCROLL* 📜\n\nWelcome traveler!\n\n👉 *What is your Shinobi Name?*\n_(Reply with your name, 3–16 chars)_"
                    )
                );
            }

            // ── Auth gate ─────────────────────────────────────────────────────
            if (!user || user.registrationStep !== 'COMPLETED') {
                const protectedCmds = ['!profile','!shop','!summon','!donate','!train','!missions','!exam','!fight','!pvp'];
                if (protectedCmds.some(cmd => lowerText.startsWith(cmd))) {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type `!start`.' });
                }
                return;
            }

            // ── !profile ──────────────────────────────────────────────────────
            if (lowerText === '!profile') {
                const card =
                    `📜 *SHINOBI PROFILE* 📜\n\n` +
                    `👤 *Name:* ${user.username}\n` +
                    `🎖 *Rank:* ${user.rank} (Lv.${user.level})\n` +
                    `🏡 *Village:* Hidden ${user.village}\n` +
                    `🩸 *Clan:* ${user.clan} (${user.bloodlineRarity})\n` +
                    `⚡ *Chakra:* ${user.chakra.current}/${user.chakra.max}\n` +
                    `❤️ *HP:* ${user.hp.current}/${user.hp.max}\n` +
                    `💰 *Ryo:* ${user.ryo.toLocaleString()}\n` +
                    `💎 *Gems:* ${user.gems}\n\n` +
                    `_Type \`!shop\` or \`!missions\` to continue!_`;

                const villageImgKey = `VILLAGE_${user.village.toUpperCase()}`;
                return await conn.sendMessage(from,
                    prepareImagePayload(GRAPHICS[villageImgKey] || GRAPHICS.WELCOME_BANNER, card)
                );
            }

            // ── !train ────────────────────────────────────────────────────────
            if (lowerText === '!train') {
                const CHAKRA_COST = 30, XP_GAIN = 15;
                if (user.chakra.current < CHAKRA_COST) {
                    return await conn.sendMessage(from, {
                        text: `❌ *CHAKRA DEPLETED*\n\n⚡ ${user.chakra.current}/${user.chakra.max} (need ${CHAKRA_COST})\n⏳ Regenerates +10/min`
                    });
                }
                user.chakra.current -= CHAKRA_COST;
                user.xp += XP_GAIN;

                let leveledUp = false;
                if (user.xp >= user.level * 100) {
                    user.xp -= user.level * 100; user.level += 1;
                    user.chakra.max += 15; user.hp.max += 50;
                    user.chakra.current = user.chakra.max; user.hp.current = user.hp.max;
                    leveledUp = true;
                }
                await user.save();

                let reply = `🏋️ *TRAINING*\n\n📉 -${CHAKRA_COST} Chakra (${user.chakra.current}/${user.chakra.max})\n📈 +${XP_GAIN} XP (${user.xp}/${user.level * 100})`;
                if (leveledUp) reply += `\n\n🎉 *LEVEL UP!* Now Level ${user.level}!`;
                return await conn.sendMessage(from, { text: reply });
            }

            // ── !missions ─────────────────────────────────────────────────────
            if (lowerText === '!missions') {
                return await conn.sendMessage(from, {
                    text: `📜 *MISSION BOARD*\n\n🟢 \`!mission d\` (20 Chakra | 150–300 Ryo)\n🔵 \`!mission c\` (40 Chakra | 500–900 Ryo)\n🔴 \`!mission b\` (60 Chakra | 1,200–2,500 Ryo)\n🔥 \`!mission s\` (90 Chakra | 4,000–7,500 Ryo + Gems)`
                });
            }

            // ── !mission [tier] ───────────────────────────────────────────────
            if (lowerText.startsWith('!mission ')) {
                const tier = lowerText.split(' ')[1];
                const configs = {
                    d: { name: 'D-Rank: Catch Tora the Cat', chakra: 20, minRyo: 150, maxRyo: 300, xp: 20, baseSuccess: 100, failDmg: 0 },
                    c: { name: 'C-Rank: Escort Merchant Fleet', chakra: 40, minRyo: 500, maxRyo: 900, xp: 50, baseSuccess: 75, failDmg: 80 },
                    b: { name: 'B-Rank: Neutralize Rogue Bandits', chakra: 60, minRyo: 1200, maxRyo: 2500, xp: 120, baseSuccess: 55, failDmg: 180 },
                    s: { name: 'S-Rank: Engage Akatsuki', chakra: 90, minRyo: 4000, maxRyo: 7500, xp: 350, baseSuccess: 30, failDmg: 350 }
                };
                const cfg = configs[tier];
                if (!cfg) return await conn.sendMessage(from, { text: '❌ Unknown tier. Use: d, c, b, or s.' });
                if (user.hp.current <= 1) return await conn.sendMessage(from, { text: `🏥 Too injured to go on missions! (${user.hp.current} HP)` });
                if (user.chakra.current < cfg.chakra) return await conn.sendMessage(from, { text: `❌ Need ${cfg.chakra} Chakra (have ${user.chakra.current})` });

                user.chakra.current -= cfg.chakra;
                const successChance = Math.min(95, cfg.baseSuccess + (user.level - 1) * 2);

                if (Math.random() * 100 > successChance) {
                    const dmg = Math.min(user.hp.current - 1, cfg.failDmg);
                    user.hp.current -= dmg;
                    await user.save();
                    return await conn.sendMessage(from, {
                        text: `🚨 *MISSION FAILED — AMBUSHED!*\n\n📉 -${cfg.chakra} Chakra\n💔 -${dmg} HP`
                    });
                }

                const ryo = Math.floor(Math.random() * (cfg.maxRyo - cfg.minRyo + 1)) + cfg.minRyo;
                const gems = (tier === 's' && Math.random() > 0.5) ? 1 : 0;
                user.ryo += ryo; user.xp += cfg.xp;
                if (gems) user.gems += gems;

                let leveledUp = false;
                if (user.xp >= user.level * 100) {
                    user.xp -= user.level * 100; user.level += 1;
                    user.chakra.max += 15; user.hp.max += 50;
                    user.chakra.current = user.chakra.max; user.hp.current = user.hp.max;
                    leveledUp = true;
                }
                await user.save();

                let reply = `✅ *MISSION SUCCESS!*\n\n🦅 ${cfg.name}\n💰 +${ryo.toLocaleString()} Ryo | +${cfg.xp} XP`;
                if (gems) reply += ` | +${gems} 💎`;
                if (leveledUp) reply += `\n\n🎉 *LEVEL UP!* Now Level ${user.level}!`;
                return await conn.sendMessage(from, { text: reply });
            }

            // ── !exam ─────────────────────────────────────────────────────────
            if (lowerText === '!exam') {
                const examMap = {
                    'Academy Student': { requiredLevel: 5,  nextRank: 'Genin',  rewardRyo: 1000 },
                    'Genin':           { requiredLevel: 15, nextRank: 'Chunin', rewardRyo: 3500 },
                    'Chunin':          { requiredLevel: 30, nextRank: 'Jonin',  rewardRyo: 8000 }
                };
                const examCfg = examMap[user.rank];
                if (!examCfg) return await conn.sendMessage(from, { text: '⚡ You have reached the highest rank!' });
                if (user.level < examCfg.requiredLevel) {
                    return await conn.sendMessage(from, {
                        text: `🔒 *EXAM LOCKED*\n\nNeed Level ${examCfg.requiredLevel} for ${examCfg.nextRank} Exam. (You are Level ${user.level})`
                    });
                }
                const triviaPool = [
                    { q: 'Who was the Fourth Hokage?\na) Tobirama\nb) Minato\nc) Hiruzen\nd) Tsunade', a: 'b' },
                    { q: 'Which clan has the Byakugan?\na) Uchiha\nb) Uzumaki\nc) Hyuga\nd) Kaguya',   a: 'c' }
                ];
                const t = triviaPool[Math.floor(Math.random() * triviaPool.length)];
                activeExams.set(from, { nextRank: examCfg.nextRank, correctAnswer: t.a, rewardRyo: examCfg.rewardRyo });
                return await conn.sendMessage(from, {
                    text: `🎖️ *${examCfg.nextRank.toUpperCase()} PROMOTION EXAM*\n\nReply with just the letter (a/b/c/d).\n\n❓ ${t.q}`
                });
            }

            // ── !shop ─────────────────────────────────────────────────────────
            if (lowerText === '!shop') {
                return await conn.sendMessage(from,
                    prepareImagePayload(GRAPHICS.SHOP_BANNER,
                        `🎒 *KONOHA SUPPLY STORE* 🎒\n\n💊 *[#1] Food Pill* — 💰 500 Ryo\n🧪 *[#2] Health Potion* — 💰 800 Ryo`
                    )
                );
            }

            // ── !donate ───────────────────────────────────────────────────────
            if (lowerText === '!donate') {
                return await conn.sendMessage(from, {
                    text: `💎 *DEVTRUST PREMIUM GEMS*\n\n${BRAND.moniepointDetails}\n\nSend proof to wa.me/${BRAND.billingSupportNumber}`
                });
            }

        } catch (err) {
            console.error('❌ MESSAGING ERROR:', err);
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
        const credDocs = await SessionModel.find({ key: 'creds' }, { sessionId: 1 });
        const sessionIds = [...new Set(credDocs.map(d => d.sessionId))];

        if (sessionIds.length === 0) {
            console.log('ℹ️ No saved sessions found. Awaiting new pairings.');
            return;
        }

        console.log(`🌀 Restoring ${sessionIds.length} session(s)...`);
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
