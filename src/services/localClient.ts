import { invoke } from "@tauri-apps/api/core";

import { localLlmBaseUrl, runtimeConfig } from "../config/runtime";
import { buildSystemPrompt, resolveModeConfig } from "./prompts";
import type { AssistantMode, ChatMessage, LocalServerStatus } from "../types/pal";

/**
 * Client for the on-device stack.
 *
 * Chat runs against the bundled llama.cpp server, which speaks the same
 * OpenAI-compatible shape as Groq — so only transport and lifecycle differ from
 * `groqClient`. The Rust side (`src-tauri/src/llm.rs`) owns the child process.
 */

interface LocalChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Ask Rust to bring the llama-server up. Idempotent: if a server is already
 * running with the same model and port, this returns immediately.
 */
export async function startLocalLlm(): Promise<LocalServerStatus> {
  const { llmModel, llmPort, contextSize, gpuLayers, threads } = runtimeConfig.local;
  return invoke<LocalServerStatus>("local_llm_start", {
    options: {
      model: llmModel,
      port: llmPort,
      contextSize,
      gpuLayers,
      threads,
    },
  });
}

export async function stopLocalLlm(): Promise<LocalServerStatus> {
  return invoke<LocalServerStatus>("local_llm_stop");
}

export async function getLocalLlmStatus(): Promise<LocalServerStatus> {
  return invoke<LocalServerStatus>("local_llm_status");
}

export async function completeWithLocal(
  messages: ChatMessage[],
  mode: AssistantMode = "advisor",
): Promise<string> {
  // First prompt after a cold start pays the model-load cost here rather than
  // failing with a connection error.
  const status = await startLocalLlm();
  if (status.state !== "ready") {
    throw new Error(status.message ?? "Local model is not ready.");
  }

  const modeConfig = resolveModeConfig(mode);
  const payload = {
    model: runtimeConfig.local.llmModel,
    temperature: modeConfig.temperature,
    max_tokens: modeConfig.maxTokens,
    stream: false,
    messages: [
      { role: "system", content: buildSystemPrompt(mode) },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  };

  const response = await fetch(`${localLlmBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Local model request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : "."}`,
    );
  }

  const data = (await response.json()) as LocalChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Local model returned an empty response.");
  }
  return content;
}
