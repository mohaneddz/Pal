import { type MutableRefObject, useEffect } from "react";

import type { AssistantStatus, ChatMessage } from "../types/pal";

interface UseChatPanelInteractionsParams {
  hasSearch: boolean;
  messages: ChatMessage[];
  status: AssistantStatus;
  errorMessage: string | null;
  chatMenuOpen: boolean;
  setChatMenuOpen: (open: boolean) => void;
  chatMenuRef: MutableRefObject<HTMLDivElement | null>;
  chatMenuToggleRef: MutableRefObject<HTMLButtonElement | null>;
  modeMenuOpen: boolean;
  setModeMenuOpen: (open: boolean) => void;
  modeMenuRef: MutableRefObject<HTMLDivElement | null>;
  modeMenuToggleRef: MutableRefObject<HTMLButtonElement | null>;
  chatScrollRef: MutableRefObject<HTMLDivElement | null>;
  searchInputRef: MutableRefObject<HTMLInputElement | null>;
}

export function useChatPanelInteractions({
  hasSearch,
  messages,
  status,
  errorMessage,
  chatMenuOpen,
  setChatMenuOpen,
  chatMenuRef,
  chatMenuToggleRef,
  modeMenuOpen,
  setModeMenuOpen,
  modeMenuRef,
  modeMenuToggleRef,
  chatScrollRef,
  searchInputRef,
}: UseChatPanelInteractionsParams) {
  useEffect(() => {
    if (hasSearch) {
      return;
    }
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [chatScrollRef, errorMessage, hasSearch, messages, status]);

  useEffect(() => {
    if (!chatMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const menu = chatMenuRef.current;
      const toggle = chatMenuToggleRef.current;
      const clickedInsideMenu = Boolean(menu?.contains(target));
      const clickedToggle = Boolean(toggle?.contains(target));

      if (!clickedInsideMenu && !clickedToggle) {
        setChatMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [chatMenuOpen, chatMenuRef, chatMenuToggleRef, setChatMenuOpen]);

  useEffect(() => {
    if (!modeMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const menu = modeMenuRef.current;
      const toggle = modeMenuToggleRef.current;
      const clickedInsideMenu = Boolean(menu?.contains(target));
      const clickedToggle = Boolean(toggle?.contains(target));

      if (!clickedInsideMenu && !clickedToggle) {
        setModeMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [modeMenuOpen, modeMenuRef, modeMenuToggleRef, setModeMenuOpen]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setChatMenuOpen(false);
        setModeMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [searchInputRef, setChatMenuOpen, setModeMenuOpen]);
}
