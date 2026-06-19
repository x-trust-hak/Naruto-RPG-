// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    phoneId:          { type: String, required: true, unique: true },
    username:         { type: String, default: 'Ninja' },
    village:          { type: String, default: 'None' },
    clan:             { type: String, default: 'None' },
    bloodlineRarity:  { type: String, default: 'None' },
    rank:             { type: String, default: 'Academy Student' },

    // Character system
    character:        { type: String, default: 'naruto' },
    ownedCharacters:  { type: [String], default: [] },
    unlockedJutsus:   { type: [String], default: [] },
    equippedJutsus:   { type: [String], default: [] },

    // XP & Level — XP never resets, keeps accumulating
    level:            { type: Number, default: 1 },
    xp:               { type: Number, default: 0 },       // current level XP progress
    totalXp:          { type: Number, default: 0 },       // lifetime XP (never resets)

    // Currency
    ryo:              { type: Number, default: 1000 },
    gems:             { type: Number, default: 5 },

    // Stats (based on character base + level bonuses)
    hp:     { current: { type: Number, default: 500 }, max: { type: Number, default: 500 } },
    chakra: { current: { type: Number, default: 500 }, max: { type: Number, default: 500 } },

    // Kage/title system
    isKage:           { type: Boolean, default: false },
    kageVotes:        { type: Number, default: 0 },

    // Inventory
    inventory:        { type: [String], default: [] },

    // Admin
    isBanned:         { type: Boolean, default: false },
    isAdmin:          { type: Boolean, default: false },

    // Onboarding
    registrationStep: { type: String, default: 'NONE' },
    lastDaily:        { type: Date, default: null },
    lastMission:      { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
