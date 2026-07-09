import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api/client";
import type { FolderEntry } from "./api/types";
import { FolderPanel } from "./components/FolderPanel";
import { PendingBadge } from "./components/PendingBadge";
import { BadExtensionsPage } from "./pages/BadExtensionsPage";
import { DuplicatesPage } from "./pages/DuplicatesPage";
import { PendingQueuePage } from "./pages/PendingQueuePage";
import { SimilarImagesPage } from "./pages/SimilarImagesPage";
import { SimilarVideosPage } from "./pages/SimilarVideosPage";

const NAV_ITEMS = [
  { to: "/bad-extensions", label: "Bad Extensions", category: null },
  { to: "/duplicates", label: "Duplicates", category: "duplicates" },
  { to: "/similar-images", label: "Similar Images", category: "similar_images" },
  { to: "/similar-videos", label: "Similar Videos", category: "similar_videos" },
  { to: "/queue", label: "Pending Queue", category: null },
] as const;

const FOLDERS_STORAGE_KEY = "czkawka-webgui:folders";

function loadStoredFolders(): FolderEntry[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FolderEntry[]) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Shared across every tool tab (czkawka_gui-style): one folder list, one
  // reference tick per folder, whichever tab you scan next reads from here.
  // Persisted to localStorage so it survives a reload/reopen the same way
  // the (backend-side) pending operations queue already does.
  const [folders, setFolders] = useState<FolderEntry[]>(loadStoredFolders);
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

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
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {item.label}
            {item.category && <PendingBadge count={counts[item.category]} />}
          </NavLink>
        ))}
      </nav>

      <main className="content">
        {location.pathname !== "/queue" && <FolderPanel folders={folders} onChange={setFolders} />}

        <Routes>
          <Route path="/" element={<BadExtensionsPage folders={folders} />} />
          <Route path="/bad-extensions" element={<BadExtensionsPage folders={folders} />} />
          <Route path="/duplicates" element={<DuplicatesPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/similar-images" element={<SimilarImagesPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/similar-videos" element={<SimilarVideosPage folders={folders} onOperationsQueued={refreshCounts} />} />
          <Route path="/queue" element={<PendingQueuePage onApplied={refreshCounts} />} />
        </Routes>
      </main>
    </div>
  );
}
