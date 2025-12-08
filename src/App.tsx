import { ReactFlowProvider } from "@xyflow/react";

import { Flow } from "./Flow";
import { RequestPanel } from "./components/request-panel";

import styles from "./styles/App.module.css";

function App() {
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

export default App;
