import {
  FolderHeart,
  LibraryBig,
  ListMusic,
  Settings,
  SquarePlay,
} from "lucide-react";
import type { AppSection, SessionUser } from "../types";

const navigation: Array<{ section: AppSection; label: string; icon: typeof LibraryBig }> = [
  { section: "library", label: "Library", icon: LibraryBig },
  { section: "now-playing", label: "Now Playing", icon: SquarePlay },
  { section: "playlists", label: "Playlists", icon: FolderHeart },
  { section: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  section: AppSection;
  user: SessionUser;
  onNavigate: (section: AppSection) => void;
}

export function Sidebar({ section, user, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="app-switcher" aria-label="EchoVault web app">
          <ListMusic size={18} strokeWidth={2.3} />
        </div>
        <img className="sidebar-logo" src="/app-logo.png" alt="" />
      </div>
      <nav className="primary-nav" aria-label="Primary navigation">
        {navigation.map(({ section: value, label, icon: Icon }) => (
          <button
            className={section === value ? "nav-item active" : "nav-item"}
            key={value}
            type="button"
            aria-current={section === value ? "page" : undefined}
            onClick={() => onNavigate(value)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-brand">
        <img src="/app-logo.png" alt="" />
        <div>
          <strong>EchoVault</strong>
          <span>{user.username}</span>
        </div>
      </div>
    </aside>
  );
}

export function MobileNavigation({ section, onNavigate }: Omit<SidebarProps, "user">) {
  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {navigation.map(({ section: value, label, icon: Icon }) => (
        <button
          key={value}
          className={section === value ? "active" : ""}
          type="button"
          aria-label={label}
          aria-current={section === value ? "page" : undefined}
          onClick={() => onNavigate(value)}
        >
          <Icon size={20} />
          <span>{label === "Now Playing" ? "Playing" : label}</span>
        </button>
      ))}
    </nav>
  );
}
