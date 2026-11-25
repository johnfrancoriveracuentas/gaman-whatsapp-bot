# 🤖 Bot de WhatsApp de Gaman (Gratis, 24/7, con IA)

Bot de WhatsApp que responde automáticamente, con **IA gratis (Groq)**, menú de roles (Editor de Video 🎬 / Streamer Gaman 🎮), stickers desde imágenes, y funcionamiento **sin tu PC encendida** (hosting gratis).

## Características
- 🧠 IA gratis con Groq (Llama 3.1) + respuestas naturales con emojis
- 🎬🎮 Menú sutil: elige con quién hablar (Editor o Streamer)
- 🎨 Convierte imágenes en stickers automáticamente
- 💬 Auto-respuestas por palabras clave
- 🌐 Health check para hosting (Render/Koyeb/etc.)
- 🔒 Sesión persistente (no re-escanear QR)

## Requisitos
- Node.js 18+ (probado en v24)
- Cuenta de WhatsApp para el bot
- (Opcional) API key gratis de Groq: https://console.groq.com/keys

## Instalación local
```bash
npm install
cp .env.example .env
# edita .env y pon tu GROQ_API_KEY (opcional)
npm start
```
Escanea el QR con WhatsApp → Dispositivos vinculados → Vincular dispositivo.

## Comandos
- `!menu` - Elegir con quién hablar
- `!editor` - Modo Editor de Video 🎬
- `!streamer` - Modo Streamer Gaman 🎮
- `!ayuda` / `!help` - Lista de comandos
- `!ping` - Probar conexión
- `!echo <texto>` - Repetir
- `!reset` - Reiniciar conversación
- Enviar una imagen → se convierte en sticker 🎨

## 🚀 Dejarlo funcionando 24/7 SIN tu PC (gratis)

### Opción A: Render (más fácil, free tier)
1. Sube este repo a GitHub.
2. Crea cuenta en https://render.com
3. New → Web Service → conecta tu repo → entorno Docker.
4. Agrega variable de entorno `GROQ_API_KEY` (tu key gratis).
5. Deploy. Render te da URL pública.
6. Para evitar que "duerma" (free tier duerme tras 15 min sin tráfico), crea monitor gratis en https://uptimerobot.com apuntando a `https://tu-app.onrender.com/health` cada 5 minutos.

### Opción B: Oracle Cloud (siempre gratis, más potente)
1. Crea VM ARM (Always Free) en https://cloud.oracle.com
2. Instala Docker y clona el repo.
3. `docker build -t gaman-bot . && docker run -d -p 3000:3000 -e GROQ_API_KEY=... -v $(pwd)/auth:/app/auth_info_baileys gaman-bot`
4. Usa `pm2` o systemd para auto-restart.

### Opción C: Celular Android (Termux)
1. Instala Termux + Node.js.
2. Clona repo, `npm install`, `npm start`.
3. Usa `termux-wake-lock` para que no se duerma.
4. Deja el celular enchufado y con WiFi.

## Referencias en GitHub (todo gratis)
- https://github.com/WhiskeySockets/Baileys (base, ~15k ⭐)
- https://github.com/wwebjs/whatsapp-web.js (alternativa, 23k ⭐)
- https://github.com/mruniquehacker/Knightbot-MD (bot completo, 8k ⭐)
- https://github.com/lyfe00011/levanter (multi-sesión, 2.4k ⭐)

## Notas
- Usa WhatsApp Web (no API oficial). Para uso personal/comunidad.
- Para empresa/producción a escala, usa WhatsApp Business API (paga).
- La sesión se guarda en `auth_info_baileys/` (NO la compartas).
- Evita enviar spam masivo: riesgo de ban de WhatsApp.