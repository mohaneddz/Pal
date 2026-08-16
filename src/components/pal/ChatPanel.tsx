import type { ChangeEvent, FormEvent, MutableRefObject } from "react";
import { Copy, Ellipsis, Paperclip, PenLine, RefreshCcw, Volume2 } from "lucide-react";

import { ONLINE_FEATURES_ENABLED, ONLINE_FEATURES_FUTURE_HINT } from "../../config/runtime";
import type { ChatMessage } from "../../types/pal";
import { formatTime } from "./utils";
import { ActionCard } from "./ActionCard";
import { MessageMarkdown } from "./MessageMarkdown";

interface ChatPanelProps {
  collapsed: boolean;
  chatMenuOpen: boolean;
  setChatMenuOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  clearConversation: () => void;
  isProcessing: boolean;
  handleReuseLastPrompt: () => void;
  openAttachmentPicker: () => void;
  handleCopyTranscript: () => Promise<void>;
  handleExportTranscript: () => void;
  handleCopyLastReply: () => Promise<void>;
  hasSearch: boolean;
  searchSummary: string;
  searchQuery: string;
  groqReady: boolean;
  errorMessage: string | null;
  messages: ChatMessage[];
  filteredMessages: ChatMessage[];
  copyToClipboard: (value: string, successLabel: string) => Promise<void>;
  setDraft: (value: string) => void;
  setComposerNotice: (value: string | null) => void;
  attachmentName: string | null;
  setAttachmentName: (value: string | null) => void;
  composerNotice: string | null;
  handleComposerSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  voiceUiState: string;
  toggleListening: () => Promise<void>;
  voiceEnabled: boolean;
  draft: string;
  isSpeaking: boolean;
  stopSpeaking: () => void;
  canSendDraft: boolean;
  handleAttachmentSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  sendQuickPrompt: (prompt: string) => Promise<void>;
  speakText: (text: string) => Promise<void>;
  composerInputRef: MutableRefObject<HTMLInputElement | null>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  chatMenuRef: MutableRefObject<HTMLDivElement | null>;
  chatMenuToggleRef: MutableRefObject<HTMLButtonElement | null>;
  chatScrollRef: MutableRefObject<HTMLDivElement | null>;
  searchInputRef: MutableRefObject<HTMLInputElement | null>;
}

export function ChatPanel({
  collapsed,
  chatMenuOpen,
  setChatMenuOpen,
  setSearchQuery,
  clearConversation,
  isProcessing,
  handleReuseLastPrompt,
  openAttachmentPicker,
  handleCopyTranscript,
  handleExportTranscript,
  handleCopyLastReply,
  hasSearch,
  searchSummary,
  searchQuery,
  groqReady,
  errorMessage,
  messages,
  filteredMessages,
  copyToClipboard,
  setDraft,
  setComposerNotice,
  attachmentName,
  setAttachmentName,
  composerNotice,
  handleComposerSubmit,
  voiceUiState,
  toggleListening,
  voiceEnabled,
  draft,
  isSpeaking,
  stopSpeaking,
  canSendDraft,
  handleAttachmentSelected,
  sendQuickPrompt,
  speakText,
  composerInputRef,
  fileInputRef,
  chatMenuRef,
  chatMenuToggleRef,
  chatScrollRef,
  searchInputRef,
}: ChatPanelProps) {
  const findPreviousUserPrompt = (targetMessageId: string): string | null => {
    const targetIndex = messages.findIndex((entry) => entry.id === targetMessageId);
    if (targetIndex <= 0) {
      return null;
    }

    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate.role === "user") {
        return candidate.content;
      }
    }

    return null;
  };

  return (
    <aside className={`pal-chat-panel ${collapsed ? "is-collapsed" : ""}`}>
      <div className="pal-chat-header">
        <div className="pal-chat-header-main">
          <button
            type="button"
            className="pal-chat-new"
            onClick={() => {
              clearConversation();
              setAttachmentName(null);
              setChatMenuOpen(false);
              setComposerNotice("Started a new conversation.");
            }}
            disabled={isProcessing}
          >
            New conversation
          </button>
          <div className="pal-chat-header-actions">
            <button
              type="button"
              className="pal-chat-icon-btn"
              aria-label="Reuse last prompt"
              title="Reuse last prompt"
              data-tooltip="Reuse last prompt"
              onClick={handleReuseLastPrompt}
            >
              <PenLine size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pal-chat-icon-btn"
              aria-label="Attach text context"
              title="Attach text context"
              data-tooltip="Attach text context"
              onClick={openAttachmentPicker}
            >
              <Paperclip size={15} aria-hidden="true" />
            </button>
            <div className="pal-chat-menu-anchor">
              <button
                type="button"
                ref={chatMenuToggleRef}
                className="pal-chat-icon-btn"
                aria-label="More actions"
                title="Conversation actions"
                data-tooltip="Conversation actions"
                onClick={() => {
                  setChatMenuOpen(!chatMenuOpen);
                }}
              >
                <Ellipsis size={15} aria-hidden="true" />
              </button>

              {chatMenuOpen && (
                <div ref={chatMenuRef} className="pal-chat-menu" role="menu" aria-label="Conversation actions">
                  <button type="button" role="menuitem" onClick={() => void handleCopyTranscript()}>
                    Copy transcript
                  </button>
                  <button type="button" role="menuitem" onClick={handleExportTranscript}>
                    Export transcript
                  </button>
                  <button type="button" role="menuitem" onClick={() => void handleCopyLastReply()}>
                    Copy last reply
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      clearConversation();
                      setAttachmentName(null);
                      setChatMenuOpen(false);
                      setComposerNotice("Conversation cleared.");
                    }}
                  >
                    Clear chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <label className="pal-chat-search" htmlFor="chat-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.4-3.4" />
          </svg>
          <input
            id="chat-search"
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search messages (Ctrl/Cmd + K)"
          />
        </label>

      </div>

      <div ref={chatScrollRef} className="pal-chat-scroll">
        <div className="pal-chat-meta">
          <span>{searchSummary}</span>
          {hasSearch && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
            >
              Clear search
            </button>
          )}
        </div>

        {!ONLINE_FEATURES_ENABLED && (
          <div className="pal-system-alert">
            Cloud features are disabled for future updates.
          </div>
        )}

        {ONLINE_FEATURES_ENABLED && !groqReady && (
          <div className="pal-system-alert">
            Add `VITE_GROQ_API_KEY` to `src/.env` to enable Groq requests.
          </div>
        )}

        {errorMessage && <div className="pal-system-alert pal-system-alert-error">{errorMessage}</div>}

        {messages.length === 0 && (
          <div className="pal-chat-placeholder">
            <p>Start with voice or send a text message.</p>
          </div>
        )}

        {messages.length > 0 && filteredMessages.length === 0 && (
          <div className="pal-chat-placeholder">
            <p>No messages match your search.</p>
          </div>
        )}

        {filteredMessages.map((message) => (
          <article
            key={message.id}
            className={`pal-chat-bubble ${message.role === "user" ? "is-user" : "is-assistant"}`}
          >
            <header>
              <span>{message.role === "user" ? "You" : "Pal"}</span>
              <time>{formatTime(message.createdAt)}</time>
            </header>
            <MessageMarkdown content={message.content} />
            {message.action && <ActionCard action={message.action} />}
            <footer className="pal-bubble-actions">
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(message.content, "Copied message.");
                }}
              >
                <Copy size={13} aria-hidden="true" />
                Copy
              </button>
              {message.role === "user" && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(message.content);
                    setComposerNotice("Loaded message into composer.");
                  }}
                >
                  <PenLine size={13} aria-hidden="true" />
                  Reuse
                </button>
              )}
              {message.role === "assistant" && (
                <>
                  <button
                    type="button"
                    title={ONLINE_FEATURES_ENABLED ? "Retry prompt" : ONLINE_FEATURES_FUTURE_HINT}
                    onClick={() => {
                      const previousPrompt = findPreviousUserPrompt(message.id);
                      if (!previousPrompt) {
                        setComposerNotice("No user prompt found to retry.");
                        return;
                      }
                      void sendQuickPrompt(previousPrompt);
                      setComposerNotice("Retrying previous prompt.");
                    }}
                    disabled={isProcessing || !ONLINE_FEATURES_ENABLED}
                  >
                    <RefreshCcw size={13} aria-hidden="true" />
                    Retry
                  </button>
                  <button
                    type="button"
                    title={ONLINE_FEATURES_ENABLED ? "Speak response" : ONLINE_FEATURES_FUTURE_HINT}
                    onClick={() => {
                      void speakText(message.content);
                      setComposerNotice("Speaking message.");
                    }}
                    disabled={isProcessing || !ONLINE_FEATURES_ENABLED}
                  >
                    <Volume2 size={13} aria-hidden="true" />
                    Speak
                  </button>
                </>
              )}
            </footer>
          </article>
        ))}
      </div>

      {attachmentName && (
        <div className="pal-composer-note">
          <span>Attached: {attachmentName}</span>
          <button
            type="button"
            onClick={() => {
              setAttachmentName(null);
              setComposerNotice("Attachment tag removed.");
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {composerNotice && !attachmentName && (
        <div className="pal-composer-note pal-composer-note-plain">
          <span>{composerNotice}</span>
        </div>
      )}

      <form
        className="pal-composer"
        onSubmit={(event) => {
          void handleComposerSubmit(event);
        }}
      >
        <button
          type="button"
          className={`pal-composer-mic is-${voiceUiState}`}
          title={ONLINE_FEATURES_ENABLED ? "Toggle voice mode" : ONLINE_FEATURES_FUTURE_HINT}
          onClick={() => {
            void toggleListening();
          }}
          aria-label={voiceEnabled ? "Disable voice mode" : "Enable voice mode"}
          disabled={isProcessing || !ONLINE_FEATURES_ENABLED}
        >
          🎤
        </button>
        <input
          ref={composerInputRef}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Send a message..."
        />
        {isSpeaking ? (
          <button type="button" className="pal-send" onClick={stopSpeaking}>
            Stop
          </button>
        ) : (
          <button type="submit" className="pal-send" disabled={!canSendDraft || isProcessing}>
            Send
          </button>
        )}
      </form>

      <input
        ref={fileInputRef}
        type="file"
        className="pal-hidden-input"
        accept=".txt,.md,.json,.csv,.log,text/plain,application/json"
        onChange={(event) => {
          void handleAttachmentSelected(event);
        }}
      />
    </aside>
  );
}
