// src/components/product-codes/CodesPickBar.tsx
//
// «Определение кодов», первый шаг: продукты выбирают щелчком на полотне, а
// эта панель внизу показывает выбранное. Выбирают на графе, а не списком:
// продуктов бывают сотни, и нужные человек видит в цепочке, а не по
// алфавиту.

import type { FC } from "react";

import { plural } from "../../utils/plural";
import { ArrowRightIcon, BarcodeIcon, CloseIcon, InfoIcon, TrashIcon } from "../icons";
import css from "./ProductCodes.module.css";

interface Props {
  picked: { id: string; label: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onContinue: () => void;
  onClose: () => void;
}

export const CodesPickBar: FC<Props> = ({ picked, onRemove, onClear, onContinue, onClose }) => (
  <div className={css.bar} role="region" aria-label="Выбор продуктов для определения кодов">
    <div className={css.barHead}>
      <BarcodeIcon size={18} className={css.barIcon} />
      <span className={css.barTitle}>Выбрано для определения кодов</span>
      <span className={css.count}>
        {picked.length} {plural(picked.length, "продукт", "продукта", "продуктов")}
      </span>
      <span className={css.spacer} />
      <button type="button" className={css.iconBtn} onClick={onClose} aria-label="Выйти из выбора продуктов">
        <CloseIcon size={16} />
      </button>
    </div>
    <p className={css.hint}>
      <InfoIcon size={14} />
      Щёлкайте по продуктам на графе: щелчок выбирает, повторный — снимает.
    </p>
    {picked.length > 0 && (
      <ul className={css.chips}>
        {picked.map((p) => (
          <li key={p.id} className={css.chip}>
            {p.label}
            <button type="button" className={css.chipX} onClick={() => onRemove(p.id)} aria-label={`Убрать «${p.label}»`}>
              <CloseIcon size={12} />
            </button>
          </li>
        ))}
      </ul>
    )}
    <div className={css.barActions}>
      <button type="button" className={css.secondary} onClick={onClear} disabled={!picked.length}>
        <TrashIcon size={14} /> Очистить
      </button>
      <button type="button" className={css.primary} onClick={onContinue} disabled={!picked.length}>
        Продолжить <ArrowRightIcon size={14} />
      </button>
    </div>
  </div>
);
