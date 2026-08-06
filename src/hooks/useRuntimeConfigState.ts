import { useCallback, useEffect, useState } from "react";

import { ONLINE_FEATURES_ENABLED, runtimeConfig } from "../config/runtime";
import type { RuntimeToggles } from "../types/pal";

const RUNTIME_TOGGLES_STORAGE_KEY = "pal.runtime.toggles.v1";
const RUNTIME_MODELS_STORAGE_KEY = "pal.runtime.models.v1";

const DEFAULT_TOGGLES: RuntimeToggles = {
  LOCAL_LLM: false,
  STT_LOCAL: false,
  TTS_LOCAL: false,
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

// Keep the module-level singleton in sync before first paint, so any consumer
// reading `runtimeConfig.toggles` during the initial render sees stored values.
const initialToggles = loadRuntimeToggles();
runtimeConfig.toggles.LOCAL_LLM = initialToggles.LOCAL_LLM;
runtimeConfig.toggles.STT_LOCAL = initialToggles.STT_LOCAL;
runtimeConfig.toggles.TTS_LOCAL = initialToggles.TTS_LOCAL;

export function useRuntimeConfigState() {
  const [runtimeTogglesState, setRuntimeTogglesState] = useState<RuntimeToggles>(() => ({
    ...initialToggles,
  }));
  const [runtimeModelsState, setRuntimeModelsState] = useState(() => loadRuntimeModels());

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

  // "local" only when every stage runs on-device; any cloud stage makes it a hybrid,
  // which the UI still labels "cloud" so the user knows requests can leave the machine.
  const runtimeMode: "local" | "cloud" = runtimeTogglesState.LOCAL_LLM
    && runtimeTogglesState.STT_LOCAL
    && runtimeTogglesState.TTS_LOCAL
    ? "local"
    : "cloud";

  const handleRuntimeModeChange = useCallback((mode: "cloud" | "local") => {
    if (!ONLINE_FEATURES_ENABLED && mode === "cloud") {
      return;
    }
    const enabled = mode === "local";
    setRuntimeTogglesState({
      LOCAL_LLM: enabled,
      STT_LOCAL: enabled,
      TTS_LOCAL: enabled,
    });
  }, []);

  return {
    runtimeTogglesState,
    setRuntimeTogglesState,
    runtimeModelsState,
    setRuntimeModelsState,
    runtimeMode,
    handleRuntimeModeChange,
  };
}
