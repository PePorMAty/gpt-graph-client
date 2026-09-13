import { useCallback, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";

import { Flow } from "./Flow";
import { TopBar } from "./components/top-bar/TopBar";
import { LeftRail, type RailSection } from "./components/left-rail/LeftRail";
import { RailPanel } from "./components/rail-panel/RailPanel";
import { StatusBar } from "./components/status-bar/StatusBar";
import { CreateGraphModal } from "./components/create-graph/CreateGraphModal";
import { ShareGraphModal } from "./components/share-graph-modal";
import { LibraryScreen } from "./components/library/LibraryScreen";
import { SharedGraphView } from "./components/shared-graph-view";
import { ToastContainer } from "./components/toast/ToastContainer";

import styles from "./styles/App.module.css";

/** Разделы рельса, у которых есть выезжающая панель поверх холста. */
const PANEL_SECTIONS: RailSection[] = ["sources", "bookmarks", "history"];

function Workspace() {
  const location = useLocation();
  const isGraphScreen = location.pathname === "/";

  const [section, setSection] = useState<RailSection>("graph");
  const [createOpen, setCreateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { fitView } = useReactFlow();

  const handleRailSelect = useCallback((next: RailSection) => {
    if (next === "create") {
      setCreateOpen(true);
      return;
    }
    // Повторный клик по открытому разделу закрывает панель и возвращает
    // обычное представление графа.
    setSection((prev) => (prev === next ? "graph" : next));
  }, []);

  const panelSection = PANEL_SECTIONS.includes(section) ? section : null;

  return (
    <div className={styles.shell}>
      <TopBar onShare={() => setShareOpen(true)} />

      <div className={styles.main}>
        <LeftRail active={createOpen ? "create" : section} onSelect={handleRailSelect} />

        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<Flow />} />
            <Route path="/library" element={<LibraryScreen />} />
          </Routes>

          {isGraphScreen && panelSection && (
            <RailPanel
              section={panelSection}
              onClose={() => setSection("graph")}
            />
          )}
        </div>
      </div>

      {isGraphScreen && <StatusBar />}

      <CreateGraphModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => fitView({ duration: 400, padding: 0.3, maxZoom: 1 })}
      />
      <ShareGraphModal isOpen={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <>
      <Routes>
        {/* Страница шар-ссылки живёт вне каркаса: только полотно. */}
        <Route
          path="/g/:shareId"
          element={
            <ReactFlowProvider>
              <SharedGraphView />
            </ReactFlowProvider>
          }
        />
        <Route
          path="*"
          element={
            <ReactFlowProvider>
              <Workspace />
            </ReactFlowProvider>
          }
        />
      </Routes>
      <ToastContainer />
    </>
  );
}

export default App;
