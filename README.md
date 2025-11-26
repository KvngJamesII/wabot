# WhatsApp Telegram Hub - Multi-User Bot System

A centralized system that allows multiple users to connect their WhatsApp accounts through Telegram and manage their groups.

## Features

✅ **Multi-User Support** - Multiple users can use the bot simultaneously
✅ **Telegram Interface** - Simple bot for phone number input & status checking
✅ **WhatsApp Sessions** - Each user gets isolated WhatsApp instance
✅ **Supabase Database** - Persistent storage of user data & sessions
✅ **Scalable Architecture** - Ready for production deployment

## Architecture

```
Telegram Bot (telegram-bot.js)
        ↓
Backend Server (server.js)
        ↓
Supabase PostgreSQL Database
        ↓
Multiple WhatsApp Instances (per user)
```

## Installation

### 1. Prerequisites
- Node.js 16+
- Telegram Bot Token (from @BotFather)
- Supabase Account with PostgreSQL

### 2. Setup

```bash
cd whatsapp-telegram-hub
npm install
```

### 3. Database Setup

1. Go to your Supabase project
2. Open SQL Editor
3. Copy & paste the contents of `db-setup.sql`
4. Execute to create tables

### 4. Environment Variables

Create `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_token_here
DATABASE_URL=postgresql://user:password@host:6543/database?sslmode=require
BACKEND_URL=http://localhost:3000
PORT=3000
NODE_ENV=production
```

### 5. Run

```bash
# Start backend server (one terminal)
npm run dev

# Start Telegram bot (another terminal)
npm run telegram
```

## How It Works

### User Flow:

1. **User sends phone number to Telegram bot**
   ```
   /start
   → Send: 1234567890
   ```

2. **Backend creates WhatsApp session**
   - Generates unique session ID
   - Creates QR code
   - Stores in database

3. **Bot sends QR code to Telegram**
   ```
   User scans with WhatsApp mobile
   ```

4. **User is connected!**
   ```
   Can now use bot to manage groups
   ```

## API Endpoints

### POST `/api/initiate-connection`
Starts WhatsApp connection for a user
```json
{
  "telegramId": 123456789,
  "phoneNumber": "1234567890"
}
```

### GET `/api/qr-code/:userId`
Gets the QR code for scanning

### GET `/api/status/:userId`
Checks connection status

### GET `/health`
Health check

## Database Schema

**users** - Stores user information
- telegram_id (unique)
- phone_number
- is_connected
- whatsapp_session_id

**whatsapp_sessions** - Stores WhatsApp auth data per user
- session_id (unique)
- user_id (FK)
- auth_data (JSON)
- is_active

**group_settings** - User group preferences
**user_warns** - Track warnings per group

## Deployment

### Replit
1. Upload folder to Replit
2. Set environment variables in Secrets
3. Add workflows for both `server.js` and `telegram-bot.js`
4. Keep both running continuously

### Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]
```

### Railway/Heroku
Set env variables and deploy both services

## Next Steps

After setup:
1. Users send phone numbers via Telegram
2. Backend handles connection management
3. Add WhatsApp command handlers to backend
4. Implement group management features per user

## Support

For issues, check server.js and telegram-bot.js console logs.

---
Made with ❤️ by iDev Team
