import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { WebDavSetupForm } from "../components/WebDavSetupForm";
import { usePlayer } from "../state/PlayerContext";
import type { SessionUser, WebDavSettings } from "../types";

interface SettingsPageProps {
  settings: WebDavSettings;
  user: SessionUser;
  onSaved: (settings: WebDavSettings) => void;
}

export function SettingsPage({ settings, user, onSaved }: SettingsPageProps) {
  const player = usePlayer();
  const [tab, setTab] = useState<"general" | "webdav" | "about">(settings.configured ? "general" : "webdav");
  return (
    <section className="page settings-page">
      <header className="page-header"><h1>Settings</h1></header>
      <div className="settings-content">
        <div className="segmented-control settings-tabs" aria-label="Settings section">
          {(["general", "webdav", "about"] as const).map((value) => (
            <button key={value} className={tab === value ? "active" : ""} type="button" onClick={() => setTab(value)}>
              {value === "webdav" ? "WebDAV" : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-panel">
          {tab === "general" && (
            <div className="settings-section-stack">
              <h2>Playback</h2>
              <div className="settings-group">
                <button className="setting-row" type="button" onClick={player.toggleShuffle}>
                  <span>Shuffle</span><span className={player.shuffle ? "toggle on" : "toggle"} />
                </button>
                <button className="setting-row" type="button" onClick={player.cycleRepeat}>
                  <span>Repeat</span><strong>{player.repeat === "off" ? "Off" : player.repeat === "all" ? "All" : "One"}</strong>
                </button>
              </div>
              <h2>Session</h2>
              <div className="settings-group">
                <div className="setting-row"><span>Signed in as</span><strong>{user.username}</strong></div>
                <div className="setting-row"><span>Queue</span><strong>{player.queue.length} tracks</strong></div>
              </div>
            </div>
          )}
          {tab === "webdav" && (
            <div className="settings-section-stack">
              <h2>Connection</h2>
              {settings.configured && (
                <div className="connection-status"><CheckCircle2 size={18} /><span><strong>Connected</strong>{settings.endpoint}</span></div>
              )}
              <WebDavSetupForm settings={settings} onSaved={onSaved} compact />
            </div>
          )}
          {tab === "about" && (
            <div className="about-panel">
              <img src="/app-logo.png" alt="EchoVault" />
              <h2>EchoVault</h2>
              <p>Version 1.0.0</p>
              <span><CheckCircle2 size={17} /> Private WebDAV playback enabled</span>
              <small>A web music library and WebDAV player.</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
