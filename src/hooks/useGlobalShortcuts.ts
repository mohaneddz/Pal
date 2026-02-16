import { type MutableRefObject, useEffect } from "react";

import type { PageId } from "../types/pal";

interface UseGlobalShortcutsParams {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  heroOnlyMode: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  isProcessing: boolean;
  isSpeaking: boolean;
  voiceEnabled: boolean;
  canSendDraft: boolean;
  sendDraft: () => Promise<void>;
  stopSpeaking: () => void;
  toggleListening: () => Promise<void>;
  handleStartNewConversation: () => void;
  handleClearConversation: () => void;
  handleReuseLastPrompt: () => void;
  handleCopyLastReply: () => Promise<void>;
  handleExportTranscript: () => void;
  openAttachmentPicker: () => void;
  setComposerNotice: (message: string | null) => void;
  setChatMenuOpen: (open: boolean) => void;
  setModeMenuOpen: (open: boolean) => void;
  composerInputRef: MutableRefObject<HTMLInputElement | null>;
  searchInputRef: MutableRefObject<HTMLInputElement | null>;
}

const PAGE_ORDER: PageId[] = ["home", "history", "stats", "settings", "about"];

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function useGlobalShortcuts({
  activePage,
  setActivePage,
  heroOnlyMode,
  sidebarOpen,
  setSidebarOpen,
  chatPanelOpen,
  setChatPanelOpen,
  isProcessing,
  isSpeaking,
  voiceEnabled,
  canSendDraft,
  sendDraft,
  stopSpeaking,
  toggleListening,
  handleStartNewConversation,
  handleClearConversation,
  handleReuseLastPrompt,
  handleCopyLastReply,
  handleExportTranscript,
  openAttachmentPicker,
  setComposerNotice,
  setChatMenuOpen,
  setModeMenuOpen,
  composerInputRef,
  searchInputRef,
}: UseGlobalShortcutsParams) {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      const alt = event.altKey;
      const shift = event.shiftKey;
      const editable = isEditableElement(event.target);

      if (event.key === "Escape") {
        setChatMenuOpen(false);
        setModeMenuOpen(false);
      }

      if (alt && !mod) {
        if (key === "1") {
          event.preventDefault();
          setActivePage("home");
          return;
        }
        if (!heroOnlyMode && key === "2") {
          event.preventDefault();
          setActivePage("history");
          return;
        }
        if (!heroOnlyMode && key === "3") {
          event.preventDefault();
          setActivePage("stats");
          return;
        }
        if (!heroOnlyMode && key === "4") {
          event.preventDefault();
          setActivePage("settings");
          return;
        }
        if (!heroOnlyMode && key === "5") {
          event.preventDefault();
          setActivePage("about");
          return;
        }
      }

      if (!mod) {
        return;
      }

      if (key === "1") {
        event.preventDefault();
        setActivePage("home");
        return;
      }
      if (!heroOnlyMode && key === "2") {
        event.preventDefault();
        setActivePage("history");
        return;
      }
      if (!heroOnlyMode && key === "3") {
        event.preventDefault();
        setActivePage("stats");
        return;
      }
      if (!heroOnlyMode && key === "4") {
        event.preventDefault();
        setActivePage("settings");
        return;
      }
      if (!heroOnlyMode && key === "5") {
        event.preventDefault();
        setActivePage("about");
        return;
      }

      if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        const pages = heroOnlyMode ? ["home"] as PageId[] : PAGE_ORDER;
        const currentIndex = pages.indexOf(activePage);
        const nextIndex = key === "arrowleft"
          ? (currentIndex - 1 + pages.length) % pages.length
          : (currentIndex + 1) % pages.length;
        setActivePage(pages[nextIndex]);
        return;
      }

      if (key === "/") {
        event.preventDefault();
        composerInputRef.current?.focus();
        return;
      }

      if (!shift && key === "b" && !heroOnlyMode) {
        event.preventDefault();
        setSidebarOpen(!sidebarOpen);
        return;
      }

      if (shift && key === "j" && !heroOnlyMode) {
        event.preventDefault();
        setChatPanelOpen(!chatPanelOpen);
        return;
      }

      if (shift && key === "v") {
        event.preventDefault();
        if (!isProcessing && !voiceEnabled) {
          void toggleListening();
          setComposerNotice("Voice chat started.");
        }
        return;
      }

      if (shift && key === "x") {
        event.preventDefault();
        if (voiceEnabled) {
          void toggleListening();
          setComposerNotice("Voice chat stopped.");
        }
        return;
      }

      if (editable && key !== "enter") {
        return;
      }

      if (key === "enter") {
        if (!shift && canSendDraft && !isSpeaking) {
          event.preventDefault();
          void sendDraft();
        }
        return;
      }

      if (key === ".") {
        event.preventDefault();
        if (isSpeaking) {
          stopSpeaking();
          setComposerNotice("Stopped speaking.");
        }
        return;
      }

      if (!shift && key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (shift && key === "n" && !heroOnlyMode) {
        event.preventDefault();
        handleStartNewConversation();
        return;
      }

      if (shift && key === "backspace" && !heroOnlyMode) {
        event.preventDefault();
        handleClearConversation();
        return;
      }

      if (shift && key === "r" && !heroOnlyMode) {
        event.preventDefault();
        handleReuseLastPrompt();
        return;
      }

      if (shift && key === "a" && !heroOnlyMode) {
        event.preventDefault();
        openAttachmentPicker();
        return;
      }

      if (shift && key === "c" && !heroOnlyMode) {
        event.preventDefault();
        void handleCopyLastReply();
        return;
      }

      if (shift && key === "e" && !heroOnlyMode) {
        event.preventDefault();
        handleExportTranscript();
        return;
      }

      if (shift && key === "?") {
        event.preventDefault();
        setComposerNotice("Shortcuts: Alt+1..5 pages, Ctrl/Cmd+B sidebar, Ctrl/Cmd+Shift+J chat panel, Ctrl/Cmd+/ composer, Ctrl/Cmd+Enter send, Ctrl/Cmd+K search, Ctrl/Cmd+Shift+V start voice, Ctrl/Cmd+Shift+X stop voice, Ctrl/Cmd+Shift+N new chat, Ctrl/Cmd+Shift+R reuse, Ctrl/Cmd+Shift+A attach, Ctrl/Cmd+Shift+C copy last, Ctrl/Cmd+Shift+E export, Ctrl/Cmd+Shift+M minimize/tray, Ctrl/Cmd+. stop speech, desktop-global Ctrl/Cmd+Shift+B focus Pal.");
      }
    };

    window.addEventListener("keydown", handleKeydown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeydown, { capture: true });
    };
  }, [
    activePage,
    canSendDraft,
    composerInputRef,
    handleClearConversation,
    handleCopyLastReply,
    handleExportTranscript,
    handleStartNewConversation,
    handleReuseLastPrompt,
    heroOnlyMode,
    isProcessing,
    isSpeaking,
    voiceEnabled,
    openAttachmentPicker,
    searchInputRef,
    sendDraft,
    setActivePage,
    setChatMenuOpen,
    setChatPanelOpen,
    setComposerNotice,
    setModeMenuOpen,
    setSidebarOpen,
    sidebarOpen,
    chatPanelOpen,
    stopSpeaking,
    toggleListening,
  ]);
}
