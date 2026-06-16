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

// Global In-Memory Tracking Engines
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

    // Critical Memory Gate: Ensures unauthenticated keys are blocked from MongoDB
    let isSessionAuthenticated = false;

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

    // 1. CONDITIONAL DB WRITE GUARD
    conn.ev.on('creds.update', async () => {
        if (isSessionAuthenticated || conn.authState.creds.registered) {
            await saveCreds(); 
        }
    });

    // 2. LIFECYCLE HANDLER & DYNAMIC CLEANUP ENGINE
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log(`✅ Session ${phoneNumber} authenticated! Flushing session tokens to database collections.`);
            isSessionAuthenticated = true;
            await saveCreds(); // Commit validated state tokens down to MongoDB cluster
            if (socket) socket.emit('connected');
        } 
        
        else if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            
            // Hard Disconnect / Explicit device unpairing via mobile interface
            if (reason === DisconnectReason.loggedOut) {
                console.log(`🚨 Session ${phoneNumber} unlinked! Executing automatic structural purge from clusters...`);
                
                try {
                    // Instantly target and delete the authentication documents
                    if (mongoose.connection.models['AuthSession']) {
                        await mongoose.connection.models['AuthSession'].deleteMany({ sessionId: phoneNumber });
                    }
                    // Delete player character stats file if an absolute hard reset is desired on logout
                    await User.deleteOne({ phoneId: `${phoneNumber}@s.whatsapp.net` });
                    console.log(`🗑️ Database cleaned. Purged all data arrays corresponding to ID: ${phoneNumber}`);
                } catch (dbErr) {
                    console.error(`Error during session cluster destruction loop:`, dbErr);
                }

                connections.delete(phoneNumber);
                if (socket) socket.emit('logged-out');
            } 
            // Standard Connection Fluctuation
            else {
                setTimeout(() => startBot(phoneNumber, socket), 5000);
            }
        }
    });

    // 3. CORE MESSAGING CONTROLLER & IN GAME COMMAND MATRIX
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            // Ensure we are dealing with actual new notifications
            if (chatUpdate.type !== 'notify') return;
            
            const m = chatUpdate.messages[0];
            if (!m.message || m.key.fromMe) return;

            const from = m.key.remoteJid;
            
            // 🔥 BULLETPROOF TEXT EXTRACTION MATRIX
            const text = m.message.conversation || 
                         m.message.extendedTextMessage?.text || 
                         m.message.imageMessage?.caption || 
                         m.message.videoMessage?.caption || 
                         m.message.buttonsResponseMessage?.selectedButtonId || 
                         m.message.templateButtonReplyMessage?.selectedId || 
                         "";

            const cleanText = text.trim();
            const lowerText = cleanText.toLowerCase();

            // 🛠️ EMERGENCY DIAGNOSTIC LOGS
            console.log(`📥 [INBOUND] From: ${from} | Extracted Text: "${cleanText}"`);

            // If empty text managed to slip past, stop immediately
            if (!cleanText) return;

            let user = await User.findOne({ phoneId: from });

            // PHASE 4 INJECTOR: TRIVIA ANSWER EVALUATION RADAR
            if (activeExams.has(from)) {
                const examData = activeExams.get(from);
                const playerAnswer = cleanText.toLowerCase();

                activeExams.delete(from); // Pop execution state immediately

                if (playerAnswer === examData.correctAnswer) {
                    user.rank = examData.nextRank;
                    user.ryo += examData.rewardRyo;
                    user.chakra.max += 30;
                    user.hp.max += 100;
                    user.chakra.current = user.chakra.max;
                    user.hp.current = user.hp.max;
                    await user.save();

                    const passMsg = `🎉 *PROMOTION EXAM PASSED!* 🎉\n\n` +
                        `✨ *Examiner:* Excellent answer, Ninja! Your knowledge matches your raw strength.\n\n` +
                        `🎖️ *New Official Rank:* **${user.rank}**\n` +
                        `💰 *Promotion Bonus:* +💰 ${examData.rewardRyo} Ryo\n` +
                        `💪 *Permanent Stats Boost:* +30 Max Chakra | +100 Max HP (Fully Restored!)`;
                    return await conn.sendMessage(from, { text: passMsg });
                } else {
                    const failMsg = `❌ *EXAM FAILURE* ❌\n\n` +
                        `💥 *Examiner:* Incorrect! A shinobi must keep their mind as sharp as a kunai.\n\n` +
                        `📝 *Correct Answer was:* **${examData.correctAnswer.toUpperCase()}**\n\n` +
                        `💪 _Train harder up your core stats, and try again when you are ready!_`;
                    return await conn.sendMessage(from, { text: failMsg });
                }
            }

            // PHASE 5 INJECTOR: PVP ARENA ACTIONS CAPTURE LOOP
            if (activeFights.has(from)) {
                const fight = activeFights.get(from);

                if (fight.turn === from) {
                    const isP1Current = (from === fight.p1.jid);
                    const attacker = isP1Current ? fight.p1 : fight.p2;
                    const defender = isP1Current ? fight.p2 : fight.p1;

                    const attackerDb = isP1Current ? user : await User.findOne({ phoneId: defender.jid });
                    const defenderDb = isP1Current ? await User.findOne({ phoneId: defender.jid }) : user;

                    let damageDealt = 0;
                    let chakraCost = 0;
                    let usedAction = "";

                    if (lowerText === '!strike') {
                        damageDealt = Math.floor(Math.random() * (30 - 15 + 1)) + 15;
                        usedAction = "jpeg dagger strike launched";
                    } else if (lowerText === '!jutsu') {
                        chakraCost = 25;
                        if (attackerDb.chakra.current < chakraCost) {
                            return await conn.sendMessage(from, { text: `❌ *CHAKRA DEPLETED!* Insufficient energy to manipulate hand signs. Call upon basic \`!strike\`!` });
                        }
                        damageDealt = Math.floor(Math.random() * (80 - 50 + 1)) + 50;
                        usedAction = `unleashed their signature *[${attackerDb.equippedJutsu[0] || "Basic Jutsu"}]*`;
                    }

                    if (usedAction !== "") {
                        let battleFlavorText = "";
                        
                        // Passive Trigger Check: Hyuga Critical Strike
                        if (attacker.clan === 'Hyuga' && Math.random() < 0.15) {
                            damageDealt = Math.floor(damageDealt * 1.5);
                            battleFlavorText += `🎯 *CRITICAL HIT!* Byakugan vision pierced vital chakra pathways!\n`;
                        }

                        // Passive Trigger Check: Uchiha Evasion Matrix
                        if (defender.clan === 'Uchiha' && Math.random() < 0.15) {
                            damageDealt = 0;
                            battleFlavorText += `🔴 *EVADE!* The opponent's Sharingan completely anticipated and dodged the attack!\n`;
                        }

                        attackerDb.chakra.current = Math.max(0, attackerDb.chakra.current - chakraCost);
                        defenderDb.hp.current = Math.max(0, defenderDb.hp.current - damageDealt);

                        await attackerDb.save();
                        await defenderDb.save();

                        fight.turn = defender.jid; // Cycle turn index pointers

                        let turnReport = `⚔️ *COMBAT ARENA INJURY REPORT* ⚔️\n` +
                            `----------------------------------------\n` +
                            `👤 *Attacker:* *${attacker.name}*\n` +
                            `💥 *Action:* ${usedAction}\n\n` +
                            `${battleFlavorText}` +
                            `📉 *Damage Recorded:* ${damageDealt} DMG\n` +
                            `----------------------------------------\n\n` +
                            `📋 *HEALTH PROFILE TRACK:* \n` +
                            `❤️ *${attacker.name}:* ${attackerDb.hp.current}/${attacker.maxHp} HP (⚡ ${attackerDb.chakra.current} Chakra)\n` +
                            `❤️ *${defender.name}:* ${defenderDb.hp.current}/${defender.maxHp} HP\n\n`;

                        if (defenderDb.hp.current <= 0) {
                            activeFights.delete(fight.p1.jid);
                            activeFights.delete(fight.p2.jid);

                            const bountyReward = 800;
                            attackerDb.ryo += bountyReward;
                            attackerDb.xp += 40;
                            
                            defenderDb.hp.current = 1; 
                            defenderDb.ryo = Math.max(0, defenderDb.ryo - 300);

                            await attackerDb.save();
                            await defenderDb.save();

                            let matchOverCard = `🏆 *KO! DUEL FINISHED!* 🏆\n` +
                                `----------------------------------------\n` +
                                `🥇 *WINNER:* **${attacker.name}**\n` +
                                `💀 *LOSER:* **${defender.name}**\n` +
                                `----------------------------------------\n\n` +
                                `💰 *Winner Loot:* +💰 800 Ryo & +40 XP\n` +
                                `📉 *Loser Penalty:* -💰 300 Ryo (Dropped on the battlefield floor)`;

                            return await conn.sendMessage(from, { text: matchOverCard });
                        }

                        turnReport += `👉 Next turn belongs to: @${defender.jid.split('@')[0]}! Respond with \`!strike\` or \`!jutsu\``;
                        return await conn.sendMessage(from, { text: turnReport, mentions: [defender.jid] });
                    }
                }
            }

            // REGISTRATION INTERACTION HANDLING BLOCK
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
                    `🎖 *Starting Rank:* Academy Student\n` +
                    `💰 *Ryo:* 1,000 | 💎 *Gems:* 5\n\n` +
                    `🏯 *VILLAGE CITIZENS FACTION GROUP:*\n👉 ${groupInvite}\n\n` +
                    `_Type \`!profile\` to view your tracking card!_`;

                if (groupInvite.endsWith('@g.us')) {
                    try { await conn.groupParticipantsUpdate(groupInvite, [from], "add"); } catch (e) {}
                }

                const villageImgKey = `VILLAGE_${randomVillage.toUpperCase()}`;
                const visualPayload = prepareImagePayload(GRAPHICS[villageImgKey] || GRAPHICS.WELCOME_BANNER, welcomeCard);
                return await conn.sendMessage(from, visualPayload);
            }

            // BASE GAME MANDATORY COMMAND ROUTER INTERFACES
            if (lowerText === '!start') {
                if (user) {
                    return await conn.sendMessage(from, { text: `❌ Your path is already set as a citizen of the Hidden ${user.village} Village!` });
                }

                user = new User({ phoneId: from, registrationStep: 'AWAITING_NAME' });
                await user.save();

                const startScrollText = "📜 *THE HOKAGE'S SCROLL REGISTER* 📜\n\nWelcome traveler! Tell us:\n\n👉 *What is your custom Shinobi Name?* \n\n_(Reply directly to this message with your name)_";
                const visualPayload = prepareImagePayload(GRAPHICS.WELCOME_BANNER, startScrollText);
                return await conn.sendMessage(from, visualPayload);
            }

            // Command Security Access Verification Interception Gate
            if (!user || user.registrationStep !== 'COMPLETED') {
                if (['!profile', '!shop', '!summon', '!donate', '!train', '!missions', '!exam', '!fight', '!pvp'].some(cmd => lowerText.startsWith(cmd))) {
                    return await conn.sendMessage(from, { text: "❌ Access Denied. Initialize your character registration first by typing \`!start\`." });
                }
                return;
            }

            // COMMAND: !profile
            if (lowerText === '!profile') {
                const profileCard = `📜 *SHINOBI PROFILE ACCESS* 📜\n\n` +
                    `👤 *Ninja Name:* ${user.username}\n` +
                    `🎖 *Rank:* ${user.rank} (Lv.${user.level})\n` +
                    `🏡 *Village Faction:* Hidden ${user.village}\n` +
                    `🩸 *Clan Bloodline:* ${user.clan} (${user.bloodlineRarity})\n` +
                    `⚡ *Chakra Pool:* ${user.chakra.current} / ${user.chakra.max}\n` +
                    `❤️ *Health Vitality:* ${user.hp.current} / ${user.hp.max}\n` +
                    `💰 *Ryo:* ${user.ryo.toLocaleString()}\n` +
                    `💎 *Gems:* ${user.gems}\n\n` +
                    `_Type \`!shop\` to buy equipment, or \`!missions\` to earn Ryo!_`;

                const villageImgKey = `VILLAGE_${user.village.toUpperCase()}`;
                const visualPayload = prepareImagePayload(GRAPHICS[villageImgKey] || GRAPHICS.WELCOME_BANNER, profileCard);
                return await conn.sendMessage(from, visualPayload);
            }

            // COMMAND: !train
            if (lowerText === '!train') {
                const CHAKRA_COST = 30;
                const XP_GAIN = 15;

                if (user.chakra.current < CHAKRA_COST) {
                    return await conn.sendMessage(from, { text: `❌ *CHAKRA DEPLETED* ❌\n\n⚡ *Current Chakra:* ${user.chakra.current} / ${user.chakra.max}\n⚠️ *Required:* ${CHAKRA_COST} Chakra\n\n⏳ _Your chakra naturally regenerates by +10 every single minute._` });
                }

                user.chakra.current -= CHAKRA_COST;
                user.xp += XP_GAIN;

                let leveledUp = false;
                const xpNeededForNextLevel = user.level * 100;
                if (user.xp >= xpNeededForNextLevel) {
                    user.xp -= xpNeededForNextLevel;
                    user.level += 1;
                    user.chakra.max += 15;
                    user.hp.max += 50;
                    user.chakra.current = user.chakra.max;
                    user.hp.current = user.hp.max;
                    leveledUp = true;
                }

                await user.save();

                let trainingResultText = `🏋️‍♂️ *SHINOBI ACADEMY TRAINING* 🏋️‍♂️\n\n` +
                    `📉 *Chakra Spent:* -${CHAKRA_COST} (Remaining: ${user.chakra.current}/${user.chakra.max})\n` +
                    `📈 *Experience Earned:* +${XP_GAIN} XP (${user.xp}/${user.level * 100})\n`;

                if (leveledUp) {
                    trainingResultText += `\n🎉 *LEVEL UP!* 🎉 You climbed to *Level ${user.level}*!`;
                }
                return await conn.sendMessage(from, { text: trainingResultText });
            }

            // COMMAND: !missions
            if (lowerText === '!missions') {
                const boardMsg = `📜 *VILLAGE SHINOBI MISSION BOARD* 📜\n\n` +
                    `🟢 *[D-Rank]* — \`!mission d\` (20 Chakra | 150-300 Ryo)\n` +
                    `🔵 *[C-Rank]* — \`!mission c\` (40 Chakra | 500-900 Ryo)\n` +
                    `🔴 *[B-Rank]* — \`!mission b\` (60 Chakra | 1,200-2,500 Ryo)\n` +
                    `🔥 *[S-Rank]* — \`!mission s\` (90 Chakra | 4,000-7,500 Ryo + Gems)`;
                return await conn.sendMessage(from, { text: boardMsg });
            }

            // COMMAND: !mission [tier]
            if (lowerText.startsWith('!mission ')) {
                const tier = lowerText.split(' ')[1];
                const missionConfigs = {
                    'd': { name: "D-Rank: Catch Tora the Cat", chakra: 20, minRyo: 150, maxRyo: 300, xp: 20, baseSuccess: 100, failDmg: 0 },
                    'c': { name: "C-Rank: Escort Merchant Fleet", chakra: 40, minRyo: 500, maxRyo: 900, xp: 50, baseSuccess: 75, failDmg: 80 },
                    'b': { name: "B-Rank: Neutralize Rogue Bandits", chakra: 60, minRyo: 1200, maxRyo: 2500, xp: 120, baseSuccess: 55, failDmg: 180 },
                    's': { name: "S-Rank: Engage Akatsuki Infiltrators", chakra: 90, minRyo: 4000, maxRyo: 7500, xp: 350, baseSuccess: 30, failDmg: 350 }
                };

                const config = missionConfigs[tier];
                if (!config) return await conn.sendMessage(from, { text: "❌ Mission tier not recognized." });

                if (user.hp.current <= 1) return await conn.sendMessage(from, { text: `🏥 *INJURED STATUS* 🏥\n\nYou are incapacitated with only ${user.hp.current} HP remaining!` });
                if (user.chakra.current < config.chakra) return await conn.sendMessage(from, { text: `❌ *INSUFFICIENT CHAKRA* ❌ (Need ${config.chakra})` });

                user.chakra.current -= config.chakra;
                const levelBonus = (user.level - 1) * 2;
                const finalSuccessChance = Math.min(95, config.baseSuccess + levelBonus); 
                const roll = Math.random() * 100;

                if (roll > finalSuccessChance) {
                    const actualDamage = Math.min(user.hp.current - 1, config.failDmg);
                    user.hp.current -= actualDamage;
                    await user.save();

                    const failMsg = `🚨 *MISSION FAILURE / AMBUSH* 🚨\n\n💥 *Status:* Ambushed by rogue missing-nin!\n📉 *Chakra Lost:* -${config.chakra}\n💔 *Damage Sustained:* -${actualDamage} HP`;
                    return await conn.sendMessage(from, { text: failMsg });
                }

                const ryoEarned = Math.floor(Math.random() * (config.maxRyo - config.minRyo + 1)) + config.minRyo;
                let gemsEarned = (tier === 's' && Math.random() > 0.5) ? 1 : 0;

                user.ryo += ryoEarned;
                user.xp += config.xp;
                if (gemsEarned > 0) user.gems += gemsEarned;

                let leveledUp = false;
                if (user.xp >= (user.level * 100)) {
                    user.xp -= (user.level * 100);
                    user.level += 1;
                    user.chakra.max += 15;
                    user.hp.max += 50;
                    user.chakra.current = user.chakra.max;
                    user.hp.current = user.hp.max;
                    leveledUp = true;
                }

                await user.save();

                let successMsg = `✅ *MISSION SUCCESS SCROLL* ✅\n\n🦅 *Mission:* ${config.name}\n💰 *Rewards:* 💰 ${ryoEarned.toLocaleString()} Ryo & ✨ +${config.xp} XP\n`;
                if (leveledUp) successMsg += `\n🎉 *LEVEL UP!* You climbed to *Level ${user.level}*!`;
                return await conn.sendMessage(from, { text: successMsg });
            }

            // COMMAND: !exam
            if (lowerText === '!exam') {
                let requiredLevel = 0, nextRank = "", rewardRyo = 0;

                if (user.rank === "Academy Student") { requiredLevel = 5; nextRank = "Genin"; rewardRyo = 1000; }
                else if (user.rank === "Genin") { requiredLevel = 15; nextRank = "Chunin"; rewardRyo = 3500; }
                else if (user.rank === "Chunin") { requiredLevel = 30; nextRank = "Jonin"; rewardRyo = 8000; }
                else if (user.rank === "Jonin") return await conn.sendMessage(from, { text: `⚡ Highest exam tier attained!` });

                if (user.level < requiredLevel) {
                    return await conn.sendMessage(from, { text: `🔒 *EXAM ELIGIBILITY LOCKED* 🔒\n\nTo challenge the **${nextRank} Exam**, you must reach **Level ${requiredLevel}**!` });
                }

                const triviaPool = [
                    { q: "Who was the Fourth Hokage of the Hidden Leaf Village?\na) Tobirama\nb) Minato\nc) Hiruzen\nd) Tsunade", a: "b" },
                    { q: "Which clan does the Kekkei Genkai 'Byakugan' belong to?\na) Uchiha\nb) Uzumaki\nc) Hyuga\nd) Kaguya", a: "c" }
                ];

                const selectedTrivia = triviaPool[Math.floor(Math.random() * triviaPool.length)];
                activeExams.set(from, { nextRank, correctAnswer: selectedTrivia.a, rewardRyo });

                const examIntro = `🎖️ *OFFICIAL ${nextRank.toUpperCase()} PROMOTION EXAM* 🎖️\n\n⚠️ *RULES:* Reply with just the option letter (*a*, *b*, *c*, or *d*).\n\n❓ *QUESTION:* ${selectedTrivia.q}`;
                return await conn.sendMessage(from, { text: examIntro });
            }

            // COMMAND: !shop
            if (lowerText === '!shop') {
                const shopText = `🎒 *KONOHA SHINOBI SUPPLY STORE* 🎒\n\n💊 *[#1] Food Pill* — 💰 500 Ryo\n🧪 *[#2] Health Potion* — 💰 800 Ryo`;
                const visualPayload = prepareImagePayload(GRAPHICS.SHOP_BANNER, shopText);
                return await conn.sendMessage(from, visualPayload);
            }

            // COMMAND: !donate
            if (lowerText === '!donate') {
                return await conn.sendMessage(from, { text: `💎 *DEVTRUST PREMIUM GEM TREASURY*\n\n${BRAND.moniepointDetails}\n\nSend proof to wa.me/${BRAND.billingSupportNumber}` });
            }

        } catch (err) { console.error("❌ CRITICAL MESSAGING RECEPTION ERROR:", err); }
    });

    return conn;
}

module.exports = { startBot, connections };
