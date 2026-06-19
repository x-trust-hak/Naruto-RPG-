// src/mediaEngine.js
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '../images');

/**
 * Load image as buffer from local file
 */
function loadImage(name) {
    try {
        const filePath = path.join(IMAGES_DIR, `${name}.jpg`);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Prepare image message payload for Baileys
 * Falls back to text-only if image not found
 */
function prepareImagePayload(imageName, caption) {
    const buffer = loadImage(imageName);
    if (!buffer) {
        return { text: caption };
    }
    return {
        image: buffer,
        caption,
        mimetype: 'image/jpeg'
    };
}

// Character image mapping
// Each character can have multiple images for different moods/situations
const CHARACTER_IMAGES = {
    naruto:     ['naruto', 'naruto2'],
    sasuke:     ['welcome'],     // placeholder until you send Sasuke image
    sakura:     ['welcome'],
    kakashi:    ['welcome'],
    itachi:     ['akatsuki'],
    gaara:      ['gaara4', 'gaara3', 'gaara5'],
    obito:      ['obito', 'obito_kid'],
    minato:     ['welcome'],
    pain:       ['akatsuki'],
    kisame:     ['akatsuki'],
    zabuza:     ['welcome'],
    killer_bee: ['welcome'],
    deidara:    ['akatsuki'],
    sasori:     ['akatsuki'],
    neji:       ['welcome'],
    rock_lee:   ['welcome'],
    jiraiya:    ['welcome'],
    tsunade:    ['welcome'],
    konan:      ['akatsuki'],
    raikage:    ['welcome'],
};

// Get main profile image for a character
function getCharacterImage(characterId) {
    const images = CHARACTER_IMAGES[characterId];
    if (!images || images.length === 0) return 'welcome';
    return images[0];
}

// Get battle image for a character (more intense)
function getBattleImage(characterId) {
    const images = CHARACTER_IMAGES[characterId];
    if (!images || images.length === 0) return 'welcome';
    return images[images.length - 1]; // last image tends to be most intense
}

// Village banner images
const VILLAGE_IMAGES = {
    Leaf:  'welcome',
    Sand:  'gaara3',
    Mist:  'welcome',
    Cloud: 'welcome',
    Stone: 'welcome',
    Rain:  'akatsuki',
};

module.exports = {
    prepareImagePayload,
    getCharacterImage,
    getBattleImage,
    VILLAGE_IMAGES,
    loadImage
};
