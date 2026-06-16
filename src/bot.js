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
const EventEmitter = require('events');
const { useMongoDBAuthState } = require('./dbAuthState');
const User = require('../models/User');

const adminEvents = new EventEmitter();
const connections = new Map();

// Branding and System Assets Configurations Maps
const BRAND = {
    dev: "Devtrust",
    ownerJid: "2347041560392@s.whatsapp.net",
    whatsappChannel: "https://whatsapp.com/channel/0029Vb7sRGNLikgHE7DxEu1d",
    telegramGroup: "https://t.me/TrustBitOfficial",
    telegramDev: "https://t.me/KallmeTrust",
    billingSupportNumber: "2347041560392",
    moniepointDetails: "🏦 Moniepoint MFB\n🔢 Acc No: 7074435901\n👤 Name: Praise Philip Jacob"
};

const CLANS = [
    { name: 'Nara', rarity: 'Common', hp: 1.0, chakra: 1.0, desc: '🧠 +10% Tactical Advantage' },
    { name: 'Akimichi', rarity: 'Common', hp: 1.2, chakra: 0.9, desc: '🍖 +20% Base Vitality HP' },
    { name: 'Hyuga', rarity: 'Rare', hp: 1.0, chakra: 1.2, desc: '👁️ Byakugan: 15% Crit penetration' },
    { name: 'Aburame', rarity: 'Rare', hp: 1.1, chakra: 1.1, desc: '🪲 Parasitic Chakra Drain' },
    { name: 'Uzumaki', rarity: 'Epic', hp: 1.3, chakra: 1.4, desc: '🌀 Monstrous Vitality Pools' },
    { name: 'Uchiha', rarity: 'Legendary', hp: 1.1, chakra: 1.3, desc: '🔴 Sharingan Evasion Matrix' }
];

const SHOP_ITEMS = {
    "1": { name: "Food Pill", cost: 500, type: "chakra", value: 50, icon: "💊", desc: "Restores +50 Chakra." },
    "2": { name: "Health Potion", cost: 800, type: "hp", value: 200, icon: "🧪", desc: "Heals +200 HP." }
};

const SUMMONS = {
    "Common": ["Konohamaru", "Kiba", "Tenten"],
    "Rare": ["Kakashi", "Asuma", "Gaara"],
    "Legendary": ["Itachi", "Jiraiya", "Sage Mode Naruto"],
    "Mythic": ["Kaguya", "Madara (Six Paths)", "Baryon Mode Naruto"]
};

function rollClan() {
    const r = Math.random() * 100;
    if (r < 2.5) return CLANS.find(c => c.name === 'Uchiha');
    if (r < 10) return CLANS.find(c => c.name === 'Uzumaki');
    if (r < 35) return CLANS.find(c => Math.random() > 0.5 ? c.name === 'Hyuga' : c.name === 'Aburame');
    return CLANS.find(c => Math.random() > 0.5 ? c.name === 'Nara' : c.name === 'Akimichi');
}

function rollGacha() {
    const roll = Math.random() * 100;
    let tier = "Common";
    if (roll < 1) tier = "Mythic";
    else if (roll < 10) tier = "Legendary";
    else if (roll < 30) tier = "Rare";
    const list = SUMMONS[tier];
    return { name: list[Math.floor(Math.random() * list.length)], tier };
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
        } else if (connection === 'open') {
            if (socket) socket.emit('connected');
            // Send connection greetings directly to the newly synchronized player
            await conn.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
                text: `✨ *NARUTO RPG ENGINE ACTIVATE* ✨\n\nSuccessfully linked your line as an authorized processing node!\n\n👑 *Game Engine Creator:* ${BRAND.dev}\n\n🤖 Type \`!start\` in any chat window to launch your journey!`
            });
        }
    });

    // CORE NATIVE COMMAND ROUTER
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message || m.key.fromMe) return;

            const from = m.key.remoteJid;
            const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
            const cleanText = text.trim().toLowerCase();

            let user = await User.findOne({ phoneId: from });

            // COMMAND: !start
            if (cleanText === '!start') {
                if (user) {
                    return await conn.sendMessage(from, { text: `❌ You already possess a verified character index trace in the Hidden ${user.village} Village!` });
                }

                const rolled = rollClan();
                const rollVillage = ['Leaf', 'Sand', 'Mist', 'Cloud', 'Stone'][Math.floor(Math.random() * 5)];
                const userProfileName = m.pushName || "Genin Traveler";

                user = new User({
                    phoneId: from,
                    username: userProfileName,
                    village: rollVillage,
                    clan: rolled.name,
                    bloodlineRarity: rolled.rarity
                });
                await user.save();

                const welcomeCard = `📜 *SHINOBI REGISTRATION COMPLETION* 📜\n\n` +
                    `Welcome to the Ninja World, *${userProfileName}*! Your path begins now.\n\n` +
                    `🏡 *Village:* Hidden ${rollVillage} Village\n` +
                    `🩸 *Clan Lineage:* ${rolled.name} Clan (${rolled.rarity})\n` +
                    `🧬 *Passive:* _${rolled.desc}_\n\n` +
                    `🎖️ *Rank:* Academy Student\n` +
                    `💰 *Ryo:* 1,000 | 💎 *Gems:* 5\n\n` +
                    `_Type \`!profile\` to view your Registration Card!_`;

                return await conn.sendMessage(from, { text: welcomeCard });
            }

            // Guard check for all remaining gameplay loop scripts
            if (!user && ['!profile', '!shop', '!summon', '!donate'].some(cmd => cleanText.startsWith(cmd))) {
                return await conn.sendMessage(from, { text: "❌ System registry trace missing. Please execute the initialization call via \`!start\` first." });
            }

            // COMMAND: !profile
            if (cleanText === '!profile') {
                const profileCard = `📜 *SHINOBI REGISTRATION CARD* 📜\n\n` +
                    `👤 *Ninja:* @${from.split('@')[0]}\n` +
                    `🎖️ *Rank:* ${user.rank} (Lv.${user.level})\n` +
                    `🏡 *Village:* Hidden ${user.village}\n` +
                    `🩸 *Clan:* ${user.clan} (${user.bloodlineRarity})\n` +
                    `⚡ *Chakra:* ${user.chakra.current} / ${user.chakra.max}\n` +
                    `❤️ *HP:* ${user.hp.current} / ${user.hp.max}\n` +
                    `💰 *Ryo:* ${user.ryo.toLocaleString()}\n` +
                    `💎 *Gems:* ${user.gems}\n\n` +
                    `🔥 *Equipped Jutsu:* ${user.equippedJutsu.join(', ')}\n\n` +
                    `_Type \`!shop\` to purchase items, or \`!summon\` to roll gems!_`;

                return await conn.sendMessage(from, { text: profileCard, mentions: [from] });
            }

            // COMMAND: !shop
            if (cleanText === '!shop') {
                let list = `🎒 *KONOHA SHINOBI SUPPLY STORE* 🎒\n\n💰 Balance: ${user.ryo} Ryo\n\n`;
                for (const [id, item] of Object.entries(SHOP_ITEMS)) {
                    list += `${item.icon} *[#${id}] ${item.name}* — 💰 ${item.cost} Ryo\n└ _${item.desc}_\n\n`;
                }
                list += `*To Purchase:* Reply with \`!buy [item_id]\`\n\n_Engine Framework Built by ${BRAND.dev}_`;
                return await conn.sendMessage(from, { text: list });
            }

            // COMMAND: !buy
            if (cleanText.startsWith('!buy ')) {
                const id = cleanText.split(' ')[1];
                const item = SHOP_ITEMS[id];
                if (!item) return await conn.sendMessage(from, { text: "❌ Selection not recognized inside store catalogs." });

                if (user.ryo < item.cost) {
                    return await conn.sendMessage(from, { text: `❌ Balance insufficient. You require ${(item.cost - user.ryo)} more Ryo.` });
                }

                user.ryo -= item.cost;
                user.inventory.push(item.name);
                await user.save();

                return await conn.sendMessage(from, { text: `🛒 *TRANSACTION COMPLETE*\n\nSuccessfully purchased **1x ${item.name}** ${item.icon}!\n💰 Wallet Balance: ${user.ryo} Ryo.` });
            }

            // COMMAND: !summon
            if (cleanText === '!summon') {
                if (user.gems < 5) {
                    return await conn.sendMessage(from, { text: `❌ You lack premium Ninja Gems! You need 5, but have ${user.gems}.\nType \`!donate\` to buy more gems.` });
                }

                user.gems -= 5;
                const result = rollGacha();
                user.inventory.push(result.name);
                await user.save();

                const borders = { "Common": "⬜", "Rare": "🟦", "Legendary": "🟥", "Mythic": "🔥" };
                const flash = borders[result.tier] || "⬜";

                const gachaCard = `🌀 *SUMMONING JUTSU ALTAR* 🌀\n` +
                    `----------------------------------------\n\n` +
                    `${flash} *You Summoned:* ${result.name}\n` +
                    `✨ *Rarity Tier:* ${result.tier}\n\n` +
                    `----------------------------------------\n` +
                    `🎒 Asset added to your inventory. Remaining Gems: ${user.gems}\n\n` +
                    `_System Engine deployed by ${BRAND.dev}_`;

                return await conn.sendMessage(from, { text: gachaCard });
            }

            // COMMAND: !donate
            if (cleanText === '!donate') {
                const donateMsg = `💎 *DEVTRUST PREMIUM GEM TREASURY* 💎\n\n` +
                    `To purchase premium Ninja Gems or special game packs, send your payment directly to the developer's account below:\n\n` +
                    `${BRAND.moniepointDetails}\n\n` +
                    `----------------------------------------\n` +
                    `💵 *Rates:* ₦1,500 = 50 Gems | ₦3,000 = 120 Gems\n` +
                    `----------------------------------------\n\n` +
                    `⚠️ *IMPORTANT:* After sending payment, message your screenshot confirmation directly to the developer at wa.me/${BRAND.billingSupportNumber}.\n\n` +
                    `✨ Thank you for supporting our game!`;
                return await conn.sendMessage(from, { text: donateMsg });
            }

        } catch (err) { console.error(err); }
    });

    return conn;
}

module.exports = { startBot, connections, adminEvents };
     
