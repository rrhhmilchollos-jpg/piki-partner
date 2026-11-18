import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import PikiSplash from "./PikiSplash";
import { PikiReleaseGate } from "./pikiRelease";
import { installPikiReleaseHeaders } from "./releaseHeaders";
import { installPartnerNativeApiTransport } from "./partnerNativeApiTransport";

installPartnerNativeApiTransport();
installPikiReleaseHeaders();
createRoot(document.getElementById("root")!).render(
  <StrictMode><PikiSplash><PikiReleaseGate><App /></PikiReleaseGate></PikiSplash></StrictMode>,
);
