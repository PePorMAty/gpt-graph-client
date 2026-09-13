import { useCallback, useEffect, useState } from "react";
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

  // Карточка узла выезжает на то же место слева, что и панель раздела —
  // открывшаяся карточка её закрывает, иначе они наложились бы друг на друга.
  useEffect(() => {
    const onCardOpened = () => setSection("graph");
    window.addEventListener("node-card-opened", onCardOpened);
    return () => window.removeEventListener("node-card-opened", onCardOpened);
  }, []);

  const panelSection = PANEL_SECTIONS.includes(section) ? section : null;
  const panelOpen = isGraphScreen && panelSection !== null;

  return (
    <div className={styles.shell}>
      <TopBar onShare={() => setShareOpen(true)} />

      <div className={styles.main}>
        <LeftRail active={createOpen ? "create" : section} onSelect={handleRailSelect} />

        {/* --panel-offset: ширина открытой панели. Панель над холстом
            сдвигается на неё вправо, чтобы её кнопки не оказались под
            панелью раздела. */}
        <div
          className={styles.content}
          style={
            panelOpen
              ? ({ "--panel-offset": "var(--w-panel)" } as React.CSSProperties)
              : undefined
          }
        >
          {/* Полотно смонтировано всегда, «Библиотека» ложится поверх него.
              Через роутер оно размонтировалось бы при каждом переходе, а на
              обратном монтировании Flow поднимает граф из автосейва — из-за
              этого только что открытый сохранённый граф подменялся прежним,
              а камера улетала в другое место. */}
          <Flow />

          {panelOpen && panelSection && (
            <RailPanel
              section={panelSection}
              onClose={() => setSection("graph")}
            />
          )}

          {!isGraphScreen && (
            <div className={styles.screenOverlay}>
              <LibraryScreen />
            </div>
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
