import { useEffect, useState } from "react";

import { useAppSelector } from "../../store/hooks";
import {
  fetchBaseSources,
  sourceHref,
} from "../../store/api/local-sources-api";
import { selectLocalSourceCounts } from "../../store/slices/localSourcesSlice";
import type { TechnologySource } from "../../store/types";
import { localSourceTag } from "../../utils/sourceOrigin";
import { CollapsibleBlock } from "./CollapsibleBlock";
import { ArrowDownIcon, ArrowUpIcon, FilePdfIcon, LinkIcon } from "../icons";
import styles from "./NodeCard.module.css";

const SectionList = ({ items }: { items: TechnologySource[] }) => (
  <ul className={styles.baseList}>
    {items.map((d) => (
      <li key={d.url} className={styles.baseItem}>
        <FilePdfIcon size={16} className={styles.baseIcon} />
        <span className={styles.baseMain}>
          <a
            href={sourceHref(d.url)}
            target="_blank"
            rel="noreferrer"
            className={styles.link}
            title="Открыть документ на этом разделе"
          >
            <span className={styles.linkText}>{d.title}</span>
            <LinkIcon size={13} className={styles.linkIcon} />
          </a>
          <span className={styles.baseMeta}>{localSourceTag(d)}</span>
        </span>
      </li>
    ))}
  </ul>
);

/**
 * Блок «Источники в базе» карточки продукта: что лежит на сервере по этому
 * продукту — разделы документов, где его производят («вверх») и где он
 * сырьё («вниз»), и сколько источников модель находила для него раньше.
 *
 * Как у опознания: сколько их, сервер сказал заранее (значок на узле), а
 * сами разделы спрашиваем, только когда открыта карточка. Ничего нет —
 * блока нет.
 */
export const NodeBaseSourcesBlock = ({ product }: { product: string }) => {
  const counts = useAppSelector((s) => selectLocalSourceCounts(s, product));
  const version = useAppSelector((s) => s.localSources.version);
  const local = counts?.local ?? 0;
  const savedUp = counts?.web.up ?? 0;
  const savedDown = counts?.web.down ?? 0;
  const [sections, setSections] = useState<{
    up: TechnologySource[];
    down: TechnologySource[];
  } | null>(null);

  useEffect(() => {
    if (!product || local === 0) return;
    let cancelled = false;
    Promise.all([fetchBaseSources(product, "up"), fetchBaseSources(product, "down")])
      .then(([up, down]) => {
        if (!cancelled) setSections({ up: up.local, down: down.local });
      })
      .catch(() => {
        if (!cancelled) setSections({ up: [], down: [] });
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
        встанут в список источников первыми.
      </p>

      {local > 0 &&
        (sections === null ? (
          <div className={styles.blockEmpty}>Загружаем разделы…</div>
        ) : (
          <>
            {sections.up.length > 0 && (
              <>
                <p className={styles.baseGroup}>
                  <ArrowUpIcon size={12} /> Как его получают
                </p>
                <SectionList items={sections.up} />
              </>
            )}
            {sections.down.length > 0 && (
              <>
                <p className={styles.baseGroup}>
                  <ArrowDownIcon size={12} /> Что из него получают
                </p>
                <SectionList items={sections.down} />
              </>
            )}
          </>
        ))}

      {saved && (
        <p className={styles.baseNote}>
          Найдено моделью раньше и сохранено: {saved}.
        </p>
      )}
    </CollapsibleBlock>
  );
};
