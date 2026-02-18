import type { ReactNode } from "react";

import type { ChatMessage } from "../../types/pal";

export interface ConversationStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalWords: number;
  totalCharacters: number;
  averageWordsPerMessage: number;
  averageCharactersPerMessage: number;
  userWordCount: number;
  assistantWordCount: number;
  averageUserWordsPerMessage: number;
  averageAssistantWordsPerMessage: number;
  messagesPerActiveDay: number;
  activeDays: number;
  longestMessageWords: number;
  longestMessageRole: "user" | "assistant" | null;
  activeConversationMessages: number;
  firstMessageAt: number | null;
  latestMessageAt: number | null;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function wordCount(content: string): number {
  const words = content.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function messageMatchesQuery(message: ChatMessage, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    message.content.toLowerCase().includes(normalized)
    || message.role.toLowerCase().includes(normalized)
    || formatTime(message.createdAt).toLowerCase().includes(normalized)
  );
}

export function renderHighlightedText(text: string, query: string): ReactNode {
  const normalized = query.trim();
  if (!normalized) {
    return text;
  }

  const matcher = new RegExp(`(${escapeRegExp(normalized)})`, "ig");
  const segments = text.split(matcher);

  return segments.map((segment, index) => {
    if (segment.toLowerCase() === normalized.toLowerCase()) {
      return (
        <mark key={`${segment}-${index}`} className="pal-highlight">
          {segment}
        </mark>
      );
    }
    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

export function conversationAsMarkdown(messages: ChatMessage[]): string {
  const lines = [
    "# Pal Conversation",
    "",
    `Exported: ${new Date().toLocaleString()}`,
    "",
  ];

  for (const message of messages) {
    lines.push(`## ${message.role === "user" ? "You" : "Pal"} (${formatTime(message.createdAt)})`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function findLastAssistantReply(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      return message;
    }
  }
  return null;
}

export function findLastUserPrompt(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return message;
    }
  }
  return null;
}

export function buildConversationStats(
  historyMessages: ChatMessage[],
  activeConversationMessages: number,
): ConversationStats {
  const userMessages = historyMessages.filter((message) => message.role === "user");
  const assistantMessages = historyMessages.filter((message) => message.role === "assistant");
  const totalWords = historyMessages.reduce((total, message) => total + wordCount(message.content), 0);
  const totalCharacters = historyMessages.reduce((total, message) => total + message.content.length, 0);
  const averageWordsPerMessage = historyMessages.length > 0
    ? Math.round(totalWords / historyMessages.length)
    : 0;
  const averageCharactersPerMessage = historyMessages.length > 0
    ? Math.round(totalCharacters / historyMessages.length)
    : 0;
  const latestMessageAt = historyMessages.length > 0 ? historyMessages[historyMessages.length - 1].createdAt : null;
  const firstMessageAt = historyMessages.length > 0 ? historyMessages[0].createdAt : null;
  const userWordCount = userMessages.reduce((total, message) => total + wordCount(message.content), 0);
  const assistantWordCount = assistantMessages.reduce((total, message) => total + wordCount(message.content), 0);
  const averageUserWordsPerMessage = userMessages.length > 0 ? Math.round(userWordCount / userMessages.length) : 0;
  const averageAssistantWordsPerMessage = assistantMessages.length > 0
    ? Math.round(assistantWordCount / assistantMessages.length)
    : 0;

  const uniqueDays = new Set(historyMessages.map((message) => new Date(message.createdAt).toDateString()));
  const activeDays = uniqueDays.size;
  const messagesPerActiveDay = activeDays > 0 ? Math.round((historyMessages.length / activeDays) * 10) / 10 : 0;

  let longestMessageWords = 0;
  let longestMessageRole: "user" | "assistant" | null = null;
  for (const message of historyMessages) {
    const count = wordCount(message.content);
    if (count > longestMessageWords) {
      longestMessageWords = count;
      longestMessageRole = message.role;
    }
  }

  return {
    totalMessages: historyMessages.length,
    userMessages: userMessages.length,
    assistantMessages: assistantMessages.length,
    totalWords,
    totalCharacters,
    averageWordsPerMessage,
    averageCharactersPerMessage,
    userWordCount,
    assistantWordCount,
    averageUserWordsPerMessage,
    averageAssistantWordsPerMessage,
    messagesPerActiveDay,
    activeDays,
    longestMessageWords,
    longestMessageRole,
    activeConversationMessages,
    firstMessageAt,
    latestMessageAt,
  };
}
