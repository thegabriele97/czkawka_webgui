import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { DataRootProvider } from "./api/DataRootContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DataRootProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </DataRootProvider>
    </BrowserRouter>
  </StrictMode>,
);
