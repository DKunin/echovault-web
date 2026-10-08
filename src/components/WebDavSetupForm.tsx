import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Server } from "lucide-react";
import { saveWebDavSettings } from "../api";
import type { WebDavSettings } from "../types";

interface WebDavSetupFormProps {
  settings: WebDavSettings;
  onSaved: (settings: WebDavSettings) => void;
  compact?: boolean;
}

export function WebDavSetupForm({ settings, onSaved, compact = false }: WebDavSetupFormProps) {
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [username, setUsername] = useState(settings.username);
  const [password, setPassword] = useState("");
  const [allowsInsecureHttp, setAllowsInsecureHttp] = useState(settings.allowsInsecureHttp);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "success" | "error"; message?: string }>({ kind: "idle" });

  useEffect(() => {
    setEndpoint(settings.endpoint);
    setUsername(settings.username);
    setAllowsInsecureHttp(settings.allowsInsecureHttp);
  }, [settings]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus({ kind: "saving" });
    try {
      const saved = await saveWebDavSettings({ endpoint, username, password, allowsInsecureHttp });
      setPassword("");
      setStatus({ kind: "success", message: "Connected. Your music is ready to browse." });
      onSaved(saved);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Connection failed." });
    }
  }

  return (
    <form className={compact ? "webdav-form compact" : "webdav-form"} onSubmit={submit}>
      {!compact && (
        <div className="setup-heading">
          <span><Server /></span>
          <div>
            <h2>{settings.configured ? "WebDAV Connection" : "Connect your music"}</h2>
            <p>EchoVault streams audio through a private server-side connection.</p>
          </div>
        </div>
      )}
      <label>
        <span>Server address</span>
        <input
          required
          type="url"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="https://server.example/music/"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>
      <div className="field-pair">
        <label>
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" autoCorrect="off" />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={settings.hasPassword ? "Leave blank to keep saved password" : "Password"}
            autoComplete="new-password"
          />
        </label>
      </div>
      <label className="switch-row">
        <span>
          <strong>Allow insecure HTTP</strong>
          <small>Credentials and music are not encrypted in transit.</small>
        </span>
        <input type="checkbox" checked={allowsInsecureHttp} onChange={(event) => setAllowsInsecureHttp(event.target.checked)} />
      </label>
      {allowsInsecureHttp && (
        <p className="inline-warning"><AlertTriangle size={16} /> Use this only on a network you trust.</p>
      )}
      {status.kind !== "idle" && (
        <p className={`form-status ${status.kind}`} role="status">
          {status.kind === "saving" && <LoaderCircle className="spin" size={17} />}
          {status.kind === "success" && <CheckCircle2 size={17} />}
          {status.kind === "error" && <AlertTriangle size={17} />}
          {status.kind === "saving" ? "Testing connection…" : status.message}
        </p>
      )}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Connecting…" : "Connect & Browse"}
        </button>
      </div>
    </form>
  );
}
