import { useCallback, useEffect, useState } from "react";

import { runtimeConfig } from "../config/runtime";

const RUNTIME_TOGGLES_STORAGE_KEY = "pal.runtime.toggles.v1";
const RUNTIME_MODELS_STORAGE_KEY = "pal.runtime.models.v1";

function loadRuntimeToggles() {
  try {
    const raw = localStorage.getItem(RUNTIME_TOGGLES_STORAGE_KEY);
    if (!raw) {
      return { ...runtimeConfig.toggles };
    }
    const parsed = JSON.parse(raw) as Partial<typeof runtimeConfig.toggles>;
    return {
      LOCAL_LLM: typeof parsed.LOCAL_LLM === "boolean" ? parsed.LOCAL_LLM : runtimeConfig.toggles.LOCAL_LLM,
      STT_LOCAL: typeof parsed.STT_LOCAL === "boolean" ? parsed.STT_LOCAL : runtimeConfig.toggles.STT_LOCAL,
      TTS_LOCAL: typeof parsed.TTS_LOCAL === "boolean" ? parsed.TTS_LOCAL : runtimeConfig.toggles.TTS_LOCAL,
    };
  } catch {
    return { ...runtimeConfig.toggles };
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

export function useRuntimeConfigState() {
  const [runtimeTogglesState, setRuntimeTogglesState] = useState(() => loadRuntimeToggles());
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

  const handleRuntimeModeChange = useCallback((mode: "cloud" | "local") => {
    const nextLocalEnabled = mode === "local";
    runtimeConfig.toggles.LOCAL_LLM = nextLocalEnabled;
    setRuntimeTogglesState((previous) => ({ ...previous, LOCAL_LLM: nextLocalEnabled }));
  }, []);

  return {
    runtimeTogglesState,
    setRuntimeTogglesState,
    runtimeModelsState,
    setRuntimeModelsState,
    runtimeMode: (runtimeTogglesState.LOCAL_LLM ? "local" : "cloud") as "local" | "cloud",
    handleRuntimeModeChange,
  };
}
