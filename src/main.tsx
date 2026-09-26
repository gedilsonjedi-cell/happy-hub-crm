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
        defaultTheme="light" 
        storageKey="optimus-theme"
        enableSystem={false}
      >
        <App />
      </ThemeProvider>
    </HelmetProvider>
  </React.StrictMode>
);
