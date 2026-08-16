import { ONLINE_FEATURES_ENABLED, ONLINE_FEATURES_FUTURE_HINT, runtimeConfig } from "../config/runtime";
import type { LocalModelPreferences } from "../hooks/useRuntimeConfigState";
import type {
  AssistantMode,
  LocalServerStatus,
  PalUiSettings,
  RuntimeModels,
  RuntimeToggles,
} from "../types/pal";

interface SettingsSectionProps {
  settings: PalUiSettings;
  modeOptions: Array<{ id: AssistantMode; label: string }>;
  updateAssistantMode: (mode: string) => void;
  updateVoice: (voice: string) => void;
  updateSpeechStyle: (style: string) => void;
  runtimeTogglesState: RuntimeToggles;
  setRuntimeTogglesState: (value: RuntimeToggles) => void;
  runtimeModelsState: RuntimeModels;
  setRuntimeModelsState: (value: RuntimeModels) => void;
  localPreferences: LocalModelPreferences;
  setLocalPreferences: (value: LocalModelPreferences) => void;
  localLlmStatus: LocalServerStatus | null;
  localSttStatus: LocalServerStatus | null;
  setAutoSpeak: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setAutoFreeRam: (enabled: boolean) => void;
  setStartWithWindows: (enabled: boolean) => void;
  setStartMinimized: (enabled: boolean) => void;
  setPcActionsEnabled: (enabled: boolean) => void;
}

/** Small status line under a local-runtime toggle. Renders nothing once the
 * toggle is off — `status` is `null` in that case, matching the fact there
 * is no process left to report on. */
function LocalStatusBanner({ status, label }: { status: LocalServerStatus | null; label: string }) {
  if (!status) {
    return null;
  }

  if (status.state === "starting") {
    return (
      <div className="pal-system-alert pal-system-alert-compact">
        Starting {label}… first load can take up to a minute.
      </div>
    );
  }

  if (status.state === "ready") {
    return (
      <div className="pal-system-alert pal-system-alert-success pal-system-alert-compact">
        {label} ready{status.model ? ` (${status.model})` : ""}.
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="pal-system-alert pal-system-alert-error pal-system-alert-compact">
        {label} failed to start: {status.message ?? "unknown error"}. Run{" "}
        <code>scripts/fetch-backend.ps1</code> if the local runtime hasn&apos;t been downloaded yet.
      </div>
    );
  }

  return null;
}

export function SettingsSection({
  settings,
  modeOptions,
  updateAssistantMode,
  updateVoice,
  updateSpeechStyle,
  runtimeTogglesState,
  setRuntimeTogglesState,
  runtimeModelsState,
  setRuntimeModelsState,
  localPreferences,
  setLocalPreferences,
  localLlmStatus,
  localSttStatus,
  setAutoSpeak,
  setMinimizeToTray,
  setAutoFreeRam,
  setStartWithWindows,
  setStartMinimized,
  setPcActionsEnabled,
}: SettingsSectionProps) {

  return (
    <section className="pal-settings-panel">
      <header className="pal-page-header">
        <h2>Settings</h2>
        <p>Tune voice behavior, model routing, and runtime options.</p>
      </header>

      <div className="pal-settings-layout">
        <article className="pal-setting-block">
          <h3>Voice & Persona</h3>
          <div className="pal-setting-row">
            <label htmlFor="mode-select">Conversation mode</label>
            <select
              id="mode-select"
              value={settings.assistantMode}
              onChange={(event) => {
                updateAssistantMode(event.target.value);
              }}
            >
              {modeOptions.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pal-setting-row">
            <label htmlFor="voice-select">Voice profile</label>
            <select
              id="voice-select"
              value={settings.voice}
              onChange={(event) => {
                updateVoice(event.target.value);
              }}
            >
              <option value="autumn">autumn</option>
              <option value="diana">diana</option>
              <option value="hannah">hannah</option>
              <option value="austin">austin</option>
              <option value="daniel">daniel</option>
              <option value="troy">troy</option>
            </select>
          </div>
          <p className="pal-setting-hint">
            Used for both engines: Groq synthesizes this voice directly, and local TTS maps it to
            the closest Kokoro voice.
          </p>

          <div className="pal-setting-row">
            <label htmlFor="style-select">Delivery style</label>
            <select
              id="style-select"
              value={settings.speechStyle}
              onChange={(event) => {
                updateSpeechStyle(event.target.value);
              }}
            >
              <option value="natural">natural</option>
              <option value="neutral">neutral</option>
              <option value="cheerful">cheerful</option>
              <option value="professional">professional</option>
              <option value="whisper">whisper</option>
            </select>
          </div>
        </article>

        <article className="pal-setting-block">
          <h3>Runtime</h3>
          <div className="pal-setting-switch">
            <label htmlFor="toggle-local-llm">Use local LLM</label>
            <label className="pal-switch-control" htmlFor="toggle-local-llm">
              <input
                id="toggle-local-llm"
                type="checkbox"
                checked={runtimeTogglesState.LOCAL_LLM}
                title="Run Gemma 3 on this machine instead of the cloud chat model."
                onChange={(event) => {
                  setRuntimeTogglesState({ ...runtimeTogglesState, LOCAL_LLM: event.target.checked });
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <LocalStatusBanner status={localLlmStatus} label="Local chat" />

          <div className="pal-setting-switch">
            <label htmlFor="toggle-local-stt">Use local STT</label>
            <label className="pal-switch-control" htmlFor="toggle-local-stt">
              <input
                id="toggle-local-stt"
                type="checkbox"
                checked={runtimeTogglesState.STT_LOCAL}
                title="Transcribe with the bundled Whisper model instead of the cloud."
                onChange={(event) => {
                  setRuntimeTogglesState({ ...runtimeTogglesState, STT_LOCAL: event.target.checked });
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <LocalStatusBanner status={localSttStatus} label="Local speech recognition" />

          <div className="pal-setting-switch">
            <label htmlFor="toggle-local-tts">Use local TTS</label>
            <label className="pal-switch-control" htmlFor="toggle-local-tts">
              <input
                id="toggle-local-tts"
                type="checkbox"
                checked={runtimeTogglesState.TTS_LOCAL}
                title="Speak with the bundled Kokoro voice instead of the cloud."
                onChange={(event) => {
                  setRuntimeTogglesState({ ...runtimeTogglesState, TTS_LOCAL: event.target.checked });
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <p className="pal-setting-hint">
            Kokoro runs in-process and loads on first use, so there is no separate status here —
            the first local reply after enabling will be a little slower while it warms up.
          </p>
        </article>

        <article className="pal-setting-block">
          <h3>Local Models</h3>
          <div className="pal-setting-row">
            <label htmlFor="local-llm-model">Local chat model</label>
            <select
              id="local-llm-model"
              value={localPreferences.llmModel}
              onChange={(event) => {
                setLocalPreferences({
                  ...localPreferences,
                  llmModel: event.target.value as LocalModelPreferences["llmModel"],
                });
              }}
            >
              <option value="gemma-3-4b-it-q4_0">Gemma 3 4B (better quality, ~3GB VRAM)</option>
              <option value="gemma-3-1b-it-q4_0">Gemma 3 1B (faster, lighter)</option>
            </select>
          </div>
          <p className="pal-setting-hint">
            Measured on an RTX 4070 Laptop: 4B runs ~50 tok/s on GPU or ~9.6 tok/s on CPU; 1B runs
            ~30 tok/s on CPU alone. Changing this restarts the local model.
          </p>

          <div className="pal-setting-switch">
            <label htmlFor="local-use-gpu">Use GPU for local chat</label>
            <label className="pal-switch-control" htmlFor="local-use-gpu">
              <input
                id="local-use-gpu"
                type="checkbox"
                checked={localPreferences.useGpu}
                title="Offload model layers to the GPU. Turn off to force CPU-only inference."
                onChange={(event) => {
                  setLocalPreferences({ ...localPreferences, useGpu: event.target.checked });
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <p className="pal-setting-hint">
            Turn this off if the local model fails to start or misbehaves on GPUs llama.cpp
            doesn&apos;t offload cleanly to — CPU inference is slower but always works.
          </p>

          <div className="pal-setting-row">
            <div className="pal-setting-row-value">
              <label htmlFor="local-tts-speed">Local speech speed</label>
              <span>{localPreferences.ttsSpeed.toFixed(2)}x</span>
            </div>
            <input
              id="local-tts-speed"
              type="range"
              min={0.75}
              max={1.5}
              step={0.05}
              value={localPreferences.ttsSpeed}
              onChange={(event) => {
                setLocalPreferences({ ...localPreferences, ttsSpeed: Number(event.target.value) });
              }}
            />
          </div>
        </article>

        <article className="pal-setting-block">
          <h3>Cloud Models</h3>
          <div className="pal-setting-row">
            <label htmlFor="chat-model">Chat model (Groq)</label>
            <select
              id="chat-model"
              value={runtimeModelsState.chat}
              disabled={!ONLINE_FEATURES_ENABLED}
              title={!ONLINE_FEATURES_ENABLED ? ONLINE_FEATURES_FUTURE_HINT : undefined}
              onChange={(event) => {
                runtimeConfig.models.chat = event.target.value;
                setRuntimeModelsState({ ...runtimeModelsState, chat: event.target.value });
              }}
            >
              <option value={runtimeConfig.models.chat}>{runtimeConfig.models.chat}</option>
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
            </select>
          </div>

          <div className="pal-setting-row">
            <label htmlFor="stt-model">Speech-to-text model (Groq)</label>
            <select
              id="stt-model"
              value={runtimeModelsState.stt}
              disabled={!ONLINE_FEATURES_ENABLED}
              title={!ONLINE_FEATURES_ENABLED ? ONLINE_FEATURES_FUTURE_HINT : undefined}
              onChange={(event) => {
                runtimeConfig.models.stt = event.target.value;
                setRuntimeModelsState({ ...runtimeModelsState, stt: event.target.value });
              }}
            >
              <option value={runtimeConfig.models.stt}>{runtimeConfig.models.stt}</option>
              <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
              <option value="whisper-large-v3">whisper-large-v3</option>
            </select>
          </div>

          <div className="pal-setting-row">
            <label htmlFor="tts-model">Text-to-speech model (Groq)</label>
            <select
              id="tts-model"
              value={runtimeModelsState.tts}
              disabled={!ONLINE_FEATURES_ENABLED}
              title={!ONLINE_FEATURES_ENABLED ? ONLINE_FEATURES_FUTURE_HINT : undefined}
              onChange={(event) => {
                runtimeConfig.models.tts = event.target.value;
                setRuntimeModelsState({ ...runtimeModelsState, tts: event.target.value });
              }}
            >
              <option value={runtimeConfig.models.tts}>{runtimeConfig.models.tts}</option>
              <option value="canopylabs/orpheus-v1-english">canopylabs/orpheus-v1-english</option>
              <option value="canopylabs/orpheus-v1-multilingual">canopylabs/orpheus-v1-multilingual</option>
            </select>
          </div>
        </article>

        <article className="pal-setting-block">
          <h3>Behavior</h3>
          <div className="pal-setting-switch">
            <label htmlFor="auto-speak">Auto-play TTS replies</label>
            <label className="pal-switch-control" htmlFor="auto-speak">
              <input
                id="auto-speak"
                type="checkbox"
                checked={settings.autoSpeak}
                onChange={(event) => {
                  setAutoSpeak(event.target.checked);
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <div className="pal-setting-switch">
            <label htmlFor="start-with-windows">Start with Windows</label>
            <label className="pal-switch-control" htmlFor="start-with-windows">
              <input
                id="start-with-windows"
                type="checkbox"
                checked={settings.startWithWindows}
                onChange={(event) => {
                  setStartWithWindows(event.target.checked);
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <div className="pal-setting-switch">
            <label htmlFor="start-minimized">Start minimized</label>
            <label className="pal-switch-control" htmlFor="start-minimized">
              <input
                id="start-minimized"
                type="checkbox"
                checked={settings.startMinimized}
                disabled={!settings.startWithWindows}
                onChange={(event) => {
                  setStartMinimized(event.target.checked);
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <p className="pal-setting-hint">
            Start minimized is available only when Start with Windows is enabled.
          </p>
          <div className="pal-setting-switch">
            <label htmlFor="minimize-to-tray">Minimize to tray</label>
            <label className="pal-switch-control" htmlFor="minimize-to-tray">
              <input
                id="minimize-to-tray"
                type="checkbox"
                checked={settings.minimizeToTray}
                onChange={(event) => {
                  setMinimizeToTray(event.target.checked);
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <div className="pal-setting-switch">
            <label htmlFor="auto-free-ram">Auto free RAM on hide/close</label>
            <label className="pal-switch-control" htmlFor="auto-free-ram">
              <input
                id="auto-free-ram"
                type="checkbox"
                checked={settings.autoFreeRam}
                onChange={(event) => {
                  setAutoFreeRam(event.target.checked);
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <p className="pal-setting-hint">
            When enabled, minimize and close will hide the app to the system tray.
          </p>
          <p className="pal-setting-hint">
            Auto free RAM destroys the main window instead of hiding it, and restores it from tray/shortcuts.
            It does not stop local model servers — turn off the local toggles above to free that VRAM.
          </p>
        </article>

        <article className="pal-setting-block">
          <h3>PC Actions</h3>
          <div className="pal-setting-switch">
            <label htmlFor="toggle-pc-actions">Let Pal take actions on this PC</label>
            <label className="pal-switch-control" htmlFor="toggle-pc-actions">
              <input
                id="toggle-pc-actions"
                type="checkbox"
                checked={settings.pcActionsEnabled}
                title="Allow Pal to read files and system info. Any write, delete, install, or settings change always asks for confirmation first."
                onChange={(event) => {
                  setPcActionsEnabled(event.target.checked);
                }}
              />
              <span className="pal-switch-slider" aria-hidden="true" />
            </label>
          </div>
          <p className="pal-setting-hint">
            Read-only actions (reading files, checking disk space, calculations) run automatically.
            Anything that changes your PC always asks for confirmation first.
          </p>
        </article>
      </div>
    </section>
  );
}
