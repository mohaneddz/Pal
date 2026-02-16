import type { CSSProperties, MutableRefObject } from "react";
import type { LucideIcon } from "lucide-react";

import type { AssistantMode } from "../types/pal";

interface HomeSectionProps {
  showSidebarToggle?: boolean;
  showChatToggle?: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  chatPanelOpen: boolean;
  toggleChatPanel: () => void;
  modeMenuOpen: boolean;
  setModeMenuOpen: (open: boolean) => void;
  modeMenuRef: MutableRefObject<HTMLDivElement | null>;
  modeMenuToggleRef: MutableRefObject<HTMLButtonElement | null>;
  selectedMode: {
    id: AssistantMode;
    label: string;
    description: string;
    icon: LucideIcon;
  };
  modeOptions: Array<{
    id: AssistantMode;
    label: string;
    description: string;
    icon: LucideIcon;
  }>;
  currentAssistantMode: AssistantMode;
  updateAssistantMode: (mode: string) => void;
  orbStateClass: string;
  orbMotionStyle: CSSProperties;
  voiceUiState: string;
  waveformBars: number[];
  isListening: boolean;
  toggleListening: () => Promise<void>;
  voiceEnabled: boolean;
  isProcessing: boolean;
  voiceStatusLabel: string;
}

export function HomeSection({
  showSidebarToggle = true,
  showChatToggle = true,
  sidebarOpen,
  setSidebarOpen,
  chatPanelOpen,
  toggleChatPanel,
  modeMenuOpen,
  setModeMenuOpen,
  modeMenuRef,
  modeMenuToggleRef,
  selectedMode,
  modeOptions,
  currentAssistantMode,
  updateAssistantMode,
  orbStateClass,
  orbMotionStyle,
  voiceUiState,
  waveformBars,
  isListening,
  toggleListening,
  voiceEnabled,
  isProcessing,
  voiceStatusLabel,
}: HomeSectionProps) {
  const SelectedModeIcon = selectedMode.icon;

  return (
    <section className="pal-hero-panel">
      <div className="pal-hero-controls">
        {showSidebarToggle ? (
          <button
            type="button"
            className="pal-sidebar-toggle"
            onClick={() => {
              setSidebarOpen(!sidebarOpen);
            }}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? "Close menu" : "Open menu"}
          </button>
        ) : <span />}

        {showChatToggle ? (
          <button
            type="button"
            className="pal-chat-toggle"
            onClick={toggleChatPanel}
            aria-label={chatPanelOpen ? "Close chat" : "Open chat"}
            title={chatPanelOpen ? "Close chat" : "Open chat"}
          >
            {chatPanelOpen ? "Close chat" : "Open chat"}
          </button>
        ) : null}

        <section className="pal-mode-picker" aria-label="Conversation mode picker">
          <button
            ref={modeMenuToggleRef}
            type="button"
            className="pal-mode-menu-trigger"
            onClick={() => {
              setModeMenuOpen(!modeMenuOpen);
            }}
            aria-label={`Select mode. Current: ${selectedMode.label}`}
            title={`${selectedMode.label}: ${selectedMode.description}`}
            aria-haspopup="dialog"
            aria-expanded={modeMenuOpen}
          >
            <SelectedModeIcon size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          {modeMenuOpen && (
            <div ref={modeMenuRef} className="pal-mode-menu" role="dialog" aria-label="Mode list">
              <div className="pal-mode-grid" role="radiogroup" aria-label="Conversation modes">
                {modeOptions.map((mode) => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      className={`pal-mode-grid-item ${currentAssistantMode === mode.id ? "active" : ""}`}
                      onClick={() => {
                        updateAssistantMode(mode.id);
                        setModeMenuOpen(false);
                      }}
                      role="radio"
                      aria-checked={currentAssistantMode === mode.id}
                      aria-label={`${mode.label}: ${mode.description}`}
                      title={`${mode.label}: ${mode.description}`}
                    >
                      <ModeIcon size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="pal-orb-stage">
        <div className={`pal-orb-shell ${orbStateClass}`} style={orbMotionStyle}>
          <div className="pal-orb-core" />
          <div className="pal-orb-wave" />
          <div className="pal-orb-ring" />
          <div className="pal-orb-ring pal-orb-ring-secondary" />
        </div>
      </div>

      <h1 className="pal-hero-title">What can I do for you?</h1>

      <div className={`pal-wave-capsule is-${voiceUiState}`}>
        {voiceUiState !== "disabled" && (
          <div className="pal-wave-track">
            {waveformBars.map((barHeight, index) => (
              <span
                key={`bar-${index}`}
                className="pal-wave-bar"
                style={{
                  height: `${Math.max(8, barHeight * 100)}%`,
                  animationDelay: `${index * 0.02}s`,
                }}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          className={`pal-mic-button is-${voiceUiState} ${isListening ? "is-live" : ""}`}
          onClick={() => {
            void toggleListening();
          }}
          aria-label={voiceEnabled ? "Disable voice mode" : "Enable voice mode"}
          disabled={isProcessing}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
            <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
            <path d="M12 19v3" />
            <path d="M9 22h6" />
          </svg>
        </button>

        <span className={`pal-voice-state is-${voiceUiState}`}>{voiceStatusLabel}</span>
      </div>
    </section>
  );
}
