import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./Titlebar.css";

interface TitlebarProps {
  minimizeToTray?: boolean;
  runtimeMode?: "cloud" | "local";
  onRuntimeModeChange?: (mode: "cloud" | "local") => void;
}

export function Titlebar({
  minimizeToTray = false,
  runtimeMode,
  onRuntimeModeChange,
}: TitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  const appWindow = getCurrentWindow();

  // Check window states
  const checkWindowState = useCallback(async () => {
    try {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch (error) {
      console.error("Failed to check window state:", error);
    }
  }, [appWindow]);

  useEffect(() => {
    checkWindowState();

    // Listen for resize events to update maximize state
    const handleResize = () => {
      checkWindowState();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [checkWindowState]);

  const handleMinimize = useCallback(async () => {
    try {
      if (minimizeToTray) {
        await appWindow.hide();
      } else {
        await appWindow.minimize();
      }
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  }, [appWindow, minimizeToTray]);

  const handleMaximize = useCallback(async () => {
    try {
      await appWindow.toggleMaximize();
      // Small delay to let the window state change
      setTimeout(() => {
        checkWindowState();
      }, 50);
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  }, [appWindow, checkWindowState]);

  const handleClose = useCallback(async () => {
    try {
      if (minimizeToTray) {
        await appWindow.hide();
      } else {
        await appWindow.close();
      }
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  }, [appWindow, minimizeToTray]);

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

  return (
    <header
      className="titlebar"
      onMouseDown={handleDragStart}
      onDoubleClick={handleDoubleClick}
    >
      {runtimeMode && onRuntimeModeChange && (
        <div className="titlebar-left">
          <div className="cloud-toggle" aria-label="Runtime mode">
            <button
              type="button"
              className={`mode-btn ${runtimeMode === "cloud" ? "is-active" : ""}`}
              onClick={() => {
                onRuntimeModeChange("cloud");
              }}
              aria-pressed={runtimeMode === "cloud"}
            >
              Cloud
            </button>
            <button
              type="button"
              className={`mode-btn ${runtimeMode === "local" ? "is-active" : ""}`}
              onClick={() => {
                onRuntimeModeChange("local");
              }}
              aria-pressed={runtimeMode === "local"}
            >
              Local
            </button>
          </div>
        </div>
      )}
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
    </header>
  );
}

export default Titlebar;
