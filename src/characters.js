// src/characters.js
// All 20 starter characters with base stats and jutsus

const CHARACTERS = {
    naruto: {
        id: 'naruto',
        name: 'Naruto Uzumaki',
        village: 'Leaf',
        rarity: 'Legendary',
        price: 0, // free (starter pool)
        emoji: '🍥',
        description: 'The unpredictable ninja who never gives up!',
        baseStats: {
            hp: 500, chakra: 600, attack: 85, defense: 60, speed: 75, crit: 15
        },
        passive: '🦊 Nine-Tails Chakra: +20% chakra regeneration',
        jutsus: [
            { id: 'shadow_clone', name: 'Shadow Clone Jutsu', cost: 30, damage: 80, desc: 'Creates clones that overwhelm the enemy' },
            { id: 'rasengan', name: 'Rasengan', cost: 60, damage: 180, desc: 'Spiraling sphere of pure chakra' },
            { id: 'sage_mode', name: 'Sage Mode', cost: 100, damage: 0, buff: { attack: 50, defense: 30 }, desc: 'Harness nature chakra for massive power boost' }
        ]
    },
    sasuke: {
        id: 'sasuke',
        name: 'Sasuke Uchiha',
        village: 'Leaf',
        rarity: 'Legendary',
        price: 0,
        emoji: '⚡',
        description: 'Last survivor of the Uchiha clan',
        baseStats: {
            hp: 420, chakra: 500, attack: 95, defense: 55, speed: 95, crit: 25
        },
        passive: '🔴 Sharingan: 20% chance to dodge any attack',
        jutsus: [
            { id: 'fireball', name: 'Great Fireball Jutsu', cost: 35, damage: 100, desc: 'Massive ball of fire' },
            { id: 'chidori', name: 'Chidori', cost: 65, damage: 200, desc: 'Lightning blade that pierces anything' },
            { id: 'susanoo', name: "Susano'o", cost: 120, damage: 0, buff: { defense: 100, attack: 60 }, desc: 'Spectral warrior armor' }
        ]
    },
    sakura: {
        id: 'sakura',
        name: 'Sakura Haruno',
        village: 'Leaf',
        rarity: 'Rare',
        price: 0,
        emoji: '🌸',
        description: 'Medical ninja with monstrous strength',
        baseStats: {
            hp: 600, chakra: 450, attack: 70, defense: 75, speed: 65, crit: 10
        },
        passive: '💊 Medical Ninjutsu: Heals 50 HP each turn',
        jutsus: [
            { id: 'cherry_punch', name: 'Cherry Blossom Impact', cost: 25, damage: 150, desc: 'Earth-shattering punch' },
            { id: 'healing', name: 'Mystical Palm Healing', cost: 40, damage: -200, desc: 'Restore 200 HP' },
            { id: 'hundred_seal', name: 'Hundred Healings Seal', cost: 90, damage: 0, buff: { hp: 300 }, desc: 'Stored chakra bursts — massive HP restore' }
        ]
    },
    kakashi: {
        id: 'kakashi',
        name: 'Kakashi Hatake',
        village: 'Leaf',
        rarity: 'Epic',
        price: 8000,
        emoji: '📖',
        description: 'Copy Ninja — master of 1000 jutsus',
        baseStats: {
            hp: 460, chakra: 520, attack: 88, defense: 70, speed: 80, crit: 20
        },
        passive: '👁️ Sharingan Copy: Can copy enemy jutsu once per battle',
        jutsus: [
            { id: 'lightning_blade', name: 'Lightning Blade', cost: 50, damage: 160, desc: 'Perfected Chidori' },
            { id: 'kamui', name: 'Kamui', cost: 80, damage: 0, buff: { evasion: 50 }, desc: 'Teleport through dimensions' },
            { id: 'purple_lightning', name: 'Purple Lightning', cost: 70, damage: 220, desc: 'Lightning release mastery' }
        ]
    },
    itachi: {
        id: 'itachi',
        name: 'Itachi Uchiha',
        village: 'Akatsuki',
        rarity: 'Legendary',
        price: 25000,
        emoji: '🪶',
        description: 'The greatest Uchiha — sacrificed everything',
        baseStats: {
            hp: 400, chakra: 580, attack: 90, defense: 65, speed: 90, crit: 30
        },
        passive: '🌙 Genjutsu Master: 25% chance to put enemy in illusion (skip turn)',
        jutsus: [
            { id: 'amaterasu', name: 'Amaterasu', cost: 80, damage: 250, desc: 'Black flames that never extinguish' },
            { id: 'tsukuyomi', name: 'Tsukuyomi', cost: 70, damage: 0, buff: { stun: 2 }, desc: 'Trap enemy in mental torture' },
            { id: 'susanoo_itachi', name: "Itachi's Susano'o", cost: 110, damage: 200, desc: 'Totsuka blade seals anything it touches' }
        ]
    },
    gaara: {
        id: 'gaara',
        name: 'Gaara of the Sand',
        village: 'Sand',
        rarity: 'Epic',
        price: 0,
        emoji: '🏜️',
        description: 'Jinchuriki of the One-Tail — Sand Kazekage',
        baseStats: {
            hp: 700, chakra: 400, attack: 75, defense: 120, speed: 55, crit: 10
        },
        passive: '🛡️ Sand Shield: Automatically blocks first attack each battle',
        jutsus: [
            { id: 'sand_coffin', name: 'Sand Coffin', cost: 40, damage: 130, desc: 'Trap enemy in crushing sand' },
            { id: 'sand_burial', name: 'Sand Burial', cost: 70, damage: 220, desc: 'Crush the enemy completely' },
            { id: 'shukaku', name: 'Shukaku Release', cost: 120, damage: 300, desc: 'Unleash the One-Tail beast' }
        ]
    },
    obito: {
        id: 'obito',
        name: 'Obito Uchiha',
        village: 'Akatsuki',
        rarity: 'Legendary',
        price: 30000,
        emoji: '🌀',
        description: 'The man behind the mask — Tobi',
        baseStats: {
            hp: 450, chakra: 560, attack: 85, defense: 80, speed: 85, crit: 20
        },
        passive: '👻 Intangibility: 20% chance to phase through any attack',
        jutsus: [
            { id: 'kamui_obito', name: 'Kamui Warp', cost: 60, damage: 0, buff: { evasion: 70 }, desc: 'Warp self or enemy to another dimension' },
            { id: 'wood_style', name: 'Wood Style: Cutting Technique', cost: 50, damage: 140, desc: 'Hashirama cells unleashed' },
            { id: 'rinne_sharingan', name: 'Rinne Sharingan', cost: 110, damage: 280, desc: 'Infinite Tsukuyomi power' }
        ]
    },
    minato: {
        id: 'minato',
        name: 'Minato Namikaze',
        village: 'Leaf',
        rarity: 'Legendary',
        price: 50000,
        emoji: '⚡',
        description: 'The Yellow Flash — Fourth Hokage',
        baseStats: {
            hp: 430, chakra: 550, attack: 92, defense: 60, speed: 120, crit: 22
        },
        passive: '💛 Yellow Flash: Always attacks first regardless of speed',
        jutsus: [
            { id: 'flying_thunder', name: 'Flying Thunder God', cost: 45, damage: 0, buff: { speed: 80 }, desc: 'Teleport to marked location instantly' },
            { id: 'rasengan_minato', name: 'Rasengan', cost: 55, damage: 170, desc: 'Original creator technique' },
            { id: 'reaper_seal', name: 'Reaper Death Seal', cost: 150, damage: 500, desc: 'Ultimate sacrifice — massive damage' }
        ]
    },
    pain: {
        id: 'pain',
        name: 'Pain (Nagato)',
        village: 'Rain',
        rarity: 'Legendary',
        price: 35000,
        emoji: '👁️',
        description: 'Leader of Akatsuki — God of the ninja world',
        baseStats: {
            hp: 480, chakra: 620, attack: 100, defense: 70, speed: 70, crit: 15
        },
        passive: '🌊 Rinnegan: Can use all five nature releases',
        jutsus: [
            { id: 'almighty_push', name: 'Almighty Push', cost: 60, damage: 180, desc: 'Repel everything in range' },
            { id: 'universal_pull', name: 'Universal Pull', cost: 60, damage: 160, desc: 'Pull everything toward center' },
            { id: 'planetary_devastation', name: 'Planetary Devastation', cost: 130, damage: 350, desc: 'Trap enemy in a floating rock prison' }
        ]
    },
    kisame: {
        id: 'kisame',
        name: 'Kisame Hoshigaki',
        village: 'Mist',
        rarity: 'Epic',
        price: 12000,
        emoji: '🦈',
        description: 'Monster of the Hidden Mist',
        baseStats: {
            hp: 650, chakra: 700, attack: 88, defense: 80, speed: 60, crit: 12
        },
        passive: '💧 Chakra Drain: Steals 20 chakra from enemy each turn',
        jutsus: [
            { id: 'samehada', name: 'Samehada Slash', cost: 35, damage: 120, desc: 'Sword that absorbs chakra' },
            { id: 'water_prison', name: 'Water Prison Jutsu', cost: 50, damage: 0, buff: { stun: 1 }, desc: 'Trap enemy in water prison' },
            { id: 'shark_bomb', name: 'Five Shark Missiles', cost: 90, damage: 280, desc: 'Five water sharks devour the enemy' }
        ]
    },
    zabuza: {
        id: 'zabuza',
        name: 'Zabuza Momochi',
        village: 'Mist',
        rarity: 'Rare',
        price: 6000,
        emoji: '⚔️',
        description: 'Demon of the Hidden Mist',
        baseStats: {
            hp: 500, chakra: 380, attack: 100, defense: 65, speed: 70, crit: 18
        },
        passive: '🌫️ Silent Killing: First strike always crits',
        jutsus: [
            { id: 'mist_jutsu', name: 'Hidden Mist Jutsu', cost: 30, damage: 0, buff: { evasion: 40 }, desc: 'Cover battlefield in mist' },
            { id: 'cleaver_sword', name: 'Executioner Blade', cost: 55, damage: 190, desc: 'Massive blade that crushes enemies' },
            { id: 'water_dragon', name: 'Water Dragon Bullet', cost: 75, damage: 230, desc: 'Dragon made of water' }
        ]
    },
    killer_bee: {
        id: 'killer_bee',
        name: 'Killer Bee',
        village: 'Cloud',
        rarity: 'Epic',
        price: 15000,
        emoji: '🐝',
        description: 'Jinchuriki of the Eight-Tails — Rap God',
        baseStats: {
            hp: 580, chakra: 520, attack: 92, defense: 75, speed: 78, crit: 20
        },
        passive: '🎤 Eight-Tails Power: Random +30% damage boost chance',
        jutsus: [
            { id: 'seven_swords', name: 'Seven Swords Dance', cost: 50, damage: 160, desc: 'Attack with all seven swords simultaneously' },
            { id: 'lariat', name: 'Double Lariat', cost: 65, damage: 200, desc: 'Lightning-powered clothesline' },
            { id: 'gyuki_mode', name: 'Eight-Tails Mode', cost: 120, damage: 320, desc: 'Transform with Gyuki for ultimate power' }
        ]
    },
    deidara: {
        id: 'deidara',
        name: 'Deidara',
        village: 'Stone',
        rarity: 'Epic',
        price: 14000,
        emoji: '💥',
        description: 'Art is an explosion!',
        baseStats: {
            hp: 380, chakra: 600, attack: 95, defense: 45, speed: 85, crit: 22
        },
        passive: '🎨 Explosive Art: All attacks have 15% chance of double explosion',
        jutsus: [
            { id: 'clay_bird', name: 'Clay Bird Bomb', cost: 40, damage: 140, desc: 'Explosive clay bird' },
            { id: 'c3', name: 'C3 Mega Bomb', cost: 80, damage: 260, desc: 'Giant bomb destroys everything' },
            { id: 'c0', name: 'C0 Ultimate Art', cost: 150, damage: 400, desc: 'Self-destruct explosion — ultimate sacrifice' }
        ]
    },
    sasori: {
        id: 'sasori',
        name: 'Sasori of the Red Sand',
        village: 'Sand',
        rarity: 'Epic',
        price: 13000,
        emoji: '🪆',
        description: 'Human puppet master',
        baseStats: {
            hp: 420, chakra: 480, attack: 85, defense: 90, speed: 60, crit: 15
        },
        passive: '☠️ Poison Master: All attacks apply 20 poison damage per turn',
        jutsus: [
            { id: 'puppet_attack', name: 'Puppet Assault', cost: 35, damage: 110, desc: 'Puppet swarm attack' },
            { id: 'iron_sand', name: 'Iron Sand World Order', cost: 75, damage: 220, desc: 'Iron sand kills everything in range' },
            { id: 'hiruko', name: 'Hiruko Puppet', cost: 90, damage: 0, buff: { defense: 80, attack: 40 }, desc: 'Enter ultimate puppet armor' }
        ]
    },
    neji: {
        id: 'neji',
        name: 'Neji Hyuga',
        village: 'Leaf',
        rarity: 'Rare',
        price: 7000,
        emoji: '👁️',
        description: 'Hyuga prodigy — Byakugan master',
        baseStats: {
            hp: 450, chakra: 460, attack: 80, defense: 80, speed: 75, crit: 25
        },
        passive: '⭕ Byakugan: See all chakra points — 20% chance to seal enemy chakra',
        jutsus: [
            { id: 'gentle_fist', name: 'Eight Trigrams Sixty-Four Palms', cost: 55, damage: 170, desc: 'Strike all chakra points' },
            { id: 'rotation', name: 'Eight Trigrams Rotation', cost: 45, damage: 0, buff: { defense: 60, reflect: 30 }, desc: 'Spin to reflect attacks' },
            { id: '128_palms', name: 'One Hundred Twenty-Eight Palms', cost: 90, damage: 280, desc: 'Ultimate Gentle Fist barrage' }
        ]
    },
    rock_lee: {
        id: 'rock_lee',
        name: 'Rock Lee',
        village: 'Leaf',
        rarity: 'Rare',
        price: 5000,
        emoji: '🥋',
        description: 'Genius of hard work — no ninjutsu needed',
        baseStats: {
            hp: 520, chakra: 100, attack: 110, defense: 70, speed: 100, crit: 20
        },
        passive: '💪 Eight Gates: Can open gates for massive temporary power boost',
        jutsus: [
            { id: 'primary_lotus', name: 'Primary Lotus', cost: 20, damage: 150, desc: 'High-speed taijutsu barrage' },
            { id: 'reverse_lotus', name: 'Reverse Lotus', cost: 40, damage: 250, desc: 'Maximum taijutsu — opens inner gates' },
            { id: 'eighth_gate', name: 'Eight Gates Release', cost: 80, damage: 400, desc: 'Transcend human limits — massive damage but lose HP' }
        ]
    },
    jiraiya: {
        id: 'jiraiya',
        name: 'Jiraiya',
        village: 'Leaf',
        rarity: 'Epic',
        price: 18000,
        emoji: '📚',
        description: 'The Toad Sage — legendary Sannin',
        baseStats: {
            hp: 550, chakra: 580, attack: 85, defense: 70, speed: 65, crit: 15
        },
        passive: '🐸 Sage Mode: Natural energy boosts all stats by 15%',
        jutsus: [
            { id: 'rasengan_jiraiya', name: 'Giant Rasengan', cost: 55, damage: 180, desc: 'Massive spiraling sphere' },
            { id: 'toad_summon', name: 'Summoning: Toad Boss', cost: 70, damage: 200, desc: 'Summon Gamabunta' },
            { id: 'sage_rasengan', name: 'Sage Art: Big Ball Rasengan', cost: 110, damage: 320, desc: 'Sage mode powered Rasengan' }
        ]
    },
    tsunade: {
        id: 'tsunade',
        name: 'Tsunade',
        village: 'Leaf',
        rarity: 'Epic',
        price: 16000,
        emoji: '💎',
        description: 'Fifth Hokage — Legendary Sannin',
        baseStats: {
            hp: 800, chakra: 500, attack: 90, defense: 85, speed: 60, crit: 15
        },
        passive: '💚 Regeneration Seal: Revive once per battle with 50% HP',
        jutsus: [
            { id: 'strength_of_hundred', name: 'Strength of a Hundred Seal', cost: 60, damage: 200, desc: 'Release stored chakra for monster punch' },
            { id: 'healing_tsunade', name: 'Mitotic Regeneration', cost: 50, damage: -300, desc: 'Restore 300 HP' },
            { id: 'creation_rebirth', name: 'Creation Rebirth', cost: 100, damage: 0, buff: { hp: 500, defense: 50 }, desc: 'Regenerate all cells — ultimate heal' }
        ]
    },
    konan: {
        id: 'konan',
        name: 'Konan',
        village: 'Rain',
        rarity: 'Rare',
        price: 9000,
        emoji: '📄',
        description: 'Angel of the Rain Village',
        baseStats: {
            hp: 420, chakra: 530, attack: 78, defense: 72, speed: 80, crit: 18
        },
        passive: '🌧️ Paper Shield: 15% damage reduction from all attacks',
        jutsus: [
            { id: 'paper_shuriken', name: 'Paper Shuriken Barrage', cost: 30, damage: 100, desc: 'Thousands of paper shuriken' },
            { id: 'paper_person', name: 'Paper Person of God', cost: 65, damage: 200, desc: 'Transform into billions of paper bombs' },
            { id: 'kami_no_shisha', name: 'Kami no Shisha', cost: 110, damage: 350, desc: '600 billion paper bombs — ultimate technique' }
        ]
    },
    raikage: {
        id: 'raikage',
        name: 'A (Fourth Raikage)',
        village: 'Cloud',
        rarity: 'Epic',
        price: 20000,
        emoji: '⚡',
        description: 'Strongest Raikage — pure power and speed',
        baseStats: {
            hp: 600, chakra: 400, attack: 115, defense: 90, speed: 110, crit: 15
        },
        passive: '⚡ Lightning Armor: Increases speed by 30% and shocks attackers',
        jutsus: [
            { id: 'lightning_armor', name: 'Lightning Release Armor', cost: 50, damage: 0, buff: { speed: 60, attack: 40 }, desc: 'Encase body in lightning' },
            { id: 'lariat_a', name: 'Lariat', cost: 60, damage: 210, desc: 'Lightning-powered arm strike' },
            { id: 'double_lariat_a', name: 'Double Lariat', cost: 90, damage: 320, desc: 'Double team lariat with Killer Bee' }
        ]
    }
};

// Free starter characters (randomly assigned on !start)
const FREE_CHARACTERS = ['naruto', 'sasuke', 'sakura', 'gaara', 'rock_lee', 'neji', 'zabuza'];

// XP required for each level
function xpForLevel(level) {
    return level * 500;
}

// Total XP needed to reach a level from 0
function totalXpForLevel(level) {
    let total = 0;
    for (let i = 1; i < level; i++) total += xpForLevel(i);
    return total;
}

module.exports = { CHARACTERS, FREE_CHARACTERS, xpForLevel, totalXpForLevel };
