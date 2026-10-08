import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PlayerProvider } from "./state/PlayerContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlayerProvider>
      <App />
    </PlayerProvider>
  </StrictMode>,
);
