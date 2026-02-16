export type PageId = "home" | "history" | "stats" | "settings" | "about";

export type AssistantStatus = "idle" | "listening" | "processing" | "speaking" | "error";

export type MessageRole = "user" | "assistant";

export type VoicePersona = "autumn" | "diana" | "hannah" | "austin" | "daniel" | "troy";

export type SpeechStyle = "natural" | "cheerful" | "professional" | "whisper";
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

export interface RuntimeConfig {
  apiKey: string;
  baseUrl: string;
  toggles: RuntimeToggles;
  models: RuntimeModels;
}

export interface PalUiSettings {
  voice: VoicePersona;
  speechStyle: SpeechStyle;
  assistantMode: AssistantMode;
  autoSpeak: boolean;
  minimizeToTray: boolean;
}
