import type { RuntimeConfig, VoicePersona } from "../types/pal";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseFlag(value: string | boolean | undefined, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function parseVoice(value: string | undefined, fallback: VoicePersona): VoicePersona {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase() as VoicePersona;
  const supported: VoicePersona[] = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
  return supported.includes(normalized) ? normalized : fallback;
}

const localLlmFromDefine = typeof __LOCAL_LLM__ !== "undefined" ? __LOCAL_LLM__ : undefined;
const ttsLocalFromDefine = typeof __TTS_LOCAL__ !== "undefined" ? __TTS_LOCAL__ : undefined;
const sttLocalFromDefine = typeof __STT_LOCAL__ !== "undefined" ? __STT_LOCAL__ : undefined;

const apiKey = (import.meta.env.VITE_GROQ_API_KEY ?? "").trim();

export const runtimeConfig: RuntimeConfig = {
  apiKey,
  baseUrl: (import.meta.env.VITE_GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
  toggles: {
    LOCAL_LLM: parseFlag(import.meta.env.VITE_LOCAL_LLM ?? import.meta.env.LOCAL_LLM ?? localLlmFromDefine, false),
    TTS_LOCAL: parseFlag(import.meta.env.VITE_TTS_LOCAL ?? import.meta.env.TTS_LOCAL ?? ttsLocalFromDefine, false),
    STT_LOCAL: parseFlag(import.meta.env.VITE_STT_LOCAL ?? import.meta.env.STT_LOCAL ?? sttLocalFromDefine, false),
  },
  models: {
    chat: (import.meta.env.VITE_GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile").trim(),
    stt: (import.meta.env.VITE_GROQ_STT_MODEL ?? "whisper-large-v3-turbo").trim(),
    tts: (import.meta.env.VITE_GROQ_TTS_MODEL ?? "canopylabs/orpheus-v1-english").trim(),
    ttsVoice: parseVoice(import.meta.env.VITE_GROQ_TTS_VOICE, "troy"),
  },
};

export const hasGroqKey = runtimeConfig.apiKey.length > 0;
