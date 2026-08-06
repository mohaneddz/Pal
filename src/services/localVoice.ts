import { invoke } from "@tauri-apps/api/core";

import { runtimeConfig } from "../config/runtime";
import type { LocalServerStatus, SpeechStyle } from "../types/pal";

/**
 * On-device speech.
 *
 * Transcription goes to the bundled whisper.cpp server; the Rust side only
 * supervises the process (`src-tauri/src/stt.rs`) while audio is POSTed
 * straight from here, so recordings never round-trip through the IPC channel.
 */

/** whisper.cpp expects 16 kHz mono PCM. */
const WHISPER_SAMPLE_RATE = 16000;

function sttBaseUrl(): string {
  return `http://127.0.0.1:${runtimeConfig.local.sttPort}`;
}

export async function startLocalStt(): Promise<LocalServerStatus> {
  const { sttModel, sttPort, threads } = runtimeConfig.local;
  return invoke<LocalServerStatus>("local_stt_start", {
    options: { model: sttModel, port: sttPort, threads },
  });
}

export async function stopLocalStt(): Promise<LocalServerStatus> {
  return invoke<LocalServerStatus>("local_stt_stop");
}

/**
 * Decode whatever container MediaRecorder produced (typically WebM/Opus) and
 * resample it to the mono 16 kHz PCM whisper wants. Doing this with WebAudio
 * reuses the codecs already in the webview, which is why the server does not
 * need its ffmpeg-backed `--convert` path.
 */
async function decodeToMono16k(audioBlob: Blob): Promise<Float32Array> {
  const arrayBuffer = await audioBlob.arrayBuffer();

  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(arrayBuffer);
  } finally {
    await decodeContext.close();
  }

  const frameCount = Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frameCount, WHISPER_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const resampled = await offline.startRendering();
  return resampled.getChannelData(0);
}

/** Wrap mono float samples as 16-bit PCM WAV. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  const byteRate = sampleRate * 2;
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

interface WhisperResponse {
  text?: string;
}

export async function transcribeWithLocal(audioBlob: Blob): Promise<string> {
  const status = await startLocalStt();
  if (status.state !== "ready") {
    throw new Error(status.message ?? "Local speech recognition is not ready.");
  }

  const samples = await decodeToMono16k(audioBlob);
  const wav = encodeWav(samples, WHISPER_SAMPLE_RATE);

  const form = new FormData();
  form.append("file", wav, "pal-recording.wav");
  form.append("response_format", "json");
  form.append("language", "en");

  const response = await fetch(`${sttBaseUrl()}/inference`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Local transcription failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : "."}`,
    );
  }

  const data = (await response.json()) as WhisperResponse;
  return (data.text ?? "").trim();
}

/**
 * Kokoro has no notion of the cloud provider's speech styles, so `style` only
 * nudges the delivery rate; timbre comes from the configured voice.
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
