import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./ConfirmUnsavedModal.module.css";

interface ConfirmUnsavedModalProps {
  open: boolean;
  /** Что произойдёт дальше — «созданием нового графа», «открытием графа». */
  action: string;
  /** Подпись главной кнопки, напр. «Сохранить и открыть». */
  confirmLabel: string;
  saving?: boolean;
  onCancel: () => void;
  /** Продолжить, не сохраняя текущее полотно. */
  onDiscard: () => void;
  /** Сохранить полотно и затем продолжить. */
  onSave: () => void;
}

/**
 * Вопрос о несохранённых правках перед действием, которое затирает полотно:
 * созданием нового графа или открытием сохранённого.
 */
export const ConfirmUnsavedModal = ({
  open,
  action,
  confirmLabel,
  saving = false,
  onCancel,
  onDiscard,
  onSave,
}: ConfirmUnsavedModalProps) => (
  <Modal
    open={open}
    onClose={onCancel}
    title="Текущий граф не сохранён"
    size="m"
    subtitle="То, что сейчас на полотне, будет заменено."
    footer={
      <>
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button onClick={onDiscard} disabled={saving}>
          Не сохранять
        </Button>
        <Button variant="primary" onClick={onSave} disabled={saving}>
          {saving ? "Сохраняю…" : confirmLabel}
        </Button>
      </>
    }
  >
    <p className={styles.text}>
      На полотне есть изменения, которых нет в сохранённом графе. Сохранить их
      перед {action}?
    </p>
  </Modal>
);
