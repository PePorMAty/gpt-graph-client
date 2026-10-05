import { useState, type FC } from "react";

import {
  describeCodes,
  type DescribedCode,
  type IndustryCodeVariant,
} from "../../store/api/industry-api";
import type { CodeOverride } from "../../types";
import { plural } from "../../utils/plural";
import { PencilIcon } from "../icons";
import { okpd2Url, tnvedTitle } from "./gisp";
import { CODE_LABEL, type CodeKind } from "./codeOverrides";
import styles from "./Industry.module.css";

/** Код, который карточка показывает без правки: из реестра или по названию. */
export interface RegistryCode {
  code: string;
  name: string | null;
  /** Название относится к коду целиком, а не к группе над ним. */
  nameExact?: boolean;
  retired?: boolean;
  /** ОКПД2 уточнён по классификатору; у записей реестра — этот код. */
  refinedFrom?: string | null;
  /** Позиция найдена в классификаторе по названию вещества, не в реестре. */
  byName?: boolean;
  /** ТН ВЭД: цепочка названий сверху вниз (см. tnvedTitle). */
  path?: string | null;
}

interface Props {
  kind: CodeKind;
  registry: RegistryCode | null;
  override?: CodeOverride;
  /** Коды всех записей реестра, первым — выбранный. */
  variants?: IndustryCodeVariant[];
  /** Чем заполнить поле, когда кода нет вовсе: категория классификатора. */
  suggestion?: string | null;
  editable: boolean;
  /** Задать код вручную или (null) вернуть код реестра. */
  onChange: (value: CodeOverride | null) => void;
}

const PLACEHOLDER: Record<CodeKind, string> = {
  okpd2: "20.14.52.111",
  tnved: "2933710000",
};

const FORMAT_HINT: Record<CodeKind, string> = {
  okpd2: "Код ОКПД2 записывается через точки: 20.14.52.111 (можно короче — 20.14.52).",
  tnved: "Код ТН ВЭД — от 4 до 10 цифр: 2933710000.",
};

/** Код ссылкой на классификатор (у ОКПД2) или просто текстом. */
const CodeValue: FC<{ kind: CodeKind; code: string }> = ({ kind, code }) =>
  kind === "okpd2" ? (
    <a
      className={styles.codeValue}
      href={okpd2Url(code)}
      target="_blank"
      rel="noreferrer noopener"
      title="Открыть код в классификаторе"
    >
      {code}
    </a>
  ) : (
    <span className={styles.codeValue}>{code}</span>
  );

/** Поле правки кода: проверка формата и названия по классификатору. */
const CodeEditor: FC<{
  kind: CodeKind;
  initial: string;
  canClear: boolean;
  onSave: (value: CodeOverride | null) => void;
  onCancel: () => void;
}> = ({ kind, initial, canClear, onSave, onCancel }) => {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Кода нет в классификаторе: сохранить можно, но только переспросив.
  const [unknown, setUnknown] = useState<DescribedCode | null>(null);
  // Сервер не ответил — проверить нечем, решать человеку.
  const [unchecked, setUnchecked] = useState(false);

  const submit = async () => {
    const value = text.trim();
    if (!value) {
      if (canClear) onSave(null);
      else onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    setUnknown(null);
    setUnchecked(false);
    try {
      const described = (await describeCodes({ [kind]: value }))[kind];
      if (!described) {
        setError(FORMAT_HINT[kind]);
      } else if (!described.known) {
        setUnknown(described);
      } else {
        onSave({
          code: described.code,
          name: described.name,
          ...(described.path ? { path: described.path } : {}),
        });
      }
    } catch {
      setUnchecked(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.codeEditor}>
      <input
        className={styles.codeInput}
        value={text}
        autoFocus
        placeholder={PLACEHOLDER[kind]}
        aria-label={`Код ${CODE_LABEL[kind]}`}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
          setUnknown(null);
          setUnchecked(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <button
        type="button"
        className={styles.codeSave}
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "Проверяем…" : "Сохранить"}
      </button>
      <button type="button" className={styles.linkBtn} onClick={onCancel}>
        Отмена
      </button>
      {error && <p className={styles.codeWarn}>{error}</p>}
      {unknown && (
        <p className={styles.codeWarn}>
          Кода {unknown.formatted ?? unknown.code} в классификаторе нет
          {unknown.name ? ` (ближайшая группа — «${unknown.name}»)` : ""}.{" "}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onSave({ code: unknown.code, name: null })}
          >
            Сохранить всё равно
          </button>
        </p>
      )}
      {unchecked && (
        <p className={styles.codeWarn}>
          Проверить код не удалось — сервер не ответил.{" "}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onSave({ code: text.trim(), name: null })}
          >
            Сохранить без проверки
          </button>
        </p>
      )}
    </div>
  );
};

/**
 * Строка кода продукта во вкладке «Промышленное знание»: ОКПД2 или ТН ВЭД.
 *
 * Записи реестра одного продукта стоят под разными кодами — заявитель
 * выбирает его сам, — и карточка показывает самый подходящий. Остальные
 * раскрываются списком, и любой из них можно поставить продукту вручную, как
 * и вписать свой: код из реестра бывает категорией или вовсе чужим. Заданный
 * вручную код показывается вместо кода реестра, а тот остаётся рядом.
 */
export const CodeLine: FC<Props> = ({
  kind,
  registry,
  override,
  variants = [],
  suggestion,
  editable,
  onChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);

  const shown = override?.code ?? registry?.code ?? null;
  // У ТН ВЭД имя позиции читается только с уровнями над ним: «прочие».
  const titled = (n: string | null, path?: string | null) =>
    kind === "tnved" ? tnvedTitle(n, path) : n;
  const name = override
    ? titled(override.name, override.path)
    : titled(registry?.name ?? null, registry?.path);
  const fullPath = override ? override.path : registry?.path;
  const others = Math.max(0, variants.length - 1);

  // Тот же код, что дал реестр, — правки нет: вернуть код реестра.
  const emit = (value: CodeOverride | null) =>
    onChange(value && registry && value.code === registry.code ? null : value);

  const save = (value: CodeOverride | null) => {
    emit(value);
    setEditing(false);
  };

  return (
    <>
      <div className={styles.classLine}>
        <span className={styles.codeLabel}>{CODE_LABEL[kind]}</span>
        {shown ? (
          <CodeValue kind={kind} code={shown} />
        ) : (
          <span className={styles.codeEmpty}>не задан</span>
        )}
        {/* Кода нет в действующем классификаторе. Пометка идёт сразу за
            самим кодом, до названия: название-то у него найдётся — по живой
            родительской группе, — и без пометки выглядело бы обычным. */}
        {!override && registry?.retired && (
          <span
            className={styles.codeRetired}
            title="Код был присвоен записи при регистрации, а сейчас в классификаторе его нет"
          >
            снят
          </span>
        )}
        {name && (
          <span className={styles.codeName} title={fullPath ?? undefined}>
            {name}
          </span>
        )}
        {override ? (
          <>
            <span
              className={styles.codeManual}
              title="Код задан вручную во вкладке «Промышленное знание» и сохраняется вместе с графом"
            >
              задан вручную
            </span>
            {override.name === null && (
              <span className={styles.codeExtra}>нет в классификаторе</span>
            )}
            {registry && registry.code !== override.code && (
              <span className={styles.codeExtra}>
                {registry.byName ? "по классификатору" : "в реестре"} — {registry.code}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Код уточнён по классификатору: записи реестра стоят под кодом
                категории над ним. */}
            {registry?.refinedFrom && (
              <span
                className={styles.codeExtra}
                title="Записи реестра стоят под кодом категории, а в классификаторе под ней есть позиция этого вещества"
              >
                уточнён по классификатору; в реестре — {registry.refinedFrom}
              </span>
            )}
            {registry?.byName && (
              <span
                className={styles.codeExtra}
                title="У записей реестра кода нет — позиция найдена в классификаторе по названию вещества"
              >
                по классификатору
              </span>
            )}
          </>
        )}
        {/* У записей реестра коды разные, и продукту достаётся самый
            подходящий. Сколько их всего — само по себе признак: много кодов
            значит, что записи собрались разнородные. По щелчку — список. */}
        {others > 0 && (
          <button
            type="button"
            className={styles.codeMore}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            title="Записи реестра по продукту стоят под разными кодами — показать все"
          >
            у остальных записей ещё{" "}
            {others === 1 ? "код" : `кодов: ${others}`} {open ? "▴" : "▾"}
          </button>
        )}
        {editable && !editing && (
          <span className={styles.codeActions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setEditing(true)}
            >
              <PencilIcon size={12} /> {shown ? "Изменить" : "Задать"}
            </button>
            {override && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => emit(null)}
              >
                {registry ? "Вернуть код реестра" : "Убрать"}
              </button>
            )}
          </span>
        )}
      </div>

      {editing && (
        <CodeEditor
          kind={kind}
          initial={shown ?? suggestion ?? ""}
          canClear={!!override}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      )}

      {open && others > 0 && (
        <div className={styles.codeVariants}>
          <p className={styles.codeVariantsHint}>
            Записи реестра по этому продукту стоят под разными кодами: код
            выбирает сам заявитель. В карточке — тот, что классификатор
            связывает с веществом, а среди таких — самый частый.
            {editable ? " Можно выбрать и другой." : ""}
            {kind === "tnved" &&
              " «Прочие» в ТН ВЭД — всё, что входит в уровень выше, но не" +
                " попало в названные рядом позиции; поэтому у кодов показана" +
                " цепочка уровней (полностью — в подсказке)."}
          </p>
          <ul className={styles.codeVariantList}>
            {variants.map((v) => (
              <li key={v.code} className={styles.codeVariant}>
                <CodeValue kind={kind} code={v.code} />
                {v.retired && <span className={styles.codeRetired}>снят</span>}
                <span className={styles.codeName} title={v.path ?? undefined}>
                  {titled(v.name, v.path) ?? "нет в классификаторе"}
                </span>
                <span className={styles.codeCount}>
                  {v.count} {plural(v.count, "запись", "записи", "записей")}
                </span>
                {v.code === shown ? (
                  <span className={styles.codeCurrent}>в карточке</span>
                ) : (
                  editable && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() =>
                        emit({
                          code: v.code,
                          name: v.name,
                          ...(v.path ? { path: v.path } : {}),
                        })
                      }
                    >
                      Выбрать
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};
