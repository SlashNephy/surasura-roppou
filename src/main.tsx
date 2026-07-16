import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { DisplayPreferencesProvider } from "./app/display-preferences";
import { router } from "./app/router";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <DisplayPreferencesProvider>
      <RouterProvider router={router} />
    </DisplayPreferencesProvider>
  </StrictMode>,
);
