import { useMemo, useState } from "react";

import type { ChatMessage } from "../types/pal";
import { formatDateTime, formatTime, messageMatchesQuery } from "../components/pal/utils";
import { MessageMarkdown } from "../components/pal/MessageMarkdown";

interface HistorySectionProps {
  historyMessages: ChatMessage[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

interface ConversationGroup {
  id: string;
  messages: ChatMessage[];
  startedAt: number;
  endedAt: number;
}

const CONVERSATION_GAP_MS = 25 * 60 * 1000;

function groupConversations(messages: ChatMessage[]): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  let current: ConversationGroup | null = null;

  for (const message of messages) {
    const lastMessage = current?.messages[current.messages.length - 1];
    const roleReset = message.role === "user" && lastMessage?.role === "assistant";
    const longGap = lastMessage ? message.createdAt - lastMessage.createdAt > CONVERSATION_GAP_MS : false;

    if (!current || (roleReset && longGap)) {
      current = {
        id: `conversation-${groups.length + 1}-${message.createdAt}`,
        messages: [message],
        startedAt: message.createdAt,
        endedAt: message.createdAt,
      };
      groups.push(current);
      continue;
    }

    current.messages.push(message);
    current.endedAt = message.createdAt;
  }

  return groups;
}

export function HistorySection({ historyMessages, searchQuery, setSearchQuery }: HistorySectionProps) {
  const [showUser, setShowUser] = useState(true);
  const [showAssistant, setShowAssistant] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [compactView, setCompactView] = useState(false);

  const conversations = useMemo(() => groupConversations(historyMessages), [historyMessages]);

  const filteredConversations = useMemo(() => {
    return conversations
      .map((conversation) => {
        const filteredMessages = conversation.messages.filter((message) => {
          if (message.role === "user" && !showUser) {
            return false;
          }
          if (message.role === "assistant" && !showAssistant) {
            return false;
          }
          return messageMatchesQuery(message, searchQuery);
        });

        return { ...conversation, messages: filteredMessages };
      })
      .filter((conversation) => conversation.messages.length > 0);
  }, [conversations, searchQuery, showAssistant, showUser]);

  return (
    <section className="pal-history-panel">
      <header className="pal-history-header">
        <h2>Conversation History</h2>
        <div className="pal-history-toolbar">
          <label className="pal-history-search" htmlFor="history-global-search">
            <span>Global search</span>
            <input
              id="history-global-search"
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
              placeholder="Search all conversations"
            />
          </label>
          <div className="pal-history-toggles">
            <label>
              <input
                type="checkbox"
                checked={showUser}
                onChange={(event) => {
                  setShowUser(event.target.checked);
                }}
              />
              You
            </label>
            <label>
              <input
                type="checkbox"
                checked={showAssistant}
                onChange={(event) => {
                  setShowAssistant(event.target.checked);
                }}
              />
              Pal
            </label>
            <label>
              <input
                type="checkbox"
                checked={showBoundaries}
                onChange={(event) => {
                  setShowBoundaries(event.target.checked);
                }}
              />
              Start/End markers
            </label>
            <label>
              <input
                type="checkbox"
                checked={compactView}
                onChange={(event) => {
                  setCompactView(event.target.checked);
                }}
              />
              Compact
            </label>
          </div>
        </div>
      </header>
      <div className="pal-history-scroll">
        {historyMessages.length === 0 ? (
          <p className="pal-empty-state">No conversation yet. Start with the microphone or type a message.</p>
        ) : filteredConversations.length === 0 ? (
          <p className="pal-empty-state">No history matches your search.</p>
        ) : (
          filteredConversations.map((conversation, index) => (
            <section key={conversation.id} className="pal-history-conversation">
              <header className="pal-history-conversation-header">
                <strong>Conversation {index + 1}</strong>
                <span>
                  {formatDateTime(conversation.startedAt)}
                  {" "}
                  to
                  {" "}
                  {formatDateTime(conversation.endedAt)}
                </span>
              </header>

              {showBoundaries && (
                <div className="pal-history-boundary pal-history-boundary-start">
                  Start: {formatDateTime(conversation.startedAt)}
                </div>
              )}

              <div className="pal-history-list">
                {conversation.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`pal-history-item pal-history-${message.role} ${compactView ? "is-compact" : ""}`}
                  >
                    <header>
                      <strong>{message.role === "user" ? "You" : "Pal"}</strong>
                      <span>{formatTime(message.createdAt)}</span>
                    </header>
                    <MessageMarkdown content={message.content} />
                  </article>
                ))}
              </div>

              {showBoundaries && (
                <div className="pal-history-boundary pal-history-boundary-end">
                  End: {formatDateTime(conversation.endedAt)}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </section>
  );
}
