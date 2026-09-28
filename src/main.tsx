import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Tema escuro é o padrão: valores ausentes/inválidos (ex.: "system") viram escuro.
try {
  const saved = localStorage.getItem("optimus-theme");
  if (saved !== "light" && saved !== "dark") localStorage.removeItem("optimus-theme");
} catch { /* armazenamento indisponível */ }

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <ThemeProvider 
        attribute="class" 
        defaultTheme="dark" 
        storageKey="optimus-theme"
        enableSystem={false}
        enableColorScheme
        disableTransitionOnChange
      >
        <App />
      </ThemeProvider>
    </HelmetProvider>
  </React.StrictMode>
);
