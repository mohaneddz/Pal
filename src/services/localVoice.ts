import { invoke } from "@tauri-apps/api/core";

import { runtimeConfig } from "../config/runtime";
import type { SpeechStyle } from "../types/pal";

/**
 * On-device speech, executed in Rust: Whisper (whisper-rs) for transcription
 * and Kokoro (ONNX Runtime) for synthesis. Audio crosses the IPC boundary as
 * raw bytes, matching the Blob-based shape the cloud client already returns.
 */

async function toBytes(blob: Blob): Promise<number[]> {
  const buffer = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buffer));
}

export async function transcribeWithLocal(audioBlob: Blob): Promise<string> {
  const audio = await toBytes(audioBlob);
  const transcript = await invoke<string>("local_stt_transcribe", { audio });
  return transcript.trim();
}

/**
 * Kokoro has no notion of the cloud provider's speech styles, so `style` only
 * nudges the delivery rate; timbre comes from the configured voice tensor.
 */
function speedForStyle(style: SpeechStyle, base: number): number {
  switch (style) {
    case "whisper":
      return base * 0.9;
    case "cheerful":
      return base * 1.08;
    case "professional":
      return base * 0.96;
    default:
      return base;
  }
}

export async function synthesizeWithLocal(
  text: string,
  style: SpeechStyle,
): Promise<Blob[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const { ttsVoice, ttsSpeed } = runtimeConfig.local;
  const wav = await invoke<number[]>("local_tts_synthesize", {
    text: trimmed,
    voice: ttsVoice,
    speed: speedForStyle(style, ttsSpeed),
  });

  return [new Blob([new Uint8Array(wav)], { type: "audio/wav" })];
}
