import { useState, type FC } from "react";

import { useAppSelector } from "../../store/hooks";
import { industryKey } from "../../store/slices/industrySlice";
import {
  PRODUCT_ID_SOURCE_LABELS,
  readProductId,
  readProductIdSource,
} from "../../utils/productIdentity";
import { okpd2Url } from "../industry/gisp";
import styles from "./NodeCard.module.css";

interface Props {
  nodeId: string | null | undefined;
  /** Короткая подпись, которую видно в шапке всегда. */
  short: string;
  /** Название продукта — по нему ищутся сведения из реестра. */
  productName?: string;
}

/**
 * Идентификаторы узла в шапке карточки.
 *
 * Раньше идентификатор вещества жил отдельным блоком с полем ввода. Вводить
 * его руками в сотни узлов никто не станет — блок убран, а показывать
 * идентификатор всё равно надо: когда «ИПБ» и «Кумол» сливаются в один узел,
 * должно быть видно, почему. Поэтому всё, что узел знает про себя, собрано
 * здесь и открывается наведением на строку «ID».
 *
 * Код ОКПД2 — ссылка на классификатор. Там же видно то, чего мы показать не
 * можем: снятые коды помечены изменением, которым их исключили, а наш файл
 * плоский, без статусов.
 */
export const NodeIdentifiers: FC<Props> = ({ nodeId, short, productName }) => {
  const [open, setOpen] = useState(false);

  // Данные узла берём из стора по id: карточка получает поля по одному, и
  // тащить через неё ещё два ради подсказки незачем.
  const data = useAppSelector(
    (s) => s.graph.data.nodes.find((n) => n.id === nodeId)?.data,
  );
  // Сведения реестра лежат по нормализованному названию — тому же ключу,
  // по которому их клала проверка по ГИСП.
  const industry = useAppSelector((s) =>
    productName ? s.industry.results[industryKey(productName)] : undefined,
  );

  const substance = readProductId(data);
  const source = readProductIdSource(data);
  const okpd2 = industry?.found ? industry.okpd2 : null;

  return (
    <div
      className={styles.idWrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <div className={styles.nodeId} tabIndex={0}>
        ID: {short}
      </div>

      {open && (
        <div className={styles.idPop} role="tooltip">
          <div className={styles.idPopRow}>
            <span className={styles.idPopLabel}>Узел</span>
            <span className={styles.idPopValue}>{nodeId ?? "—"}</span>
          </div>

          {substance && (
            <div className={styles.idPopRow}>
              <span className={styles.idPopLabel}>Вещество</span>
              <span className={styles.idPopValue}>
                {substance}
                {source && (
                  <span className={styles.idPopNote}>
                    {PRODUCT_ID_SOURCE_LABELS[source]}
                  </span>
                )}
              </span>
            </div>
          )}

          {okpd2 && (
            <div className={styles.idPopRow}>
              <span className={styles.idPopLabel}>ОКПД2</span>
              <span className={styles.idPopValue}>
                <a
                  className={styles.idPopLink}
                  href={okpd2Url(okpd2)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {okpd2}
                </a>
                {industry?.okpd2Name && (
                  // Наш справочник классификатора шестизначный, а коды реестра
                  // длиннее. Значит, это название ГРУППЫ, в которую код попал,
                  // а не самой позиции, — так и подписываем.
                  <span className={styles.idPopNote}>
                    группа: {industry.okpd2Name}
                  </span>
                )}
              </span>
            </div>
          )}

          {!substance && (
            <p className={styles.idPopHint}>
              Идентификатор вещества появляется при объединении графов и при
              построении шага — справочник опознаёт продукт по названию.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
