import { useCallback, useEffect, useState } from "react";

import { ONLINE_FEATURES_ENABLED, runtimeConfig } from "../config/runtime";

const RUNTIME_TOGGLES_STORAGE_KEY = "pal.runtime.toggles.v1";
const RUNTIME_MODELS_STORAGE_KEY = "pal.runtime.models.v1";
const DISABLED_LOCAL_TOGGLES = {
  LOCAL_LLM: false,
  STT_LOCAL: false,
  TTS_LOCAL: false,
};

function loadRuntimeToggles() {
  try {
    const raw = localStorage.getItem(RUNTIME_TOGGLES_STORAGE_KEY);
    if (!raw) {
      return { ...DISABLED_LOCAL_TOGGLES };
    }
    JSON.parse(raw);
    return {
      ...DISABLED_LOCAL_TOGGLES,
    };
  } catch {
    return { ...DISABLED_LOCAL_TOGGLES };
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
    const hasEnabledLocalToggle = runtimeTogglesState.LOCAL_LLM
      || runtimeTogglesState.STT_LOCAL
      || runtimeTogglesState.TTS_LOCAL;
    if (hasEnabledLocalToggle) {
      setRuntimeTogglesState({ ...DISABLED_LOCAL_TOGGLES });
    }
    runtimeConfig.toggles.LOCAL_LLM = false;
    runtimeConfig.toggles.STT_LOCAL = false;
    runtimeConfig.toggles.TTS_LOCAL = false;
  }, [runtimeTogglesState.LOCAL_LLM, runtimeTogglesState.STT_LOCAL, runtimeTogglesState.TTS_LOCAL]);

  useEffect(() => {
    runtimeConfig.toggles.LOCAL_LLM = false;
    runtimeConfig.toggles.STT_LOCAL = false;
    runtimeConfig.toggles.TTS_LOCAL = false;
    try {
      localStorage.setItem(RUNTIME_TOGGLES_STORAGE_KEY, JSON.stringify(DISABLED_LOCAL_TOGGLES));
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
    if (!ONLINE_FEATURES_ENABLED && mode === "cloud") {
      return;
    }
    runtimeConfig.toggles.LOCAL_LLM = false;
    setRuntimeTogglesState({ ...DISABLED_LOCAL_TOGGLES });
  }, []);

  return {
    runtimeTogglesState,
    setRuntimeTogglesState,
    runtimeModelsState,
    setRuntimeModelsState,
    runtimeMode: "cloud" as "local" | "cloud",
    handleRuntimeModeChange,
  };
}
