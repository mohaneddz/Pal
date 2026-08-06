import type { LocalLlmModel, RuntimeConfig, VoicePersona } from "../types/pal";

function parseVoice(value: string | undefined, fallback: VoicePersona): VoicePersona {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase() as VoicePersona;
  const supported: VoicePersona[] = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
  return supported.includes(normalized) ? normalized : fallback;
}

function parseLocalModel(value: string | undefined): LocalLlmModel {
  return value?.trim() === "gemma-3-1b-it-q4_0" ? "gemma-3-1b-it-q4_0" : "gemma-3-4b-it-q4_0";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const apiKey = (import.meta.env.VITE_GROQ_API_KEY ?? "").trim();
export const ONLINE_FEATURES_ENABLED = true;
export const ONLINE_FEATURES_FUTURE_HINT = "Feature disabled in this build.";

/** Base URL of the llama-server child process managed by the Rust side. */
export function localLlmBaseUrl(): string {
  return `http://127.0.0.1:${runtimeConfig.local.llmPort}/v1`;
}

export const runtimeConfig: RuntimeConfig = {
  apiKey,
  baseUrl: (import.meta.env.VITE_GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
  toggles: {
    LOCAL_LLM: false,
    TTS_LOCAL: false,
    STT_LOCAL: false,
  },
  local: {
    llmModel: parseLocalModel(import.meta.env.VITE_LOCAL_LLM_MODEL),
    llmPort: parseNumber(import.meta.env.VITE_LOCAL_LLM_PORT, 8080),
    contextSize: parseNumber(import.meta.env.VITE_LOCAL_LLM_CTX, 8192),
    gpuLayers: parseNumber(import.meta.env.VITE_LOCAL_LLM_NGL, 99),
    threads: parseNumber(import.meta.env.VITE_LOCAL_LLM_THREADS, 6),
    ttsVoice: (import.meta.env.VITE_LOCAL_TTS_VOICE ?? "af_heart").trim(),
    ttsSpeed: 1.0,
  },
  models: {
    chat: (import.meta.env.VITE_GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile").trim(),
    stt: (import.meta.env.VITE_GROQ_STT_MODEL ?? "whisper-large-v3-turbo").trim(),
    tts: (import.meta.env.VITE_GROQ_TTS_MODEL ?? "canopylabs/orpheus-v1-english").trim(),
    ttsVoice: parseVoice(import.meta.env.VITE_GROQ_TTS_VOICE, "troy"),
  },
};

export const hasGroqKey = runtimeConfig.apiKey.length > 0;
