import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";

import { Flow } from "./Flow";
import { RequestPanel } from "./components/request-panel";
import { SharedGraphView } from "./components/shared-graph-view";
import { ToastContainer } from "./components/toast/ToastContainer";

import styles from "./styles/App.module.css";

function FullApp() {
  // Режим просмотра на главной: холст разворачивается на весь экран,
  // нижняя панель скрывается. Управляется кнопкой-глазом внутри Flow.
  const [viewMode, setViewMode] = useState(false);

  return (
    <div
      className={`${styles.app_container} ${
        viewMode ? styles.fullscreen : ""
      }`}
    >
      <div className={styles.flow_container}>
        <div className={styles.flow_border}>
          <ReactFlowProvider>
            <Flow
              viewMode={viewMode}
              onToggleViewMode={() => setViewMode((v) => !v)}
            />
          </ReactFlowProvider>
        </div>
      </div>
      {!viewMode && <RequestPanel />}
    </div>
  );
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<FullApp />} />
        <Route path="/g/:shareId" element={<SharedGraphView />} />
      </Routes>
      <ToastContainer />
    </>
  );
}

export default App;
