import { useEffect, useRef, useState, type FC } from "react";

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
/**
 * Сколько ждать перед закрытием, когда мышь ушла с надписи.
 *
 * Подсказка шире надписи в несколько раз, и мышь, идущая к ней по диагонали,
 * выходит из надписи вбок раньше, чем доходит до подсказки. Без задержки
 * подсказка закрывалась в этот самый момент — до неё было не добраться.
 */
const CLOSE_DELAY_MS = 180;

export const NodeIdentifiers: FC<Props> = ({ nodeId, short, productName }) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  // Карточка закрывается вместе с узлом — таймер переживать её не должен.
  useEffect(() => cancelClose, []);

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
  const tnved = industry?.found ? industry.tnved : null;
  // CAS — факт справочника, а не реестра: он есть и у вещества, которого в
  // ГИСП нет вовсе. Потому и не прячется за found, в отличие от кодов.
  const cas = industry?.cas ?? null;

  return (
    <div
      className={styles.idWrap}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={(e) => {
        // Щелчок по ссылке ОКПД2 переводит фокус ВНУТРЬ подсказки — закрывать
        // её при этом нельзя, иначе по ссылке не попасть. Закрываем, только
        // когда фокус ушёл за пределы обёртки.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
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

          {cas && (
            <div className={styles.idPopRow}>
              <span className={styles.idPopLabel}>CAS</span>
              <span className={styles.idPopValue}>
                {cas}
                <span className={styles.idPopNote}>
                  международный номер вещества
                </span>
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

          {tnved && (
            <div className={styles.idPopRow}>
              <span className={styles.idPopLabel}>ТН ВЭД</span>
              <span className={styles.idPopValue}>
                {tnved}
                {industry?.tnvedName && (
                  <span className={styles.idPopNote}>
                    {industry.tnvedName}
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
