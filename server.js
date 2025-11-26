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

// Initialize WhatsApp session for a user with pairing code
async function initializeWhatsAppSession(userId, telegramId, phoneNumber) {
  try {
    const sessionId = uuidv4();
    const sessionDir = `./sessions/${sessionId}`;
    
    console.log(`Initializing WhatsApp session for user ${userId} with phone ${phoneNumber}`);

    // Create WhatsApp socket
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
    });

    let pairingCode = null;
    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, pairingCode: code, qr } = update;
      
      console.log(`[Connection Update] User ${userId}: connection=${connection}, code=${code ? 'YES' : 'NO'}, qr=${qr ? 'YES' : 'NO'}`);

      // If we get a QR code, try to generate pairing code from it
      if (qr && !pairingCode && typeof sock.requestPairingCode === 'function') {
        console.log(`Got QR code, attempting to request pairing code for ${phoneNumber}...`);
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          pairingCode = code;
          console.log(`✅ Pairing code generated for user ${userId}: ${pairingCode}`);
          if (whatsappSessions[userId]) {
            whatsappSessions[userId].pairingCode = code;
          }
        } catch (err) {
          console.log(`Could not generate pairing code: ${err.message}`);
        }
      }

      // Capture pairing code when available
      if (code) {
        pairingCode = code;
        console.log(`✅ Pairing code generated for user ${userId}: ${pairingCode}`);
        if (whatsappSessions[userId]) {
          whatsappSessions[userId].pairingCode = code;
        }
      }

      if (connection === 'open') {
        console.log(`✅ WhatsApp connected for user ${userId}`);
        
        // Update database
        await pool.query(
          'UPDATE users SET is_connected = true, whatsapp_session_id = $1, status = $2 WHERE id = $3',
          [sessionId, 'connected', userId]
        );

        // Update session
        if (whatsappSessions[userId]) {
          whatsappSessions[userId].connected = true;
        }
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`[Disconnect] User ${userId}: statusCode=${reason}, error=${lastDisconnect?.error?.message}`);
        
        if (reason === DisconnectReason.loggedOut) {
          console.log(`User ${userId} logged out`);
          delete whatsappSessions[userId];
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Store session data immediately
    whatsappSessions[userId] = {
      socket: sock,
      sessionId,
      pairingCode: null,
      connected: false,
    };

    console.log(`✅ Session created for user ${userId}. Waiting for pairing code...`);
    
    // Return immediately with sessionId - pairing code will be captured in the event listener
    return { sessionId, pairingCode: null, message: 'Session initialized. Waiting for pairing code...' };

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

// API endpoint to get pairing code (polling)
app.get('/api/pairing-code/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const session = whatsappSessions[userId];

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.pairingCode) {
      return res.json({ pairingCode: null, status: 'generating' });
    }

    res.json({ pairingCode: session.pairingCode, status: 'ready' });
  } catch (err) {
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
