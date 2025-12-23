import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { loadGraphFromFile } from "../../store/slices/gptSlice";
import { clearSelectedGraph } from "../../store/slices/savedGraphSlice";

export function LoadGraphEffect() {
  const dispatch = useAppDispatch();
  const savedGraph = useAppSelector((state) => state.savedGraphs.selectedGraph);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!savedGraph) return;
    if (loadedRef.current) return;

    loadedRef.current = true;

    dispatch(
      loadGraphFromFile({
        nodes: savedGraph.graph.nodes,
        edges: savedGraph.graph.edges,
        leafNodes: savedGraph.state.leaf_nodes,
        hasMore: savedGraph.state.has_more,
        originalPrompt: savedGraph.meta.prompt ?? null,
      })
    );

    // 🔥 КРИТИЧЕСКИ ВАЖНО
    dispatch(clearSelectedGraph());
  }, [savedGraph, dispatch]);

  return null;
}
