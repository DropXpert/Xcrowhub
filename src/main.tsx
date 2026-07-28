import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { captureRefFromUrl } from "./lib/referral";
import { installInputFocusNavGuard } from "./lib/inputFocusNav";
import "./index.css";

installInputFocusNavGuard();

// Persist a ?ref=CODE before anything else reads/strips the URL.
captureRefFromUrl();

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
