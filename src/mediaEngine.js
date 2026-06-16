// src/mediaEngine.js
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// High-quality static graphic URLs representing the villages and banners
const GRAPHICS = {
    WELCOME_BANNER: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&q=80", // Premium Anime Stylized Banner
    VILLAGE_LEAF: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&q=80",
    VILLAGE_SAND: "https://images.unsplash.com/photo-1547234935-80c7145ec969?w=600&q=80",
    VILLAGE_MIST: "https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=600&q=80",
    VILLAGE_CLOUD: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=600&q=80",
    VILLAGE_STONE: "https://images.unsplash.com/photo-1504198453319-5ce911bafcde?w=600&q=80",
    SHOP_BANNER: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80"
};

/**
 * Safely fetches an image from an external URL and wraps it into a clean Baileys message config.
 * @param {string} url - Target asset link
 * @param {string} caption - Accompanying textual scroll info
 */
function prepareImagePayload(url, caption) {
    return {
        image: { url: url },
        caption: caption,
        mimetype: "image/jpeg"
    };
}

module.exports = { GRAPHICS, prepareImagePayload };
