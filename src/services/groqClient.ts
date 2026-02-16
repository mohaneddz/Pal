import { runtimeConfig } from "../config/runtime";
import type {
  ApiQuotaSnapshot,
  AssistantMode,
  ChatMessage,
  SpeechStyle,
  VoicePersona,
} from "../types/pal";

interface GroqApiError {
  error?: {
    message?: string;
  };
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GroqTranscriptionResponse {
  text?: string;
}

let latestQuotaSnapshot: ApiQuotaSnapshot | null = null;

const BASE_SYSTEM_PROMPT = [
  "You are Pal, a concise and practical desktop AI assistant.",
  "Be helpful, specific, and actionable.",
  "When the user asks for structured output, format clearly with short lists.",
].join(" ");

const MODE_PROMPTS: Record<AssistantMode, string> = {
  advisor:
    "Use an advisor tone: practical, direct, and decision-oriented. Prioritize clear next steps.",
  therapist:
    "Use a therapist tone: empathetic, calm, and validating. Ask reflective follow-up questions when useful.",
  sassy:
    "Use a sassy tone: bold, flirty, and witty while staying respectful and helpful. Keep it playful, never explicit, and never rude or insulting.",
  chatty:
    "Use a chatty tone: warm, conversational, and expressive while staying concise.",
  coach:
    "Use a coach tone: high-energy, direct, and accountability-focused. Push toward execution with concrete action steps.",
  analyst:
    "Use an analyst tone: precise, structured, and evidence-oriented. Surface assumptions, tradeoffs, and decision criteria.",
  creative:
    "Use a creative tone: imaginative and idea-rich while still useful. Offer multiple novel options and practical next moves.",
  guardian:
    "Use a guardian tone: cautious, risk-aware, and protective. Highlight safety considerations and reliable fallback plans.",
};

function readErrorMessage(payload: unknown, fallback: string): string {
  const typed = payload as GroqApiError;
  return typed.error?.message?.trim() || fallback;
}

function requireGroqKey(): void {
  if (!runtimeConfig.apiKey) {
    throw new Error("Missing `VITE_GROQ_API_KEY` for Groq requests.");
  }
}

async function parseFailedResponse(response: Response): Promise<never> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Groq request failed (${response.status}).`);
  }

  throw new Error(readErrorMessage(payload, `Groq request failed (${response.status}).`));
}

function makeHeaders(contentType?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${runtimeConfig.apiKey}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

function readNumberHeader(headers: Headers, names: string[]): number | undefined {
  for (const name of names) {
    const raw = headers.get(name);
    if (!raw) {
      continue;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readTextHeader(headers: Headers, names: string[]): string | undefined {
  for (const name of names) {
    const raw = headers.get(name);
    if (raw && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return undefined;
}

function captureQuotaHeaders(headers: Headers): void {
  const names = [
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
    "ratelimit-limit-requests",
    "ratelimit-remaining-requests",
    "ratelimit-reset-requests",
    "ratelimit-limit-tokens",
    "ratelimit-remaining-tokens",
    "ratelimit-reset-tokens",
  ];

  const rawHeaders: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) {
      rawHeaders[name] = value;
    }
  }

  const limitRequests = readNumberHeader(headers, ["x-ratelimit-limit-requests", "ratelimit-limit-requests"]);
  const remainingRequests = readNumberHeader(headers, [
    "x-ratelimit-remaining-requests",
    "ratelimit-remaining-requests",
  ]);
  const resetRequests = readTextHeader(headers, ["x-ratelimit-reset-requests", "ratelimit-reset-requests"]);
  const limitTokens = readNumberHeader(headers, ["x-ratelimit-limit-tokens", "ratelimit-limit-tokens"]);
  const remainingTokens = readNumberHeader(headers, [
    "x-ratelimit-remaining-tokens",
    "ratelimit-remaining-tokens",
  ]);
  const resetTokens = readTextHeader(headers, ["x-ratelimit-reset-tokens", "ratelimit-reset-tokens"]);

  const hasAnyValue = limitRequests !== undefined
    || remainingRequests !== undefined
    || resetRequests !== undefined
    || limitTokens !== undefined
    || remainingTokens !== undefined
    || resetTokens !== undefined
    || Object.keys(rawHeaders).length > 0;

  if (!hasAnyValue) {
    return;
  }

  latestQuotaSnapshot = {
    limitRequests,
    remainingRequests,
    resetRequests,
    limitTokens,
    remainingTokens,
    resetTokens,
    rawHeaders,
    updatedAt: Date.now(),
  };
}

export function getGroqQuotaSnapshot(): ApiQuotaSnapshot | null {
  if (!latestQuotaSnapshot) {
    return null;
  }

  return {
    ...latestQuotaSnapshot,
    rawHeaders: { ...latestQuotaSnapshot.rawHeaders },
  };
}

function chunkSpeechInput(input: string, maxChunkSize = 190): string[] {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }
  if (cleaned.length <= maxChunkSize) {
    return [cleaned];
  }

  const sentences = cleaned.match(/[^.!?]+[.!?]?/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.map((part) => part.trim()).filter(Boolean)) {
    if (sentence.length > maxChunkSize) {
      const words = sentence.split(" ");
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChunkSize) {
          if (current) {
            chunks.push(current);
          }
          current = word;
        } else {
          current = next;
        }
      }
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChunkSize) {
      if (current) {
        chunks.push(current);
      }
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildSpeechInput(text: string, style: SpeechStyle): string {
  const trimmed = text.trim();
  if (style === "natural" || style === "neutral") {
    return trimmed;
  }
  return `[${style}] ${trimmed}`;
}

export async function completeWithGroq(
  messages: ChatMessage[],
  mode: AssistantMode = "advisor",
): Promise<string> {
  requireGroqKey();

  const endpoint = `${runtimeConfig.baseUrl}/chat/completions`;
  const modePrompt = MODE_PROMPTS[mode] ?? MODE_PROMPTS.advisor;
  const payload = {
    model: runtimeConfig.models.chat,
    temperature: 0.45,
    max_tokens: 900,
    messages: [
      { role: "system", content: `${BASE_SYSTEM_PROMPT} ${modePrompt}` },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: makeHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  captureQuotaHeaders(response.headers);

  if (!response.ok) {
    return parseFailedResponse(response);
  }

  const data = (await response.json()) as GroqChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Groq returned an empty assistant response.");
  }
  return content;
}

export async function transcribeWithGroq(audioBlob: Blob): Promise<string> {
  requireGroqKey();

  const endpoint = `${runtimeConfig.baseUrl}/audio/transcriptions`;
  const formData = new FormData();
  formData.append("model", runtimeConfig.models.stt);
  formData.append("file", audioBlob, "pal-recording.webm");
  formData.append("language", "en");
  formData.append("temperature", "0");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: makeHeaders(),
    body: formData,
  });
  captureQuotaHeaders(response.headers);

  if (!response.ok) {
    return parseFailedResponse(response);
  }

  const data = (await response.json()) as GroqTranscriptionResponse;
  return data.text?.trim() ?? "";
}

async function synthesizeChunk(
  text: string,
  voice: VoicePersona,
  style: SpeechStyle,
): Promise<Blob> {
  const endpoint = `${runtimeConfig.baseUrl}/audio/speech`;
  const payload = {
    model: runtimeConfig.models.tts,
    voice,
    response_format: "wav",
    input: buildSpeechInput(text, style),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: makeHeaders("application/json"),
    body: JSON.stringify(payload),
  });
  captureQuotaHeaders(response.headers);

  if (!response.ok) {
    return parseFailedResponse(response);
  }

  return response.blob();
}

export async function synthesizeWithGroq(
  text: string,
  voice: VoicePersona,
  style: SpeechStyle,
): Promise<Blob[]> {
  requireGroqKey();

  const chunks = chunkSpeechInput(text, 190);
  if (!chunks.length) {
    return [];
  }

  const audioChunks: Blob[] = [];
  for (const chunk of chunks) {
    const audio = await synthesizeChunk(chunk, voice, style);
    audioChunks.push(audio);
  }
  return audioChunks;
}
