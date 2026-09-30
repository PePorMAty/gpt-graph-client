import { useEffect, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import {
  fetchBaseSources,
  sourceHref,
} from "../../store/api/local-sources-api";
import { selectLocalSourceCounts } from "../../store/slices/localSourcesSlice";
import type { TechnologySource } from "../../store/types";
import { localSourceLabel } from "../../utils/sourceOrigin";
import { plural } from "../../utils/plural";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { FilePdfIcon, LinkIcon } from "../icons";
import styles from "./NodeCard.module.css";

/**
 * Блок «Источники в базе» карточки продукта: что лежит на сервере по этому
 * продукту — PDF заказчика, где он упоминается, и найденное моделью раньше.
 *
 * Как у опознания: сколько их, сервер сказал заранее (значок PDF на узле), а
 * сами документы спрашиваем, только когда открыта карточка. Ничего нет —
 * блока нет.
 */
export const NodeBaseSourcesBlock = ({ product }: { product: string }) => {
  const counts = useAppSelector((s) => selectLocalSourceCounts(s, product));
  const version = useAppSelector((s) => s.localSources.version);
  const local = counts?.local ?? 0;
  const savedUp = counts?.web.up ?? 0;
  const savedDown = counts?.web.down ?? 0;
  const [docs, setDocs] = useState<TechnologySource[] | null>(null);

  useEffect(() => {
    if (!product || local === 0) return;
    let cancelled = false;
    // У PDF направления нет — сервер отдаёт их одинаково в обе стороны.
    fetchBaseSources(product, "down")
      .then((r) => {
        if (!cancelled) setDocs(r.local);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [product, local, version]);

  if (local === 0 && savedUp === 0 && savedDown === 0) return null;

  const saved = [
    savedDown > 0 && `вниз — ${savedDown}`,
    savedUp > 0 && `вверх — ${savedUp}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <CollapsibleBlock
      title="Источники в базе"
      count={local + savedUp + savedDown}
      icon={<FilePdfIcon size={17} />}
    >
      <p className={styles.baseNote}>
        Есть на сервере для этого продукта — в любом графе. При построении шага
        встанут в список источников, PDF первыми.
      </p>

      {local > 0 &&
        (docs === null ? (
          <div className={styles.blockEmpty}>Загружаем документы…</div>
        ) : (
          <ul className={styles.baseList}>
            {docs.map((d) => (
              <li key={d.url} className={styles.baseItem}>
                <FilePdfIcon size={16} className={styles.baseIcon} />
                <span className={styles.baseMain}>
                  <a
                    href={sourceHref(d.url)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.link}
                    title="Открыть PDF на странице, где продукт"
                  >
                    <span className={styles.linkText}>{d.title}</span>
                    <LinkIcon size={13} className={styles.linkIcon} />
                  </a>
                  <span className={styles.baseMeta}>
                    {localSourceLabel(d.url, d.page)}
                    {d.mentions
                      ? ` · ${d.mentions} ${plural(d.mentions, "упоминание", "упоминания", "упоминаний")}`
                      : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ))}
      {docs && local > docs.length && (
        <p className={styles.baseNote}>
          Показаны {docs.length} из {local}{" "}
          {plural(local, "документа", "документов", "документов")} — где продукт
          упоминается чаще.
        </p>
      )}

      {saved && (
        <p className={styles.baseNote}>
          Найдено моделью раньше и сохранено: {saved}.
        </p>
      )}
    </CollapsibleBlock>
  );
};
