import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import axios from "axios";

import { Flow } from "../../Flow";
import { useAppDispatch } from "../../store/hooks";
import { loadGraphFromFile } from "../../store/slices/gptSlice";
import { loadSharedGraph } from "../../store/api/share-api";
import { StatusBar } from "../status-bar/StatusBar";
import styles from "./SharedGraphView.module.css";

type Status = "loading" | "ready" | "notfound" | "error";

/**
 * Страница просмотра графа по шар-ссылке (`/g/:shareId`).
 * Грузит снапшот с сервера и кладёт его на холст. Без шапки, рельса и
 * кнопок редактирования: над полотном — переключатели представления
 * («Только продукты», «Промышленные данные», «Альтернативы»), под ним —
 * строка счётчиков и масштаба.
 */
export const SharedGraphView = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<Status>("loading");
  // Guard от двойной загрузки в StrictMode (React 19).
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!shareId) {
      setStatus("notfound");
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;

    loadSharedGraph(shareId)
      .then((file) => {
        dispatch(
          loadGraphFromFile({
            nodes: file.graph.nodes,
            edges: file.graph.edges,
            leafNodes: file.state.leaf_nodes,
            hasMore: file.state.has_more,
            originalPrompt: file.meta.prompt ?? null,
            sourcesPool: file.state.sources?.pool,
            sourcesSeqCounter: file.state.sources?.seqCounter,
          }),
        );
        setStatus("ready");
      })
      .catch((e) => {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setStatus("notfound");
        } else {
          setStatus("error");
        }
      });
  }, [shareId, dispatch]);

  if (status === "loading") {
    return <div className={styles.message}>Загрузка графа…</div>;
  }
  if (status === "notfound") {
    return <div className={styles.message}>Граф не найден</div>;
  }
  if (status === "error") {
    return <div className={styles.message}>Не удалось загрузить граф</div>;
  }

  // Строка состояния — в одном ReactFlowProvider с полотном: счётчики берут
  // из него камеру и нарисованные узлы.
  return (
    <div className={styles.fullscreen}>
      <ReactFlowProvider>
        <div className={styles.canvas}>
          <Flow sharedView />
        </div>
        <StatusBar readOnly />
      </ReactFlowProvider>
    </div>
  );
};
