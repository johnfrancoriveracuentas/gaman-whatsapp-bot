require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const qrcodeTerm = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const express = require('express');
const sharp = require('sharp');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const PREFIX = process.env.PREFIX || '!';
const AUTH_DIR = process.env.AUTH_DIR || './auth_info_baileys';
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

// Estado por usuario
const userState = new Map(); // jid -> { role, history: [] }

const ROLES = {
    editor: {
        name: 'Editor de Video',
        emoji: '🎬',
        system: `Eres el asistente de Gaman en su rol de EDITOR DE VIDEO. Respondes en español, de forma cercana, profesional y natural, con emojis ocasionales. Ayudas con edición de video, color, audio, motion graphics, software (Premiere, Resolve, After Effects, etc.), flujos de trabajo, consejos de contenido y clientes. Si te preguntan por streamer, recuerda que también puedes cambiar de rol con !streamer. Mantén respuestas concisas y útiles.`
    },
    streamer: {
        name: 'Streamer Gaman',
        emoji: '🎮',
        system: `Eres el asistente de Gaman en su rol de STREAMER. Respondes en español, de forma energética, divertida y natural, con emojis. Ayudas con streaming (OBS, overlays, chat, horarios, comunidad, juegos, monetización, consejos para crecer). Si te preguntan por editor, recuerda que puedes cambiar de rol con !editor. Mantén respuestas concisas y amigables.`
    }
};

function getState(jid) {
    if (!userState.has(jid)) userState.set(jid, { role: null, history: [] });
    return userState.get(jid);
}

const MENU_TEXT =
    `¡Hola! 👋 Soy el asistente de *Gaman*.\n\n` +
    `¿Con quién te gustaría hablar hoy? Responde con el número:\n\n` +
    `1️⃣ 🎬 *Editor de Video*\n` +
    `2️⃣ 🎮 *Streamer Gaman*\n\n` +
    `_También puedes escribir *!editor* o *!streamer* cuando quieras cambiar._`;

async function askAI(role, history, userText) {
    if (!groq) {
        return null;
    }
    const messages = [
        { role: 'system', content: ROLES[role].system },
        ...history.slice(-8),
        { role: 'user', content: userText }
    ];
    try {
        const res = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            messages,
            temperature: 0.7,
            max_tokens: 400
        });
        return res.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
        console.error('Groq error:', e?.message || e);
        return null;
    }
}

const FALLBACK = {
    editor: [
        '🎬 ¡Claro! Cuéntame qué necesitas con tu edición. ¿Software, color, audio o render?',
        '✂️ Para editar mejor, define primero el ritmo: cortes cada 2-4s en videos dinámicos.',
        '🎨 Un buen LUT + ajuste de exposición cambia todo. ¿Quieres tips de color?'
    ],
    streamer: [
        '🎮 ¡Vamos! ¿Qué juego o tema de stream hoy?',
        '📡 Tip: bitrate 6000kbps para 1080p60 y audio a 160kbps. OBS listo.',
        '💬 Interactúa con el chat cada 2-3 min para retener audiencia.'
    ]
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function handleCommand(sock, from, cmd, args, state) {
    switch (cmd) {
        case 'ayuda':
        case 'help':
            await sock.sendMessage(from, { text:
                `🤖 *Asistente de Gaman*\n\n` +
                `*!menu* - Elegir con quién hablar\n` +
                `*!editor* - Modo Editor de Video 🎬\n` +
                `*!streamer* - Modo Streamer Gaman 🎮\n` +
                `*!reset* - Reiniciar conversación\n` +
                `*!ping* - Probar conexión\n` +
                `*!echo <texto>* - Repetir\n\n` +
                `_Envía una imagen y la convierto en sticker 🎨_`
            });
            break;
        case 'menu':
            state.role = null;
            state.history = [];
            await sock.sendMessage(from, { text: MENU_TEXT });
            break;
        case 'editor':
            state.role = 'editor';
            state.history = [];
            await sock.sendMessage(from, { text: `🎬 *Modo Editor de Video activado.*\n${pick(FALLBACK.editor)}` });
            break;
        case 'streamer':
            state.role = 'streamer';
            state.history = [];
            await sock.sendMessage(from, { text: `🎮 *Modo Streamer Gaman activado.*\n${pick(FALLBACK.streamer)}` });
            break;
        case 'reset':
            state.role = null;
            state.history = [];
            await sock.sendMessage(from, { text: '🔄 Conversación reiniciada. ' + MENU_TEXT.split('\n\n')[1] ? 'Escribe *!menu* para elegir.' : '' });
            break;
        case 'ping':
            await sock.sendMessage(from, { text: 'pong 🏓' });
            break;
        case 'echo':
            await sock.sendMessage(from, { text: args.join(' ') || '(sin texto)' });
            break;
        default:
            await sock.sendMessage(from, { text: `❓ Comando no reconocido: *${cmd}*. Usa *!ayuda*.` });
    }
}

async function handleImageSticker(sock, from, msg) {
    try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        const webp = await sharp(buffer).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp().toBuffer();
        await sock.sendMessage(from, { sticker: webp });
    } catch (e) {
        console.error('sticker error:', e?.message || e);
        await sock.sendMessage(from, { text: '⚠️ No pude convertir la imagen a sticker.' });
    }
}

let currentQR = null;

async function startBot() {
    if (sock) {
        try { sock.end(); } catch (e) {}
        sock = null;
    }
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['GamanBot', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            currentQR = qr;
            console.log('\n=== Escanea este QR con WhatsApp ===\n');
            qrcodeTerm.generate(qr, { small: true });
            console.log('\nWhatsApp > Dispositivos vinculados > Vincular dispositivo\n');
        }
        if (connection === 'close') {
            const code = (lastDisconnect?.error)?.output?.statusCode;
            console.log('⚠️ Conexión cerrada. code:', code, (lastDisconnect?.error)?.message);
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconectando en 5s...');
                setTimeout(() => { sock = null; startBot(); }, 5000);
            } else {
                console.log('Sesión cerrada (logged out). Escanea QR de nuevo.');
                sock = null;
            }
        } else if (connection === 'open') {
            currentQR = null;
            console.log('✅ Bot de WhatsApp (Baileys) listo y conectado.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            try {
                if (!msg.message) continue;
                if (msg.key.fromMe) continue;

                const from = msg.key.remoteJid;
                if (from === 'status@broadcast') continue;
                const isGroup = from.endsWith('@g.us');
                const st = getState(from);

                // Imagen -> sticker
                const hasImage = !!(msg.message.imageMessage);
                if (hasImage && !isGroup) {
                    await handleImageSticker(sock, from, msg);
                    continue;
                }

                const text =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    '';
                const body = (text || '').trim();
                if (!body) continue;

                // Selección por número del menú
                if (!st.role && (body === '1' || body === '2')) {
                    st.role = body === '1' ? 'editor' : 'streamer';
                    st.history = [];
                    const r = ROLES[st.role];
                    await sock.sendMessage(from, { text: `${r.emoji} *Modo ${r.name} activado.*\n${pick(FALLBACK[st.role])}\n\n_Escribe *!menu* para cambiar._` });
                    continue;
                }

                // Comandos
                if (body.startsWith(PREFIX)) {
                    const [cmd, ...args] = body.slice(PREFIX.length).trim().split(/\s+/);
                    await handleCommand(sock, from, cmd.toLowerCase(), args, st);
                    continue;
                }

                // Si no tiene rol, mostrar menú
                if (!st.role) {
                    await sock.sendMessage(from, { text: MENU_TEXT });
                    continue;
                }

                // Auto-respuesta inteligente
                const reply = await askAI(st.role, st.history, body);
                if (reply) {
                    st.history.push({ role: 'user', content: body });
                    st.history.push({ role: 'assistant', content: reply });
                    // añadir emoji natural ocasional
                    await sock.sendMessage(from, { text: reply });
                } else {
                    const fb = pick(FALLBACK[st.role]);
                    await sock.sendMessage(from, { text: fb });
                }

                // En grupos: solo responder si mencionan
                if (isGroup) {
                    // (opcional) ignorar grupos por defecto
                }
            } catch (err) {
                console.error('Error manejando mensaje:', err);
            }
        }
    });
}

// Health endpoint para hosting (Render/Koyeb/etc.)
const app = express();
app.get('/', (req, res) => res.send('Gaman WhatsApp Bot OK 🟢'));
app.get('/qr', async (req, res) => {
    if (!currentQR) {
        return res.status(404).send('No hay QR disponible. El bot ya está conectado o reiniciando.');
    }
    try {
        const img = await QRCode.toBuffer(currentQR, { type: 'png', width: 300 });
        res.type('png').send(img);
    } catch (e) {
        res.status(500).send('Error generando QR');
    }
});
app.listen(PORT, () => console.log(`🌐 Health server en puerto ${PORT}`));

startBot().catch((err) => {
    console.error('Error iniciando bot:', err);
    process.exit(1);
});