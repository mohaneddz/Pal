# Pal - Setup and Run Instructions

## Quick Start

### 1. Install dependencies

```bash
cd d:\Programming\Tauri\Projects\pal
pnpm install
```

### 2. Configure runtime

Edit `src/.env` and ensure these are set:

```env
LOCAL_LLM=false
TTS_LOCAL=false
STT_LOCAL=false

VITE_GROQ_API_KEY=your_groq_key
VITE_GROQ_CHAT_MODEL=llama-3.3-70b-versatile
VITE_GROQ_STT_MODEL=whisper-large-v3-turbo
VITE_GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
VITE_GROQ_TTS_VOICE=troy
```

### 3. Start the app

```bash
pnpm tauri dev
```

## Notes

- No Python backend is required for the current app flow.
- Voice capture uses browser microphone APIs in the Tauri webview.
- Conversation and UI preferences are stored in localStorage.

## Build

```bash
pnpm build
```
