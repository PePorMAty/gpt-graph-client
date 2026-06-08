import { Routes, Route } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";

import { Flow } from "./Flow";
import { RequestPanel } from "./components/request-panel";
import { SharedGraphView } from "./components/shared-graph-view";

import styles from "./styles/App.module.css";

function FullApp() {
  return (
    <div className={styles.app_container}>
      <div className={styles.flow_container}>
        <div className={styles.flow_border}>
          <ReactFlowProvider>
            <Flow />
          </ReactFlowProvider>
        </div>
      </div>
      <RequestPanel />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<FullApp />} />
      <Route path="/g/:shareId" element={<SharedGraphView />} />
    </Routes>
  );
}

export default App;
