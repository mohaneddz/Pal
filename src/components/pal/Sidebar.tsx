import type { PageId } from "../../types/pal";

interface SidebarProps {
  activePage: PageId;
  navItems: Array<{ id: PageId; label: string; icon: string }>;
  sidebarOpen: boolean;
  setActivePage: (page: PageId) => void;
  voiceUiState: string;
  voiceStatusLabel: string;
}

export function Sidebar({
  activePage,
  navItems,
  sidebarOpen,
  setActivePage,
  voiceUiState,
  voiceStatusLabel,
}: SidebarProps) {
  return (
    <aside className={`pal-rail ${sidebarOpen ? "" : "is-closed"}`}>
      <div className="pal-rail-header">
        <div className="pal-rail-brand">
          <div className="pal-rail-logo">
            <img src="/pal.png" alt="Pal logo" />
          </div>
          <span className="pal-rail-name">Pal</span>
        </div>
      </div>

      <nav className="pal-rail-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pal-rail-item ${activePage === item.id ? "active" : ""}`}
            onClick={() => {
              setActivePage(item.id);
            }}
          >
            <span className="pal-rail-item-icon" aria-hidden="true">{item.icon}</span>
            <span className="pal-rail-item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="pal-rail-footer">
        <div className={`pal-voice-pill is-${voiceUiState}`}>
          {voiceStatusLabel}
        </div>
      </div>
    </aside>
  );
}
