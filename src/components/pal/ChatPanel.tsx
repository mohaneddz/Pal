import type { ChangeEvent, FormEvent, MutableRefObject } from "react";

import type { ChatMessage } from "../../types/pal";
import { formatTime, renderHighlightedText } from "./utils";

interface ChatPanelProps {
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
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  chatMenuRef: MutableRefObject<HTMLDivElement | null>;
  chatMenuToggleRef: MutableRefObject<HTMLButtonElement | null>;
  chatScrollRef: MutableRefObject<HTMLDivElement | null>;
  searchInputRef: MutableRefObject<HTMLInputElement | null>;
}

export function ChatPanel({
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
  fileInputRef,
  chatMenuRef,
  chatMenuToggleRef,
  chatScrollRef,
  searchInputRef,
}: ChatPanelProps) {
  return (
    <aside className="pal-chat-panel">
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
              onClick={handleReuseLastPrompt}
            >
              ✎
            </button>
            <button
              type="button"
              className="pal-chat-icon-btn"
              aria-label="Attach text context"
              onClick={openAttachmentPicker}
            >
              ⊕
            </button>
            <button
              type="button"
              ref={chatMenuToggleRef}
              className="pal-chat-icon-btn"
              aria-label="More actions"
              onClick={() => {
                setChatMenuOpen(!chatMenuOpen);
              }}
            >
              •••
            </button>
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

        {!groqReady && (
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
            <p>{renderHighlightedText(message.content, searchQuery)}</p>
            <footer className="pal-bubble-actions">
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(message.content, "Copied message.");
                }}
              >
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
                  Reuse
                </button>
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
          onClick={() => {
            void toggleListening();
          }}
          aria-label={voiceEnabled ? "Disable voice mode" : "Enable voice mode"}
          disabled={isProcessing}
        >
          🎤
        </button>
        <input
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
