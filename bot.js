const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Presence,
  downloadMediaMessage,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const readline = require("readline");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const logger = pino({
  level: "silent",
});

// Store admin settings and sticker commands
const adminSettings = {};
const stickerCommands = {};
const lockedGroups = new Set();
const userWarns = {}; // Track warns per user per group
const blockedUsers = {}; // Track blocked users
const BOT_OWNER = "2347020598370"; // Bot owner number

// Helper function to check if sender is bot owner
const isOwnerNumber = (senderJid) => {
  if (!senderJid) return false;
  // Extract just the phone number from the JID (e.g., "2347020596756@s.whatsapp.net" -> "2347020596756")
  const senderNumber = senderJid.split("@")[0];
  return senderNumber === BOT_OWNER;
};

// Helper function to normalize JID format
const normalizeJid = (jid) => {
  if (!jid) return jid;
  const number = jid.split("@")[0];
  // Convert any format to standard @s.whatsapp.net format
  return `${number}@s.whatsapp.net`;
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

const getMenu = () => `
╔══════════════════════════════════════╗
║  ⚔️⚔️⚔️  KAIDO BOT  ⚔️⚔️⚔️           ║
║   *Built by James The Goat 🐐*      ║
╚══════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 👥 👥  GROUP MANAGEMENT  👥 👥 👥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 .lock ····· 🔐 Lock group
🔓 .open ····· 🔑 Unlock group
👢 .kick ····· ⚡ Kick user (reply)
⚠️  .warn ····· ⛔ Warn user (reply)
⬆️  .promote ··· 👑 Make admin (reply)
⬇️  .demote ··· 📉 Remove admin (reply)
🚫 .block ····· 🚷 Block user (reply)
✅ .unblock ··· 🟢 Unblock user

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📢 📢 📢  CHAT MANAGEMENT  📢 📢 📢
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 .antilink ··· 🚫 Toggle link filter
📢 .tagall ····· 📣 Tag all (visible)
👻 .hidetag ··· 🌙 Tag all (hidden)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 🎨 🎨  STICKER COMMANDS  🎨 🎨 🎨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🖼️  .sticker ··· 🎭 Convert image to sticker
🎪 .setsticker · 🎯 Set custom sticker cmd
   💫 kick, lock, open, vv, hidetag, pp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ 🛠️ 🛠️  UTILITY TOOLS  🛠️ 🛠️ 🛠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👁️  .vv ······· 🔍 Save view-once (reply)
👤 .get pp ···· 🖼️  Get profile pic (reply)
📊 .ping ····· 🎮 Bot status
🔗 .join ····· ➡️  Join group (link)
🗑️  .delete ···· ❌ Delete message (reply)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️ ℹ️ ℹ️  INFORMATION  ℹ️ ℹ️ ℹ️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 .menu ····· 📚 Show this menu
ℹ️  .help ····· 📖 Bot information

╔══════════════════════════════════════╗
║  ⚠️⚠️⚠️  USE RESPONSIBLY  ⚠️⚠️⚠️    ║
║  ⛔ Account bans are YOUR FAULT ⛔  ║
╚══════════════════════════════════════╝
`;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.clear();
      console.log("╔════════════════════════════════╗");
      console.log("║   📱 Enter Phone Number 📱    ║");
      console.log("╚════════════════════════════════╝\n");

      const phoneNumber = await askQuestion(
        "Enter your phone number (with country code, e.g., 1234567890): "
      );
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n✅ Your pairing code: ${code}\n📌 Enter this in WhatsApp to connect`);
      } catch (err) {
        console.log("❌ Error requesting pairing code:", err.message);
      }
    }

    if (connection === "open") {
      console.clear();
      console.log("╔════════════════════════════════╗");
      console.log("║   ✅ Connected Successfully!   ║");
      console.log("╚════════════════════════════════╝\n");
      console.log("Bot is running... Press Ctrl+C to stop\n");

      // Send connection message to owner
      const myJid = sock.user.id;
      await sock.sendMessage(myJid, {
        text: `✅ *CONNECTION SUCCESSFUL*

🤖 KAIDO Bot is online!
Built by: Everybody Hates James

━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *Quick Start:*
.menu - View all commands
.help - Bot information
.ping - Check status

━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to manage! 🚀`,
      });
    }

    if (connection === "close") {
      if (
        lastDisconnect?.error?.output?.statusCode ===
        DisconnectReason.loggedOut
      ) {
        console.log("❌ Device logged out. Delete auth_info folder to reconnect.");
        process.exit(0);
      }
      setTimeout(() => startBot(), 3000);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    try {
      const message = m.messages[0];
      if (!message.message) return;

      const isGroup = message.key.remoteJid.endsWith("@g.us");
      const sender = message.key.participant || message.key.remoteJid;
      const myJid = sock.user.id;
      const isSender = sender === myJid;

      let text = "";
      if (message.message.conversation)
        text = message.message.conversation;
      else if (message.message.extendedTextMessage)
        text = message.message.extendedTextMessage.text;

      const command = text?.toLowerCase().trim().split(" ")[0];
      const args = text?.toLowerCase().trim().split(" ").slice(1);

      // If it's a group and not from bot
      if (isGroup) {
        // Check if user is admin
        const groupMetadata = await sock.groupMetadata(
          message.key.remoteJid
        );
        const isAdmin = groupMetadata.participants.some(
          (p) =>
            p.id === sender &&
            (p.admin === "admin" || p.admin === "superadmin")
        );

        const botIsAdmin = groupMetadata.participants.some(
          (p) =>
            p.id === myJid &&
            (p.admin === "admin" || p.admin === "superadmin")
        );

        const botIsMember = groupMetadata.participants.some(
          (p) => p.id === myJid
        );

        // Check if sender is bot owner - only owner can use commands
        const isOwner = isOwnerNumber(sender);

        // PUBLIC COMMANDS - Available for everyone

        // .menu command - for everyone
        if (command === ".menu") {
          try {
            const menuImage = fs.readFileSync("./images/menu-image.jpg");
            await sock.sendMessage(message.key.remoteJid, {
              image: menuImage,
              caption: getMenu(),
            });
          } catch (err) {
            // Fallback to text if image fails
            await sock.sendMessage(message.key.remoteJid, {
              text: getMenu(),
            });
          }
          return;
        }

        // .ping command - Check if bot is online
        if (command === ".ping") {
          const now = Date.now();
          await sock.sendMessage(message.key.remoteJid, {
            text: `📊 *PONG!*\n✅ Bot is online and responding\n⚡ Latency: ${Date.now() - now}ms`,
          });
          return;
        }

        // .tagall - Tag all members (for everyone)
        if (command === ".tagall") {
          const groupMetadata = await sock.groupMetadata(
            message.key.remoteJid
          );
          let mentions = [];
          let text = "👥 *Group Members:*\n\n";

          for (let member of groupMetadata.participants) {
            mentions.push(member.id);
            text += `@${member.id.split("@")[0]}\n`;
          }

          await sock.sendMessage(
            message.key.remoteJid,
            { text, mentions },
            { quoted: message }
          );
          return;
        }

        // .hidetag - Tag all hidden (for everyone)
        if (command === ".hidetag") {
          try {
            const groupMetadata = await sock.groupMetadata(
              message.key.remoteJid
            );
            let mentions = [];

            for (let member of groupMetadata.participants) {
              mentions.push(member.id);
            }

            // Send dot message with mentions to tag all members
            await sock.sendMessage(message.key.remoteJid, {
              text: ".",
              mentions,
            });

            // Add checkmark emoji for 5 seconds then remove it
            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });

            // Remove the reaction after 5 seconds
            setTimeout(async () => {
              try {
                await sock.sendMessage(message.key.remoteJid, {
                  react: { text: "", key: message.key },
                });
              } catch (err) {
                console.error("Error removing reaction:", err.message);
              }
            }, 5000);
          } catch (err) {
            console.error("Hidetag error:", err.message);
          }
          return;
        }

        // OWNER-ONLY COMMANDS - Only bot owner can use
        if (!isOwner && text && text.startsWith(".")) {
          return; // Silently ignore non-owner commands
        }

        // .setsticker - Set sticker as command (for everyone)
        if (command === ".setsticker") {
          const cmdName = args[0]?.toLowerCase();
          const sticker = message.message.extendedTextMessage?.contextInfo
            ?.quotedMessage?.stickerMessage;

          if (!sticker || !cmdName) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a sticker with *.setsticker [command]*\n\nSupported: kick, open, lock, vv, sticker",
            });
            return;
          }

          if (!["kick", "open", "lock", "vv", "hidetag", "pp", "sticker"].includes(cmdName)) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Supported commands: kick, open, lock, vv, hidetag, pp, sticker",
            });
            return;
          }

          // Handle .setsticker sticker - create sticker converter
          if (cmdName === "sticker") {
            stickerCommands[cmdName] = { type: "sticker_converter", hash: sticker.fileSha256?.toString('base64') };
            await sock.sendMessage(message.key.remoteJid, {
              text: `✅ Sticker set to *STICKER CONVERTER*!\n\nNow reply with this sticker to an image to convert it to a sticker!`,
            });
            return;
          }

          const stickerHash = sticker.fileSha256?.toString('base64');
          stickerCommands[cmdName] = stickerHash || true;

          let successMsg = "";
          if (cmdName === "kick") {
            successMsg = `✅ Sticker set to *KICK*!\n\nNow reply to a user's message with this sticker to kick them.`;
          } else if (cmdName === "lock") {
            successMsg = `✅ Sticker set to *LOCK*!\n\nNow reply with this sticker to lock the group.`;
          } else if (cmdName === "open") {
            successMsg = `✅ Sticker set to *OPEN*!\n\nNow reply with this sticker to open the group.`;
          } else if (cmdName === "vv") {
            successMsg = `✅ Sticker set to *VV*!\n\nNow reply to a view-once photo/video with this sticker to save it.`;
          } else if (cmdName === "hidetag") {
            successMsg = `✅ Sticker set to *HIDETAG*!\n\nNow reply with this sticker to tag all members hidden.`;
          } else if (cmdName === "pp") {
            successMsg = `✅ Sticker set to *PP*!\n\nNow reply to a user's message with this sticker to get their profile picture.`;
          }

          await sock.sendMessage(message.key.remoteJid, {
            text: successMsg,
          });
          return;
        }

        // Helper function to convert image to sticker
        const convertToSticker = async (imageBuffer, packName = "idev sticker") => {
          try {
            const stickerBuffer = await sharp(imageBuffer)
              .resize(512, 512, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
              })
              .png()
              .toBuffer();
            return stickerBuffer;
          } catch (err) {
            console.error("Sticker conversion error:", err.message);
            return null;
          }
        };

        // .sticker - Convert image to sticker (for everyone)
        if (command === ".sticker") {
          try {
            const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Reply to an image with *.sticker* or *.sticker [name]*\n\nExample: .sticker ramo",
              });
              return;
            }

            const imageMsg = quoted?.imageMessage;
            if (!imageMsg) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Reply to an image only!",
              });
              return;
            }

            const packName = args[0] || "idev sticker";

            const stream = await downloadContentFromMessage(imageMsg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            const stickerBuffer = await convertToSticker(buffer, packName);
            if (!stickerBuffer) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Failed to convert image to sticker",
              });
              return;
            }

            await sock.sendMessage(message.key.remoteJid, {
              sticker: stickerBuffer,
            });
          } catch (err) {
            console.error("Sticker error:", err.message, err.stack);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to create sticker: " + err.message,
            });
          }
          return;
        }

        // .vv - Save view-once media (for everyone)
        if (command === ".vv") {
          try {
            const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Reply to a view-once photo or video with *.vv*",
              });
              return;
            }

            // Handle view-once message - try multiple possible structures
            let viewOnceMsg = null;
            if (quoted?.viewOnceMessage) {
              viewOnceMsg = quoted.viewOnceMessage.message || quoted.viewOnceMessage;
            } else if (quoted?.viewOnceMessageV2) {
              viewOnceMsg = quoted.viewOnceMessageV2.message;
            } else if (quoted?.viewOnceMessageV2Extension) {
              viewOnceMsg = quoted.viewOnceMessageV2Extension.message;
            }

            // Also try direct access if above doesn't work
            if (!viewOnceMsg && quoted?.imageMessage) {
              viewOnceMsg = { imageMessage: quoted.imageMessage };
            } else if (!viewOnceMsg && quoted?.videoMessage) {
              viewOnceMsg = { videoMessage: quoted.videoMessage };
            }

            if (!viewOnceMsg) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ That message is not a view-once photo or video. Reply to a view-once message.",
              });
              return;
            }

            const imageMsg = viewOnceMsg.imageMessage;
            const videoMsg = viewOnceMsg.videoMessage;

            if (!imageMsg && !videoMsg) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Could not find image or video in the view-once message",
              });
              return;
            }

            let mediaData = null;
            let mediaType = null;
            let caption = "";

            if (imageMsg) {
              const stream = await downloadContentFromMessage(imageMsg, 'image');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
              }
              mediaData = buffer;
              mediaType = "image";
              caption = imageMsg.caption || "";
            } else if (videoMsg) {
              const stream = await downloadContentFromMessage(videoMsg, 'video');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
              }
              mediaData = buffer;
              mediaType = "video";
              caption = videoMsg.caption || "";
            }

            if (!mediaData) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Failed to download media",
              });
              return;
            }

            const ownerJid = BOT_OWNER + "@s.whatsapp.net";
            if (mediaType === "image") {
              await sock.sendMessage(ownerJid, {
                image: mediaData,
                caption: caption || "View-once photo saved",
              });
            } else if (mediaType === "video") {
              await sock.sendMessage(ownerJid, {
                video: mediaData,
                caption: caption || "View-once video saved",
              });
            }

            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });
          } catch (err) {
            console.error("VV error:", err.message, err.stack);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to save view-once media: " + err.message,
            });
          }
          return;
        }

        // Check for sticker commands (reply with sticker) - for everyone
        if (message.message.stickerMessage && !text) {
          const stickerHash = message.message.stickerMessage.fileSha256?.toString('base64');

          console.log("Sticker detected! Hash:", stickerHash);
          console.log("Registered commands:", Object.keys(stickerCommands));

          for (const [cmdName, hash] of Object.entries(stickerCommands)) {
            if (hash === stickerHash || hash === true) {
              console.log("Matched command:", cmdName);

              // Execute sticker command - check admin for lock/open/kick, not for vv/hidetag
              if (cmdName === "vv") {
                // .vv sticker works for everyone
                try {
                  // CRITICAL FIX: Get contextInfo from stickerMessage, NOT extendedTextMessage
                  const contextInfo = message.message.stickerMessage?.contextInfo;

                  console.log("Sticker VV: contextInfo exists?", !!contextInfo);

                  if (!contextInfo || !contextInfo.quotedMessage) {
                    console.log("Sticker VV: No quoted message found");
                    return;
                  }

                  const quoted = contextInfo.quotedMessage;
                  console.log("Sticker VV: Processing quoted message");

                  // Handle view-once message - try multiple structures
                  let viewOnceMsg = null;
                  if (quoted?.viewOnceMessage) {
                    viewOnceMsg = quoted.viewOnceMessage.message || quoted.viewOnceMessage;
                  } else if (quoted?.viewOnceMessageV2) {
                    viewOnceMsg = quoted.viewOnceMessageV2.message;
                  } else if (quoted?.viewOnceMessageV2Extension) {
                    viewOnceMsg = quoted.viewOnceMessageV2Extension.message;
                  }

                  // Also try direct access
                  if (!viewOnceMsg && quoted?.imageMessage) {
                    viewOnceMsg = { imageMessage: quoted.imageMessage };
                  } else if (!viewOnceMsg && quoted?.videoMessage) {
                    viewOnceMsg = { videoMessage: quoted.videoMessage };
                  }

                  console.log("Sticker VV: viewOnceMsg exists?", !!viewOnceMsg);

                  if (!viewOnceMsg) {
                    console.log("Sticker VV: Not a view-once message");
                    return;
                  }

                  const imageMsg = viewOnceMsg.imageMessage;
                  const videoMsg = viewOnceMsg.videoMessage;

                  console.log("Sticker VV: Has image?", !!imageMsg, "Has video?", !!videoMsg);

                  if (!imageMsg && !videoMsg) {
                    console.log("Sticker VV: No media found");
                    return;
                  }

                  let mediaData = null;
                  let mediaType = null;
                  let caption = "";

                  if (imageMsg) {
                    console.log("Sticker VV: Downloading image...");
                    const stream = await downloadContentFromMessage(imageMsg, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                      buffer = Buffer.concat([buffer, chunk]);
                    }
                    mediaData = buffer;
                    mediaType = "image";
                    caption = imageMsg.caption || "";
                    console.log("Sticker VV: Image downloaded, size:", buffer.length);
                  } else if (videoMsg) {
                    console.log("Sticker VV: Downloading video...");
                    const stream = await downloadContentFromMessage(videoMsg, 'video');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                      buffer = Buffer.concat([buffer, chunk]);
                    }
                    mediaData = buffer;
                    mediaType = "video";
                    caption = videoMsg.caption || "";
                    console.log("Sticker VV: Video downloaded, size:", buffer.length);
                  }

                  if (!mediaData) {
                    console.log("Sticker VV: Failed to download media");
                    return;
                  }

                  // Send to bot owner
                  const ownerJid = BOT_OWNER + "@s.whatsapp.net";
                  console.log("Sticker VV: Sending to owner:", ownerJid);

                  if (mediaType === "image") {
                    await sock.sendMessage(ownerJid, {
                      image: mediaData,
                      caption: caption || "View-once photo saved (via sticker)",
                    });
                  } else if (mediaType === "video") {
                    await sock.sendMessage(ownerJid, {
                      video: mediaData,
                      caption: caption || "View-once video saved (via sticker)",
                    });
                  }

                  console.log("Sticker VV: Success! Sent to owner");

                  await sock.sendMessage(message.key.remoteJid, {
                    react: { text: "✅", key: message.key },
                  });

                  // Remove the checkmark after 5 seconds
                  setTimeout(async () => {
                    try {
                      await sock.sendMessage(message.key.remoteJid, {
                        react: { text: "", key: message.key },
                      });
                    } catch (err) {
                      console.error("Error removing sticker vv reaction:", err.message);
                    }
                  }, 5000);
                } catch (err) {
                  console.error("Sticker vv error:", err.message, err.stack);
                }
                return;
              } else if (cmdName === "hidetag") {
                // .hidetag sticker works for everyone
                try {
                  const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
                  let mentions = [];
                  for (let member of groupMetadata.participants) {
                    mentions.push(member.id);
                  }

                  // Send dot message with mentions to tag all members
                  await sock.sendMessage(message.key.remoteJid, {
                    text: ".",
                    mentions,
                  });

                  // Add checkmark emoji for 5 seconds then remove it
                  await sock.sendMessage(message.key.remoteJid, {
                    react: { text: "✅", key: message.key },
                  });

                  // Remove the reaction after 5 seconds
                  setTimeout(async () => {
                    try {
                      await sock.sendMessage(message.key.remoteJid, {
                        react: { text: "", key: message.key },
                      });
                    } catch (err) {
                      console.error("Error removing reaction:", err.message);
                    }
                  }, 5000);
                } catch (err) {
                  console.error("Sticker hidetag error:", err.message);
                }
                return;
              } else if (cmdName === "pp") {
                // .pp sticker - get profile picture
                try {
                  const contextInfo = message.message.stickerMessage?.contextInfo;
                  if (!contextInfo || !contextInfo.participant) {
                    console.log("Sticker PP: No participant found");
                    return;
                  }

                  let targetJid = normalizeJid(contextInfo.participant);
                  console.log("Sticker PP: Getting profile picture for:", targetJid);

                  let ppUrl = null;
                  
                  // Try different approaches to get profile picture
                  try {
                    ppUrl = await sock.profilePictureUrl(targetJid, "display");
                  } catch (err1) {
                    console.log("Display failed, trying image:", err1?.message);
                    try {
                      ppUrl = await sock.profilePictureUrl(targetJid, "image");
                    } catch (err2) {
                      console.log("Image also failed");
                    }
                  }

                  // If still no URL, try getting user info
                  if (!ppUrl) {
                    try {
                      console.log("Trying alternative: getting user info");
                      const userInfo = await sock.groupMetadata(message.key.remoteJid);
                      const participant = userInfo?.participants?.find(p => p.id === targetJid);
                      if (participant?.picture) {
                        ppUrl = participant.picture;
                        console.log("Got PP from participant info");
                      }
                    } catch (err) {
                      console.log("Participant info also failed:", err?.message);
                    }
                  }

                  if (ppUrl) {
                    console.log("Sticker PP: Sending image from URL:", ppUrl?.slice(0, 50) + "...");
                    await sock.sendMessage(message.key.remoteJid, {
                      image: { url: ppUrl },
                      caption: `Profile: @${targetJid.split("@")[0]}`,
                    });
                  } else {
                    console.log("Sticker PP: No profile picture available or private");
                    await sock.sendMessage(message.key.remoteJid, {
                      text: "❌ Profile picture is private or unavailable",
                    });
                  }
                } catch (err) {
                  console.error("Sticker pp error:", err.message, err.stack);
                  await sock.sendMessage(message.key.remoteJid, {
                    text: "❌ Error: " + err.message,
                  });
                }
                return;
              } else if (isAdmin) {
                // kick, lock, open require admin
                if (cmdName === "kick") {
                  // CRITICAL FIX: Get contextInfo from stickerMessage
                  const contextInfo = message.message.stickerMessage?.contextInfo;
                  const targetJid = contextInfo?.participant;

                  if (targetJid) {
                    try {
                      await sock.groupParticipantsUpdate(message.key.remoteJid, [targetJid], "remove");
                      await sock.sendMessage(message.key.remoteJid, {
                        react: { text: "✅", key: message.key },
                      });
                    } catch (err) {
                      console.error("Sticker kick error:", err.message);
                    }
                  }
                  return;
                } else if (cmdName === "open") {
                  try {
                    lockedGroups.delete(message.key.remoteJid);
                    await sock.groupSettingUpdate(message.key.remoteJid, "not_announcement");
                    await sock.sendMessage(message.key.remoteJid, {
                      react: { text: "✅", key: message.key },
                    });
                  } catch (err) {
                    console.error("Sticker open error:", err.message);
                  }
                  return;
                } else if (cmdName === "lock") {
                  try {
                    lockedGroups.add(message.key.remoteJid);
                    await sock.groupSettingUpdate(message.key.remoteJid, "announcement");
                    await sock.sendMessage(message.key.remoteJid, {
                      react: { text: "✅", key: message.key },
                    });
                  } catch (err) {
                    console.error("Sticker lock error:", err.message);
                  }
                  return;
                }
              }
            }
          }
          return;
        }

        // Admin-only commands - require admin
        if (!isAdmin) return;

        // .lock - Lock group
        if (command === ".lock") {
          try {
            lockedGroups.add(message.key.remoteJid);
            await sock.groupUpdateSubject(message.key.remoteJid, groupMetadata.subject);
            await sock.groupSettingUpdate(message.key.remoteJid, "announcement");
            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });
          } catch (err) {
            console.error("Lock error:", err.message);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to lock group. Make sure bot and you are admin.",
            });
          }
          return;
        }

        // .open - Unlock group
        if (command === ".open") {
          try {
            lockedGroups.delete(message.key.remoteJid);
            await sock.groupSettingUpdate(message.key.remoteJid, "not_announcement");
            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });
          } catch (err) {
            console.error("Open error:", err.message);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to open group. Make sure bot and you are admin.",
            });
          }
          return;
        }

        // .get pp - Get user profile picture
        if (command === ".get" && args[0] === "pp") {
          const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a user's message to get their profile picture",
            });
            return;
          }

          let targetJid = message.message.extendedTextMessage?.contextInfo?.participant;
          
          // Fallback: try to get from quoted message key
          if (!targetJid && quoted.key?.participant) {
            targetJid = quoted.key.participant;
          }
          
          // Another fallback for DMs
          if (!targetJid && quoted.key?.fromMe === false) {
            targetJid = message.key.remoteJid;
          }

          if (!targetJid) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Could not identify the user",
            });
            return;
          }

          // Normalize JID format
          targetJid = normalizeJid(targetJid);

          try {
            console.log("Get PP: Fetching for targetJid:", targetJid);
            let ppUrl = null;
            
            // Try different approaches to get profile picture
            try {
              ppUrl = await sock.profilePictureUrl(targetJid, "display");
            } catch (err1) {
              console.log("Display failed, trying image:", err1?.message);
              try {
                ppUrl = await sock.profilePictureUrl(targetJid, "image");
              } catch (err2) {
                console.log("Image also failed");
              }
            }

            // If still no URL, try getting user info from group
            if (!ppUrl && message.key.remoteJid.includes("@g.us")) {
              try {
                console.log("Trying alternative: getting user info from group");
                const userInfo = await sock.groupMetadata(message.key.remoteJid);
                const participant = userInfo?.participants?.find(p => p.id === targetJid);
                if (participant?.picture) {
                  ppUrl = participant.picture;
                  console.log("Got PP from participant info");
                }
              } catch (err) {
                console.log("Participant info also failed:", err?.message);
              }
            }
            
            if (ppUrl) {
              console.log("Get PP: Sending image");
              await sock.sendMessage(message.key.remoteJid, {
                image: { url: ppUrl },
                caption: `Profile: @${targetJid.split("@")[0]}`,
              });
            } else {
              console.log("Get PP: No profile picture available or private");
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Profile picture is private or unavailable",
              });
            }
          } catch (err) {
            console.error("Get PP error:", err.message, err.stack);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Error: " + err.message,
            });
          }
          return;
        }

        // .kick - Remove user
        if (command === ".kick") {
          const quoted = message.message.extendedTextMessage?.contextInfo
            ?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a message to kick that user",
            });
            return;
          }

          const targetJid = message.message.extendedTextMessage?.contextInfo
            ?.participant;
          if (targetJid) {
            try {
              await sock.groupParticipantsUpdate(message.key.remoteJid, [
                targetJid,
              ], "remove");
              await sock.sendMessage(message.key.remoteJid, {
                react: { text: "✅", key: message.key },
              });
            } catch (err) {
              console.error("Kick error:", err.message);
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Failed to kick user. Make sure you're admin.",
              });
            }
          }
          return;
        }


        // .warn - Warn a user (3 warns = kick)
        if (command === ".warn") {
          const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a user's message to warn them",
            });
            return;
          }

          const targetJid = message.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetJid) return;

          const groupId = message.key.remoteJid;
          if (!userWarns[groupId]) userWarns[groupId] = {};
          if (!userWarns[groupId][targetJid]) userWarns[groupId][targetJid] = 0;

          userWarns[groupId][targetJid]++;
          const warnCount = userWarns[groupId][targetJid];

          if (warnCount >= 3) {
            try {
              await sock.groupParticipantsUpdate(groupId, [targetJid], "remove");
              await sock.sendMessage(groupId, {
                text: `⚠️ User received 3 warnings and has been kicked!`,
              });
              delete userWarns[groupId][targetJid];
            } catch (err) {
              console.error("Auto-kick error:", err.message);
            }
          } else {
            await sock.sendMessage(groupId, {
              text: `⚠️ *Warning ${warnCount}/3* - ${targetJid.split("@")[0]}`,
            });
          }
          return;
        }

        // .promote - Make user admin
        if (command === ".promote") {
          const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a user's message to promote them",
            });
            return;
          }

          const targetJid = message.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetJid) return;

          try {
            await sock.groupParticipantsUpdate(message.key.remoteJid, [targetJid], "promote");
            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });
          } catch (err) {
            console.error("Promote error:", err.message);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to promote user",
            });
          }
          return;
        }

        // .demote - Remove user admin
        if (command === ".demote") {
          const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a user's message to demote them",
            });
            return;
          }

          const targetJid = message.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetJid) return;

          try {
            await sock.groupParticipantsUpdate(message.key.remoteJid, [targetJid], "demote");
            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });
          } catch (err) {
            console.error("Demote error:", err.message);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to demote user",
            });
          }
          return;
        }

        // .block - Block user
        if (command === ".block") {
          const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Reply to a user's message to block them",
            });
            return;
          }

          const targetJid = message.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetJid) return;

          const myJid = sock.user.id;
          if (!blockedUsers[myJid]) blockedUsers[myJid] = new Set();
          blockedUsers[myJid].add(targetJid);

          await sock.sendMessage(message.key.remoteJid, {
            react: { text: "✅", key: message.key },
          });
          return;
        }

        // .unblock - Unblock user
        if (command === ".unblock") {
          const args = text?.toLowerCase().trim().split(" ");
          if (args.length < 2) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Usage: .unblock [number]\n\nExample: .unblock 1234567890",
            });
            return;
          }

          const phoneNumber = args[1];
          const targetJid = phoneNumber + "@s.whatsapp.net";
          const myJid = sock.user.id;

          if (blockedUsers[myJid]?.has(targetJid)) {
            blockedUsers[myJid].delete(targetJid);
            await sock.sendMessage(message.key.remoteJid, {
              text: `✅ User ${phoneNumber} unblocked`,
            });
          } else {
            await sock.sendMessage(message.key.remoteJid, {
              text: `❌ User not found in blocked list`,
            });
          }
          return;
        }


        // .antilink - Enable/disable antilink protection (admin only)
        if (command === ".antilink") {
          // Check if sender is admin
          if (!isAdmin && !isOwner) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ This command is for admins only!",
            });
            return;
          }

          const action = args[0]?.toLowerCase();

          if (!action || (action !== "on" && action !== "off")) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Usage: .antilink on/off\n\nExample:\n.antilink on - Enable link protection\n.antilink off - Disable link protection",
            });
            return;
          }

          // Initialize settings if not exists
          if (!adminSettings[message.key.remoteJid]) {
            adminSettings[message.key.remoteJid] = {};
          }

          const isOn = action === "on";
          adminSettings[message.key.remoteJid].antilink = isOn;

          const status = isOn ? "✅ *ENABLED*" : "❌ *DISABLED*";
          const message_text = isOn 
            ? `Antilink ${status}\n\nNon-admins who send links will be kicked!`
            : `Antilink ${status}\n\nUsers can send links freely.`;

          await sock.sendMessage(message.key.remoteJid, {
            text: message_text,
          });
          return;
        }

        // Unrecognized command in group
        if (text && text.startsWith(".")) {
          await sock.sendMessage(message.key.remoteJid, {
            text: `❌ *Wrong Command!*\n\nUse *.menu* to see available commands`,
          });
          return;
        }

      } else {
        // DM commands
        // Check if user is bot owner
        const isOwner = isOwnerNumber(sender);

        if (command === ".menu") {
          try {
            const menuImage = fs.readFileSync("./images/menu-image.jpg");
            await sock.sendMessage(message.key.remoteJid, {
              image: menuImage,
              caption: getMenu(),
            });
          } catch (err) {
            // Fallback to text if image fails
            await sock.sendMessage(message.key.remoteJid, {
              text: getMenu(),
            });
          }
          return;
        }

        // .help command - Bot information
        if (command === ".help") {
          await sock.sendMessage(message.key.remoteJid, {
            text: `ℹ️ *BOT INFORMATION*

🤖 KAIDO Bot
Built by: Everybody Hates James
Version: 2.0

━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *Features:*
• Group management (lock/unlock/kick)
• Member tagging (hidden & visible)
• View-once media saving
• Profile picture extraction
• Custom sticker commands
• Auto-link moderation
• Warning system

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *How to Use:*
1. Type .menu for all commands
2. Reply to messages for actions
3. Use stickers for quick commands
4. Only owner can control bot
5. Works in all groups

━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *Important:*
Use responsibly!
Misuse can result in account ban.

━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          });
          return;
        }

        // .ping command - Check if bot is online
        if (command === ".ping") {
          const now = Date.now();
          await sock.sendMessage(message.key.remoteJid, {
            text: `📊 *PONG!*\n✅ Bot is online and responding\n⚡ Latency: ${Date.now() - now}ms`,
          });
          return;
        }

        // .setsticker - Set sticker as command in DMs (for owner only)
        if (command === ".setsticker") {
          // Check if sender is owner - try sender JID first, then check contextInfo participant for DM format
          let isOwner = isOwnerNumber(sender);
          if (!isOwner && message.message.extendedTextMessage?.contextInfo?.participant) {
            isOwner = isOwnerNumber(message.message.extendedTextMessage.contextInfo.participant);
          }

          if (!isOwner) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ This command is only available for the bot owner in DMs",
            });
            return;
          }

          const cmdName = args[0]?.toLowerCase();
          console.log("Command name:", cmdName);
          console.log("Looking for sticker in contextInfo...");
          const sticker = message.message.extendedTextMessage?.contextInfo
            ?.quotedMessage?.stickerMessage;
          console.log("Sticker found:", !!sticker);
          if (sticker) {
            console.log("Sticker structure:", JSON.stringify(sticker, null, 2).substring(0, 300));
          }

          if (!sticker || !cmdName) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Usage: Reply to a sticker with *.setsticker [command]*\n\nSupported commands: kick, open, lock, vv, hidetag\n\n✅ This will set the sticker to work globally in all groups!",
            });
            return;
          }

          if (!["kick", "open", "lock", "vv", "hidetag", "pp"].includes(cmdName)) {
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Supported commands: kick, open, lock, vv, hidetag, pp",
            });
            return;
          }

          const stickerHash = sticker.fileSha256?.toString('base64');
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log("STORING STICKER COMMAND:");
          console.log("Command name:", cmdName);
          console.log("Sticker hash:", stickerHash);
          console.log("FileSha256 buffer:", sticker.fileSha256);
          console.log("All sticker commands before:", stickerCommands);
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

          stickerCommands[cmdName] = stickerHash || true;

          let successMsg = "";
          if (cmdName === "kick") {
            successMsg = `✅ Sticker set to *KICK* - works in all groups!`;
          } else if (cmdName === "lock") {
            successMsg = `✅ Sticker set to *LOCK* - works in all groups!`;
          } else if (cmdName === "open") {
            successMsg = `✅ Sticker set to *OPEN* - works in all groups!`;
          } else if (cmdName === "vv") {
            successMsg = `✅ Sticker set to *VV* - works in all groups!`;
          } else if (cmdName === "hidetag") {
            successMsg = `✅ Sticker set to *HIDETAG* - works in all groups!`;
          } else if (cmdName === "pp") {
            successMsg = `✅ Sticker set to *PP* - works in all groups! Reply to a user's message to get their profile picture.`;
          }

          await sock.sendMessage(message.key.remoteJid, {
            text: successMsg,
          });
          return;
        }

        // .join command - Join a WhatsApp group
        if (command === ".join") {
          try {
            const groupLink = text?.split(" ").slice(1).join(" ")?.trim();

            if (!groupLink) {
              await sock.sendMessage(message.key.remoteJid, {
                text: `❌ Usage: .join [WhatsApp Group Link]\n\nExample:\n.join https://chat.whatsapp.com/ABCDEF123456`,
              });
              return;
            }

            if (!groupLink.includes("chat.whatsapp.com")) {
              await sock.sendMessage(message.key.remoteJid, {
                text: `❌ Invalid WhatsApp group link!`,
              });
              return;
            }

            // Extract code from link
            let code = "";
            if (groupLink.includes("chat.whatsapp.com/")) {
              code = groupLink.split("chat.whatsapp.com/")[1]?.trim();
            }

            if (!code || code.length < 10) {
              await sock.sendMessage(message.key.remoteJid, {
                text: `❌ Invalid group link format!`,
              });
              return;
            }

            // Try to join group
            const response = await sock.groupAcceptInvite(code);

            await sock.sendMessage(message.key.remoteJid, {
              text: `✅ Successfully joined the group!`,
            });
          } catch (err) {
            console.error("Join error:", err.message);
            let errorMsg = `❌ Failed to join group.\n\nPossible reasons:\n• Invalid link\n• Already in group\n• Link expired\n• Group doesn't exist`;

            if (err.message.includes("already")) {
              errorMsg = `❌ You are already in this group!`;
            } else if (err.message.includes("expired")) {
              errorMsg = `❌ This invite link has expired!`;
            }

            await sock.sendMessage(message.key.remoteJid, {
              text: errorMsg,
            });
          }
          return;
        }

        // Unrecognized command in DM
        if (text && text.startsWith(".")) {
          await sock.sendMessage(message.key.remoteJid, {
            text: `❌ *Wrong Command!*\n\nUse *.menu* to see available commands`,
          });
          return;
        }

        // .delete - Delete message (works in DMs)
        if (command === ".delete") {
          try {
            const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Reply to a message to delete it",
              });
              return;
            }

            const quotedKey = message.message.extendedTextMessage?.contextInfo?.stanzaId;
            if (quotedKey) {
              await sock.sendMessage(message.key.remoteJid, {
                delete: {
                  remoteJid: message.key.remoteJid,
                  fromMe: true,
                  id: quotedKey,
                },
              });
            }
          } catch (err) {
            console.error("Delete error:", err.message);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to delete message",
            });
          }
          return;
        }

        // .vv command in DMs
        if (command === ".vv") {
          try {
            const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Reply to a view-once photo or video with *.vv*",
              });
              return;
            }

            // Handle view-once message - try multiple possible structures
            let viewOnceMsg = null;
            if (quoted?.viewOnceMessage) {
              viewOnceMsg = quoted.viewOnceMessage.message || quoted.viewOnceMessage;
            } else if (quoted?.viewOnceMessageV2) {
              viewOnceMsg = quoted.viewOnceMessageV2.message;
            } else if (quoted?.viewOnceMessageV2Extension) {
              viewOnceMsg = quoted.viewOnceMessageV2Extension.message;
            }

            // Also try direct access if above doesn't work
            if (!viewOnceMsg && quoted?.imageMessage) {
              viewOnceMsg = { imageMessage: quoted.imageMessage };
            } else if (!viewOnceMsg && quoted?.videoMessage) {
              viewOnceMsg = { videoMessage: quoted.videoMessage };
            }

            if (!viewOnceMsg) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ That message is not a view-once photo or video. Reply to a view-once message.",
              });
              return;
            }

            const imageMsg = viewOnceMsg.imageMessage;
            const videoMsg = viewOnceMsg.videoMessage;

            if (!imageMsg && !videoMsg) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Could not find image or video in the view-once message",
              });
              return;
            }

            let mediaData = null;
            let mediaType = null;
            let caption = "";

            if (imageMsg) {
              const stream = await downloadContentFromMessage(imageMsg, 'image');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
              }
              mediaData = buffer;
              mediaType = "image";
              caption = imageMsg.caption || "";
            } else if (videoMsg) {
              const stream = await downloadContentFromMessage(videoMsg, 'video');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
              }
              mediaData = buffer;
              mediaType = "video";
              caption = videoMsg.caption || "";
            }

            if (!mediaData) {
              await sock.sendMessage(message.key.remoteJid, {
                text: "❌ Failed to download media",
              });
              return;
            }

            const ownerJid = BOT_OWNER + "@s.whatsapp.net";
            if (mediaType === "image") {
              await sock.sendMessage(ownerJid, {
                image: mediaData,
                caption: caption || "View-once photo saved",
              });
            } else if (mediaType === "video") {
              await sock.sendMessage(ownerJid, {
                video: mediaData,
                caption: caption || "View-once video saved",
              });
            }

            await sock.sendMessage(message.key.remoteJid, {
              react: { text: "✅", key: message.key },
            });
          } catch (err) {
            console.error("VV error in DM:", err.message, err.stack);
            await sock.sendMessage(message.key.remoteJid, {
              text: "❌ Failed to save view-once media: " + err.message,
            });
          }
          return;
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  // Monitor messages for links when antilink is enabled
  sock.ev.on("messages.update", async (m) => {
    try {
      for (const { key, update } of m) {
        if (update.pollUpdates) continue;
      }
    } catch (error) {
      console.error("Error in message update:", error);
    }
  });

  // Check for links in incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const message = m.messages[0];
      if (!message.message || message.key.fromMe) return;

      const isGroup = message.key.remoteJid.endsWith("@g.us");
      if (!isGroup) return;

      const settings = adminSettings[message.key.remoteJid];
      if (!settings || !settings.antilink) return;

      let text = "";
      if (message.message.conversation)
        text = message.message.conversation;
      else if (message.message.extendedTextMessage)
        text = message.message.extendedTextMessage.text;

      if (
        text &&
        (text.includes("http://") ||
          text.includes("https://") ||
          text.includes("www."))
      ) {
        const sender = message.key.participant;
        const groupMetadata = await sock.groupMetadata(
          message.key.remoteJid
        );
        const isAdmin = groupMetadata.participants.some(
          (p) =>
            p.id === sender &&
            (p.admin === "admin" || p.admin === "superadmin")
        );

        if (!isAdmin) {
          // Delete the message with link
          try {
            await sock.chatModify(
              { delete: true },
              message.key
            );
          } catch (err) {
            console.log("Could not delete message:", err.message);
          }

          // Kick the user
          await sock.groupParticipantsUpdate(
            message.key.remoteJid,
            [sender],
            "remove"
          );

          // Notify the group
          const userNumber = sender.split("@")[0];
          await sock.sendMessage(message.key.remoteJid, {
            text: `🚫 *User @${userNumber} kicked for sending link*`,
          });
        }
      }
    } catch (error) {
      console.error("Error checking links:", error);
    }
  });
}

console.clear();
console.log("╔════════════════════════════════╗");
console.log("║   ⚔️ KAIDO BOT v1 ⚔️           ║");
console.log("║   Starting...                  ║");
console.log("╚════════════════════════════════╝\n");

startBot().catch(console.error);

process.on("SIGINT", () => {
  console.log("\n✅ Bot stopped gracefully");
  process.exit(0);
});
