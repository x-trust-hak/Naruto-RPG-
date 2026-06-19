// src/case.js
const User = require('../models/User');
const { prepareImagePayload, getCharacterImage, getBattleImage, VILLAGE_IMAGES } = require('./mediaEngine');
const { CHARACTERS, FREE_CHARACTERS, xpForLevel } = require('./characters');

const ADMIN_NUMBER = '2347041560392@s.whatsapp.net';
const ADMIN_PLAIN  = '2347041560392';

const BRAND = {
    billingSupportNumber: "2347041560392",
    moniepointDetails: "🏦 Moniepoint MFB\n🔢 Acc No: 7074435901\n👤 Name: Praise Philip Jacob"
};

const VILLAGE_GROUPS = {
    Leaf:  'https://chat.whatsapp.com/ExampleLeafGroupLink',
    Sand:  'https://chat.whatsapp.com/ExampleSandGroupLink',
    Mist:  'https://chat.whatsapp.com/ExampleMistGroupLink',
    Cloud: 'https://chat.whatsapp.com/ExampleCloudGroupLink',
    Stone: 'https://chat.whatsapp.com/ExampleStoneGroupLink',
    Rain:  'https://chat.whatsapp.com/ExampleRainGroupLink',
};

const CLANS = [
    { name: 'Nara',     rarity: 'Common',    desc: '🧠 +10% Tactical Advantage' },
    { name: 'Akimichi', rarity: 'Common',    desc: '🍖 +20% Base Vitality HP' },
    { name: 'Hyuga',    rarity: 'Rare',      desc: '👁️ Byakugan: 15% Crit penetration' },
    { name: 'Aburame',  rarity: 'Rare',      desc: '🪲 Parasitic Chakra Drain' },
    { name: 'Uzumaki',  rarity: 'Epic',      desc: '🌀 Monstrous Vitality Pools' },
    { name: 'Uchiha',   rarity: 'Legendary', desc: '🔴 Sharingan Evasion Matrix' }
];

const VILLAGES = ['Leaf', 'Sand', 'Mist', 'Cloud', 'Stone'];

function rollClan() {
    const r = Math.random() * 100;
    if (r < 3)  return CLANS[5]; // Uchiha
    if (r < 12) return CLANS[4]; // Uzumaki
    if (r < 35) return CLANS[Math.random() > 0.5 ? 2 : 3];
    return CLANS[Math.random() > 0.5 ? 0 : 1];
}

function isAdmin(senderJid) {
    return senderJid === ADMIN_NUMBER ||
           senderJid.replace('@s.whatsapp.net','').replace('@lid','') === ADMIN_PLAIN;
}

// XP needed to reach next level
function xpNeeded(level) { return level * 500; }

// Add XP and handle level ups — returns { leveledUp, newLevel, rewards }
async function addXP(user, amount) {
    user.xp += amount;
    user.totalXp += amount;
    let leveledUp = false;
    let rewards = [];

    while (user.xp >= xpNeeded(user.level)) {
        user.xp -= xpNeeded(user.level);
        user.level += 1;
        leveledUp = true;

        // Level up rewards
        const ryoReward = user.level * 200;
        let gemReward   = 0;
        let bonus       = '';

        user.ryo += ryoReward;

        // Milestone rewards
        if (user.level === 10) { gemReward = 3; bonus = '🎉 Milestone: Level 10 reached!'; }
        else if (user.level === 25) { gemReward = 5; bonus = '🏆 Milestone: Level 25 — Chunin power!'; }
        else if (user.level === 50) { gemReward = 10; bonus = '⚡ Milestone: Level 50 — Jonin strength!'; }
        else if (user.level === 75) { gemReward = 15; bonus = '🔥 Milestone: Level 75 — Kage candidate!'; }
        else if (user.level >= 100 && !user.isKage) { gemReward = 20; bonus = '👑 KAGE CANDIDATE! You are now eligible for Kage election!'; }

        if (gemReward > 0) user.gems += gemReward;

        // Stat boost on level up
        user.hp.max     += 20;
        user.chakra.max += 15;
        user.hp.current     = user.hp.max;
        user.chakra.current = user.chakra.max;

        rewards.push({ level: user.level, ryo: ryoReward, gems: gemReward, bonus });
    }

    // Update rank based on level
    if (user.level >= 75) user.rank = 'Jonin Elite';
    else if (user.level >= 50) user.rank = 'Jonin';
    else if (user.level >= 25) user.rank = 'Chunin';
    else if (user.level >= 10) user.rank = 'Genin';
    else user.rank = 'Academy Student';

    await user.save();
    return { leveledUp, rewards };
}

// Active game state maps
const activeExams   = new Map();
const activeFights  = new Map();
const activeVotes   = new Map(); // Kage votes: village -> { candidates: {jid: votes}, endTime }

module.exports = async (conn, from, senderJid, cleanText, phoneNumber, pushName = 'Ninja') => {
    try {
        // Check ban
        const user = await User.findOne({ phoneId: senderJid });
        if (user?.isBanned) return;

        const lowerText = cleanText.toLowerCase();
        const args = lowerText.startsWith('!')
            ? lowerText.slice(1).trim().split(/ +/)
            : [];
        const command = args.shift() || '';
        // Get original case args for things like names
        const rawArgs = cleanText.startsWith('!')
            ? cleanText.slice(1).trim().split(/ +/)
            : [];
        rawArgs.shift();
        const rawText = rawArgs.join(' ');

        console.log(`[CASE] cmd=${command} from=${from} sender=${senderJid}`);

        // ── TRIVIA ANSWER ─────────────────────────────────────────────────────
        if (activeExams.has(senderJid)) {
            const examData = activeExams.get(senderJid);
            activeExams.delete(senderJid);
            if (!user) return;

            if (lowerText.trim() === examData.correctAnswer) {
                user.rank = examData.nextRank;
                user.ryo += examData.rewardRyo;
                user.chakra.max    += 30;
                user.hp.max        += 100;
                user.chakra.current = user.chakra.max;
                user.hp.current     = user.hp.max;
                await user.save();
                return await conn.sendMessage(from, {
                    text: `🎉 *PROMOTION EXAM PASSED!*\n\n🎖️ *New Rank:* ${user.rank}\n💰 *Bonus:* +${examData.rewardRyo} Ryo\n💪 +30 Max Chakra | +100 Max HP`
                });
            } else {
                return await conn.sendMessage(from, {
                    text: `❌ *EXAM FAILURE*\n\nCorrect answer: *${examData.correctAnswer.toUpperCase()}*\n\nTrain harder and try again!`
                });
            }
        }

        // ── KAGE VOTE ─────────────────────────────────────────────────────────
        if (user && lowerText.startsWith('!vote ') && user.registrationStep === 'COMPLETED') {
            const voteData = activeVotes.get(user.village);
            if (voteData && Date.now() < voteData.endTime) {
                const candidateNum = lowerText.split(' ')[1]?.replace('+','');
                const candidateJid = `${candidateNum}@s.whatsapp.net`;
                const candidate    = await User.findOne({ phoneId: candidateJid });

                if (!candidate || candidate.village !== user.village) {
                    return await conn.sendMessage(from, { text: '❌ Invalid candidate or not from your village.' });
                }
                if (voteData.voted?.has(senderJid)) {
                    return await conn.sendMessage(from, { text: '❌ You already voted this week!' });
                }

                voteData.candidates[candidateJid] = (voteData.candidates[candidateJid] || 0) + 1;
                voteData.voted = voteData.voted || new Set();
                voteData.voted.add(senderJid);

                return await conn.sendMessage(from, {
                    text: `✅ Vote cast for *${candidate.username}* as ${user.village} Kage!\n\n🗳️ They now have ${voteData.candidates[candidateJid]} votes.`
                });
            }
        }

        if (!command) return;

        switch (command) {

            // ════════════════════════════════════════════════════════════════
            // REGISTRATION
            // ════════════════════════════════════════════════════════════════
            case 'start': {
                if (user && user.registrationStep === 'COMPLETED') {
                    return await conn.sendMessage(from, {
                        text: `❌ Already registered as *${user.username}*!\n\nType !profile to view your stats.`
                    });
                }

                const rolledClan      = rollClan();
                const randomVillage   = VILLAGES[Math.floor(Math.random() * VILLAGES.length)];
                const charId          = FREE_CHARACTERS[Math.floor(Math.random() * FREE_CHARACTERS.length)];
                const char            = CHARACTERS[charId];
                const ninjaName       = (pushName || 'Ninja').slice(0, 16);

                const newUser = new User({
                    phoneId:          senderJid,
                    username:         ninjaName,
                    village:          randomVillage,
                    clan:             rolledClan.name,
                    bloodlineRarity:  rolledClan.rarity,
                    character:        charId,
                    ownedCharacters:  [charId],
                    unlockedJutsus:   [char.jutsus[0].id],
                    equippedJutsus:   [char.jutsus[0].id],
                    hp:     { current: char.baseStats.hp,     max: char.baseStats.hp },
                    chakra: { current: char.baseStats.chakra, max: char.baseStats.chakra },
                    registrationStep: 'COMPLETED'
                });
                await newUser.save();

                const groupInvite = VILLAGE_GROUPS[randomVillage] || 'Contact Admin';
                const welcomeMsg  =
                    `🍥 *WELCOME TO NARUTO RPG* 🍥\n\n` +
                    `✅ *Ninja Name:* ${ninjaName}\n\n` +
                    `🏡 *Village:* Hidden ${randomVillage} Village\n` +
                    `🩸 *Clan:* ${rolledClan.name} (${rolledClan.rarity})\n` +
                    `🧬 *Passive:* _${rolledClan.desc}_\n\n` +
                    `${char.emoji} *Character:* ${char.name}\n` +
                    `📖 *${char.description}*\n\n` +
                    `❤️ HP: ${char.baseStats.hp} | ⚡ Chakra: ${char.baseStats.chakra}\n` +
                    `⚔️ ATK: ${char.baseStats.attack} | 🛡️ DEF: ${char.baseStats.defense} | 💨 SPD: ${char.baseStats.speed}\n\n` +
                    `🥋 *Starter Jutsu:* ${char.jutsus[0].name}\n\n` +
                    `🎖️ *Rank:* Academy Student | Lv.1\n` +
                    `💰 Ryo: 1,000 | 💎 Gems: 5\n\n` +
                    `🏯 *Village Group:* ${groupInvite}\n\n` +
                    `_Don't like your character? Use !shop to buy another!_\n` +
                    `_Type !menu to see all commands_`;

                return await conn.sendMessage(from,
                    prepareImagePayload(getCharacterImage(charId), welcomeMsg)
                );
            }

            // ════════════════════════════════════════════════════════════════
            // PROFILE
            // ════════════════════════════════════════════════════════════════
            case 'profile': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                const char = CHARACTERS[user.character] || CHARACTERS.naruto;
                const kageTitle = user.isKage ? `👑 *${user.village} KAGE*\n` : '';
                const xpBar = Math.floor((user.xp / xpNeeded(user.level)) * 10);
                const xpBarStr = '█'.repeat(xpBar) + '░'.repeat(10 - xpBar);

                const profileMsg =
                    `📜 *SHINOBI PROFILE* 📜\n\n` +
                    `${kageTitle}` +
                    `👤 *Name:* ${user.username}\n` +
                    `${char.emoji} *Character:* ${char.name}\n` +
                    `🎖️ *Rank:* ${user.rank} (Lv.${user.level})\n` +
                    `🏡 *Village:* Hidden ${user.village}\n` +
                    `🩸 *Clan:* ${user.clan} (${user.bloodlineRarity})\n\n` +
                    `❤️ *HP:* ${user.hp.current}/${user.hp.max}\n` +
                    `⚡ *Chakra:* ${user.chakra.current}/${user.chakra.max}\n\n` +
                    `📈 *XP:* [${xpBarStr}] ${user.xp}/${xpNeeded(user.level)}\n` +
                    `🌟 *Total XP:* ${user.totalXp.toLocaleString()}\n\n` +
                    `💰 *Ryo:* ${user.ryo.toLocaleString()}\n` +
                    `💎 *Gems:* ${user.gems}\n\n` +
                    `🥋 *Jutsus:* ${user.equippedJutsus.join(', ') || 'None'}\n\n` +
                    `_!jutsus — view your moves | !shop — buy characters & skills_`;

                return await conn.sendMessage(from,
                    prepareImagePayload(getCharacterImage(user.character), profileMsg)
                );
            }

            // ════════════════════════════════════════════════════════════════
            // JUTSUS
            // ════════════════════════════════════════════════════════════════
            case 'jutsus': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                const char = CHARACTERS[user.character] || CHARACTERS.naruto;
                let jutsuList = `🥋 *${char.name} JUTSU LIST* 🥋\n\n`;

                char.jutsus.forEach(j => {
                    const owned    = user.unlockedJutsus.includes(j.id);
                    const equipped = user.equippedJutsus.includes(j.id);
                    jutsuList += `${owned ? '✅' : '🔒'} *${j.name}*\n`;
                    jutsuList += `   💧 Cost: ${j.cost} Chakra\n`;
                    jutsuList += `   📖 ${j.desc}\n`;
                    if (!owned) jutsuList += `   💰 Unlock: 2,000 Ryo\n`;
                    if (equipped) jutsuList += `   ⚡ _EQUIPPED_\n`;
                    jutsuList += '\n';
                });

                jutsuList += `_!buyjutsu [name] — unlock a jutsu_\n_!equip [name] — equip a jutsu_`;
                return await conn.sendMessage(from, { text: jutsuList });
            }

            // ════════════════════════════════════════════════════════════════
            // BUY JUTSU
            // ════════════════════════════════════════════════════════════════
            case 'buyjutsu': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                if (!rawText) return await conn.sendMessage(from, { text: '❌ Usage: !buyjutsu jutsu name' });

                const char = CHARACTERS[user.character] || CHARACTERS.naruto;
                const jutsu = char.jutsus.find(j =>
                    j.name.toLowerCase().includes(rawText.toLowerCase()) ||
                    j.id.toLowerCase().includes(rawText.toLowerCase())
                );

                if (!jutsu) return await conn.sendMessage(from, { text: `❌ Jutsu not found. Type !jutsus to see available moves.` });
                if (user.unlockedJutsus.includes(jutsu.id)) return await conn.sendMessage(from, { text: `❌ You already own *${jutsu.name}*!` });

                const JUTSU_COST = 2000;
                if (user.ryo < JUTSU_COST) return await conn.sendMessage(from, { text: `❌ Need ${JUTSU_COST} Ryo (have ${user.ryo})` });

                user.ryo -= JUTSU_COST;
                user.unlockedJutsus.push(jutsu.id);
                await user.save();

                return await conn.sendMessage(from, {
                    text: `✅ *Jutsu Unlocked!*\n\n🥋 *${jutsu.name}*\n💧 Chakra Cost: ${jutsu.cost}\n📖 ${jutsu.desc}\n\n💰 -${JUTSU_COST} Ryo\n\n_Type !equip ${jutsu.name} to equip it_`
                });
            }

            // ════════════════════════════════════════════════════════════════
            // TRAIN
            // ════════════════════════════════════════════════════════════════
            case 'train': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                const CHAKRA_COST = 30, XP_GAIN = 25;

                if (user.chakra.current < CHAKRA_COST) {
                    return await conn.sendMessage(from, {
                        text: `❌ *CHAKRA DEPLETED*\n\n⚡ ${user.chakra.current}/${user.chakra.max} (need ${CHAKRA_COST})\n⏳ Regen +10/min`
                    });
                }

                user.chakra.current -= CHAKRA_COST;
                const { leveledUp, rewards } = await addXP(user, XP_GAIN);

                let reply = `🏋️ *TRAINING COMPLETE*\n\n📉 -${CHAKRA_COST} Chakra\n📈 +${XP_GAIN} XP\n\n⚡ Chakra: ${user.chakra.current}/${user.chakra.max}\n📊 XP: ${user.xp}/${xpNeeded(user.level)}`;

                if (leveledUp) {
                    rewards.forEach(r => {
                        reply += `\n\n🎉 *LEVEL UP! Now Level ${r.level}!*\n💰 +${r.ryo} Ryo`;
                        if (r.gems > 0) reply += ` | +${r.gems} 💎`;
                        if (r.bonus) reply += `\n${r.bonus}`;
                    });
                }

                return await conn.sendMessage(from, { text: reply });
            }

            // ════════════════════════════════════════════════════════════════
            // BUY XP
            // ════════════════════════════════════════════════════════════════
            case 'buyxp': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }

                const XP_PACKAGES = [
                    { id: '1', xp: 500,   ryo: 2000,  gems: 0 },
                    { id: '2', xp: 1500,  ryo: 5000,  gems: 0 },
                    { id: '3', xp: 5000,  ryo: 15000, gems: 0 },
                    { id: '4', xp: 500,   ryo: 0,     gems: 1 },
                    { id: '5', xp: 1500,  ryo: 0,     gems: 2 },
                    { id: '6', xp: 5000,  ryo: 0,     gems: 5 },
                    { id: '7', xp: 15000, ryo: 0,     gems: 10 },
                ];

                const pkg = args[0];
                if (!pkg || !XP_PACKAGES.find(p => p.id === pkg)) {
                    let menu = `📈 *BUY XP PACKAGES*\n\n`;
                    XP_PACKAGES.forEach(p => {
                        menu += `*[${p.id}]* +${p.xp.toLocaleString()} XP — `;
                        menu += p.ryo > 0 ? `💰 ${p.ryo.toLocaleString()} Ryo` : `💎 ${p.gems} Gems`;
                        menu += '\n';
                    });
                    menu += `\n_Usage: !buyxp [package number]_`;
                    return await conn.sendMessage(from, { text: menu });
                }

                const selected = XP_PACKAGES.find(p => p.id === pkg);

                if (selected.ryo > 0 && user.ryo < selected.ryo) {
                    return await conn.sendMessage(from, { text: `❌ Need ${selected.ryo.toLocaleString()} Ryo (have ${user.ryo.toLocaleString()})` });
                }
                if (selected.gems > 0 && user.gems < selected.gems) {
                    return await conn.sendMessage(from, { text: `❌ Need ${selected.gems} Gems (have ${user.gems})` });
                }

                if (selected.ryo > 0) user.ryo -= selected.ryo;
                if (selected.gems > 0) user.gems -= selected.gems;

                const { leveledUp, rewards } = await addXP(user, selected.xp);

                let reply = `✅ *XP PURCHASED!*\n\n📈 +${selected.xp.toLocaleString()} XP\n`;
                reply += selected.ryo > 0 ? `💰 -${selected.ryo.toLocaleString()} Ryo\n` : `💎 -${selected.gems} Gems\n`;

                if (leveledUp) {
                    rewards.forEach(r => {
                        reply += `\n🎉 *LEVEL UP! Now Level ${r.level}!*\n💰 +${r.ryo} Ryo`;
                        if (r.gems > 0) reply += ` | +${r.gems} 💎`;
                        if (r.bonus) reply += `\n${r.bonus}`;
                    });
                }

                return await conn.sendMessage(from, { text: reply });
            }

            // ════════════════════════════════════════════════════════════════
            // MISSIONS
            // ════════════════════════════════════════════════════════════════
            case 'missions': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                return await conn.sendMessage(from, {
                    text: `📜 *MISSION BOARD*\n\n` +
                          `🟢 !mission d — D-Rank (20 Chakra | 150-300 Ryo | 20 XP)\n` +
                          `🔵 !mission c — C-Rank (40 Chakra | 500-900 Ryo | 50 XP)\n` +
                          `🔴 !mission b — B-Rank (60 Chakra | 1,200-2,500 Ryo | 120 XP)\n` +
                          `🔥 !mission a — A-Rank (80 Chakra | 3,000-5,000 Ryo | 200 XP)\n` +
                          `💀 !mission s — S-Rank (90 Chakra | 4,000-7,500 Ryo | 350 XP + Gems)`
                });
            }

            case 'mission': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }

                // Cooldown check — 5 minutes between missions
                const now = Date.now();
                if (user.lastMission && now - user.lastMission.getTime() < 5 * 60 * 1000) {
                    const wait = Math.ceil((5 * 60 * 1000 - (now - user.lastMission.getTime())) / 1000);
                    return await conn.sendMessage(from, { text: `⏳ Mission cooldown: ${wait}s remaining` });
                }

                const tier = args[0];
                const configs = {
                    d: { name: 'D-Rank: Catch Tora the Cat',      chakra: 20, minRyo: 150,  maxRyo: 300,  xp: 20,  baseSuccess: 100, failDmg: 0 },
                    c: { name: 'C-Rank: Escort Merchant Fleet',    chakra: 40, minRyo: 500,  maxRyo: 900,  xp: 50,  baseSuccess: 75,  failDmg: 80 },
                    b: { name: 'B-Rank: Neutralize Rogue Bandits', chakra: 60, minRyo: 1200, maxRyo: 2500, xp: 120, baseSuccess: 55,  failDmg: 180 },
                    a: { name: 'A-Rank: Infiltrate Enemy Base',    chakra: 80, minRyo: 3000, maxRyo: 5000, xp: 200, baseSuccess: 40,  failDmg: 250 },
                    s: { name: 'S-Rank: Engage Akatsuki',          chakra: 90, minRyo: 4000, maxRyo: 7500, xp: 350, baseSuccess: 30,  failDmg: 350 }
                };

                const cfg = configs[tier];
                if (!cfg) return await conn.sendMessage(from, { text: '❌ Unknown tier. Use: d, c, b, a, or s.' });
                if (user.hp.current <= 1) return await conn.sendMessage(from, { text: `🏥 Too injured! (${user.hp.current} HP)` });
                if (user.chakra.current < cfg.chakra) return await conn.sendMessage(from, { text: `❌ Need ${cfg.chakra} Chakra (have ${user.chakra.current})` });

                user.chakra.current -= cfg.chakra;
                user.lastMission = new Date();
                const successChance = Math.min(95, cfg.baseSuccess + (user.level - 1) * 2);

                if (Math.random() * 100 > successChance) {
                    const dmg = Math.min(user.hp.current - 1, cfg.failDmg);
                    user.hp.current -= dmg;
                    await user.save();
                    return await conn.sendMessage(from, {
                        text: `🚨 *MISSION FAILED — AMBUSHED!*\n\n🦅 ${cfg.name}\n📉 -${cfg.chakra} Chakra\n💔 -${dmg} HP`
                    });
                }

                const ryo  = Math.floor(Math.random() * (cfg.maxRyo - cfg.minRyo + 1)) + cfg.minRyo;
                const gems = (tier === 's' && Math.random() > 0.5) ? 1 : 0;
                user.ryo += ryo;
                if (gems) user.gems += gems;

                const { leveledUp, rewards } = await addXP(user, cfg.xp);

                let reply = `✅ *MISSION SUCCESS!*\n\n🦅 ${cfg.name}\n💰 +${ryo.toLocaleString()} Ryo | +${cfg.xp} XP`;
                if (gems) reply += ` | +${gems} 💎`;

                if (leveledUp) {
                    rewards.forEach(r => {
                        reply += `\n\n🎉 *LEVEL UP! Now Level ${r.level}!*\n💰 +${r.ryo} Ryo`;
                        if (r.gems > 0) reply += ` | +${r.gems} 💎`;
                        if (r.bonus) reply += `\n${r.bonus}`;
                    });
                }

                return await conn.sendMessage(from, { text: reply });
            }

            // ════════════════════════════════════════════════════════════════
            // SHOP
            // ════════════════════════════════════════════════════════════════
            case 'shop': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }

                const shopArg = args[0];

                if (!shopArg || shopArg === 'chars') {
                    let charList = `🛒 *NINJA CHARACTER SHOP* 🛒\n\n`;
                    charList += `_You own: ${user.ownedCharacters.join(', ')}_\n\n`;

                    Object.values(CHARACTERS).forEach(c => {
                        if (user.ownedCharacters.includes(c.id)) return;
                        charList += `${c.emoji} *${c.name}*\n`;
                        charList += `   Village: ${c.village} | Rarity: ${c.rarity}\n`;
                        charList += `   💰 ${c.price.toLocaleString()} Ryo\n\n`;
                    });

                    charList += `\n_!buy [character name] — purchase a character_\n`;
                    charList += `_!shop jutsus — buy jutsus for your character_\n`;
                    charList += `_!shop xp — buy XP packages_`;

                    return await conn.sendMessage(from,
                        prepareImagePayload('welcome', charList)
                    );
                }

                if (shopArg === 'xp') {
                    return await conn.sendMessage(from, { text: `Type !buyxp to see XP packages` });
                }

                break;
            }

            // ════════════════════════════════════════════════════════════════
            // BUY CHARACTER
            // ════════════════════════════════════════════════════════════════
            case 'buy': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                if (!rawText) return await conn.sendMessage(from, { text: '❌ Usage: !buy [character name]' });

                const foundChar = Object.values(CHARACTERS).find(c =>
                    c.name.toLowerCase().includes(rawText.toLowerCase()) ||
                    c.id.toLowerCase().includes(rawText.toLowerCase())
                );

                if (!foundChar) return await conn.sendMessage(from, { text: `❌ Character not found. Type !shop to browse.` });
                if (user.ownedCharacters.includes(foundChar.id)) return await conn.sendMessage(from, { text: `❌ You already own *${foundChar.name}*!` });
                if (user.ryo < foundChar.price) return await conn.sendMessage(from, { text: `❌ Need ${foundChar.price.toLocaleString()} Ryo (have ${user.ryo.toLocaleString()})` });

                user.ryo -= foundChar.price;
                user.ownedCharacters.push(foundChar.id);
                await user.save();

                return await conn.sendMessage(from,
                    prepareImagePayload(getCharacterImage(foundChar.id),
                        `✅ *CHARACTER UNLOCKED!*\n\n${foundChar.emoji} *${foundChar.name}*\n${foundChar.description}\n\n💰 -${foundChar.price.toLocaleString()} Ryo\n\n_Type !switch ${foundChar.name} to equip this character!_`
                    )
                );
            }

            // ════════════════════════════════════════════════════════════════
            // SWITCH CHARACTER
            // ════════════════════════════════════════════════════════════════
            case 'switch': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                if (!rawText) return await conn.sendMessage(from, { text: '❌ Usage: !switch [character name]' });

                const foundChar = Object.values(CHARACTERS).find(c =>
                    c.name.toLowerCase().includes(rawText.toLowerCase()) ||
                    c.id.toLowerCase().includes(rawText.toLowerCase())
                );

                if (!foundChar) return await conn.sendMessage(from, { text: `❌ Character not found.` });
                if (!user.ownedCharacters.includes(foundChar.id)) {
                    return await conn.sendMessage(from, { text: `❌ You don't own *${foundChar.name}*. Type !buy ${foundChar.name} to purchase.` });
                }

                user.character      = foundChar.id;
                user.hp.max         = foundChar.baseStats.hp + (user.level - 1) * 20;
                user.chakra.max     = foundChar.baseStats.chakra + (user.level - 1) * 15;
                user.hp.current     = user.hp.max;
                user.chakra.current = user.chakra.max;
                user.unlockedJutsus = [foundChar.jutsus[0].id];
                user.equippedJutsus = [foundChar.jutsus[0].id];
                await user.save();

                return await conn.sendMessage(from,
                    prepareImagePayload(getCharacterImage(foundChar.id),
                        `✅ *CHARACTER SWITCHED!*\n\n${foundChar.emoji} Now playing as *${foundChar.name}*\n${foundChar.description}\n\n❤️ HP: ${user.hp.max}\n⚡ Chakra: ${user.chakra.max}\n\n_Your jutsus have been reset to starter. Use !jutsus to unlock more!_`
                    )
                );
            }

            // ════════════════════════════════════════════════════════════════
            // LEADERBOARD
            // ════════════════════════════════════════════════════════════════
            case 'top':
            case 'leaderboard': {
                const topPlayers = await User.find({ registrationStep: 'COMPLETED' })
                    .sort({ totalXp: -1 })
                    .limit(10);

                let board = `🏆 *GLOBAL LEADERBOARD* 🏆\n\n`;
                topPlayers.forEach((p, i) => {
                    const char = CHARACTERS[p.character];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    board += `${medal} *${p.username}* ${p.isKage ? '👑' : ''}\n`;
                    board += `   ${char?.emoji || '🥷'} ${char?.name || 'Unknown'} | Lv.${p.level} | ${p.totalXp.toLocaleString()} XP\n`;
                    board += `   🏡 ${p.village} | 🩸 ${p.clan}\n\n`;
                });

                return await conn.sendMessage(from, { text: board });
            }

            // ════════════════════════════════════════════════════════════════
            // KAGE INFO
            // ════════════════════════════════════════════════════════════════
            case 'kage': {
                const village = args[0] ? args[0].charAt(0).toUpperCase() + args[0].slice(1) : user?.village;
                const kage = await User.findOne({ village, isKage: true });

                if (!kage) {
                    return await conn.sendMessage(from, {
                        text: `👑 *${village} KAGE*\n\nNo Kage elected yet!\n\n_Reach Level 100+ and win the weekly vote to become Kage!_`
                    });
                }

                const kageChar = CHARACTERS[kage.character];
                return await conn.sendMessage(from,
                    prepareImagePayload(getCharacterImage(kage.character),
                        `👑 *${village} KAGE* 👑\n\n` +
                        `👤 *${kage.username}*\n` +
                        `${kageChar?.emoji} ${kageChar?.name}\n` +
                        `🎖️ Level ${kage.level} | ${kage.totalXp.toLocaleString()} Total XP\n` +
                        `🗳️ Votes: ${kage.kageVotes}\n\n` +
                        `_Dethrone them by surpassing their XP and winning the vote!_`
                    )
                );
            }

            // ════════════════════════════════════════════════════════════════
            // SETNAME
            // ════════════════════════════════════════════════════════════════
            case 'setname': {
                if (!user || user.registrationStep !== 'COMPLETED') {
                    return await conn.sendMessage(from, { text: '❌ Register first! Type !start.' });
                }
                if (!rawText || rawText.length < 3 || rawText.length > 16) {
                    return await conn.sendMessage(from, { text: '❌ Name must be 3-16 chars. Usage: !setname YourName' });
                }
                const oldName  = user.username;
                user.username  = rawText;
                await user.save();
                return await conn.sendMessage(from, {
                    text: `✅ Name changed: *${oldName}* → *${rawText}*`
                });
            }

            // ════════════════════════════════════════════════════════════════
            // DONATE
            // ════════════════════════════════════════════════════════════════
            case 'donate': {
                return await conn.sendMessage(from, {
                    text: `💎 *DEVTRUST PREMIUM GEMS*\n\n${BRAND.moniepointDetails}\n\nSend proof to wa.me/${BRAND.billingSupportNumber}`
                });
            }

            // ════════════════════════════════════════════════════════════════
            // MENU
            // ════════════════════════════════════════════════════════════════
            case 'menu':
            case 'help': {
                return await conn.sendMessage(from, {
                    text: `🍥 *NARUTO RPG COMMANDS* 🍥\n\n` +
                          `🔰 *Start*\n!start — Register | !profile — Stats\n!setname — Change name\n\n` +
                          `⚔️ *Combat & Training*\n!train — Gain XP | !missions — Mission board\n!mission d/c/b/a/s — Run mission\n\n` +
                          `🥋 *Characters & Skills*\n!jutsus — View your moves\n!buyjutsu — Unlock a jutsu\n!switch — Change character\n\n` +
                          `📈 *Progression*\n!buyxp — Buy XP packages\n!top — Global leaderboard\n!kage — See village Kage\n\n` +
                          `🛒 *Shop*\n!shop — Buy characters\n!buy — Purchase a character\n!donate — Support the bot\n\n` +
                          `_More commands coming soon!_`
                });
            }

            // ════════════════════════════════════════════════════════════════
            // ADMIN COMMANDS
            // ════════════════════════════════════════════════════════════════
            case 'admin': {
                if (!isAdmin(senderJid)) {
                    return await conn.sendMessage(from, { text: '❌ Admin only.' });
                }

                const subCmd = args[0];

                if (!subCmd || subCmd === 'help') {
                    return await conn.sendMessage(from, {
                        text: `👑 *ADMIN PANEL*\n\n` +
                              `!admin stats — Server overview\n` +
                              `!admin give [number] ryo [amount]\n` +
                              `!admin give [number] gems [amount]\n` +
                              `!admin give [number] xp [amount]\n` +
                              `!admin ban [number]\n` +
                              `!admin unban [number]\n` +
                              `!admin setkage [village] [number]\n` +
                              `!admin reset [number] — Reset player data\n` +
                              `!admin broadcast [message]\n` +
                              `!admin startvote [village] — Start Kage election`
                    });
                }

                if (subCmd === 'stats') {
                    const total   = await User.countDocuments({ registrationStep: 'COMPLETED' });
                    const banned  = await User.countDocuments({ isBanned: true });
                    const kages   = await User.countDocuments({ isKage: true });
                    const topUser = await User.findOne({ registrationStep: 'COMPLETED' }).sort({ totalXp: -1 });

                    return await conn.sendMessage(from, {
                        text: `📊 *SERVER STATS*\n\n` +
                              `👥 Total Players: ${total}\n` +
                              `🚫 Banned: ${banned}\n` +
                              `👑 Active Kages: ${kages}\n` +
                              `🏆 Top Player: ${topUser?.username || 'None'} (Lv.${topUser?.level || 0})\n\n` +
                              `_Updated: ${new Date().toLocaleTimeString()}_`
                    });
                }

                if (subCmd === 'give') {
                    const targetNum  = args[1]?.replace('+', '');
                    const giveType   = args[2];
                    const giveAmount = parseInt(args[3]);

                    if (!targetNum || !giveType || isNaN(giveAmount)) {
                        return await conn.sendMessage(from, { text: '❌ Usage: !admin give [number] ryo/gems/xp [amount]' });
                    }

                    const targetJid = `${targetNum}@s.whatsapp.net`;
                    const target    = await User.findOne({ phoneId: targetJid });
                    if (!target) return await conn.sendMessage(from, { text: '❌ Player not found.' });

                    if (giveType === 'ryo') {
                        target.ryo += giveAmount;
                        await target.save();
                    } else if (giveType === 'gems') {
                        target.gems += giveAmount;
                        await target.save();
                    } else if (giveType === 'xp') {
                        await addXP(target, giveAmount);
                    } else {
                        return await conn.sendMessage(from, { text: '❌ Type must be ryo, gems, or xp' });
                    }

                    await conn.sendMessage(from, { text: `✅ Gave ${giveAmount} ${giveType} to ${target.username}` });

                    // Notify the player
                    try {
                        await conn.sendMessage(targetJid, {
                            text: `🎁 *ADMIN GIFT!*\n\nYou received *${giveAmount} ${giveType}* from the admin!\n\nType !profile to see your updated stats.`
                        });
                    } catch {}
                    return;
                }

                if (subCmd === 'ban') {
                    const targetNum = args[1]?.replace('+', '');
                    const target    = await User.findOne({ phoneId: `${targetNum}@s.whatsapp.net` });
                    if (!target) return await conn.sendMessage(from, { text: '❌ Player not found.' });
                    target.isBanned = true;
                    await target.save();
                    return await conn.sendMessage(from, { text: `✅ Banned ${target.username}` });
                }

                if (subCmd === 'unban') {
                    const targetNum = args[1]?.replace('+', '');
                    const target    = await User.findOne({ phoneId: `${targetNum}@s.whatsapp.net` });
                    if (!target) return await conn.sendMessage(from, { text: '❌ Player not found.' });
                    target.isBanned = false;
                    await target.save();
                    return await conn.sendMessage(from, { text: `✅ Unbanned ${target.username}` });
                }

                if (subCmd === 'setkage') {
                    const village   = args[1] ? args[1].charAt(0).toUpperCase() + args[1].slice(1) : null;
                    const targetNum = args[2]?.replace('+', '');

                    if (!village || !targetNum) {
                        return await conn.sendMessage(from, { text: '❌ Usage: !admin setkage [village] [number]' });
                    }

                    // Remove old kage
                    await User.updateMany({ village, isKage: true }, { isKage: false, kageVotes: 0 });

                    const target = await User.findOne({ phoneId: `${targetNum}@s.whatsapp.net` });
                    if (!target) return await conn.sendMessage(from, { text: '❌ Player not found.' });

                    target.isKage    = true;
                    target.kageVotes = 0;
                    await target.save();

                    return await conn.sendMessage(from, { text: `✅ ${target.username} is now ${village} Kage!` });
                }

                if (subCmd === 'reset') {
                    const targetNum = args[1]?.replace('+', '');
                    const deleted   = await User.deleteOne({ phoneId: `${targetNum}@s.whatsapp.net` });
                    return await conn.sendMessage(from, {
                        text: deleted.deletedCount > 0 ? `✅ Player data reset.` : `❌ Player not found.`
                    });
                }

                if (subCmd === 'broadcast') {
                    const message = rawText.replace(/^broadcast\s*/i, '');
                    if (!message) return await conn.sendMessage(from, { text: '❌ Usage: !admin broadcast Your message here' });

                    const allPlayers = await User.find({ registrationStep: 'COMPLETED' });
                    let sent = 0;
                    for (const p of allPlayers) {
                        try {
                            await conn.sendMessage(p.phoneId, {
                                text: `📢 *ADMIN BROADCAST*\n\n${message}`
                            });
                            sent++;
                            await new Promise(r => setTimeout(r, 500));
                        } catch {}
                    }
                    return await conn.sendMessage(from, { text: `✅ Broadcast sent to ${sent} players.` });
                }

                if (subCmd === 'startvote') {
                    const village = args[1] ? args[1].charAt(0).toUpperCase() + args[1].slice(1) : null;
                    if (!village) return await conn.sendMessage(from, { text: '❌ Usage: !admin startvote [village]' });

                    const endTime = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
                    activeVotes.set(village, { candidates: {}, endTime, voted: new Set() });

                    // Get eligible candidates (level 100+)
                    const candidates = await User.find({ village, level: { $gte: 100 }, registrationStep: 'COMPLETED' })
                        .sort({ totalXp: -1 }).limit(5);

                    let voteMsg = `🗳️ *${village.toUpperCase()} KAGE ELECTION STARTED!*\n\n`;
                    voteMsg += `_Vote ends in 24 hours_\n\n*Candidates:*\n`;

                    candidates.forEach(c => {
                        voteMsg += `• ${c.username} (Lv.${c.level}) — !vote ${c.phoneId.replace('@s.whatsapp.net', '')}\n`;
                    });

                    if (candidates.length === 0) {
                        voteMsg += `_No eligible candidates (need Level 100+)_`;
                    }

                    return await conn.sendMessage(from, { text: voteMsg });
                }

                break;
            }

            default:
                break;
        }
    } catch (err) {
        console.error('❌ [CASE] Error:', err);
    }
};

module.exports.activeExams  = activeExams;
module.exports.activeFights = activeFights;
