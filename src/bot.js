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

const connections = new Map();

const BRAND = {
    dev: "Devtrust",
    ownerJid: "2347041560392@s.whatsapp.net",
    billingSupportNumber: "2347041560392",
    moniepointDetails: "🏦 Moniepoint MFB\n🔢 Acc No: 7074435901\n👤 Name: Praise Philip Jacob"
};

// ⚠️ PASTE YOUR ACTUAL WHATSAPP VILLAGE GROUP LINKS OR JIDs HERE
const VILLAGE_GROUPS = {
    'Leaf': 'https://chat.whatsapp.com/ExampleLeafGroupLink',
    'Sand': 'https://chat.whatsapp.com/ExampleSandGroupLink',
    'Mist': 'https://chat.whatsapp.com/ExampleMistGroupLink',
    'Cloud': 'https://chat.whatsapp.com/ExampleCloudGroupLink',
    'Stone': 'https://chat.whatsapp.com/ExampleStoneGroupLink'
};

const CLANS = [
    { name: 'Nara', rarity: 'Common', desc: '🧠 +10% Tactical Advantage' },
    { name: 'Akimichi', rarity: 'Common', desc: '🍖 +20% Base Vitality HP' },
    { name: 'Hyuga', rarity: 'Rare', desc: '👁️ Byakugan: 15% Crit penetration' },
    { name: 'Aburame', rarity: 'Rare', desc: '🪲 Parasitic Chakra Drain' },
    { name: 'Uzumaki', rarity: 'Epic', desc: '🌀 Monstrous Vitality Pools' },
    { name: 'Uchiha', rarity: 'Legendary', desc: '🔴 Sharingan Evasion Matrix' }
];

function rollClan() {
    const r = Math.random() * 100;
    if (r < 3.0) return CLANS.find(c => c.name === 'Uchiha');
    if (r < 12) return CLANS.find(c => c.name === 'Uzumaki');
    if (r < 35) return CLANS.find(c => Math.random() > 0.5 ? c.name === 'Hyuga' : c.name === 'Aburame');
    return CLANS.find(c => Math.random() > 0.5 ? c.name === 'Nara' : c.name === 'Akimichi');
}

async function startBot(phoneNumber, socket) {
    const { state, saveCreds } = await useMongoDBAuthState(phoneNumber);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000
    });

    connections.set(phoneNumber, conn);

    if (!conn.authState.creds.registered && phoneNumber && socket) {
        setTimeout(async () => {
            try {
                let code = await conn.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                socket.emit('pairing-code', code);
            } catch (err) { console.error(err); }
        }, 2500);
    }

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(() => startBot(phoneNumber, socket), 5000);
            } else {
                if(socket) socket.emit('logged-out');
            }
        } else if (connection === 'open' && socket) {
            socket.emit('connected');
        }
    });

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message || m.key.fromMe) return;

            const from = m.key.remoteJid;
            const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
            const cleanText = text.trim();
            const lowerText = cleanText.toLowerCase();

            let user = await User.findOne({ phoneId: from });

            // INTERACTIVE ONBOARDING STEP 2: Name Input Capture
            if (user && user.registrationStep === 'AWAITING_NAME') {
                if (cleanText.length < 3 || cleanText.length > 16 || cleanText.startsWith('!')) {
                    return await conn.sendMessage(from, { text: "❌ Invalid Shinobi Name! Please type a clean name between 3 and 16 characters long." });
                }

                const rolledClan = rollClan();
                const randomVillage = ['Leaf', 'Sand', 'Mist', 'Cloud', 'Stone'][Math.floor(Math.random() * 5)];
                
                user.username = cleanText;
                user.village = randomVillage;
                user.clan = rolledClan.name;
                user.bloodlineRarity = rolledClan.rarity;
                user.registrationStep = 'COMPLETED';
                await user.save();

                const groupInvite = VILLAGE_GROUPS[randomVillage] || "Contact Admin for Group Entry";

                const welcomeCard = `🍃 *WELCOME TO THE SHINOBI WORLD* 🍃\n\n` +
                    `Your official registry scroll has been stamped, *Ninja ${user.username}*!\n\n` +
                    `🏡 *Spawned Village:* Hidden ${randomVillage} Village\n` +
                    `🩸 *Clan Lineage:* ${rolledClan.name} Clan (${rolledClan.rarity})\n` +
                    `🧬 *Passive:* _${rolledClan.desc}_\n\n` +
                    `🎖️ *Starting Rank:* Academy Student\n` +
                    `💰 *Ryo:* 1,000 | 💎 *Gems:* 5\n\n` +
                    `🏯 *VILLAGE CITIZENS FACTION GROUP:*\n` +
                    `The Great Shinobi War has begun. Join your allies immediately in your village council room:\n👉 ${groupInvite}\n\n` +
                    `_Type \`!profile\` to view your tracking card!_`;

                // Automated attempt to natively add user to group if JID is provided instead of link
                if (groupInvite.endsWith('@g.us')) {
                    try {
                        await conn.groupParticipantsUpdate(groupInvite, [from], "add");
                    } catch (e) {
                        // Fallback message if bot lacks admin privileges
                        await conn.sendMessage(from, { text: `⚠️ I tried adding you directly to the official Hidden ${randomVillage} Group, but I need group administrator permissions to complete that action automatically!` });
                    }
                }

                return await conn.sendMessage(from, { text: welcomeCard });
            }

            // COMMAND: !start
            if (lowerText === '!start') {
                if (user) {
                    return await conn.sendMessage(from, { text: `❌ Your path is already set as a citizen of the Hidden ${user.village} Village!` });
                }

                // Initialize empty staging record to ask questions
                user = new User({
                    phoneId: from,
                    registrationStep: 'AWAITING_NAME'
                });
                await user.save();

                return await conn.sendMessage(from, { text: "📜 *THE HOKAGE'S SCROLL REGISTER* 📜\n\nWelcome traveler! Before you are assigned a clan and spawned into one of the Great Five Shinobi Nations, tell us:\n\n👉 *What is your custom Shinobi Name?* (Reply to this message with your name)" });
            }

            // Command Guard
            if (!user || user.registrationStep !== 'COMPLETED') {
                if (['!profile', '!shop', '!summon', '!donate'].some(cmd => lowerText.startsWith(cmd))) {
                    return await conn.sendMessage(from, { text: "❌ Access Denied. Initialize your character registration first by typing \`!start\`." });
                }
                return;
            }

            // COMMAND: !profile
            if (lowerText === '!profile') {
                const profileCard = `📜 *SHINOBI PROFILE ACCESS* 📜\n\n` +
                    `👤 *Ninja Name:* ${user.username}\n` +
                    `🎖️ *Rank:* ${user.rank} (Lv.${user.level})\n` +
                    `🏡 *Village Faction:* Hidden ${user.village}\n` +
                    `🩸 *Clan Bloodline:* ${user.clan} (${user.bloodlineRarity})\n` +
                    `⚡ *Chakra Pool:* ${user.chakra.current} / ${user.chakra.max}\n` +
                    `❤️ *Health Vitality:* ${user.hp.current} / ${user.hp.max}\n` +
                    `💰 *Ryo:* ${user.ryo.toLocaleString()}\n` +
                    `💎 *Gems:* ${user.gems}\n\n` +
                    `🏆 *Goal:* Race to defeat rivals & claim Hokage supremacy!\n\n` +
                    `_Type \`!shop\` to buy equipment, or \`!summon\` to roll gems!_`;

                return await conn.sendMessage(from, { text: profileCard });
            }

            // Rest of your features below (Shop, Buy, Summon, Donate...)
            if (lowerText === '!shop') {
                return await conn.sendMessage(from, { text: `🎒 *KONOHA SHINOBI SUPPLY STORE*\n\nType \`!buy 1\` for Food Pill (💰500 Ryo)\nType \`!buy 2\` for Health Potion (💰800 Ryo)` });
            }

            if (lowerText === '!donate') {
                return await conn.sendMessage(from, { text: `💎 *DEVTRUST PREMIUM GEM TREASURY*\n\n${BRAND.moniepointDetails}\n\nSend proof to wa.me/${BRAND.billingSupportNumber}` });
            }

        } catch (err) { console.error(err); }
    });

    return conn;
}

module.exports = { startBot, connections };
