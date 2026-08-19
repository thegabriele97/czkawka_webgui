import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api/client";
import type { FolderEntry } from "./api/types";
import { FolderPanel } from "./components/FolderPanel";
import { PendingBadge } from "./components/PendingBadge";
import { useTheme } from "./hooks/useTheme";
import { BadExtensionsPage } from "./pages/BadExtensionsPage";
import { DuplicatesPage } from "./pages/DuplicatesPage";
import { PendingQueuePage } from "./pages/PendingQueuePage";
import { SimilarImagesPage } from "./pages/SimilarImagesPage";
import { SimilarVideosPage } from "./pages/SimilarVideosPage";

const NAV_ITEMS = [
  { to: "/bad-extensions", label: "Bad Extensions", category: "bad_extensions" },
  { to: "/duplicates", label: "Duplicates", category: "duplicates" },
  { to: "/similar-images", label: "Similar Images", category: "similar_images" },
  { to: "/similar-videos", label: "Similar Videos", category: "similar_videos" },
  { to: "/queue", label: "Pending Queue", category: null },
] as const;

export function App() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Shared across every tool tab (czkawka_gui-style): one folder list, one
  // reference tick per folder, whichever tab you scan next reads from here.
  // Persisted on the backend (not localStorage) so it's the same list
  // regardless of which device/browser has the app open.
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const location = useLocation();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    api
      .getFolders()
      .then(({ folders }) => setFolders(folders.map((f) => ({ path: f.path, isReference: f.is_reference }))))
      .catch(() => undefined)
      .finally(() => setFoldersLoaded(true));
  }, []);

  useEffect(() => {
    // Skip the save that would otherwise fire the moment the initial fetch
    // above resolves - that's just echoing back what the server already
    // has, and doing it unconditionally would race an empty `folders: []`
    // write against that fetch on first mount.
    if (!foldersLoaded) return;
    api.saveFolders(folders.map((f) => ({ path: f.path, is_reference: f.isReference }))).catch(() => undefined);
  }, [folders, foldersLoaded]);

  const refreshCounts = useCallback(() => {
    api.operationCounts().then((r) => setCounts(r.counts)).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCounts();
    const interval = setInterval(refreshCounts, 5000);
    return () => clearInterval(interval);
  }, [refreshCounts]);

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-mark">cz</span>
          <span className="nav-name">
            czkawka<em>duplicate &amp; junk finder</em>
          </span>
        </div>
        <div className="nav-links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {item.label}
              {item.category && <PendingBadge count={counts[item.category]} />}
            </NavLink>
          ))}
        </div>
        <button
          className="theme-toggle"
          onClick={toggle}
          aria-label={theme === "salvage" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "salvage" ? "Daylight (light)" : "Salvage (dark)"}
        >
          {theme === "salvage" ? "☾" : "☀"}
        </button>
      </nav>

      <main className="content">
        {location.pathname !== "/queue" && <FolderPanel folders={folders} onChange={setFolders} />}

        <Routes>
          <Route path="/" element={<BadExtensionsPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/bad-extensions" element={<BadExtensionsPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/duplicates" element={<DuplicatesPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/similar-images" element={<SimilarImagesPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/similar-videos" element={<SimilarVideosPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/queue" element={<PendingQueuePage onApplied={refreshCounts} />} />
        </Routes>
      </main>
    </div>
  );
}
