import { useEffect, useState } from "react";

import { getLocalLlmStatus, startLocalLlm, stopLocalLlm } from "../services/localClient";
import { getLocalSttStatus, startLocalStt, stopLocalStt } from "../services/localVoice";
import type { LocalServerStatus, RuntimeToggles } from "../types/pal";

const POLL_STARTING_MS = 1500;
/** Heartbeat once ready, mainly to notice a server that crashed on its own. */
const POLL_READY_MS = 8000;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Watches one local server (llama-server or whisper-server): starts it when
 * its toggle turns on, stops it (freeing VRAM) when the toggle turns off, and
 * polls status while starting so the UI can show real progress instead of a
 * silent multi-second hang on the first request.
 */
function useSupervisedServer(
  enabled: boolean,
  start: () => Promise<LocalServerStatus>,
  stop: () => Promise<LocalServerStatus>,
  getStatus: () => Promise<LocalServerStatus>,
  /** Extra values that should force a restart when they change, e.g. a model
   * or GPU-offload choice. The Rust supervisor already detects a config
   * mismatch and restarts on the next `start()` call — this just makes that
   * call happen immediately instead of waiting for the next chat turn. */
  restartDeps: readonly unknown[] = [],
): LocalServerStatus | null {
  const [status, setStatus] = useState<LocalServerStatus | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      void stop().catch(() => {
        // Best-effort: nothing to reconcile if the server was never running.
      });
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const tick = async (isFirst: boolean) => {
      try {
        const next = isFirst ? await start() : await getStatus();
        if (cancelled) {
          return;
        }
        setStatus(next);
        if (next.state === "starting" || next.state === "ready") {
          const delay = next.state === "ready" ? POLL_READY_MS : POLL_STARTING_MS;
          timer = window.setTimeout(() => {
            void tick(false);
          }, delay);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ state: "error", model: "", port: 0, message: toErrorMessage(error) });
        }
      }
    };

    void tick(true);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
    // `start`/`stop`/`getStatus` are stable module-level functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...restartDeps]);

  return status;
}

export interface LocalRuntimeStatus {
  llmStatus: LocalServerStatus | null;
  sttStatus: LocalServerStatus | null;
}

/**
 * Surfaces live state for the local LLM and STT child processes so Settings
 * can show "starting / ready / error" instead of the toggle silently doing
 * nothing until the next chat turn. TTS has no comparable server — Kokoro
 * runs in-process and its ONNX session loads lazily on first use.
 *
 * `llmRestartKey` should change whenever a setting that requires reloading
 * the model changes (model size, GPU offload), so the swap happens as soon
 * as the user picks it rather than on their next chat turn.
 */
export function useLocalRuntimeStatus(
  toggles: RuntimeToggles,
  llmRestartKey?: unknown,
): LocalRuntimeStatus {
  const llmStatus = useSupervisedServer(
    toggles.LOCAL_LLM,
    startLocalLlm,
    stopLocalLlm,
    getLocalLlmStatus,
    [llmRestartKey],
  );
  const sttStatus = useSupervisedServer(
    toggles.STT_LOCAL,
    startLocalStt,
    stopLocalStt,
    getLocalSttStatus,
  );

  return { llmStatus, sttStatus };
}
