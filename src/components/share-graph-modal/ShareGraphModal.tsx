import { useEffect, useRef, useState, type FC } from "react";
import { useAppSelector } from "../../store/hooks";
import { shareGraph } from "../../store/api/share-api";
import styles from "./ShareGraphModal.module.css";

interface ShareGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Status = "idle" | "empty" | "loading" | "done" | "error";

function buildShareLink(id: string): string {
  const rawBase = import.meta.env.BASE_URL || "/";
  const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
  return `${window.location.origin}${base}g/${id}`;
}

export const ShareGraphModal: FC<ShareGraphModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { data, leafNodes, hasMore, originalPrompt } = useAppSelector(
    (s) => s.graph,
  );

  const [status, setStatus] = useState<Status>("idle");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  // Guard от двойного POST в StrictMode (React 19) и при ре-рендерах.
  const requestedRef = useRef(false);

  // ESC закрывает модалку.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // При открытии один раз создаём шарный снапшот и строим ссылку.
  useEffect(() => {
    if (!isOpen) {
      // Сброс состояния при закрытии — чтобы следующее открытие шарило заново.
      requestedRef.current = false;
      setStatus("idle");
      setLink("");
      setCopied(false);
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;

    if (!data.nodes.length) {
      setStatus("empty");
      return;
    }

    setStatus("loading");
    shareGraph({
      name: originalPrompt ?? undefined,
      prompt: originalPrompt ?? "graph",
      nodes: data.nodes,
      edges: data.edges,
      leaf_nodes: leafNodes,
      has_more: hasMore,
    })
      .then(({ id }) => {
        setLink(buildShareLink(id));
        setStatus("done");
      })
      .catch(() => setStatus("error"));
  }, [isOpen, data.nodes, data.edges, leafNodes, hasMore, originalPrompt]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const input = document.getElementById(
        "share-link-input",
      ) as HTMLInputElement | null;
      input?.select();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Поделиться графом</h3>

        {status === "empty" && (
          <p className={styles.warning}>Нечего шарить — полотно пустое.</p>
        )}
        {status === "loading" && (
          <p className={styles.warning}>Создаём ссылку…</p>
        )}
        {status === "error" && (
          <p className={styles.warning}>
            Не удалось создать ссылку. Попробуйте ещё раз.
          </p>
        )}
        {status === "done" && (
          <>
            <p className={styles.warning}>
              Ссылка на текущий граф. Любой, кто перейдёт по ней, сразу увидит
              этот граф.
            </p>
            <input
              id="share-link-input"
              className={styles.link}
              type="text"
              value={link}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Закрыть
          </button>
          {status === "done" && (
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? "Скопировано ✓" : "Скопировать"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
