/// <reference types="vite/client" />

declare const __LOCAL_LLM__: string | undefined;
declare const __TTS_LOCAL__: string | undefined;
declare const __STT_LOCAL__: string | undefined;

interface ImportMetaEnv {
  readonly LOCAL_LLM?: string;
  readonly TTS_LOCAL?: string;
  readonly STT_LOCAL?: string;
  readonly VITE_LOCAL_LLM?: string;
  readonly VITE_TTS_LOCAL?: string;
  readonly VITE_STT_LOCAL?: string;
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_GROQ_BASE_URL?: string;
  readonly VITE_GROQ_CHAT_MODEL?: string;
  readonly VITE_GROQ_STT_MODEL?: string;
  readonly VITE_GROQ_TTS_MODEL?: string;
  readonly VITE_GROQ_TTS_VOICE?: string;
  readonly VITE_LOCAL_LLM_MODEL?: string;
  readonly VITE_LOCAL_LLM_PORT?: string;
  readonly VITE_LOCAL_LLM_CTX?: string;
  readonly VITE_LOCAL_LLM_NGL?: string;
  readonly VITE_LOCAL_LLM_THREADS?: string;
  readonly VITE_LOCAL_TTS_VOICE?: string;
}
