import { invoke } from "@tauri-apps/api/core";

/**
 * Shared tool-calling glue between `localClient` and `groqClient`.
 *
 * The two transports speak different wire formats: Groq's Llama 3.3 supports
 * OpenAI-style `tools`/`tool_calls` natively, but the bundled Gemma 3 model
 * ignores that field entirely (verified by hand against llama-server before
 * building this). Local tool calls instead use a small JSON convention baked
 * into the system prompt and parsed back out of plain content. Both paths
 * are normalized into the same `RawToolCall` shape so the rest of the app
 * doesn't need to know which transport produced a call.
 */

export type ActionRisk = "auto_run" | "confirm_required";

export interface ActionDescriptor {
  name: string;
  description: string;
  risk: ActionRisk;
  parametersSchema: unknown;
}

export interface RawToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  output: unknown;
  error?: string;
}

export async function fetchActionDescriptors(): Promise<ActionDescriptor[]> {
  return invoke<ActionDescriptor[]>("actions_list_available");
}

export function isAutoRun(descriptors: ActionDescriptor[], name: string): boolean {
  return descriptors.find((descriptor) => descriptor.name === name)?.risk === "auto_run";
}

export async function executeAction(
  name: string,
  args: Record<string, unknown>,
  confirmed: boolean,
): Promise<ActionResult> {
  return invoke<ActionResult>("actions_execute", {
    request: { name, arguments: args },
    confirmed,
  });
}

/** OpenAI `tools` array shape, used by the Groq request payload. */
export function buildOpenAiTools(descriptors: ActionDescriptor[]): unknown[] {
  return descriptors.map((descriptor) => ({
    type: "function",
    function: {
      name: descriptor.name,
      description: descriptor.description,
      parameters: descriptor.parametersSchema,
    },
  }));
}

interface GroqToolCallPayload {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/** Parses Groq's native `tool_calls` response field. */
export function parseGroqToolCalls(toolCalls: GroqToolCallPayload[] | undefined): RawToolCall[] | null {
  if (!toolCalls?.length) {
    return null;
  }

  const parsed: RawToolCall[] = [];
  for (const call of toolCalls) {
    const name = call.function?.name;
    if (!name) {
      continue;
    }
    let args: Record<string, unknown> = {};
    try {
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      continue;
    }
    parsed.push({ id: call.id ?? name, name, arguments: args });
  }

  return parsed.length ? parsed : null;
}

/**
 * System-prompt block describing available actions and the JSON convention
 * the local model should use to invoke one. Appended only when PC actions
 * are enabled and at least one action is offered.
 */
export function buildLocalToolInstructions(descriptors: ActionDescriptor[]): string {
  const toolList = descriptors
    .map((descriptor) => `- ${descriptor.name}: ${descriptor.description}`)
    .join("\n");

  return [
    "You can take actions on the user's computer using the tools listed below.",
    "If the user's request needs a tool, respond with ONLY a single JSON object of the exact form",
    '{"tool_call": {"name": "<tool name>", "arguments": {...}}} and nothing else — no markdown fences, no extra text.',
    "Only use a tool name from this list, and only when it is actually needed to answer the request.",
    "Otherwise, respond normally in plain text.",
    "Available tools:",
    toolList,
  ].join("\n");
}

/** Parses the local model's JSON tool-call convention out of plain content. */
export function parseLocalToolCall(content: string): RawToolCall | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const call = (parsed as { tool_call?: { name?: string; arguments?: Record<string, unknown> } })
    .tool_call;
  if (!call?.name) {
    return null;
  }

  return { id: call.name, name: call.name, arguments: call.arguments ?? {} };
}
