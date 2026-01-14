// components/graph-search/SearchToggle.tsx
import { useState } from "react";

import { SearchGraphPanel } from "./SearchGraphPanel";
import styles from "./SearchGraphPanel.module.css";

export function SearchToggle() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        🔍
      </button>

      {open && <SearchGraphPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
