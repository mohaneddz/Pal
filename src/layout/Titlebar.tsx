import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./Titlebar.css";

interface TitlebarProps {
  minimizeToTray?: boolean;
  autoFreeRam?: boolean;
}

export function Titlebar({
  minimizeToTray = false,
  autoFreeRam = false,
}: TitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const appWindow = getCurrentWindow();

  const syncWindowState = useCallback(async () => {
    try {
      const [maximized, fullscreen] = await Promise.all([
        appWindow.isMaximized(),
        appWindow.isFullscreen(),
      ]);
      setIsMaximized(maximized);
      setIsFullscreen(fullscreen);
    } catch (error) {
      console.error("Failed to check window state:", error);
    }
  }, [appWindow]);

  useEffect(() => {
    void syncWindowState();

    // Listen for resize events to update maximize state
    const handleResize = () => {
      void syncWindowState();
    };

    window.addEventListener("resize", handleResize);

    let unlisten: (() => void) | null = null;
    void appWindow.onResized(() => {
      void syncWindowState();
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {
      // Ignore listener setup failures outside Tauri.
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      if (unlisten) {
        unlisten();
      }
    };
  }, [appWindow, syncWindowState]);

  useEffect(() => {
    const root = document.documentElement;
    if (isFullscreen) {
      root.classList.add("pal-window-fullscreen");
    } else {
      root.classList.remove("pal-window-fullscreen");
    }

    return () => {
      root.classList.remove("pal-window-fullscreen");
    };
  }, [isFullscreen]);

  const handleMinimize = useCallback(async () => {
    try {
      if (minimizeToTray) {
        if (autoFreeRam) {
          await appWindow.close();
        } else {
          await appWindow.hide();
        }
      } else {
        await appWindow.minimize();
      }
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  }, [appWindow, autoFreeRam, minimizeToTray]);

  const handleMaximize = useCallback(async () => {
    try {
      await appWindow.toggleMaximize();
      // Small delay to let the window state change
      setTimeout(() => {
        void syncWindowState();
      }, 50);
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  }, [appWindow, syncWindowState]);

  const handleClose = useCallback(async () => {
    try {
      if (minimizeToTray) {
        if (autoFreeRam) {
          await appWindow.close();
        } else {
          await appWindow.hide();
        }
      } else {
        await appWindow.close();
      }
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  }, [appWindow, autoFreeRam, minimizeToTray]);

  const handleFullscreenToggle = useCallback(async () => {
    try {
      const fullscreen = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!fullscreen);
      // Keep control state in sync after mode changes.
      setTimeout(() => {
        void syncWindowState();
      }, 50);
      return;
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }

    // Fallback 1: maximize/restore when fullscreen APIs are unavailable.
    try {
      await appWindow.toggleMaximize();
      setTimeout(() => {
        void syncWindowState();
      }, 50);
      return;
    } catch (error) {
      console.error("Failed to toggle maximize fallback:", error);
    }

    // Fallback 2: browser fullscreen (dev/browser context).
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, [appWindow, syncWindowState]);

  const handleDragStart = useCallback(
    async (e: React.MouseEvent) => {
      // Only start drag on left mouse button and not on buttons
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest(".titlebar-controls") || target.closest("button")) return;

      try {
        await appWindow.startDragging();
      } catch (error) {
        console.error("Failed to start dragging:", error);
      }
    },
    [appWindow]
  );

  const handleDoubleClick = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".titlebar-controls") || target.closest("button")) return;

      await handleMaximize();
    },
    [handleMaximize]
  );

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "f11") {
        event.preventDefault();
        void handleFullscreenToggle();
      }
    };

    // Capture phase improves reliability for keys that browsers/OS may handle.
    window.addEventListener("keydown", handleKeydown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeydown, { capture: true });
    };
  }, [handleFullscreenToggle]);

  return (
    <header
      className={`titlebar ${isFullscreen ? "is-fullscreen" : ""}`}
      onMouseDown={handleDragStart}
      onDoubleClick={handleDoubleClick}
    >
      {!isFullscreen && (
        <div className="titlebar-controls">
          <button
            type="button"
            className="titlebar-btn titlebar-btn-minimize"
            onClick={handleMinimize}
            aria-label={minimizeToTray ? "Minimize to tray" : "Minimize"}
            title={minimizeToTray ? "Minimize to tray" : "Minimize"}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          <button
            type="button"
            className="titlebar-btn titlebar-btn-maximize"
            onClick={handleMaximize}
            aria-label={isMaximized ? "Restore" : "Maximize"}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 8V4h4M1 10V6h4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <rect
                  x="5"
                  y="2"
                  width="5"
                  height="5"
                  rx="0.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
                <rect
                  x="2"
                  y="5"
                  width="5"
                  height="5"
                  rx="0.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect
                  x="2"
                  y="2"
                  width="8"
                  height="8"
                  rx="0.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="titlebar-btn titlebar-btn-close"
            onClick={handleClose}
            aria-label={minimizeToTray ? "Close to tray" : "Close"}
            title={minimizeToTray ? "Close to tray" : "Close"}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}

export default Titlebar;
