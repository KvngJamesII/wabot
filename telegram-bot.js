const { Telegraf } = require('telegraf');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const backendPort = process.env.PORT || 8080;
const backendUrl = process.env.BACKEND_URL || `http://localhost:${backendPort}`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
    
    // Check if already connected
    const user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    if (user.rows.length > 0 && user.rows[0].is_connected) {
      return await ctx.reply('✅ You\'re already connected! Use /help for commands.');
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
    const user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);

    if (user.rows.length === 0) {
      return await ctx.reply('❌ You haven\'t connected yet. Send your phone number to start!');
    }

    const userInfo = user.rows[0];
    const status = userInfo.is_connected ? '✅ Connected' : '⏳ Connecting...';

    await ctx.reply(
      `📊 *Your Connection Status*\n\n` +
      `Phone: ${userInfo.phone_number}\n` +
      `Status: ${status}\n` +
      `Connected Since: ${userInfo.created_at}`,
      { parse_mode: 'Markdown' }
    );
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

    await ctx.reply('⏳ Initiating WhatsApp connection...');

    // Call backend to initiate connection
    const response = await axios.post(`${backendUrl}/api/initiate-connection`, {
      telegramId,
      phoneNumber: text,
    });

    if (response.data.success) {
      const userId = response.data.userId;
      
      await ctx.reply(
        `✅ *Connection Started!*\n\n` +
        `Generating QR code...\n` +
        `Please wait a moment for the QR code to appear.`,
        { parse_mode: 'Markdown' }
      );

      // Wait a bit then send QR code
      setTimeout(async () => {
        try {
          const qrResponse = await axios.get(`${backendUrl}/api/qr-code/${userId}`);
          
          if (qrResponse.data.qrCode) {
            await ctx.reply(
              `📱 *Your QR Code:*\n\n` +
              `Open WhatsApp on your phone and scan this code.`,
              { parse_mode: 'Markdown' }
            );
            // Send QR as text (actual QR image would need special handling)
            await ctx.reply(`QR Code: ${qrResponse.data.qrCode.substring(0, 100)}...`);
          } else {
            await ctx.reply('⏳ QR code is being generated. Please wait...');
          }
        } catch (err) {
          console.error('Error getting QR:', err);
        }
      }, 2000);
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
