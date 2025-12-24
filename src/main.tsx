import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider 
      attribute="class" 
      defaultTheme="dark" 
      storageKey="whatscode-theme"
      enableSystem={false}
    >
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
