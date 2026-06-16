// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    phoneId: { type: String, required: true, unique: true },
    username: { type: String, default: "Genin Traveler" },
    village: { type: String, default: "None" },
    clan: { type: String, default: "None" },
    bloodlineRarity: { type: String, default: "None" },
    rank: { type: String, default: "Academy Student" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    ryo: { type: Number, default: 1000 },
    gems: { type: Number, default: 5 },
    chakra: { current: { type: Number, default: 100 }, max: { type: Number, default: 100 } },
    hp: { current: { type: Number, default: 500 }, max: { type: Number, default: 500 } },
    equippedJutsu: { type: [String], default: ["Substitution Jutsu"] },
    inventory: { type: [String], default: ["Kunai"] },
    registrationStep: { type: String, default: "NONE" }, // Tracks onboarding flow
    lastDaily: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
