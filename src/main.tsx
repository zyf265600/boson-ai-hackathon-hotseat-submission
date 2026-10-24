import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Home } from "./ui/Home";
import { HOME, usePath } from "./router";
import { Inspector } from "./inspector/Inspector";
// Styles by screen, in this order: later files win ties, as in the old single index.css.
import "./styles/base.css";
import "./styles/lobby.css";
import "./styles/home.css";
import "./styles/controls.css";
import "./styles/meeting.css";
import "./styles/countdown.css";
import "./styles/ended.css";
import "./styles/report.css";
import "./styles/inspector.css";
import "./styles/script-panel.css";
import "./styles/dialog.css";
import "./styles/prep.css";

// StrictMode is left ON deliberately. In development it mounts every component
// twice, which is exactly the condition that makes careless code open two
// WebSockets. Better to hit that on your own machine than to leave it lurking.
// Test mode opens a second window at ?view=inspector that only watches the interview.
const inspector = new URLSearchParams(location.search).get("view") === "inspector";

/** "/" is the home page; any other path (normally /prep) is the prep room and the call. */
function Root() {
  const path = usePath();
  return path === HOME ? <Home /> : <App />;
}

createRoot(document.getElementById("root")!).render(<StrictMode>{inspector ? <Inspector /> : <Root />}</StrictMode>);
