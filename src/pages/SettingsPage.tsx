import { useState } from "react";
import { CheckCircle2, LockKeyhole, TriangleAlert } from "lucide-react";
import { usePlayer } from "../state/PlayerContext";
import type { SessionUser, WebDavSettings } from "../types";

interface SettingsPageProps {
  settings: WebDavSettings;
  user: SessionUser;
}

export function SettingsPage({ settings, user }: SettingsPageProps) {
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
              <div className={settings.configured ? "managed-connection" : "managed-connection unavailable"}>
                {settings.configured ? <LockKeyhole size={22} /> : <TriangleAlert size={22} />}
                <span>
                  <strong>{settings.configured ? "Shared music access is ready" : "Music access is not configured"}</strong>
                  <small>{settings.endpoint}</small>
                  <small>WebDAV credentials are encrypted on the server and never sent to this browser.</small>
                </span>
              </div>
            </div>
          )}
          {tab === "about" && (
            <div className="about-panel">
              <img src="/app-logo.png" alt="EchoVault" />
              <h2>EchoVault</h2>
              <p>Version 1.0.0</p>
              <span><CheckCircle2 size={17} /> Private WebDAV playback enabled</span>
              <small>Track metadata by MusicBrainz. Artwork by Cover Art Archive.</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
