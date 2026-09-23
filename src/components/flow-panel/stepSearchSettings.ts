import { createContext, useContext, useMemo, useState } from "react";

/**
 * Настройки поиска источников: промпт, белый список доменов, сколько искать.
 *
 * Живут ВЫШЕ обоих экранов мастера. Первый экран запускает поиск, второй
 * повторяет его кнопкой «Найти источники заново» — и это должен быть один и
 * тот же набор настроек. Пока состояние лежало внутри второго экрана, промпт
 * было негде править до первого поиска; если же завести второй набор на
 * первом экране, домены, указанные там, терялись бы при повторе.
 */
export interface StepSearchSettings {
  maxItems: number;
  setMaxItems: (n: number) => void;
  /** Открыт ли редактор. Общий, чтобы «Скрыть» работало с любого экрана. */
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** null — промпт не правили, берётся стандартный. */
  manualPrompt: string | null;
  setManualPrompt: (v: string | null) => void;
  domainsText: string;
  setDomainsText: (v: string) => void;
}

/** Своё состояние — на случай, когда провайдера над компонентом нет. */
export function useLocalStepSearchSettings(): StepSearchSettings {
  const [maxItems, setMaxItems] = useState(5);
  const [open, setOpen] = useState(false);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [domainsText, setDomainsText] = useState("");

  return useMemo(
    () => ({
      maxItems,
      setMaxItems,
      open,
      setOpen,
      manualPrompt,
      setManualPrompt,
      domainsText,
      setDomainsText,
    }),
    [maxItems, open, manualPrompt, domainsText],
  );
}

export const StepSearchSettingsContext =
  createContext<StepSearchSettings | null>(null);

/**
 * Настройки поиска: общие, если сверху есть провайдер, иначе собственные.
 *
 * Собственные нужны узлу-альтернативе: он открывается без мастера, и
 * требовать провайдер значило бы либо обернуть и его, либо уронить ветку,
 * которая до сих пор работала.
 */
export function useStepSearchSettings(): StepSearchSettings {
  const shared = useContext(StepSearchSettingsContext);
  // Хук вызывается всегда — порядок хуков не должен зависеть от наличия
  // провайдера. Лишнее состояние при этом просто не используется.
  const own = useLocalStepSearchSettings();
  return shared ?? own;
}
