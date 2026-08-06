export type PageId = "home" | "history" | "stats" | "settings" | "about";

export type AssistantStatus = "idle" | "listening" | "processing" | "speaking" | "error";

export type MessageRole = "user" | "assistant";

export type VoicePersona = "autumn" | "diana" | "hannah" | "austin" | "daniel" | "troy";

export type SpeechStyle = "natural" | "neutral" | "cheerful" | "professional" | "whisper";
export type AssistantMode =
  | "advisor"
  | "therapist"
  | "sassy"
  | "chatty"
  | "coach"
  | "analyst"
  | "creative"
  | "guardian";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface ApiQuotaSnapshot {
  limitRequests?: number;
  remainingRequests?: number;
  resetRequests?: string;
  limitTokens?: number;
  remainingTokens?: number;
  resetTokens?: string;
  rawHeaders: Record<string, string>;
  updatedAt: number;
}

export interface ApiUsageStats {
  totalRequests: number;
  chatRequests: number;
  transcriptionRequests: number;
  speechRequests: number;
  failedRequests: number;
  quota: ApiQuotaSnapshot | null;
}

export interface RuntimeToggles {
  LOCAL_LLM: boolean;
  TTS_LOCAL: boolean;
  STT_LOCAL: boolean;
}

export interface RuntimeModels {
  chat: string;
  stt: string;
  tts: string;
  ttsVoice: VoicePersona;
}

/** Which Gemma 3 weight the bundled llama-server loads. */
export type LocalLlmModel = "gemma-3-4b-it-q4_0" | "gemma-3-1b-it-q4_0";

/** Lifecycle of the llama-server child process owned by the Rust side. */
export type LocalServerState = "stopped" | "starting" | "ready" | "error";

export interface LocalServerStatus {
  state: LocalServerState;
  model: LocalLlmModel;
  port: number;
  /** Populated only when `state` is "error". */
  message?: string;
}

export interface LocalConfig {
  llmModel: LocalLlmModel;
  llmPort: number;
  contextSize: number;
  /** Layers offloaded to GPU; 99 means "all that fit". */
  gpuLayers: number;
  threads: number;
  /** whisper.cpp model file stem in `backend/whisper/models`. */
  sttModel: string;
  sttPort: number;
  /** Kokoro voice id, e.g. `af_heart`. Distinct from the cloud `VoicePersona`. */
  ttsVoice: string;
  ttsSpeed: number;
}

export interface RuntimeConfig {
  apiKey: string;
  baseUrl: string;
  toggles: RuntimeToggles;
  models: RuntimeModels;
  local: LocalConfig;
}

export interface PalUiSettings {
  voice: VoicePersona;
  speechStyle: SpeechStyle;
  assistantMode: AssistantMode;
  autoSpeak: boolean;
  minimizeToTray: boolean;
  autoFreeRam: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
}
