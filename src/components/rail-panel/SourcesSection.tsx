import { useMemo } from "react";

import { useAppSelector } from "../../store/hooks";
import { sourcesPoolKey } from "../../store/slices/gptSlice";
import { collectGraphSources } from "../../utils/graphSources";
import { GraphSourcesList } from "./GraphSourcesList";

/**
 * Раздел «База данных» → «Источники графа»: все источники, использованные
 * при построении текущего графа. Источники продуктов приходят из пула
 * поиска, источники превращений — из ссылок на самих узлах-преобразованиях;
 * здесь они сведены вложенным списком: объект графа → его источники.
 */
export const SourcesSection = () => {
  const { data, sourcesPool, originalPrompt } = useAppSelector((s) => s.graph);
  const graphName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const title = graphName || originalPrompt || "без названия";

  const summary = useMemo(
    () => collectGraphSources(data.nodes, sourcesPool, sourcesPoolKey),
    [data.nodes, sourcesPool],
  );

  return <GraphSourcesList summary={summary} graphTitle={title} collapsible />;
};
