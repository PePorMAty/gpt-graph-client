import type { FC, ReactNode } from "react";

import {
  StepSearchSettingsContext,
  useLocalStepSearchSettings,
} from "./stepSearchSettings";

/** Общие настройки поиска для обоих экранов мастера. */
export const StepSearchSettingsProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const value = useLocalStepSearchSettings();
  return (
    <StepSearchSettingsContext.Provider value={value}>
      {children}
    </StepSearchSettingsContext.Provider>
  );
};
