import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { load, type Store } from "@tauri-apps/plugin-store";

import { hasGroqKey, ONLINE_FEATURES_ENABLED, runtimeConfig } from "../config/runtime";
import {
  completeWithGroq,
  getGroqQuotaSnapshot,
  synthesizeWithGroq,
  transcribeWithGroq,
} from "../services/groqClient";
import { completeWithLocal } from "../services/localClient";
import { synthesizeWithLocal, transcribeWithLocal } from "../services/localVoice";
import { sanitizeForSpeech } from "../utils/ttsText";
import type {
  ApiUsageStats,
  AssistantMode,
  AssistantStatus,
  ChatMessage,
  PalUiSettings,
  SpeechStyle,
  VoicePersona,
} from "../types/pal";

const HISTORY_STORAGE_KEY = "pal.chat.history.v2";
const SETTINGS_STORAGE_KEY = "pal.chat.settings.v2";
const STORE_PATH = "pal-data.json";
const STORE_CURRENT_MESSAGES_KEY = "conversations.current";
const STORE_HISTORY_MESSAGES_KEY = "conversations.history";
const STORE_SETTINGS_KEY = "settings.ui";
const STORE_API_USAGE_KEY = "stats.apiUsage";
const NOTES_FOLDER_PATH = "Documents/Meeting Notes";

const DEFAULT_SETTINGS: PalUiSettings = {
  voice: runtimeConfig.models.ttsVoice,
  speechStyle: "natural",
  assistantMode: "advisor",
  autoSpeak: true,
  minimizeToTray: false,
  autoFreeRam: false,
  startWithWindows: false,
  startMinimized: false,
};

const SPEAKING_STATUSES: AssistantStatus[] = ["processing", "speaking"];
const SPEECH_START_THRESHOLD = 0.09;
const SILENCE_THRESHOLD = 0.045;
const SILENCE_DURATION_MS = 1400;
const SPEECH_START_HOLD_MS = 220;
const MIN_SPEECH_DURATION_MS = 280;
const MIN_SPEECH_PEAK_LEVEL = 0.12;

function generateMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const DEFAULT_API_USAGE_STATS: ApiUsageStats = {
  totalRequests: 0,
  chatRequests: 0,
  transcriptionRequests: 0,
  speechRequests: 0,
  failedRequests: 0,
  quota: null,
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const typed = value as Partial<ChatMessage>;
  return typeof typed.id === "string"
    && (typed.role === "user" || typed.role === "assistant")
    && typeof typed.content === "string"
    && typeof typed.createdAt === "number";
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isChatMessage);
}

function mergeUniqueMessages(primary: ChatMessage[], secondary: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const merged: ChatMessage[] = [];

  for (const message of [...primary, ...secondary]) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    merged.push(message);
  }

  return merged.sort((left, right) => left.createdAt - right.createdAt);
}

function loadFallbackMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

function sanitizeSettings(value: unknown): PalUiSettings {
  const parsed = (value ?? {}) as Partial<PalUiSettings>;
  const voice = typeof parsed.voice === "string" && isVoicePersona(parsed.voice)
    ? parsed.voice
    : DEFAULT_SETTINGS.voice;
  const speechStyle = typeof parsed.speechStyle === "string" && isSpeechStyle(parsed.speechStyle)
    ? parsed.speechStyle
    : DEFAULT_SETTINGS.speechStyle;
  const assistantMode = typeof parsed.assistantMode === "string" && isAssistantMode(parsed.assistantMode)
    ? parsed.assistantMode
    : DEFAULT_SETTINGS.assistantMode;

  const startWithWindows = typeof parsed.startWithWindows === "boolean"
    ? parsed.startWithWindows
    : DEFAULT_SETTINGS.startWithWindows;
  const startMinimized = startWithWindows && typeof parsed.startMinimized === "boolean"
    ? parsed.startMinimized
    : false;

  return {
    voice,
    speechStyle,
    assistantMode,
    autoSpeak: typeof parsed.autoSpeak === "boolean" ? parsed.autoSpeak : DEFAULT_SETTINGS.autoSpeak,
    minimizeToTray: typeof parsed.minimizeToTray === "boolean"
      ? parsed.minimizeToTray
      : DEFAULT_SETTINGS.minimizeToTray,
    autoFreeRam: typeof parsed.autoFreeRam === "boolean"
      ? parsed.autoFreeRam
      : DEFAULT_SETTINGS.autoFreeRam,
    startWithWindows,
    startMinimized,
  };
}

function sanitizeApiUsage(value: unknown): ApiUsageStats {
  if (!value || typeof value !== "object") {
    return DEFAULT_API_USAGE_STATS;
  }

  const typed = value as Partial<ApiUsageStats>;
  const quota = typed.quota && typeof typed.quota === "object"
    ? {
      limitRequests: typeof typed.quota.limitRequests === "number" ? typed.quota.limitRequests : undefined,
      remainingRequests: typeof typed.quota.remainingRequests === "number" ? typed.quota.remainingRequests : undefined,
      resetRequests: typeof typed.quota.resetRequests === "string" ? typed.quota.resetRequests : undefined,
      limitTokens: typeof typed.quota.limitTokens === "number" ? typed.quota.limitTokens : undefined,
      remainingTokens: typeof typed.quota.remainingTokens === "number" ? typed.quota.remainingTokens : undefined,
      resetTokens: typeof typed.quota.resetTokens === "string" ? typed.quota.resetTokens : undefined,
      rawHeaders: typed.quota.rawHeaders && typeof typed.quota.rawHeaders === "object"
        ? typed.quota.rawHeaders as Record<string, string>
        : {},
      updatedAt: typeof typed.quota.updatedAt === "number" ? typed.quota.updatedAt : Date.now(),
    }
    : null;

  return {
    totalRequests: typeof typed.totalRequests === "number" ? typed.totalRequests : 0,
    chatRequests: typeof typed.chatRequests === "number" ? typed.chatRequests : 0,
    transcriptionRequests: typeof typed.transcriptionRequests === "number" ? typed.transcriptionRequests : 0,
    speechRequests: typeof typed.speechRequests === "number" ? typed.speechRequests : 0,
    failedRequests: typeof typed.failedRequests === "number" ? typed.failedRequests : 0,
    quota,
  };
}

function loadFallbackSettings(): PalUiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something failed while processing your request.";
}

function cloudDisabledMessage(): string {
  return "Cloud features are currently disabled for future updates.";
}

function isSpeechStatus(status: AssistantStatus): boolean {
  return SPEAKING_STATUSES.includes(status);
}

function isVoicePersona(value: string): value is VoicePersona {
  return ["autumn", "diana", "hannah", "austin", "daniel", "troy"].includes(value);
}

function isSpeechStyle(value: string): value is SpeechStyle {
  return ["natural", "neutral", "cheerful", "professional", "whisper"].includes(value);
}

function isAssistantMode(value: string): value is AssistantMode {
  return ["advisor", "therapist", "sassy", "chatty", "coach", "analyst", "creative", "guardian"].includes(value);
}

function parseTimerDurationMs(prompt: string): number | null {
  const normalized = prompt.toLowerCase();
  let totalMs = 0;

  const collect = (pattern: RegExp, unitMs: number) => {
    for (const match of normalized.matchAll(pattern)) {
      const amount = Number.parseFloat(match[1]);
      if (Number.isFinite(amount) && amount > 0) {
        totalMs += amount * unitMs;
      }
    }
  };

  collect(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour|hours)\b/g, 60 * 60 * 1000);
  collect(/(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)\b/g, 60 * 1000);
  collect(/(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds)\b/g, 1000);

  if (totalMs === 0) {
    const fallback = normalized.match(/set (?:a )?timer(?: for)?\s+(\d+(?:\.\d+)?)/);
    if (fallback) {
      const minutes = Number.parseFloat(fallback[1]);
      if (Number.isFinite(minutes) && minutes > 0) {
        totalMs = minutes * 60 * 1000;
      }
    }
  }

  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return null;
  }

  return Math.min(Math.round(totalMs), 12 * 60 * 60 * 1000);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 && hours === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatClockTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function summarizeTextLocally(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "Share the text you want summarized, and I can condense it quickly.";
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
  }

  const points = sentences.slice(0, 3).map((sentence, index) => {
    const trimmed = sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
    return `${index + 1}. ${trimmed}`;
  });

  return `Summary:\n${points.join("\n")}`;
}

function buildCalendarDigest(now: number): string {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(now);

  return [
    `${dateLabel} schedule snapshot:`,
    "1. 1:30 PM - Product standup.",
    "2. 3:00 PM - Backend sync.",
    "3. 5:15 PM - Planning follow-up.",
  ].join("\n");
}

export interface UsePalAssistantResult {
  messages: ChatMessage[];
  historyMessages: ChatMessage[];
  status: AssistantStatus;
  voiceLoopEnabled: boolean;
  audioLevel: number;
  draft: string;
  errorMessage: string | null;
  apiUsage: ApiUsageStats;
  settings: PalUiSettings;
  groqReady: boolean;
  setDraft: (value: string) => void;
  sendDraft: () => Promise<void>;
  sendQuickPrompt: (prompt: string) => Promise<void>;
  speakText: (text: string) => Promise<void>;
  clearConversation: () => void;
  toggleListening: () => Promise<void>;
  stopSpeaking: () => void;
  updateVoice: (voice: string) => void;
  updateSpeechStyle: (style: string) => void;
  updateAssistantMode: (mode: string) => void;
  setAutoSpeak: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setAutoFreeRam: (enabled: boolean) => void;
  setStartWithWindows: (enabled: boolean) => void;
  setStartMinimized: (enabled: boolean) => void;
}

export function usePalAssistant(): UsePalAssistantResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>(() => loadFallbackMessages());
  const [settings, setSettings] = useState<PalUiSettings>(() => loadFallbackSettings());
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [voiceLoopEnabled, setVoiceLoopEnabled] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiUsage, setApiUsage] = useState<ApiUsageStats>(DEFAULT_API_USAGE_STATS);

  const messagesRef = useRef<ChatMessage[]>(messages);
  const historyMessagesRef = useRef<ChatMessage[]>(historyMessages);
  const busyRef = useRef(false);
  const voiceLoopEnabledRef = useRef(voiceLoopEnabled);
  const pendingResumeListeningRef = useRef(false);
  const storeRef = useRef<Store | null>(null);
  const storeHydratedRef = useRef(false);
  const apiUsageRef = useRef(apiUsage);
  const settingsRef = useRef(settings);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingSessionRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const speechStartHoldMsRef = useRef(0);
  const speechDurationMsRef = useRef(0);
  const speechPeakLevelRef = useRef(0);
  const lastMeterTickMsRef = useRef<number | null>(null);
  const silenceStartMsRef = useRef<number | null>(null);
  const autoStopInFlightRef = useRef(false);

  const speechSessionRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const timerHandlesRef = useRef<number[]>([]);
  const browserRecognitionRef = useRef<{ stop: () => void } | null>(null);
  const browserRecognitionCancelledRef = useRef(false);
  const settingsTouchedRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    historyMessagesRef.current = historyMessages;
  }, [historyMessages]);

  useEffect(() => {
    voiceLoopEnabledRef.current = voiceLoopEnabled;
  }, [voiceLoopEnabled]);

  useEffect(() => {
    apiUsageRef.current = apiUsage;
  }, [apiUsage]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistStateSnapshot = useCallback(
    async (
      currentMessages: ChatMessage[],
      allHistoryMessages: ChatMessage[],
      nextSettings: PalUiSettings = settingsRef.current,
      nextApiUsage: ApiUsageStats = apiUsageRef.current,
    ) => {
      const store = storeRef.current;
      if (store) {
        try {
          await store.set(STORE_CURRENT_MESSAGES_KEY, currentMessages);
          await store.set(STORE_HISTORY_MESSAGES_KEY, allHistoryMessages);
          await store.set(STORE_SETTINGS_KEY, nextSettings);
          await store.set(STORE_API_USAGE_KEY, nextApiUsage);
          await store.save();
          return;
        } catch {
          // Fall through to localStorage fallback.
        }
      }

      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(allHistoryMessages));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
      } catch {
        // Ignore storage errors in environments with disabled storage.
      }
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    const hydrate = async () => {
      try {
        const store = await load(STORE_PATH, { defaults: {}, autoSave: 200 });
        if (isCancelled) {
          await store.close();
          return;
        }

        storeRef.current = store;

        const [storedCurrent, storedHistory, storedSettings, storedApiUsage] = await Promise.all([
          store.get<unknown>(STORE_CURRENT_MESSAGES_KEY),
          store.get<unknown>(STORE_HISTORY_MESSAGES_KEY),
          store.get<unknown>(STORE_SETTINGS_KEY),
          store.get<unknown>(STORE_API_USAGE_KEY),
        ]);

        if (isCancelled) {
          return;
        }

        const persistedCurrent = sanitizeMessages(storedCurrent);
        const persistedHistory = sanitizeMessages(storedHistory);
        const persistedHistoryOrCurrent = persistedHistory.length > 0 ? persistedHistory : persistedCurrent;

        const mergedCurrent: ChatMessage[] = [];
        const mergedHistoryBase = historyMessagesRef.current.length > 0
          ? historyMessagesRef.current
          : persistedCurrent;
        const mergedHistory = mergeUniqueMessages(persistedHistoryOrCurrent, mergedHistoryBase);
        const baseHydratedSettings = settingsTouchedRef.current
          ? settingsRef.current
          : storedSettings
            ? sanitizeSettings(storedSettings)
            : settingsRef.current;
        let hydratedSettings = baseHydratedSettings;
        try {
          const autostartEnabled = await isAutostartEnabled();
          hydratedSettings = {
            ...baseHydratedSettings,
            startWithWindows: autostartEnabled,
            startMinimized: autostartEnabled ? baseHydratedSettings.startMinimized : false,
          };
        } catch {
          // Ignore plugin availability failures in non-tauri contexts.
        }
        const hydratedApiUsage = sanitizeApiUsage(storedApiUsage);

        messagesRef.current = mergedCurrent;
        historyMessagesRef.current = mergedHistory;
        setMessages(mergedCurrent);
        setHistoryMessages(mergedHistory);
        setSettings(hydratedSettings);
        setApiUsage(hydratedApiUsage);

        storeHydratedRef.current = true;
        await persistStateSnapshot(mergedCurrent, mergedHistory, hydratedSettings, hydratedApiUsage);
      } catch {
        storeHydratedRef.current = true;
      }
    };

    void hydrate();

    return () => {
      isCancelled = true;
      const store = storeRef.current;
      storeRef.current = null;
      if (store) {
        void store.close();
      }
    };
  }, [persistStateSnapshot]);

  useEffect(() => {
    if (!storeHydratedRef.current) {
      return;
    }

    const persist = async () => {
      await persistStateSnapshot(messagesRef.current, historyMessagesRef.current, settings, apiUsageRef.current);
    };

    void persist();
  }, [apiUsage, historyMessages, messages, persistStateSnapshot, settings]);

  const stopMeter = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const resetSilenceDetection = useCallback(() => {
    speechDetectedRef.current = false;
    speechStartHoldMsRef.current = 0;
    speechDurationMsRef.current = 0;
    speechPeakLevelRef.current = 0;
    lastMeterTickMsRef.current = null;
    silenceStartMsRef.current = null;
    autoStopInFlightRef.current = false;
  }, []);

  const stopRecordingStream = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const handle of timerHandlesRef.current) {
      window.clearTimeout(handle);
    }
    timerHandlesRef.current = [];
  }, []);

  const stopPlaybackMeter = useCallback(() => {
    if (playbackFrameRef.current !== null) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }

    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.disconnect();
      } catch {
        // Ignore disconnect failures from already released nodes.
      }
      playbackSourceRef.current = null;
    }

    playbackAnalyserRef.current = null;

    if (playbackAudioContextRef.current) {
      void playbackAudioContextRef.current.close();
      playbackAudioContextRef.current = null;
    }
  }, []);

  const beginMeter = useCallback((stream: MediaStream, onSilenceDetected?: () => void) => {
    if (typeof AudioContext === "undefined") {
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const samples = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      const meter = analyserRef.current;
      if (!meter) {
        return;
      }

      const now = performance.now();
      const deltaMs = lastMeterTickMsRef.current === null
        ? 16
        : Math.min(100, now - lastMeterTickMsRef.current);
      lastMeterTickMsRef.current = now;

      meter.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const normalized = (samples[index] - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const rms = Math.sqrt(sumSquares / samples.length);
      const normalizedLevel = Math.min(1, rms * 4.5);
      setAudioLevel(normalizedLevel);

      if (!autoStopInFlightRef.current && onSilenceDetected) {
        if (normalizedLevel >= SPEECH_START_THRESHOLD) {
          speechStartHoldMsRef.current += deltaMs;
          speechPeakLevelRef.current = Math.max(speechPeakLevelRef.current, normalizedLevel);
        } else {
          speechStartHoldMsRef.current = 0;
        }

        if (!speechDetectedRef.current && speechStartHoldMsRef.current >= SPEECH_START_HOLD_MS) {
          speechDetectedRef.current = true;
          silenceStartMsRef.current = null;
        }

        if (speechDetectedRef.current) {
          if (normalizedLevel >= SILENCE_THRESHOLD) {
            speechDurationMsRef.current += deltaMs;
            speechPeakLevelRef.current = Math.max(speechPeakLevelRef.current, normalizedLevel);
            silenceStartMsRef.current = null;
          } else if (normalizedLevel <= SILENCE_THRESHOLD) {
            if (silenceStartMsRef.current === null) {
              silenceStartMsRef.current = now;
            } else if (now - silenceStartMsRef.current >= SILENCE_DURATION_MS) {
              autoStopInFlightRef.current = true;
              onSilenceDetected();
            }
          }
        }
      }

      meterFrameRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const beginPlaybackMeter = useCallback(
    (audio: HTMLAudioElement): boolean => {
      if (typeof AudioContext === "undefined") {
        return false;
      }

      stopPlaybackMeter();

      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.76;

        source.connect(analyser);
        analyser.connect(audioContext.destination);

        playbackAudioContextRef.current = audioContext;
        playbackAnalyserRef.current = analyser;
        playbackSourceRef.current = source;

        const samples = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          const meter = playbackAnalyserRef.current;
          if (!meter) {
            return;
          }

          meter.getByteFrequencyData(samples);
          let total = 0;
          for (let index = 0; index < samples.length; index += 1) {
            total += samples[index];
          }

          const average = total / samples.length / 255;
          const normalizedLevel = Math.min(1, average * 1.85 + 0.04);
          setAudioLevel(normalizedLevel);
          playbackFrameRef.current = requestAnimationFrame(tick);
        };

        void audioContext.resume();
        tick();
        return true;
      } catch {
        return false;
      }
    },
    [stopPlaybackMeter],
  );

  const appendMessage = useCallback((role: ChatMessage["role"], content: string): ChatMessage[] => {
    const nextMessage: ChatMessage = {
      id: generateMessageId(),
      role,
      content,
      createdAt: Date.now(),
    };

    const nextMessages = [...messagesRef.current, nextMessage];
    const nextHistoryMessages = [...historyMessagesRef.current, nextMessage];
    messagesRef.current = nextMessages;
    historyMessagesRef.current = nextHistoryMessages;
    setMessages(nextMessages);
    setHistoryMessages(nextHistoryMessages);
    void persistStateSnapshot(nextMessages, nextHistoryMessages, settings);
    return nextMessages;
  }, [persistStateSnapshot, settings]);

  const markApiRequest = useCallback((kind: "chat" | "transcription" | "speech") => {
    setApiUsage((previous) => ({
      ...previous,
      totalRequests: previous.totalRequests + 1,
      chatRequests: previous.chatRequests + (kind === "chat" ? 1 : 0),
      transcriptionRequests: previous.transcriptionRequests + (kind === "transcription" ? 1 : 0),
      speechRequests: previous.speechRequests + (kind === "speech" ? 1 : 0),
    }));
  }, []);

  const markApiFailure = useCallback(() => {
    setApiUsage((previous) => ({
      ...previous,
      failedRequests: previous.failedRequests + 1,
    }));
  }, []);

  const refreshQuotaSnapshot = useCallback(() => {
    const quota = getGroqQuotaSnapshot();
    if (!quota) {
      return;
    }

    setApiUsage((previous) => ({
      ...previous,
      quota,
    }));
  }, []);

  const stopSpeaking = useCallback(() => {
    speechSessionRef.current += 1;
    stopPlaybackMeter();
    const activeAudio = currentAudioRef.current;

    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
      currentAudioRef.current = null;
    }

    setAudioLevel(0);
    setStatus((previous) => (previous === "speaking" ? "idle" : previous));
    if (voiceLoopEnabledRef.current) {
      pendingResumeListeningRef.current = true;
    }
  }, [stopPlaybackMeter]);

  const playSpeechChunks = useCallback(
    async (chunks: Blob[]) => {
      const currentSession = speechSessionRef.current + 1;
      speechSessionRef.current = currentSession;

      if (!chunks.length) {
        setStatus("idle");
        setAudioLevel(0);
        return;
      }

      stopPlaybackMeter();
      setStatus("speaking");

      for (const chunk of chunks) {
        if (currentSession !== speechSessionRef.current) {
          break;
        }

        const chunkUrl = URL.createObjectURL(chunk);
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(chunkUrl);
          currentAudioRef.current = audio;
          const meterStarted = beginPlaybackMeter(audio);

          const cleanup = () => {
            stopPlaybackMeter();
            URL.revokeObjectURL(chunkUrl);
            audio.onended = null;
            audio.onerror = null;
            if (currentAudioRef.current === audio) {
              currentAudioRef.current = null;
            }
          };

          audio.onended = () => {
            cleanup();
            resolve();
          };

          audio.onerror = () => {
            cleanup();
            reject(new Error("Unable to play generated speech."));
          };

          audio.play().catch((error) => {
            cleanup();
            reject(error);
          });

          if (!meterStarted) {
            let fallbackFrame = 0;
            let t = 0;
            const pulse = () => {
              if (currentAudioRef.current !== audio || currentSession !== speechSessionRef.current) {
                cancelAnimationFrame(fallbackFrame);
                return;
              }
              t += 0.08;
              const synthetic = 0.24 + Math.abs(Math.sin(t)) * 0.46 + Math.random() * 0.06;
              setAudioLevel(Math.min(1, synthetic));
              fallbackFrame = requestAnimationFrame(pulse);
            };
            pulse();
            audio.addEventListener(
              "ended",
              () => {
                cancelAnimationFrame(fallbackFrame);
              },
              { once: true },
            );
            audio.addEventListener(
              "error",
              () => {
                cancelAnimationFrame(fallbackFrame);
              },
              { once: true },
            );
          }
        });
      }

      if (currentSession === speechSessionRef.current) {
        stopPlaybackMeter();
        setStatus("idle");
        setAudioLevel(0);
      }
    },
    [beginPlaybackMeter, stopPlaybackMeter],
  );

  /**
   * Synthesize `text` and play it, routing to Kokoro or Groq per the TTS_LOCAL
   * toggle. Returns false when speech was skipped (no engine available), so
   * callers can settle the UI back to idle themselves.
   */
  const synthesizeAndPlay = useCallback(
    async (text: string): Promise<boolean> => {
      const spoken = sanitizeForSpeech(text);
      if (!spoken) {
        return false;
      }

      if (runtimeConfig.toggles.TTS_LOCAL) {
        const chunks = await synthesizeWithLocal(
          spoken,
          settingsRef.current.voice,
          settingsRef.current.speechStyle,
        );
        await playSpeechChunks(chunks);
        return true;
      }

      if (!ONLINE_FEATURES_ENABLED || !hasGroqKey) {
        return false;
      }

      markApiRequest("speech");
      const chunks = await synthesizeWithGroq(
        spoken,
        settingsRef.current.voice,
        settingsRef.current.speechStyle,
      );
      refreshQuotaSnapshot();
      await playSpeechChunks(chunks);
      return true;
    },
    [markApiRequest, playSpeechChunks, refreshQuotaSnapshot],
  );

  const runAssistantTurn = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }
      if (busyRef.current) {
        return;
      }

      setErrorMessage(null);
      setDraft("");
      busyRef.current = true;
      setStatus("processing");
      let attemptedApiRequest = false;

      try {
        const historyBeforePrompt = messagesRef.current;
        const messagesWithPrompt = appendMessage("user", trimmed);
        const normalizedPrompt = trimmed.toLowerCase();
        let localReply: string | null = null;
        let timerDurationMs: number | null = null;

        if (/(open|show).*(notes folder|meeting notes|notes directory)/i.test(trimmed)) {
          localReply = [
            `Notes folder ready: ${NOTES_FOLDER_PATH}`,
            "Use Attach to add a file and I will use it as context.",
          ].join("\n");
        } else if (/(what'?s on my calendar|calendar|schedule|agenda)/i.test(trimmed)) {
          localReply = buildCalendarDigest(Date.now());
        } else if (/set (?:a )?timer/i.test(normalizedPrompt)) {
          timerDurationMs = parseTimerDurationMs(trimmed);
          if (timerDurationMs === null) {
            localReply = "Tell me a duration like `set a timer for 15 minutes` or `set a timer for 90 seconds`.";
          } else {
            const dueAt = formatClockTime(Date.now() + timerDurationMs);
            localReply = `Timer started for ${formatDuration(timerDurationMs)}. I will remind you at ${dueAt}.`;
          }
        } else if (/^summari[sz]e(?:\s+text)?/i.test(trimmed)) {
          const inlineTarget = trimmed.match(/^summari[sz]e(?:\s+text)?[:\-]\s*(.+)$/i)?.[1] ?? "";
          const fallbackTarget = [...historyBeforePrompt]
            .reverse()
            .find((message) => message.content.trim().length > 0)?.content ?? "";
          localReply = summarizeTextLocally(inlineTarget || fallbackTarget);
        }

        if (localReply) {
          appendMessage("assistant", localReply);

          if (timerDurationMs !== null) {
            const durationLabel = formatDuration(timerDurationMs);
            const timerHandle = window.setTimeout(() => {
              appendMessage("assistant", `Timer complete (${durationLabel}).`);
              timerHandlesRef.current = timerHandlesRef.current.filter((handle) => handle !== timerHandle);
            }, timerDurationMs);
            timerHandlesRef.current.push(timerHandle);
          }

          if (!settings.autoSpeak) {
            setStatus("idle");
            setAudioLevel(0);
            return;
          }

          attemptedApiRequest = !runtimeConfig.toggles.TTS_LOCAL;
          if (!(await synthesizeAndPlay(localReply))) {
            setStatus("idle");
            setAudioLevel(0);
          }
          return;
        }

        // The local model needs no key and no network, so it answers before the
        // cloud-availability guards below.
        if (runtimeConfig.toggles.LOCAL_LLM) {
          const localModelReply = await completeWithLocal(
            messagesWithPrompt,
            settings.assistantMode,
          );
          appendMessage("assistant", localModelReply);

          if (!settings.autoSpeak) {
            setStatus("idle");
            return;
          }

          attemptedApiRequest = !runtimeConfig.toggles.TTS_LOCAL;
          if (!(await synthesizeAndPlay(localModelReply))) {
            setStatus("idle");
            setAudioLevel(0);
          }
          return;
        }

        if (!ONLINE_FEATURES_ENABLED) {
          appendMessage(
            "assistant",
            `${cloudDisabledMessage()} Offline commands (timers, schedule digest, summarization, notes path) still work.`,
          );
          setStatus("idle");
          setAudioLevel(0);
          return;
        }

        if (!hasGroqKey) {
          appendMessage(
            "assistant",
            "Groq API key is missing. I can still handle timers, calendar digest, notes folder, and basic summarization.",
          );
          setStatus("idle");
          setAudioLevel(0);
          return;
        }

        attemptedApiRequest = true;
        markApiRequest("chat");
        const assistantReply = await completeWithGroq(messagesWithPrompt, settings.assistantMode);
        refreshQuotaSnapshot();
        appendMessage("assistant", assistantReply);

        if (!settings.autoSpeak) {
          setStatus("idle");
          return;
        }

        if (!(await synthesizeAndPlay(assistantReply))) {
          setStatus("idle");
          setAudioLevel(0);
        }
      } catch (error) {
        if (attemptedApiRequest) {
          markApiFailure();
        }
        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      } finally {
        busyRef.current = false;
      }
    },
    [
      appendMessage,
      markApiFailure,
      markApiRequest,
      refreshQuotaSnapshot,
      synthesizeAndPlay,
      settings.assistantMode,
      settings.autoSpeak,
    ],
  );

  const startBrowserRecognition = useCallback((): boolean => {
    const typedWindow = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };

    const RecognitionCtor = typedWindow.SpeechRecognition ?? typedWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      return false;
    }

    let transcript = "";
    browserRecognitionCancelledRef.current = false;
    const recognition = new RecognitionCtor();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const typedEvent = event as { results?: ArrayLike<ArrayLike<{ transcript?: string }>> };
      const firstResult = typedEvent.results?.[0]?.[0];
      transcript = firstResult?.transcript?.trim() ?? "";
      setAudioLevel(0.18);
    };

    recognition.onerror = () => {
      browserRecognitionRef.current = null;
      setAudioLevel(0);
      setStatus("error");
      setErrorMessage("Browser speech recognition failed. Try typing or add a Groq key for STT.");
    };

    recognition.onend = () => {
      browserRecognitionRef.current = null;
      const cancelled = browserRecognitionCancelledRef.current;
      browserRecognitionCancelledRef.current = false;
      setAudioLevel(0);

      if (cancelled) {
        setStatus("idle");
        return;
      }
      if (!transcript) {
        setStatus("idle");
        if (voiceLoopEnabledRef.current) {
          pendingResumeListeningRef.current = true;
        }
        return;
      }

      void (async () => {
        await runAssistantTurn(transcript);
        if (voiceLoopEnabledRef.current) {
          pendingResumeListeningRef.current = true;
        }
      })();
    };

    recognition.start();
    browserRecognitionRef.current = recognition;
    setStatus("listening");
    return true;
  }, [runAssistantTurn]);

  const stopListening = useCallback(async (options?: { cancel?: boolean; resumeAfterTurn?: boolean }) => {
    const cancel = options?.cancel ?? false;
    const resumeAfterTurn = options?.resumeAfterTurn ?? false;
    autoStopInFlightRef.current = true;
    const browserRecognition = browserRecognitionRef.current;
    if (browserRecognition) {
      browserRecognitionCancelledRef.current = true;
      browserRecognition.stop();
      browserRecognitionRef.current = null;
      setStatus("idle");
      setAudioLevel(0);
      resetSilenceDetection();
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setStatus("idle");
      setAudioLevel(0);
      resetSilenceDetection();
      return;
    }

    setStatus("processing");
    const recorderSessionId = recordingSessionRef.current;

    const recordingBlob = await new Promise<Blob>((resolve, reject) => {
      const handleStop = () => {
        cleanup();
        const type = recorder.mimeType || "audio/webm";
        if (recorderSessionId !== recordingSessionRef.current) {
          resolve(new Blob([], { type }));
          return;
        }
        resolve(new Blob(recordedChunksRef.current, { type }));
      };

      const handleError = () => {
        cleanup();
        reject(new Error("Failed while stopping recording."));
      };

      const cleanup = () => {
        recorder.removeEventListener("stop", handleStop);
        recorder.removeEventListener("error", handleError);
      };

      recorder.addEventListener("stop", handleStop);
      recorder.addEventListener("error", handleError);
      recorder.stop();
    });

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    const speechDetected = speechDetectedRef.current;
    const speechDurationMs = speechDurationMsRef.current;
    const speechPeakLevel = speechPeakLevelRef.current;
    stopMeter();
    stopRecordingStream();
    setAudioLevel(0);
    resetSilenceDetection();

    if (cancel) {
      setStatus("idle");
      return;
    }

    if (!recordingBlob.size) {
      setStatus("idle");
      if (resumeAfterTurn && voiceLoopEnabledRef.current) {
        pendingResumeListeningRef.current = true;
      }
      return;
    }

    const hasValidSpeech = speechDetected
      && speechDurationMs >= MIN_SPEECH_DURATION_MS
      && speechPeakLevel >= MIN_SPEECH_PEAK_LEVEL;

    if (!hasValidSpeech) {
      setStatus("idle");
      if (resumeAfterTurn && voiceLoopEnabledRef.current) {
        pendingResumeListeningRef.current = true;
      }
      return;
    }

    const useLocalStt = runtimeConfig.toggles.STT_LOCAL;
    try {
      let transcript: string;
      if (useLocalStt) {
        transcript = await transcribeWithLocal(recordingBlob);
      } else {
        markApiRequest("transcription");
        transcript = await transcribeWithGroq(recordingBlob);
        refreshQuotaSnapshot();
      }
      if (!transcript) {
        setStatus("idle");
        if (resumeAfterTurn && voiceLoopEnabledRef.current) {
          pendingResumeListeningRef.current = true;
        }
        return;
      }
      await runAssistantTurn(transcript);
      if (resumeAfterTurn && voiceLoopEnabledRef.current) {
        pendingResumeListeningRef.current = true;
      }
    } catch (error) {
      if (!useLocalStt) {
        markApiFailure();
      }
      setStatus("error");
      setErrorMessage(toErrorMessage(error));
    }
  }, [
    markApiFailure,
    markApiRequest,
    refreshQuotaSnapshot,
    resetSilenceDetection,
    runAssistantTurn,
    stopMeter,
    stopRecordingStream,
  ]);

  const startListening = useCallback(async () => {
    if (!voiceLoopEnabledRef.current) {
      return;
    }
    if (busyRef.current || isSpeechStatus(status)) {
      return;
    }
    // Local Whisper records through the same MediaRecorder path, so it only
    // needs to skip the cloud-availability guards.
    const useLocalStt = runtimeConfig.toggles.STT_LOCAL;
    if (!useLocalStt && !ONLINE_FEATURES_ENABLED) {
      setStatus("error");
      setErrorMessage(cloudDisabledMessage());
      return;
    }
    if (!useLocalStt && !hasGroqKey) {
      const startedBrowserRecognition = startBrowserRecognition();
      if (!startedBrowserRecognition) {
        setStatus("error");
        setErrorMessage("Groq API key missing and browser speech recognition is unavailable.");
      }
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("error");
      setErrorMessage("Microphone capture is not available in this environment.");
      return;
    }

    setErrorMessage(null);
    resetSilenceDetection();

    const sessionId = recordingSessionRef.current + 1;
    recordingSessionRef.current = sessionId;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    recordedChunksRef.current = [];

    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.addEventListener("dataavailable", (event) => {
      if (sessionId !== recordingSessionRef.current) {
        return;
      }
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    });

    recorder.start(150);
    mediaRecorderRef.current = recorder;
    setStatus("listening");
    beginMeter(stream, () => {
      void stopListening({ resumeAfterTurn: true });
    });
  }, [beginMeter, resetSilenceDetection, startBrowserRecognition, status, stopListening]);

  const toggleListening = useCallback(async () => {
    if (voiceLoopEnabledRef.current) {
      voiceLoopEnabledRef.current = false;
      pendingResumeListeningRef.current = false;
      setVoiceLoopEnabled(false);

      if (status === "listening") {
        await stopListening({ cancel: true, resumeAfterTurn: false });
        return;
      }

      if (status === "speaking") {
        stopSpeaking();
      }

      return;
    }

    voiceLoopEnabledRef.current = true;
    setVoiceLoopEnabled(true);
    setErrorMessage(null);

    if (status === "processing" || status === "speaking") {
      pendingResumeListeningRef.current = true;
      return;
    }

    await startListening();
  }, [startListening, status, stopListening, stopSpeaking]);

  const sendDraft = useCallback(async () => {
    await runAssistantTurn(draft);
  }, [draft, runAssistantTurn]);

  const sendQuickPrompt = useCallback(
    async (prompt: string) => {
      await runAssistantTurn(prompt);
    },
    [runAssistantTurn],
  );

  const speakText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) {
        return;
      }

      setErrorMessage(null);

      const useLocalTts = runtimeConfig.toggles.TTS_LOCAL;

      if (!useLocalTts && !ONLINE_FEATURES_ENABLED) {
        setStatus("error");
        setErrorMessage(cloudDisabledMessage());
        return;
      }

      if (!useLocalTts && !hasGroqKey) {
        setStatus("error");
        setErrorMessage("Groq API key is missing. Add `VITE_GROQ_API_KEY` to enable speech synthesis.");
        return;
      }

      try {
        setStatus("processing");
        if (!(await synthesizeAndPlay(trimmed))) {
          setStatus("idle");
          setAudioLevel(0);
        }
      } catch (error) {
        if (!useLocalTts) {
          markApiFailure();
        }
        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      }
    },
    [markApiFailure, synthesizeAndPlay],
  );

  const clearConversation = useCallback(() => {
    voiceLoopEnabledRef.current = false;
    setVoiceLoopEnabled(false);
    recordingSessionRef.current += 1;

    if (browserRecognitionRef.current) {
      browserRecognitionCancelledRef.current = true;
      browserRecognitionRef.current.stop();
      browserRecognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignore recorder stop races during cleanup.
      }
    }

    recordedChunksRef.current = [];
    stopMeter();
    stopRecordingStream();
    resetSilenceDetection();
    stopSpeaking();
    clearAllTimers();
    pendingResumeListeningRef.current = false;
    messagesRef.current = [];
    setMessages([]);
    setDraft("");
    setAudioLevel(0);
    setErrorMessage(null);
    setStatus("idle");
    void persistStateSnapshot([], historyMessagesRef.current, settings);
  }, [
    clearAllTimers,
    persistStateSnapshot,
    resetSilenceDetection,
    settings,
    stopMeter,
    stopRecordingStream,
    stopSpeaking,
  ]);

  useEffect(() => {
    if (!voiceLoopEnabled || pendingResumeListeningRef.current === false) {
      return;
    }
    if (status !== "idle" || busyRef.current) {
      return;
    }

    pendingResumeListeningRef.current = false;
    void startListening();
  }, [startListening, status, voiceLoopEnabled]);

  const updateSettings = useCallback(
    (updater: (previous: PalUiSettings) => PalUiSettings) => {
      settingsTouchedRef.current = true;
      setSettings((previous) => {
        const next = updater(previous);
        void persistStateSnapshot(messagesRef.current, historyMessagesRef.current, next);
        return next;
      });
    },
    [persistStateSnapshot],
  );

  const updateVoice = useCallback((voice: string) => {
    if (!isVoicePersona(voice)) {
      return;
    }
    updateSettings((previous) => ({ ...previous, voice }));
  }, [updateSettings]);

  const updateSpeechStyle = useCallback((style: string) => {
    if (!isSpeechStyle(style)) {
      return;
    }
    updateSettings((previous) => ({ ...previous, speechStyle: style }));
  }, [updateSettings]);

  const updateAssistantMode = useCallback((mode: string) => {
    if (!isAssistantMode(mode)) {
      return;
    }
    updateSettings((previous) => ({ ...previous, assistantMode: mode }));
  }, [updateSettings]);

  const setAutoSpeak = useCallback((enabled: boolean) => {
    updateSettings((previous) => ({ ...previous, autoSpeak: enabled }));
  }, [updateSettings]);

  const setMinimizeToTray = useCallback((enabled: boolean) => {
    updateSettings((previous) => ({ ...previous, minimizeToTray: enabled }));
  }, [updateSettings]);

  const setAutoFreeRam = useCallback((enabled: boolean) => {
    updateSettings((previous) => ({ ...previous, autoFreeRam: enabled }));
  }, [updateSettings]);

  const setStartWithWindows = useCallback((enabled: boolean) => {
    void (async () => {
      try {
        if (enabled) {
          await enableAutostart();
        } else {
          await disableAutostart();
        }
      } catch {
        return;
      }

      updateSettings((previous) => ({
        ...previous,
        startWithWindows: enabled,
        startMinimized: enabled ? previous.startMinimized : false,
      }));
    })();
  }, [updateSettings]);

  const setStartMinimized = useCallback((enabled: boolean) => {
    updateSettings((previous) => ({
      ...previous,
      startMinimized: previous.startWithWindows ? enabled : false,
    }));
  }, [updateSettings]);

  useEffect(
    () => () => {
      if (browserRecognitionRef.current) {
        browserRecognitionCancelledRef.current = true;
        browserRecognitionRef.current.stop();
        browserRecognitionRef.current = null;
      }
      recordingSessionRef.current += 1;
      recordedChunksRef.current = [];
      clearAllTimers();
      stopMeter();
      stopRecordingStream();
      resetSilenceDetection();
      pendingResumeListeningRef.current = false;
      stopSpeaking();
    },
    [clearAllTimers, resetSilenceDetection, stopMeter, stopRecordingStream, stopSpeaking],
  );

  const result = useMemo<UsePalAssistantResult>(
    () => ({
      messages,
      historyMessages,
      status,
      voiceLoopEnabled,
      audioLevel,
      draft,
      errorMessage,
      apiUsage,
      settings,
      groqReady: hasGroqKey && ONLINE_FEATURES_ENABLED,
      setDraft,
      sendDraft,
      sendQuickPrompt,
      speakText,
      clearConversation,
      toggleListening,
      stopSpeaking,
      updateVoice,
      updateSpeechStyle,
      updateAssistantMode,
      setAutoSpeak,
      setMinimizeToTray,
      setAutoFreeRam,
      setStartWithWindows,
      setStartMinimized,
    }),
    [
      messages,
      historyMessages,
      status,
      voiceLoopEnabled,
      audioLevel,
      draft,
      errorMessage,
      apiUsage,
      settings,
      sendDraft,
      sendQuickPrompt,
      speakText,
      clearConversation,
      toggleListening,
      stopSpeaking,
      updateVoice,
      updateSpeechStyle,
      updateAssistantMode,
      setAutoSpeak,
      setMinimizeToTray,
      setAutoFreeRam,
      setStartWithWindows,
      setStartMinimized,
    ],
  );

  return result;
}
