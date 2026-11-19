// Окно конфликта сохранения: «Обновить» получил 409 — граф сохранил кто-то
// другой, пока его правили (сервер с версиями, PG-MIGRATION.md этапа 1).
//
// Молча перезаписать нельзя: пропала бы чужая правка. Выбор — за человеком:
// - открыть их версию (свои несохранённые правки уходят);
// - сохранить свою копией — отдельным графом в библиотеке, чужая версия
//   остаётся как есть.

import { useEffect, useState, type FC } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { clearSaveConflict } from "../../store/slices/savedGraphSlice";
import { openSavedGraphOnCanvas } from "../../store/openSavedGraph";
import { useSaveGraph } from "../../hooks/useSaveGraph";
import { showToast } from "../toast/toastStore";
import styles from "./SaveConflictModal.module.css";

/** «18 ноября, 14:02» — когда сохранили чужую версию. */
function when(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export const SaveConflictModal: FC = () => {
  const dispatch = useAppDispatch();
  const conflict = useAppSelector((s) => s.savedGraphs.saveConflict);
  const openedName = useAppSelector((s) => s.savedGraphs.openedGraphName);
  const { saveNew } = useSaveGraph();
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (!busy) dispatch(clearSaveConflict());
  };

  useEffect(() => {
    if (!conflict) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) dispatch(clearSaveConflict());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [conflict, busy, dispatch]);

  if (!conflict) return null;
  const name = conflict.current.name || openedName || "граф";
  const at = when(conflict.current.updatedAt);

  const openTheirs = async () => {
    setBusy(true);
    try {
      await dispatch(openSavedGraphOnCanvas(conflict.id)).unwrap();
      showToast("success", `Открыта последняя версия «${name}»`);
      dispatch(clearSaveConflict());
    } catch (e) {
      showToast("error", `Не удалось открыть граф: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveCopy = async () => {
    setBusy(true);
    try {
      if (await saveNew(`${name} (моя копия)`)) dispatch(clearSaveConflict());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.window} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Граф изменили, пока вы работали</h3>
        <p className={styles.text}>
          «{name}» уже сохранили{at ? ` ${at}` : ""} — после того, как вы его открыли. Если сохранить
          поверх, та правка пропадёт, поэтому граф не перезаписан.
        </p>
        <ul className={styles.options}>
          <li>
            <b>Открыть их версию</b> — на полотне будет последняя сохранённая версия; ваши
            несохранённые правки уйдут.
          </li>
          <li>
            <b>Сохранить мою копией</b> — ваш вариант станет отдельным графом «{name} (моя копия)»,
            их версия останется как есть.
          </li>
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={close} disabled={busy}>
            Отмена
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={openTheirs} disabled={busy}>
            Открыть их версию
          </button>
          <button type="button" className={styles.primaryBtn} onClick={saveCopy} disabled={busy}>
            Сохранить мою копией
          </button>
        </div>
      </div>
    </div>
  );
};
