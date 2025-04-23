require('dotenv').config();

const config = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY
};

module.exports = config; 