export type AppSection = "library" | "now-playing" | "playlists" | "settings";

export interface SessionUser {
  userId: string;
  username: string;
  roles: string[];
}

export interface WebDavSettings {
  configured: boolean;
  endpoint: string;
  managed: true;
  legacyEndpoints: string[];
}

export interface WebDavItem {
  name: string;
  path: string;
  isDirectory: boolean;
  contentLength: number | null;
  contentType: string | null;
  lastModified: string | null;
  eTag: string | null;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  path: string;
}
