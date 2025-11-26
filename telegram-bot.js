const { Telegraf } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const backendPort = process.env.PORT || 8080;
const backendUrl = process.env.BACKEND_URL || `http://localhost:${backendPort}`;

console.log(`✅ Telegram bot initialized with backend: ${backendUrl}`);

// Track users waiting for phone number
const waitingForPhone = new Set();

// Start command
bot.start(async (ctx) => {
  try {
    await ctx.reply(
      `✨ *Welcome to iDev WhatsApp Hub!* ✨\n\n` +
      `This bot helps you connect your WhatsApp account and manage your groups.\n\n` +
      `🔄 *How it works:*\n` +
      `1. Use /pair command\n` +
      `2. Send your phone number\n` +
      `3. Get pairing code from us\n` +
      `4. Scan QR code in WhatsApp\n` +
      `5. Start managing your groups!\n\n` +
      `📱 To get started, use: /pair`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Error in /start:', err);
    await ctx.reply('❌ Error occurred. Please try again.');
  }
});

// Pair command
bot.command('pair', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    // Check status via backend
    try {
      const statusResponse = await axios.get(`${backendUrl}/api/user-status/${telegramId}`);
      if (statusResponse.data.isConnected) {
        return await ctx.reply('✅ You\'re already connected! Use /help for commands.');
      }
    } catch (err) {
      // User doesn't exist yet, that's fine - continue with pairing
    }

    waitingForPhone.add(telegramId);
    await ctx.reply(
      `📱 *Ready to pair!*\n\n` +
      `Please send your phone number with country code:\n\n` +
      `Example: 1234567890`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Error in /pair:', err);
    await ctx.reply('❌ Error occurred. Please try again.');
  }
});

// Help command
bot.command('help', async (ctx) => {
  try {
    await ctx.reply(
      `📚 *Help & Commands*\n\n` +
      `/start - Start the bot\n` +
      `/pair - Pair your WhatsApp account\n` +
      `/status - Check connection status\n` +
      `/help - Show this message\n\n` +
      `📱 To connect WhatsApp, use /pair first!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Error in /help:', err);
  }
});

// Status command
bot.command('status', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    try {
      const statusResponse = await axios.get(`${backendUrl}/api/user-status/${telegramId}`);
      const userInfo = statusResponse.data;
      const status = userInfo.isConnected ? '✅ Connected' : '⏳ Connecting...';

      await ctx.reply(
        `📊 *Your Connection Status*\n\n` +
        `Phone: ${userInfo.phoneNumber}\n` +
        `Status: ${status}\n` +
        `Connected Since: ${userInfo.createdAt}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.reply('❌ You haven\'t connected yet. Use /pair to start!');
    }
  } catch (err) {
    console.error('Error in /status:', err);
    await ctx.reply('❌ Error checking status');
  }
});

// Handle text messages (phone numbers)
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;
    const telegramId = ctx.from.id;

    // Only process if user sent /pair command first
    if (!waitingForPhone.has(telegramId)) {
      return await ctx.reply('❌ Please use /pair command first to start pairing.');
    }

    // Check if it's a phone number (digits only)
    if (!/^\d{10,15}$/.test(text)) {
      return await ctx.reply('❌ Please send a valid phone number with country code (digits only)\n\nExample: 1234567890');
    }

    // Remove from waiting set
    waitingForPhone.delete(telegramId);

    // Call backend to initiate connection
    const response = await axios.post(`${backendUrl}/api/initiate-connection`, {
      telegramId,
      phoneNumber: text,
    });

    if (response.data.success) {
      const userId = response.data.userId;
      
      await ctx.reply(
        `⏳ *Generating Pairing Code...*\n\n` +
        `Please wait while we connect to WhatsApp and generate your pairing code.`,
        { parse_mode: 'Markdown' }
      );

      // Poll for pairing code
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        
        try {
          const codeResponse = await axios.get(`${backendUrl}/api/pairing-code/${userId}`);
          
          if (codeResponse.data.pairingCode) {
            clearInterval(pollInterval);
            await ctx.reply(
              `✅ *Your Pairing Code is Ready!*\n\n` +
              `📱 Use this code to connect:\n\n` +
              `\`\`\`\n${codeResponse.data.pairingCode}\n\`\`\`\n\n` +
              `🔗 *How to pair:*\n` +
              `1. Open WhatsApp on your phone\n` +
              `2. Go to Settings → Linked devices\n` +
              `3. Select "Link a device"\n` +
              `4. Enter this code when prompted`,
              { parse_mode: 'Markdown' }
            );
          } else if (attempts > 120) {
            // Timeout after 2 minutes
            clearInterval(pollInterval);
            await ctx.reply('❌ Pairing code generation timeout. Please try again with /pair command.');
          }
        } catch (err) {
          console.error('Error polling for pairing code:', err);
        }
      }, 1000); // Poll every second
    }
  } catch (err) {
    console.error('Error in text handler:', err);
    await ctx.reply('❌ Error: ' + err.message);
  }
});

// Error handling
bot.catch((err) => {
  console.error('Telegraf error:', err);
});

// Start bot
bot.launch();
console.log('✅ Telegram bot started...');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
