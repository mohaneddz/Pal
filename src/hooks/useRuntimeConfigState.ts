import { useEffect, useState } from "react";

import { runtimeConfig } from "../config/runtime";
import type { LocalLlmModel, RuntimeToggles } from "../types/pal";

const RUNTIME_TOGGLES_STORAGE_KEY = "pal.runtime.toggles.v1";
const RUNTIME_MODELS_STORAGE_KEY = "pal.runtime.models.v1";
const RUNTIME_LOCAL_STORAGE_KEY = "pal.runtime.local.v1";

const DEFAULT_TOGGLES: RuntimeToggles = {
  LOCAL_LLM: false,
  STT_LOCAL: false,
  TTS_LOCAL: false,
};

/** The subset of `LocalConfig` exposed as a Settings control. Context size and
 * thread count stay fixed — they're tuning knobs, not something most users
 * benefit from touching, and raw number inputs there just invite footguns
 * (a 0-thread or 0-context value with no validation). */
export interface LocalModelPreferences {
  llmModel: LocalLlmModel;
  /** `true` offloads all layers to GPU (`-ngl 99`); `false` forces CPU (`-ngl 0`). */
  useGpu: boolean;
  ttsSpeed: number;
}

const DEFAULT_LOCAL_PREFS: LocalModelPreferences = {
  llmModel: "gemma-3-4b-it-q4_0",
  useGpu: true,
  ttsSpeed: 1.0,
};

function readBool(source: Record<string, unknown>, key: keyof RuntimeToggles): boolean {
  return typeof source[key] === "boolean" ? (source[key] as boolean) : DEFAULT_TOGGLES[key];
}

function loadRuntimeToggles(): RuntimeToggles {
  try {
    const raw = localStorage.getItem(RUNTIME_TOGGLES_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_TOGGLES };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      LOCAL_LLM: readBool(parsed, "LOCAL_LLM"),
      STT_LOCAL: readBool(parsed, "STT_LOCAL"),
      TTS_LOCAL: readBool(parsed, "TTS_LOCAL"),
    };
  } catch {
    return { ...DEFAULT_TOGGLES };
  }
}

function loadRuntimeModels() {
  try {
    const raw = localStorage.getItem(RUNTIME_MODELS_STORAGE_KEY);
    if (!raw) {
      return { ...runtimeConfig.models };
    }
    const parsed = JSON.parse(raw) as Partial<typeof runtimeConfig.models>;
    return {
      chat: typeof parsed.chat === "string" ? parsed.chat : runtimeConfig.models.chat,
      stt: typeof parsed.stt === "string" ? parsed.stt : runtimeConfig.models.stt,
      tts: typeof parsed.tts === "string" ? parsed.tts : runtimeConfig.models.tts,
      ttsVoice: typeof parsed.ttsVoice === "string" ? parsed.ttsVoice : runtimeConfig.models.ttsVoice,
    };
  } catch {
    return { ...runtimeConfig.models };
  }
}

function loadLocalPreferences(): LocalModelPreferences {
  const fallback: LocalModelPreferences = {
    ...DEFAULT_LOCAL_PREFS,
    llmModel: runtimeConfig.local.llmModel,
    useGpu: runtimeConfig.local.gpuLayers > 0,
    ttsSpeed: runtimeConfig.local.ttsSpeed,
  };
  try {
    const raw = localStorage.getItem(RUNTIME_LOCAL_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<LocalModelPreferences>;
    return {
      llmModel: parsed.llmModel === "gemma-3-1b-it-q4_0" ? "gemma-3-1b-it-q4_0" : fallback.llmModel,
      useGpu: typeof parsed.useGpu === "boolean" ? parsed.useGpu : fallback.useGpu,
      ttsSpeed:
        typeof parsed.ttsSpeed === "number" && Number.isFinite(parsed.ttsSpeed)
          ? Math.min(1.5, Math.max(0.75, parsed.ttsSpeed))
          : fallback.ttsSpeed,
    };
  } catch {
    return fallback;
  }
}

// Keep the module-level singleton in sync before first paint, so any consumer
// reading `runtimeConfig` during the initial render sees stored values.
const initialToggles = loadRuntimeToggles();
runtimeConfig.toggles.LOCAL_LLM = initialToggles.LOCAL_LLM;
runtimeConfig.toggles.STT_LOCAL = initialToggles.STT_LOCAL;
runtimeConfig.toggles.TTS_LOCAL = initialToggles.TTS_LOCAL;

const initialLocalPrefs = loadLocalPreferences();
runtimeConfig.local.llmModel = initialLocalPrefs.llmModel;
runtimeConfig.local.gpuLayers = initialLocalPrefs.useGpu ? 99 : 0;
runtimeConfig.local.ttsSpeed = initialLocalPrefs.ttsSpeed;

export function useRuntimeConfigState() {
  const [runtimeTogglesState, setRuntimeTogglesState] = useState<RuntimeToggles>(() => ({
    ...initialToggles,
  }));
  const [runtimeModelsState, setRuntimeModelsState] = useState(() => loadRuntimeModels());
  const [localPreferences, setLocalPreferences] = useState<LocalModelPreferences>(
    () => initialLocalPrefs,
  );

  useEffect(() => {
    runtimeConfig.toggles.LOCAL_LLM = runtimeTogglesState.LOCAL_LLM;
    runtimeConfig.toggles.STT_LOCAL = runtimeTogglesState.STT_LOCAL;
    runtimeConfig.toggles.TTS_LOCAL = runtimeTogglesState.TTS_LOCAL;
    try {
      localStorage.setItem(RUNTIME_TOGGLES_STORAGE_KEY, JSON.stringify(runtimeTogglesState));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [runtimeTogglesState]);

  useEffect(() => {
    runtimeConfig.models.chat = runtimeModelsState.chat;
    runtimeConfig.models.stt = runtimeModelsState.stt;
    runtimeConfig.models.tts = runtimeModelsState.tts;
    try {
      localStorage.setItem(RUNTIME_MODELS_STORAGE_KEY, JSON.stringify(runtimeModelsState));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [runtimeModelsState]);

  useEffect(() => {
    runtimeConfig.local.llmModel = localPreferences.llmModel;
    runtimeConfig.local.gpuLayers = localPreferences.useGpu ? 99 : 0;
    runtimeConfig.local.ttsSpeed = localPreferences.ttsSpeed;
    try {
      localStorage.setItem(RUNTIME_LOCAL_STORAGE_KEY, JSON.stringify(localPreferences));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [localPreferences]);

  return {
    runtimeTogglesState,
    setRuntimeTogglesState,
    runtimeModelsState,
    setRuntimeModelsState,
    localPreferences,
    setLocalPreferences,
  };
}
