import { useEffect, useState } from "react";
import { getSession, getWebDavSettings } from "./api";
import { MiniPlayer } from "./components/MiniPlayer";
import { MobileNavigation, Sidebar } from "./components/Sidebar";
import { LibraryPage } from "./pages/LibraryPage";
import { NowPlayingPage } from "./pages/NowPlayingPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AppSection, SessionUser, WebDavSettings } from "./types";

const emptySettings: WebDavSettings = {
  configured: false,
  endpoint: "",
  username: "",
  hasPassword: false,
  allowsInsecureHttp: false,
};

export default function App() {
  const [section, setSection] = useState<AppSection>("library");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [settings, setSettings] = useState<WebDavSettings>(emptySettings);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSession(), getWebDavSettings()])
      .then(([session, webDavSettings]) => {
        setUser(session.user);
        setSettings(webDavSettings);
        if (!webDavSettings.configured) setSection("settings");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "EchoVault could not start."));
  }, []);

  if (error) {
    return <div className="fatal-state"><img src="/app-logo.png" alt="EchoVault" /><h1>EchoVault is unavailable</h1><p>{error}</p></div>;
  }
  if (!user) {
    return <div className="splash"><img src="/app-logo.png" alt="EchoVault" /><span>Opening your vault…</span></div>;
  }

  return (
    <div className="app-shell">
      <Sidebar section={section} user={user} onNavigate={setSection} />
      <main className="app-main">
        {section === "library" && <LibraryPage settings={settings} onNavigate={setSection} />}
        {section === "now-playing" && <NowPlayingPage />}
        {section === "playlists" && <PlaylistsPage settings={settings} userId={user.userId} />}
        {section === "settings" && <SettingsPage settings={settings} user={user} onSaved={setSettings} />}
        <MiniPlayer onOpenNowPlaying={() => setSection("now-playing")} />
      </main>
      <MobileNavigation section={section} onNavigate={setSection} />
    </div>
  );
}
