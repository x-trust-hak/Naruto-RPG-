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
const { GRAPHICS, prepareImagePayload } = require('./mediaEngine'); // Import Media Core

const connections = new Map();

const activeExams = new Map(); // Tracks ongoing trivia questions for players

const activeFights = new Map(); // Tracks ongoing live matches: playerJid -> fightState data object


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

            // INTERACTIVE ONBOARDING STEP 2: Name Input Capture & Spawning
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
                    `🏯 *VILLAGE CITIZENS FACTION GROUP:*\n` +
                    `The Great Shinobi War has begun. Join your allies immediately in your village council room:\n👉 ${groupInvite}\n\n` +
                    `_Type \`!profile\` to view your tracking card!_`;

                // Automated attempt to natively add user to group if JID is provided instead of link
                if (groupInvite.endsWith('@g.us')) {
                    try { await conn.groupParticipantsUpdate(groupInvite, [from], "add"); } catch (e) {}
                }

                // Send completion text accompanied by specific Village spawn landscape graphic
                const villageImgKey = `VILLAGE_${randomVillage.toUpperCase()}`;
                const visualPayload = prepareImagePayload(GRAPHICS[villageImgKey] || GRAPHICS.WELCOME_BANNER, welcomeCard);
                return await conn.sendMessage(from, visualPayload);
            }

            // COMMAND: !start
            if (lowerText === '!start') {
                if (user) {
                    return await conn.sendMessage(from, { text: `❌ Your path is already set as a citizen of the Hidden ${user.village} Village!` });
                }

                user = new User({ phoneId: from, registrationStep: 'AWAITING_NAME' });
                await user.save();

                const startScrollText = "📜 *THE HOKAGE'S SCROLL REGISTER* 📜\n\nWelcome traveler! Before you are assigned a clan and spawned into one of the Great Five Shinobi Nations, tell us:\n\n👉 *What is your custom Shinobi Name?* \n\n_(Reply directly to this message with your name)_";
                
                // Fire off onboarding introductory card using dynamic welcome layout
                const visualPayload = prepareImagePayload(GRAPHICS.WELCOME_BANNER, startScrollText);
                return await conn.sendMessage(from, visualPayload);
            }

            // Command Guard
            if (!user || user.registrationStep !== 'COMPLETED') {
                if (['!profile', '!shop', '!summon', '!donate'].some(cmd => lowerText.startsWith(cmd))) {
                    return await conn.sendMessage(from, { text: "❌ Access Denied. Initialize your character registration first by typing \`!start\`." });
                }
                return;
            }
                        // Place this inside your conn.ev.on('messages.upsert') command handler logic in src/bot.js

            // COMMAND: !train (Chakra Depletion & Experience Gain Demonstration)
            if (lowerText === '!train') {
                const CHAKRA_COST = 30;
                const XP_GAIN = 15;

                // Guard Check: Does the user have enough chakra?
                if (user.chakra.current < CHAKRA_COST) {
                    const lowChakraMsg = `❌ *CHAKRA DEPLETED* ❌\n\n` +
                        `Your physical stamina is completely exhausted, Ninja *${user.username}*!\n\n` +
                        `⚡ *Current Chakra:* ${user.chakra.current} / ${user.chakra.max}\n` +
                        `⚠️ *Required:* ${CHAKRA_COST} Chakra\n\n` +
                        `⏳ _Sit tight or eat a Food Pill from the \`!shop\`! Your chakra naturally regenerates by +10 every single minute._`;
                    return await conn.sendMessage(from, { text: lowChakraMsg });
                }

                // Deduct stats and award experience points
                user.chakra.current -= CHAKRA_COST;
                user.xp += XP_GAIN;

                // Level up processing calculation logic
                let leveledUp = false;
                const xpNeededForNextLevel = user.level * 100;
                if (user.xp >= xpNeededForNextLevel) {
                    user.xp -= xpNeededForNextLevel;
                    user.level += 1;
                    user.chakra.max += 15;
                    user.hp.max += 50;
                    user.chakra.current = user.chakra.max; // Full heal upon achieving level milestone
                    user.hp.current = user.hp.max;
                    leveledUp = true;
                }

                await user.save();

                let trainingResultText = `🏋️‍♂️ *SHINOBI ACADEMY TRAINING* 🏋️‍♂️\n\n` +
                    `You spent hours focusing your physical energy and practicing hand signs!\n\n` +
                    `📉 *Chakra Spent:* -${CHAKRA_COST} (Remaining: ${user.chakra.current}/${user.chakra.max})\n` +
                    `📈 *Experience Earned:* +${XP_GAIN} XP (${user.xp}/${user.level * 100})\n`;

                if (leveledUp) {
                    trainingResultText += `\n🎉 *LEVEL UP!* 🎉\n` +
                        `Congratulations! You climbed to *Level ${user.level}*!\n` +
                        `💪 Your Max Health points increased to ${user.hp.max} and Max Chakra expanded to ${user.chakra.max}!`;
                }

                return await conn.sendMessage(from, { text: trainingResultText });
            }


                        // Place this inside your conn.ev.on('messages.upsert') command handler logic in src/bot.js

            // TRIVIA ANSWER CHECKER INJECTOR (Runs before normal command evaluation)
            if (activeExams.has(from)) {
                const examData = activeExams.get(from);
                const playerAnswer = cleanText.toLowerCase();

                // Clear the active exam tracking immediately so they can't double-guess
                activeExams.delete(from);

                if (playerAnswer === examData.correctAnswer) {
                    // Update user rank and give a massive reward
                    user.rank = examData.nextRank;
                    user.ryo += examData.rewardRyo;
                    user.chakra.max += 30;
                    user.hp.max += 100;
                    user.chakra.current = user.chakra.max;
                    user.hp.current = user.hp.max;
                    await user.save();

                    const passMsg = `🎉 *PROMOTION EXAM PASSED!* 🎉\n\n` +
                        `✨ *Examiner:* Excellent answer, Ninja! Your knowledge and resolve match your skills.\n\n` +
                        `🎖️ *New Official Rank:* **${user.rank}**\n` +
                        `💰 Promotion Bonus:* +💰 ${examData.rewardRyo} Ryo\n` +
                        `💪 Permanent Stats Boost:* +30 Max Chakra | +100 Max HP (Fully Restored!)\n\n` +
                        `_Your name has been updated in the village archives. Go forth and claim higher bounties!_`;
                    return await conn.sendMessage(from, { text: passMsg });
                } else {
                    const failMsg = `❌ *EXAM FAILURE* ❌\n\n` +
                        `💥 *Examiner:* Incorrect! A shinobi must be sharp in both mind and body. You failed the trial.\n\n` +
                        `📝 *Correct Answer was:* **${examData.correctAnswer.toUpperCase()}**\n\n` +
                        `💪 _Train harder, level up your stats, and try again when you are ready!_`;
                    return await conn.sendMessage(from, { text: failMsg });
                }
            }

            // COMMAND: !exam
            if (lowerText === '!exam') {
                let requiredLevel = 0;
                let nextRank = "";
                let rewardRyo = 0;

                // Determine eligibility based on current rank
                if (user.rank === "Academy Student") {
                    requiredLevel = 5;
                    nextRank = "Genin";
                    rewardRyo = 1000;
                } else if (user.rank === "Genin") {
                    requiredLevel = 15;
                    nextRank = "Chunin";
                    rewardRyo = 3500;
                } else if (user.rank === "Chunin") {
                    requiredLevel = 30;
                    nextRank = "Jonin";
                    rewardRyo = 8000;
                } else if (user.rank === "Jonin") {
                    return await conn.sendMessage(from, { text: `⚡ *ELITE JONIN STATUS* ⚡\n\nYou have reached the highest exam tier! Your next path is the world tournament to fight for the absolute title of **Hokage**!` });
                }

                // Check Level Requirement Guard
                if (user.level < requiredLevel) {
                    return await conn.sendMessage(from, { text: `🔒 *EXAM ELIGIBILITY LOCKED* 🔒\n\nYou are currently an *${user.rank}* (Lv. ${user.level}).\n\nTo challenge the official **${nextRank} Promotional Exam**, you must train until you reach **Level ${requiredLevel}**!` });
                }

                // Questions Matrix Pool
                const triviaPool = [
                    { q: "Who was the Fourth Hokage of the Hidden Leaf Village?\na) Tobirama\nb) Minato\nc) Hiruzen\nd) Tsunade", a: "b" },
                    { q: "What is the name of the tailed beast sealed inside Gaara?\na) Shukaku\nb) Matatabi\nc) Kurama\nb) Gyuki", a: "a" },
                    { q: "Which clan does the Kekkei Genkai 'Byakugan' belong to?\na) Uchiha\nb) Uzumaki\nc) Hyuga\nd) Kaguya", a: "c" },
                    { q: "What is the name of Sasuke Uchiha's signature lightning jutsu?\na) Rasengan\nb) Chidori\nc) Amaterasu\nd) Kirin", a: "b" },
                    { q: "Who is known as the 'Handsome Devil of the Leaf'?\na) Naruto\nb) Kakashi\nc) Rock Lee\nd) Neji", a: "c" }
                ];

                // Pick a random question
                const selectedTrivia = triviaPool[Math.floor(Math.random() * triviaPool.length)];

                // Save question parameters to session state tracking map
                activeExams.set(from, {
                    nextRank: nextRank,
                    correctAnswer: selectedTrivia.a,
                    rewardRyo: rewardRyo
                });

                const examIntro = `🎖️ *OFFICIAL ${nextRank.toUpperCase()} PROMOTION EXAM* 🎖️\n` +
                    `----------------------------------------\n` +
                    `You are standing before the Village Council Board. To prove you are worthy of advancing to **${nextRank}**, you must answer this tactical lore question correctly.\n\n` +
                    `⚠️ *RULES:* Reply directly to this message with just the letter of your choice (*a*, *b*, *c*, or *d*).\n` +
                    `----------------------------------------\n\n` +
                    `❓ *QUESTION:* ${selectedTrivia.q}`;

                return await conn.sendMessage(from, { text: examIntro });
            }


                        // Place this inside your conn.ev.on('messages.upsert') command handler logic in src/bot.js

            // ==========================================
            // PHASE 5: LIVE COMBAT COMMANDS INTERCEPTOR
            // ==========================================
            
            // COMMAND: !fight @tag / !pvp @tag (Challenge initiation)
            if (lowerText.startsWith('!fight') || lowerText.startsWith('!pvp')) {
                const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                
                if (!mentioned) {
                    return await conn.sendMessage(from, { text: "❌ *TARGET MISSING* ❌\n\nYou must tag a valid ninja to challenge them to a duel!\n\n👉 *Usage:* \`!fight @player\`" });
                }

                if (mentioned === from) {
                    return await conn.sendMessage(from, { text: "❌ You cannot hit yourself with a shadow clone technique. Tag a rival instead!" });
                }

                // Target state check
                const rival = await User.findOne({ phoneId: mentioned, registrationStep: 'COMPLETED' });
                if (!rival) {
                    return await conn.sendMessage(from, { text: "❌ The targeted ninja has not registered their path yet using \`!start\`!" });
                }

                // Check if either player is already trapped in an active fight match
                if (activeFights.has(from) || activeFights.has(mentioned)) {
                    return await conn.sendMessage(from, { text: "❌ Battle arena occupied! One of you is currently engaged in a deathmatch." });
                }

                if (user.hp.current <= 50 || rival.hp.current <= 50) {
                    return await conn.sendMessage(from, { text: "❌ Health bars too low! Both ninjas need at least 50 HP to start an official duel." });
                }

                // Initialize the combat session metadata inside the live tracking state container map
                const fightInstance = {
                    p1: { jid: from, name: user.username, clan: user.clan, maxHp: user.hp.max },
                    p2: { jid: mentioned, name: rival.username, clan: rival.clan, maxHp: rival.hp.max },
                    turn: from, // Challenger takes the first turn
                    logs: []
                };

                activeFights.set(from, fightInstance);
                activeFights.set(mentioned, fightInstance);

                const challengeNotice = `⚔️ *SHINOBI DUEL CHALLENGE* ⚔️\n` +
                    `----------------------------------------\n` +
                    `🔴 *Challenger:* @${from.split('@')[0]} (${user.clan} Clan)\n` +
                    `🔵 *Opponent:* @${mentioned.split('@')[0]} (${rival.clan} Clan)\n` +
                    `----------------------------------------\n\n` +
                    `💥 The match has officially begun!\n` +
                    `👉 It is @${from.split('@')[0]}'s turn. \n\n` +
                    `*AVAILABLE ACTION COMMANDS:*\n` +
                    `🔹 Type \`!strike\` — Basic physical kunai attack (15-30 DMG, Costs 0 Chakra)\n` +
                    `🔸 Type \`!jutsu\` — Cast your equipped Jutsu move (50-80 DMG, Costs 25 Chakra)`;

                return await conn.sendMessage(from, { text: challengeNotice, mentions: [from, mentioned] });
            }

            // RUNTIME COMBAT ACTION EXECUTION INTERCEPTORS
            if (activeFights.has(from)) {
                const fight = activeFights.get(from);

                // Quick safety check: Ensure it's actually this player's turn
                if (fight.turn !== from) {
                    return; // Silently ignore out-of-turn inputs so it doesn't spam the chat
                }

                const isP1Current = (from === fight.p1.jid);
                const attacker = isP1Current ? fight.p1 : fight.p2;
                const defender = isP1Current ? fight.p2 : fight.p1;

                // Load database profile configurations dynamically for state operations
                const attackerDb = isP1Current ? user : await User.findOne({ phoneId: defender.jid });
                const defenderDb = isP1Current ? await User.findOne({ phoneId: defender.jid }) : user;

                let damageDealt = 0;
                let chakraCost = 0;
                let usedAction = "";

                // ACTION 1: Basic Physical Strike
                if (lowerText === '!strike') {
                    damageDealt = Math.floor(Math.random() * (30 - 15 + 1)) + 15;
                    usedAction = "🗡️ launched a brutal physical Kunai dash";
                }
                // ACTION 2: Cast Equipped Jutsu
                else if (lowerText === '!jutsu') {
                    chakraCost = 25;
                    if (attackerDb.chakra.current < chakraCost) {
                        return await conn.sendMessage(from, { text: `❌ *CHAKRA DEPLETED!* You don't have enough chakra for a jutsu. Type \`!strike\` instead!` });
                    }
                    damageDealt = Math.floor(Math.random() * (80 - 50 + 1)) + 50;
                    usedAction = `🔥 unleashed their signature *[${attackerDb.equippedJutsu[0] || "Basic Jutsu"}]*`;
                } else {
                    return; // Ignore non-combat text lines during active fights
                }

                // APPLY CLAN PASSIVE STRATEGIC MATRIX BUFFS
                let battleFlavorText = "";
                
                // Attacker: Hyuga Clan 15% Critical Chance
                if (attacker.clan === 'Hyuga' && Math.random() < 0.15) {
                    damageDealt = Math.floor(damageDealt * 1.5);
                    battleFlavorText += `🎯 *CRITICAL HIT!* Byakugan vision pierced through vital chakra pathways!\n`;
                }

                // Defender: Uchiha Clan 15% Evasion matrix adjustment
                if (defender.clan === 'Uchiha' && Math.random() < 0.15) {
                    damageDealt = 0;
                    battleFlavorText += `🔴 *EVADE!* The opponent's Sharingan completely anticipated and dodged the movement!\n`;
                }

                // Deduct stats from database records
                attackerDb.chakra.current = Math.max(0, attackerDb.chakra.current - chakraCost);
                defenderDb.hp.current = Math.max(0, defenderDb.hp.current - damageDealt);

                // Save both files safely down into MongoDB collections
                await attackerDb.save();
                await defenderDb.save();

                // Switch turn pointers
                fight.turn = defender.jid;

                // Build action card text frame layout strings
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

                // CHECK FOR FINISHING KNOCKOUT CONDITION MET
                if (defenderDb.hp.current <= 0) {
                    // Clean out tracking maps pointers completely
                    activeFights.delete(fight.p1.jid);
                    activeFights.delete(fight.p2.jid);

                    // Distribute cash balances rewards/penalties to profiles
                    const bountyReward = 800;
                    attackerDb.ryo += bountyReward;
                    attackerDb.xp += 40;
                    
                    // Leave the loser at 1 HP so they are knocked out but don't lose their account
                    defenderDb.hp.current = 1; 
                    defenderDb.ryo = Math.max(0, defenderDb.ryo - 300);

                    await attackerDb.save();
                    await defenderDb.save();

                    let matchOverCard = `🏆 *KO! DUEL FINISHED!* 🏆\n` +
                        `----------------------------------------\n` +
                        `🥇 *WINNER:* **${attacker.name}**\n` +
                        `💀 *LOSER:* **${defender.name}**\n` +
                        `----------------------------------------\n\n` +
                        `✨ **${attacker.name}** completely dominated the battlefield and takes home the bounty!\n\n` +
                        `💰 *Winner Loot:* +💰 800 Ryo & +40 XP\n` +
                        `📉 *Loser Penalty:* -💰 300 Ryo (Dropped on the battlefield floor)`;

                    return await conn.sendMessage(from, { text: matchOverCard });
                }

                // If match is still going, announce the next turn
                turnReport += `👉 Next turn belongs to: @${defender.jid.split('@')[0]}! Respond with \`!strike\` or \`!jutsu\``;
                return await conn.sendMessage(from, { text: turnReport, mentions: [defender.jid] });
                    }
                    
            


                        // Place this inside your conn.ev.on('messages.upsert') command handler logic in src/bot.js

            // COMMAND: !missions
            if (lowerText === '!missions') {
                const boardMsg = `📜 *VILLAGE SHINOBI MISSION BOARD* 📜\n\n` +
                    `Welcome, Ninja *${user.username}*. Select a contract suited to your rank. Higher-tier missions carry dangerous failure risks!\n\n` +
                    `🟢 *[D-Rank]* — \`!mission d\`\n` +
                    `├ 📋 *Task:* Chase Tora the runaway cat / Weed fields\n` +
                    `├ ⚡ *Cost:* 20 Chakra | 📈 *Rewards:* 150-300 Ryo & 20 XP\n` +
                    `└ 🛡️ *Safety:* 100% Success Rate\n\n` +
                    `🔵 *[C-Rank]* — \`!mission c\`\n` +
                    `├ 📋 *Task:* Escort a merchant caravan through Wave Country\n` +
                    `├ ⚡ *Cost:* 40 Chakra | 📈 *Rewards:* 500-900 Ryo & 50 XP\n` +
                    `└ ⚠️ *Safety:* Danger present. Fail risk scales lower as your Level increases.\n\n` +
                    `🔴 *[B-Rank]* — \`!mission b\`\n` +
                    `├ 📋 *Task:* Ambush rogue bandits / Infiltrate supply outposts\n` +
                    `├ ⚡ *Cost:* 60 Chakra | 📈 *Rewards:* 1,200-2,500 Ryo & 120 XP\n` +
                    `└ 🚨 *Risk:* Heavy Ambush chance. Failure inflicts heavy physical damage!\n\n` +
                    `🔥 *[S-Rank]* — \`!mission s\`\n` +
                    `├ 📋 *Task:* Hunt rogue Akatsuki members or defend the Village boundaries\n` +
                    `├ ⚡ *Cost:* 90 Chakra | 📈 *Rewards:* 4,000-7,500 Ryo, 350 XP & 1-2 Gems\n` +
                    `└ 💀 *Danger:* Extreme lethal risk. Only elite high-level ninjas will survive.\n\n` +
                    `_To deploy, type your target command (e.g., \`!mission d\`)_`;

                return await conn.sendMessage(from, { text: boardMsg });
            }

            // COMMAND: !mission [tier]
            if (lowerText.startsWith('!mission ')) {
                const tier = lowerText.split(' ')[1];
                
                // 1. Structure configuration matrix mapping for all active missions
                const missionConfigs = {
                    'd': { name: "D-Rank: Catch Tora the Cat", chakra: 20, minRyo: 150, maxRyo: 300, xp: 20, baseSuccess: 100, failDmg: 0 },
                    'c': { name: "C-Rank: Escort Merchant Fleet", chakra: 40, minRyo: 500, maxRyo: 900, xp: 50, baseSuccess: 75, failDmg: 80 },
                    'b': { name: "B-Rank: Neutralize Rogue Bandits", chakra: 60, minRyo: 1200, maxRyo: 2500, xp: 120, baseSuccess: 55, failDmg: 180 },
                    's': { name: "S-Rank: Engage Akatsuki Infiltrators", chakra: 90, minRyo: 4000, maxRyo: 7500, xp: 350, baseSuccess: 30, failDmg: 350 }
                };

                const config = missionConfigs[tier];
                if (!config) {
                    return await conn.sendMessage(from, { text: "❌ Mission tier not recognized on the board. Choose \`d\`, \`c\`, \`b\`, or \`s\`." });
                }

                // 2. Health & Chakra pre-flight checks
                if (user.hp.current <= 1) {
                    return await conn.sendMessage(from, { text: `🏥 *INJURED STATUS* 🏥\n\nYou are physically incapacitated with only ${user.hp.current} HP remaining! Please buy a Health Potion from the \`!shop\` or wait for passive healing before going back out.` });
                }

                if (user.chakra.current < config.chakra) {
                    return await conn.sendMessage(from, { text: `❌ *INSUFFICIENT CHAKRA* ❌\n\nYou need at least *${config.chakra} Chakra* to take on this mission, but you only have ${user.chakra.current}.\n\n💊 _Tip: Use a Food Pill or wait for natural recovery._` });
                }

                // Deduct Chakra immediately upon starting the deployment
                user.chakra.current -= config.chakra;

                // 3. Dynamic Success Rate Calculation (Player Level adds a +2% bonus per level)
                const levelBonus = (user.level - 1) * 2;
                const finalSuccessChance = Math.min(95, config.baseSuccess + levelBonus); 
                const roll = Math.random() * 100;

                // HANDLE FAILURE SCENARIO
                if (roll > finalSuccessChance) {
                    // Reduce user's health points, leaving them with at least 1 HP
                    const actualDamage = Math.min(user.hp.current - 1, config.failDmg);
                    user.hp.current -= actualDamage;
                    await user.save();

                    const failMsg = `🚨 *MISSION FAILURE / AMBUSH* 🚨\n\n` +
                        `🔴 *Mission:* ${config.name}\n` +
                        `💥 *Status:* Your squad was completely ambushed by rogue missing-nin!\n\n` +
                        `📉 *Chakra Lost:* -${config.chakra}\n` +
                        `💔 *Damage Sustained:* -${actualDamage} HP (Remaining: ${user.hp.current}/${user.hp.max})\n\n` +
                        `👉 _Heal up or rest before planning your counter-strike!_`;
                    return await conn.sendMessage(from, { text: failMsg });
                }

                // HANDLE SUCCESS SCENARIO
                const ryoEarned = Math.floor(Math.random() * (config.maxRyo - config.minRyo + 1)) + config.minRyo;
                let gemsEarned = 0;
                
                // S-Rank contracts have a chance to drop premium gems
                if (tier === 's') {
                    gemsEarned = Math.random() > 0.5 ? 2 : 1;
                }

                user.ryo += ryoEarned;
                user.xp += config.xp;
                if (gemsEarned > 0) user.gems += gemsEarned;

                // Check for Level Up milestones
                let leveledUp = false;
                const xpNeeded = user.level * 100;
                if (user.xp >= xpNeeded) {
                    user.xp -= xpNeeded;
                    user.level += 1;
                    user.chakra.max += 15;
                    user.hp.max += 50;
                    user.chakra.current = user.chakra.max;
                    user.hp.current = user.hp.max;
                    leveledUp = true;
                }

                await user.save();

                let successMsg = `✅ *MISSION SUCCESS SCROLL* ✅\n\n` +
                    `🦅 *Mission:* ${config.name}\n` +
                    `🏆 *Status:* Mission completed perfectly. Your deployment squad has returned safely to the village.\n\n` +
                    `⚡ *Chakra Expended:* -${config.chakra} (Remaining: ${user.chakra.current}/${user.chakra.max})\n` +
                    `💰 *Rewards Secured:* 💰 ${ryoEarned.toLocaleString()} Ryo & ✨ +${config.xp} XP\n`;

                if (gemsEarned > 0) {
                    successMsg += `💎 *Premium Bonus:* +${gemsEarned} Ninja Gems found!\n`;
                }

                if (leveledUp) {
                    successMsg += `\n🎉 *LEVEL UP!* 🎉\n` +
                        `Your renown spreads! You climbed to *Level ${user.level}*!\n` +
                        `💪 Max Health is now ${user.hp.max} HP and Max Chakra is ${user.chakra.max}!`;
                }

                return await conn.sendMessage(from, { text: successMsg });
                    }
                    
            

            // COMMAND: !profile (Upgraded with Village Landscape Card)
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
                    `🏆 *Goal:* Race to defeat rivals & claim Hokage supremacy!\n\n` +
                    `_Type \`!shop\` to buy equipment, or \`!summon\` to roll gems!_`;

                const villageImgKey = `VILLAGE_${user.village.toUpperCase()}`;
                const visualPayload = prepareImagePayload(GRAPHICS[villageImgKey] || GRAPHICS.WELCOME_BANNER, profileCard);
                return await conn.sendMessage(from, visualPayload);
            }

            // COMMAND: !shop (Upgraded with Item Emporium Graphic Card)
            if (lowerText === '!shop') {
                const shopText = `🎒 *KONOHA SHINOBI SUPPLY STORE* 🎒\n\n` +
                    `💰 Balance: ${user.ryo} Ryo\n\n` +
                    `💊 *[#1] Food Pill* — 💰 500 Ryo\n└ _Restores +50 Chakra._\n\n` +
                    `🧪 *[#2] Health Potion* — 💰 800 Ryo\n└ _Heals +200 HP._\n\n` +
                    `*To Purchase:* Reply with \`!buy [item_id]\`\n\n_Engine Framework Built by ${BRAND.dev}_`;

                const visualPayload = prepareImagePayload(GRAPHICS.SHOP_BANNER, shopText);
                return await conn.sendMessage(from, visualPayload);
            }

            if (lowerText === '!donate') {
                return await conn.sendMessage(from, { text: `💎 *DEVTRUST PREMIUM GEM TREASURY*\n\n${BRAND.moniepointDetails}\n\nSend proof to wa.me/${BRAND.billingSupportNumber}` });
            }

        } catch (err) { console.error(err); }
    });

    return conn;
}

module.exports = { startBot, connections };
