import type { ChatMessage } from "../types/pal";
import { formatTime, renderHighlightedText } from "../components/pal/utils";

interface HistorySectionProps {
  historyMessages: ChatMessage[];
  filteredHistoryMessages: ChatMessage[];
  searchQuery: string;
}

export function HistorySection({ historyMessages, filteredHistoryMessages, searchQuery }: HistorySectionProps) {
  return (
    <section className="pal-history-panel">
      <h2>Conversation History</h2>
      <div className="pal-history-scroll">
        {historyMessages.length === 0 ? (
          <p className="pal-empty-state">No conversation yet. Start with the microphone or type a message.</p>
        ) : filteredHistoryMessages.length === 0 ? (
          <p className="pal-empty-state">No history matches your search.</p>
        ) : (
          <div className="pal-history-list">
            {filteredHistoryMessages.map((message) => (
              <article key={message.id} className={`pal-history-item pal-history-${message.role}`}>
                <header>
                  <strong>{message.role === "user" ? "You" : "Pal"}</strong>
                  <span>{formatTime(message.createdAt)}</span>
                </header>
                <p>{renderHighlightedText(message.content, searchQuery)}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
