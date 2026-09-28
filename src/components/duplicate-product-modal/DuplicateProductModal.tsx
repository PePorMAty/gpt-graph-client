import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import styles from "./DuplicateProductModal.module.css";

interface DuplicateProductModalProps {
  open: boolean;
  /** Как человек назвал узел. */
  newLabel: string;
  /** Продукт, который уже стоит на полотне. */
  existingLabel: string;
  /** Совпали названием или веществом (справочник знает оба названия). */
  by: "name" | "substance";
  /** Слить узел с уже имеющимся. */
  onMerge: () => void;
  /** Оставить два узла: человек знает, что это разные продукты. */
  onKeep: () => void;
}

/**
 * «Такой продукт уже есть на графе».
 *
 * Показывается, когда узел назвали так же, как уже стоящий продукт, или
 * синонимом того же вещества. Два узла одного продукта — это две половины
 * данных: у каждого свои источники и связи, и ни у одного не полная картина.
 * Решает человек: бывает, что одноимённые продукты и правда разные (разные
 * марки, разные стадии).
 */
export const DuplicateProductModal = ({
  open,
  newLabel,
  existingLabel,
  by,
  onMerge,
  onKeep,
}: DuplicateProductModalProps) => (
  <Modal
    open={open}
    onClose={onKeep}
    title="Такой продукт уже есть на графе"
    size="s"
    footer={
      <>
        <Button variant="ghost" onClick={onKeep}>
          Оставить отдельно
        </Button>
        <Button variant="primary" onClick={onMerge}>
          Объединить
        </Button>
      </>
    }
  >
    <p className={styles.text}>
      {by === "name" ? (
        <>
          Продукт «{existingLabel}» уже стоит на полотне.
        </>
      ) : (
        <>
          «{newLabel}» — то же вещество, что «{existingLabel}», который уже
          стоит на полотне: справочник знает оба названия.
        </>
      )}
    </p>
    <p className={styles.text}>
      Объединить узлы? Связи нового узла перейдут к «{existingLabel}», вместе с
      ним останутся его источники, а новый узел исчезнет.
    </p>
  </Modal>
);
