import type { FC } from "react";
import {
  AI_MODELS,
  AI_PROVIDERS,
  useAiConfig,
  type AiStage,
} from "../../hooks/useAiConfig";
import styles from "./AiModelSelect.module.css";

type Props = {
  /** Подпись над селектами; пусто — без подписи. */
  label?: string;
  /**
   * Стадия, на которой стоит селект. Модели, не работающие на ней, в списке не
   * показываем — так пользователю не приходится читать оговорки там, где они
   * не к месту: непригодного варианта просто нет.
   */
  stage?: AiStage;
};

/**
 * Выбор провайдера и модели. Состояние общее для всего приложения
 * (src/hooks/useAiConfig), поэтому селект можно ставить в любую панель —
 * выбор сразу действует на все запросы к LLM.
 */
export const AiModelSelect: FC<Props> = ({
  label = "Модель для запросов:",
  stage,
}) => {
  const { config, setProvider, setModel } = useAiConfig();
  const all = AI_MODELS[config.provider] ?? [];
  const models = stage
    ? all.filter((m) => !m.unsupportedIn?.includes(stage))
    : all;

  // Если общий выбор пал на модель, непригодную для этой стадии, показываем
  // ту, что реально уйдёт в запрос, — иначе селект был бы пустым.
  const value = models.some((m) => m.value === config.model)
    ? config.model
    : (models[0]?.value ?? "");
  const hint = models.find((m) => m.value === value)?.hint;

  return (
    <div className={styles.block}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.row}>
        <select
          value={config.provider}
          onChange={(e) => setProvider(e.target.value)}
          className={styles.select}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={value}
          onChange={(e) => setModel(e.target.value)}
          className={styles.select}
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
};
