<h1 style="font-family: Arial, sans-serif; font-size: 36px; color: #6cb4ec; display: flex; align-items: center; border-bottom: 3px solid #6cb4ec; padding-bottom: 5px;">
    <img src="public/pal.png" alt="PAL Icon" style="width: 50px; height: 50px; margin-right: 15px;">
    PAL - Personal AI Launcher
</h1>
PAL is your desktop co-pilot: fast voice chat, sharp text reasoning, and a clean Tauri-native experience that stays close to your workflow instead of living in a browser tab.

---

## Tech Used 🧑‍💻

![Tauri](https://img.shields.io/badge/Tauri-24C8B1?style=for-the-badge&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-111111?style=for-the-badge)

---

## Core Features ⚡

* 🎙️ **Voice-First Assistant:**
    Talk naturally with PAL using live voice input and spoken output.

* 💬 **Text + Voice Hybrid Chat:**
    Switch between typing and speaking without breaking the conversation flow.

* 🧠 **Multiple Assistant Modes:**
    Different personalities/work modes for different tasks.

* 🕘 **History + Stats:**
    Track past chats and usage analytics from inside the app.

* ⌨️ **Global Shortcuts + Tray Control:**
    Summon PAL quickly, then hide/show/quit from the system tray.

* 💾 **Persistent Local Settings:**
    Startup behavior, preferences, and app state are saved locally.

* 🖥️ **Desktop-Native Performance:**
    Tauri + Rust backend for a lightweight, responsive experience.

---

## Screenshots 📸

<br>
<img src="screenshots/voice.webp" alt="Voice Screen" width="70%"/>

**Voice Screen:** Push-to-talk and conversational voice pipeline for fast hands-free interaction.

<br>
<img src="screenshots/chat.webp" alt="Chat Screen" width="70%"/>

**Chat Screen:** Structured responses, markdown support, and focused conversation layout.

<br>
<img src="screenshots/history.webp" alt="History Screen" width="70%"/>

**History Screen:** Jump back into previous sessions instantly.

<br>
<img src="screenshots/stats.webp" alt="Stats Screen" width="70%"/>

**Stats Screen:** Lightweight analytics to understand how you use PAL.

<br>
<img src="screenshots/settings.webp" alt="Settings Screen" width="70%"/>

**Settings Screen:** Configure startup, models, voice behavior, and app preferences.

<br>
<img src="screenshots/about.webp" alt="About Screen" width="70%"/>

**About Screen:** Quick project overview and build context.

---

## Runtime Modes 🧪

Current default build runs with cloud providers:

| Flag | Value | Meaning |
|------|-------|---------|
| `LOCAL_LLM` | `false` | Chat model runs via cloud API |
| `STT_LOCAL` | `false` | Speech-to-text runs via cloud API |
| `TTS_LOCAL` | `false` | Text-to-speech runs via cloud API |

Default model setup:

- Chat: `llama-3.3-70b-versatile`
- STT: `whisper-large-v3-turbo`
- TTS: `canopylabs/orpheus-v1-english`

---

## Project Structure

```plaintext
/ (root)
├── README.md
├── AnotherProject.md
├── package.json
├── vite.config.ts
├── screenshots/            # App screenshots used in this README
├── public/                 # Static assets (including PAL icon)
├── src/                    # React + TypeScript frontend
│   ├── components/
│   ├── routes/
│   ├── services/
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Rust + Tauri desktop backend
└── backend/                # Optional/local experimentation backend
```

---

## Setup and Development 🛠️

1. **Prerequisites:**
   - Node.js (v18+)
   - Rust toolchain
   - Tauri CLI

2. **Install dependencies:**
   ```sh
   pnpm install
   ```

3. **Configure environment:**
   Create/update `src/.env`:
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

4. **Run in development:**
   ```sh
   pnpm tauri dev
   ```

5. **Other useful commands:**
   ```sh
   pnpm dev
   pnpm build
   ```

---

## Recommended IDE Setup 💻

* [VS Code](https://code.visualstudio.com/)
* [Tauri for VS Code](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
* [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## Roadmap 🗺️

### Phase 1: Core Experience
- [x] Voice + text assistant workflows
- [x] Tauri desktop integration
- [x] Tray behavior and global shortcuts
- [x] Start with OS

### Phase 2: Expansion
- [ ] More local model runtime options
- [ ] Deeper assistant mode customization
- [ ] Improved session intelligence and memory controls

---

## Notes

- Current setup is Windows-first.
- Active flow does not require a Python backend.
- App data is persisted locally via Tauri plugins.

---

## Contact 📬

- GitHub: [mohaneddz](https://github.com/mohaneddz)
- Email: mohaned.manaa.dev@gmail.com
