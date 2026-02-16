# Pal

Pal is a Tauri + React + TypeScript desktop assistant with a full glass/cosmic UI and Groq-powered voice/chat pipeline.

## Runtime Mode

The app now runs in TypeScript only:

- `LOCAL_LLM=false`
- `TTS_LOCAL=false`
- `STT_LOCAL=false`

When these toggles are `false`, Pal uses Groq models:

- STT: `whisper-large-v3-turbo`
- TTS: `canopylabs/orpheus-v1-english` (voice configurable, default `troy`)
- Chat: `llama-3.3-70b-versatile`

## Environment

Configure `src/.env`:

```env
LOCAL_LLM=false
TTS_LOCAL=false
STT_LOCAL=false

VITE_GROQ_API_KEY=your_groq_key
VITE_GROQ_BASE_URL=https://api.groq.com/openai/v1
VITE_GROQ_CHAT_MODEL=llama-3.3-70b-versatile
VITE_GROQ_STT_MODEL=whisper-large-v3-turbo
VITE_GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
VITE_GROQ_TTS_VOICE=troy
```

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm tauri dev
```
