import { type CSSProperties, useMemo } from "react";

import type { AssistantStatus } from "../types/pal";

export function useVoiceUiState(status: AssistantStatus, audioLevel: number, voiceLoopEnabled: boolean) {
  const waveformBars = useMemo(() => {
    const barCount = 72;
    const baseLevel = status === "idle" ? 0.05 : Math.max(audioLevel, status === "processing" ? 0.12 : 0.18);

    return Array.from({ length: barCount }, (_, index) => {
      const progress = index / (barCount - 1);
      const envelope = Math.sin(progress * Math.PI);
      const harmonics = Math.abs(Math.sin((progress * Math.PI * 8) + baseLevel * 6.5));
      const shimmer = (Math.sin((index + 2) * 2.35 + baseLevel * 12) + 1) * 0.09;
      const value = envelope * (0.22 + harmonics * 0.78 + shimmer) * baseLevel + 0.04;
      return Math.min(1, value);
    });
  }, [audioLevel, status]);

  const orbStateClass = useMemo(() => {
    if (status === "speaking") {
      return "is-speaking";
    }
    if (status === "listening") {
      return "is-listening";
    }
    if (status === "processing") {
      return "is-processing";
    }
    return "is-idle";
  }, [status]);

  const orbMotionStyle = useMemo(
    () =>
      ({
        "--orb-stretch-x":
          status === "speaking" ? (0.03 + Math.max(audioLevel, 0.12) * 0.2).toFixed(3) : "0",
        "--orb-stretch-y":
          status === "speaking" ? (0.02 + Math.max(audioLevel, 0.12) * 0.16).toFixed(3) : "0",
        "--orb-wave-rise":
          status === "speaking" ? `${(Math.max(audioLevel, 0.12) * 18).toFixed(2)}px` : "0px",
        "--orb-tilt":
          status === "speaking" ? `${(Math.max(audioLevel, 0.12) * 4).toFixed(2)}deg` : "0deg",
      }) as CSSProperties,
    [audioLevel, status],
  );

  const isListening = status === "listening";
  const isSpeaking = status === "speaking";
  const isProcessing = status === "processing";
  const voiceEnabled = voiceLoopEnabled;

  const voiceUiState = !voiceEnabled
    ? "disabled"
    : isListening
      ? "listening"
      : isProcessing
        ? "processing"
        : isSpeaking
          ? "speaking"
          : "armed";

  const voiceStatusLabel = voiceUiState === "listening"
    ? "Listening"
    : voiceUiState === "processing"
      ? "Processing"
      : voiceUiState === "speaking"
        ? "Model speaking"
        : voiceUiState === "armed"
          ? "Voice enabled"
          : "Voice disabled";

  return {
    waveformBars,
    orbStateClass,
    orbMotionStyle,
    isListening,
    isSpeaking,
    isProcessing,
    voiceEnabled,
    voiceUiState,
    voiceStatusLabel,
  };
}
