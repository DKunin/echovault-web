import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { getSession, getWebDavSettings } from "./api";
import { MiniPlayer } from "./components/MiniPlayer";
import { MobileNavigation, Sidebar } from "./components/Sidebar";
import { defaultUiState, loadUiState, saveUiState } from "./local-state";
import type { LibraryMode } from "./music-library";
import { LibraryPage } from "./pages/LibraryPage";
import { NowPlayingPage } from "./pages/NowPlayingPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PlayerProvider } from "./state/PlayerContext";
import type { AppSection, SessionUser, WebDavSettings } from "./types";

const emptySettings: WebDavSettings = {
  configured: false,
  endpoint: "",
  managed: true,
  legacyEndpoints: [],
};

export default function App() {
  const [uiState, setUiState] = useState(defaultUiState);
  const [uiStateReady, setUiStateReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [settings, setSettings] = useState<WebDavSettings>(emptySettings);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSession(), getWebDavSettings()])
      .then(([session, webDavSettings]) => {
        const restored = loadUiState(session.user.userId);
        setUser(session.user);
        setSettings(webDavSettings);
        setUiState({
          ...restored,
          section: webDavSettings.configured ? restored.section : "settings",
        });
        setUiStateReady(true);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "EchoVault could not start."));
  }, []);

  useEffect(() => {
    if (user && uiStateReady) saveUiState(user.userId, uiState);
  }, [uiState, uiStateReady, user]);

  const setSection = useCallback((section: AppSection) => {
    setUiState((current) => ({ ...current, section }));
  }, []);
  const setLibraryPath: Dispatch<SetStateAction<string>> = useCallback((value) => {
    setUiState((current) => ({
      ...current,
      libraryPath: typeof value === "function" ? value(current.libraryPath) : value,
    }));
  }, []);
  const setLibraryMode: Dispatch<SetStateAction<LibraryMode>> = useCallback((value) => {
    setUiState((current) => ({
      ...current,
      libraryMode: typeof value === "function" ? value(current.libraryMode) : value,
    }));
  }, []);
  const setSelectedPlaylistId: Dispatch<SetStateAction<string | null>> = useCallback((value) => {
    setUiState((current) => ({
      ...current,
      selectedPlaylistId: typeof value === "function" ? value(current.selectedPlaylistId) : value,
    }));
  }, []);

  if (error) {
    return <div className="fatal-state"><img src="/app-logo.png" alt="EchoVault" /><h1>EchoVault is unavailable</h1><p>{error}</p></div>;
  }
  if (!user || !uiStateReady) {
    return <div className="splash"><img src="/app-logo.png" alt="EchoVault" /><span>Opening your vault…</span></div>;
  }

  return (
    <PlayerProvider key={user.userId} userId={user.userId}>
      <div className="app-shell">
        <Sidebar section={uiState.section} user={user} onNavigate={setSection} />
        <main className="app-main">
          {uiState.section === "library" && (
            <LibraryPage
              settings={settings}
              path={uiState.libraryPath}
              setPath={setLibraryPath}
              mode={uiState.libraryMode}
              setMode={setLibraryMode}
              onNavigate={setSection}
            />
          )}
          {uiState.section === "now-playing" && <NowPlayingPage />}
          {uiState.section === "playlists" && (
            <PlaylistsPage
              settings={settings}
              userId={user.userId}
              selectedID={uiState.selectedPlaylistId}
              setSelectedID={setSelectedPlaylistId}
            />
          )}
          {uiState.section === "settings" && <SettingsPage settings={settings} user={user} />}
          <MiniPlayer onOpenNowPlaying={() => setSection("now-playing")} />
        </main>
        <MobileNavigation section={uiState.section} onNavigate={setSection} />
      </div>
    </PlayerProvider>
  );
}
