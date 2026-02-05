// Polyfill for 'global' required by opus-media-recorder and other Node.js libraries
if (typeof window !== 'undefined' && typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <ThemeProvider 
        attribute="class" 
        defaultTheme="dark" 
        storageKey="whatscode-theme"
        enableSystem={false}
      >
        <App />
      </ThemeProvider>
    </HelmetProvider>
  </React.StrictMode>
);
