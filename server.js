const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode-terminal');
require('dotenv').config();

const app = express();
const logger = pino({ level: 'silent' });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Store active WhatsApp sessions
const whatsappSessions = {};

app.use(cors());
app.use(express.json());

// Generate 6-digit pairing code
function generatePairingCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Initialize WhatsApp session for a user with pairing code
async function initializeWhatsAppSession(userId, telegramId, phoneNumber) {
  try {
    const sessionId = uuidv4();
    const sessionDir = `./sessions/${sessionId}`;
    
    console.log(`Initializing WhatsApp session for user ${userId}`);

    // Create WhatsApp socket
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
    });

    let pairingCode = null;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`WhatsApp connected for user ${userId}`);
        
        // Update database
        await pool.query(
          'UPDATE users SET is_connected = true, whatsapp_session_id = $1, status = $2 WHERE id = $3',
          [sessionId, 'connected', userId]
        );

        // Store session
        whatsappSessions[userId] = {
          socket: sock,
          sessionId,
          pairingCode,
          connected: true,
        };
      }

      if (connection === 'close') {
        if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
          console.log(`User ${userId} logged out`);
          delete whatsappSessions[userId];
        } else {
          setTimeout(() => initializeWhatsAppSession(userId, telegramId, phoneNumber), 3000);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Store initial session data
    whatsappSessions[userId] = {
      socket: sock,
      sessionId,
      pairingCode: null,
      connected: false,
    };

    // Return pairing code immediately
    return { sessionId, pairingCode: generatePairingCode() };
  } catch (err) {
    console.error(`Error initializing session for user ${userId}:`, err);
    throw err;
  }
}

// API endpoint to start WhatsApp connection
app.post('/api/initiate-connection', async (req, res) => {
  try {
    const { telegramId, phoneNumber } = req.body;

    if (!telegramId || !phoneNumber) {
      return res.status(400).json({ error: 'Missing telegramId or phoneNumber' });
    }

    // Check if user exists
    let user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    
    if (user.rows.length === 0) {
      // Create new user
      user = await pool.query(
        'INSERT INTO users (telegram_id, phone_number, status) VALUES ($1, $2, $3) RETURNING *',
        [telegramId, phoneNumber, 'pairing']
      );
    } else {
      // Update existing user
      await pool.query(
        'UPDATE users SET phone_number = $1, status = $2 WHERE telegram_id = $3',
        [phoneNumber, 'pairing', telegramId]
      );
      user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    }

    const userId = user.rows[0].id;

    // Initialize WhatsApp session and get pairing code
    const sessionInfo = await initializeWhatsAppSession(userId, telegramId, phoneNumber);

    res.json({
      success: true,
      userId,
      sessionId: sessionInfo.sessionId,
      pairingCode: sessionInfo.pairingCode,
    });
  } catch (err) {
    console.error('Error in initiate-connection:', err);
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to get QR code
app.get('/api/qr-code/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const session = whatsappSessions[userId];

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.qrCode) {
      return res.json({ qrCode: null, status: 'generating' });
    }

    res.json({ qrCode: session.qrCode, status: 'ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to check connection status
app.get('/api/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId,
      isConnected: user.rows[0].is_connected,
      status: user.rows[0].status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to get user status by Telegram ID
app.get('/api/user-status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userInfo = user.rows[0];
    res.json({
      telegramId,
      phoneNumber: userInfo.phone_number,
      isConnected: userInfo.is_connected,
      status: userInfo.status,
      createdAt: userInfo.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Backend server running', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Backend server running on port ${PORT}`);
  console.log(`📊 Database connected: ${process.env.DATABASE_URL.split('@')[1]}`);
});
