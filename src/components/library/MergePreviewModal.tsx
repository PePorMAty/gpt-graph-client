import type { Edge } from "@xyflow/react";

import type { CustomNode } from "../../types";
import type { MergeReportRow } from "../upload-graph/MergeReportModal";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { GraphPreview } from "./GraphPreview";
import { LegendList } from "../legend/LegendList";
import { hasCommonProductNodes } from "../../utils/presentationColors";
import { ChainLengthIcon, LinkIcon, NodesCountIcon } from "../icons";
import styles from "./LibraryScreen.module.css";

export interface MergePreviewResult {
  nodes: CustomNode[];
  edges: Edge[];
  commonNodes: MergeReportRow[];
  addedCount: number;
  /** Реестр «презентация → цвет» посчитанного объединения — для легенды. */
  presentationColors: Record<string, string>;
}

interface MergePreviewModalProps {
  open: boolean;
  /** Имя графа-основы и имена присоединяемых — для подписи окна. */
  baseName: string;
  names: string[];
  /** Результат расчёта; пока считаем — null. */
  result: MergePreviewResult | null;
  loading: boolean;
  error: string | null;
  /** Переименовать источник прямо в превью — до того, как он попал на полотно. */
  onRename: (from: string, to: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Превью объединения: что получится, до того как это окажется на полотне.
 *
 * Слияние считается той же функцией, что и настоящее (`computeMergeChain`),
 * только мимо стора — поэтому схема в окне не «похожая», а ровно та же.
 * Превью интерактивное: большой объединённый граф иначе не разобрать.
 *
 * Здесь же правится легенда. Имена источников берутся из названий графов
 * («Пиролиз бензина от 12.03»), и подписывать ими цвета удобнее до объединения,
 * а не разыскивать потом нужный цвет на полотне.
 */
export const MergePreviewModal = ({
  open,
  baseName,
  names,
  result,
  loading,
  error,
  onRename,
  onCancel,
  onConfirm,
}: MergePreviewModalProps) => (
  <Modal
    open={open}
    onClose={onCancel}
    title="Превью объединения"
    size="l"
    subtitle={
      names.length
        ? `«${baseName}» + ${names.map((n) => `«${n}»`).join(", ")}`
        : `«${baseName}»`
    }
    footer={
      <>
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={loading || !result}
        >
          Объединить
        </Button>
      </>
    }
  >
    {error ? (
      <div className={styles.detailsError}>Ошибка: {error}</div>
    ) : loading || !result ? (
      <div className={styles.previewCard}>
        <div className={styles.previewEmpty}>Считаю объединение…</div>
      </div>
    ) : (
      <>
        <div className={styles.previewCard}>
          <GraphPreview nodes={result.nodes} edges={result.edges} />
        </div>

        <div className={styles.mergeStats}>
          <span className={styles.aboutStat}>
            <NodesCountIcon size={16} className={styles.aboutStatIcon} />
            Узлов после объединения: <b>{result.nodes.length}</b>
          </span>
          <span className={styles.aboutStat}>
            <LinkIcon size={16} className={styles.aboutStatIcon} />
            Связей: <b>{result.edges.length}</b>
          </span>
          <span className={styles.aboutStat}>
            <ChainLengthIcon size={16} className={styles.aboutStatIcon} />
            Добавится узлов: <b>{result.addedCount}</b>
          </span>
        </div>

        <div className={styles.mergeCommon}>
          <div className={styles.mergeCommonTitle}>Легенда источников</div>
          <p className={styles.mergeLegendHint}>
            Цвет узла показывает, из какого графа он пришёл. Название можно
            поправить сразу — нажмите карандаш.
          </p>
          <LegendList
            colors={result.presentationColors}
            hasCommonNodes={hasCommonProductNodes(result.nodes)}
            onRename={onRename}
          />
        </div>

        {result.commonNodes.length > 0 && (
          <div className={styles.mergeCommon}>
            <div className={styles.mergeCommonTitle}>
              Продукты, которые сольются в один узел:{" "}
              {result.commonNodes.length}
            </div>
            <ul className={styles.mergeCommonList}>
              {result.commonNodes.slice(0, 12).map((row) => (
                <li key={row.label} className={styles.mergeCommonItem}>
                  <span className={styles.mergeCommonName}>{row.label}</span>
                  <span className={styles.mergeCommonFrom}>
                    {row.presentations.join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
            {result.commonNodes.length > 12 && (
              <div className={styles.mergeCommonMore}>
                …и ещё {result.commonNodes.length - 12}
              </div>
            )}
          </div>
        )}
      </>
    )}
  </Modal>
);
