import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initializeBrowserCompatibility } from "./browser-compat";
import { PlayerProvider } from "./state/PlayerContext";
import "./styles.css";

initializeBrowserCompatibility();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlayerProvider>
      <App />
    </PlayerProvider>
  </StrictMode>,
);
