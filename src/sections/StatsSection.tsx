import type { ApiUsageStats, AssistantMode } from "../types/pal";
import type { ConversationStats } from "../components/pal/utils";
import { formatDateTime } from "../components/pal/utils";

interface StatsSectionProps {
  conversationStats: ConversationStats;
  apiUsage: ApiUsageStats;
  currentAssistantMode: AssistantMode;
  modeLabelById: Record<AssistantMode, string>;
}

export function StatsSection({
  conversationStats,
  apiUsage,
  currentAssistantMode,
  modeLabelById,
}: StatsSectionProps) {
  const assistantShare = conversationStats.totalWords > 0
    ? Math.round((conversationStats.assistantWordCount / conversationStats.totalWords) * 100)
    : 0;

  return (
    <section className="pal-stats-panel">
      <header className="pal-page-header">
        <h2>Conversation Statistics</h2>
        <p>Usage across all saved conversations in this workspace.</p>
      </header>

      <div className="pal-stats-grid">
        <article className="pal-stat-card">
          <span>Total messages</span>
          <strong>{conversationStats.totalMessages}</strong>
        </article>
        <article className="pal-stat-card">
          <span>User messages</span>
          <strong>{conversationStats.userMessages}</strong>
        </article>
        <article className="pal-stat-card">
          <span>Assistant messages</span>
          <strong>{conversationStats.assistantMessages}</strong>
        </article>
        <article className="pal-stat-card">
          <span>Total words</span>
          <strong>{conversationStats.totalWords}</strong>
        </article>
        <article className="pal-stat-card">
          <span>Total characters</span>
          <strong>{conversationStats.totalCharacters}</strong>
        </article>
        <article className="pal-stat-card">
          <span>Active days</span>
          <strong>{conversationStats.activeDays}</strong>
        </article>
        <article className="pal-stat-card">
          <span>Messages per active day</span>
          <strong>{conversationStats.messagesPerActiveDay}</strong>
        </article>
        <article className="pal-stat-card">
          <span>API requests (total)</span>
          <strong>{apiUsage.totalRequests}</strong>
        </article>
      </div>

      <div className="pal-stats-list">
        <div className="pal-stat-row">
          <span>Average words per message</span>
          <strong>{conversationStats.averageWordsPerMessage}</strong>
        </div>
        <div className="pal-stat-row">
          <span>Average characters per message</span>
          <strong>{conversationStats.averageCharactersPerMessage}</strong>
        </div>
        <div className="pal-stat-row">
          <span>First saved message</span>
          <strong>{conversationStats.firstMessageAt ? formatDateTime(conversationStats.firstMessageAt) : "No messages yet"}</strong>
        </div>
        <div className="pal-stat-row">
          <span>Last message</span>
          <strong>{conversationStats.latestMessageAt ? formatDateTime(conversationStats.latestMessageAt) : "No messages yet"}</strong>
        </div>
        <div className="pal-stat-row">
          <span>Current voice mode</span>
          <strong>{modeLabelById[currentAssistantMode] ?? "Advisor"}</strong>
        </div>
        <div className="pal-stat-row">
          <span>User words / assistant words</span>
          <strong>{conversationStats.userWordCount} / {conversationStats.assistantWordCount}</strong>
        </div>
        <div className="pal-stat-row">
          <span>Assistant word share</span>
          <strong>{assistantShare}%</strong>
        </div>
        <div className="pal-stat-row">
          <span>Average user message length</span>
          <strong>{conversationStats.averageUserWordsPerMessage} words</strong>
        </div>
        <div className="pal-stat-row">
          <span>Average assistant message length</span>
          <strong>{conversationStats.averageAssistantWordsPerMessage} words</strong>
        </div>
        <div className="pal-stat-row">
          <span>Longest message</span>
          <strong>
            {conversationStats.longestMessageWords > 0
              ? `${conversationStats.longestMessageWords} words (${conversationStats.longestMessageRole === "user" ? "You" : "Assistant"})`
              : "No messages yet"}
          </strong>
        </div>
        <div className="pal-stat-row">
          <span>API calls by type (chat / STT / TTS)</span>
          <strong>{apiUsage.chatRequests} / {apiUsage.transcriptionRequests} / {apiUsage.speechRequests}</strong>
        </div>
      </div>
    </section>
  );
}
