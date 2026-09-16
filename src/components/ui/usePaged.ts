import { useEffect, useMemo, useState } from "react";

/** Сколько строк на странице по умолчанию. */
export const PAGE_SIZE = 20;

/**
 * Разбить список на страницы.
 *
 * Таблицы источников и реестровых записей вырастают до сотен строк, и сплошная
 * прокрутка в них бесполезна: до нужного места не долистать, а положение
 * теряется при каждом возврате. Возвращает текущий срез и то, что нужно
 * подвалу со страницами (компонент `Pagination`).
 *
 * Страница сбрасывается при смене самого списка — иначе после поиска можно
 * оказаться на девятой странице пустого результата.
 *
 * Живёт отдельно от компонента: файл с компонентом и хуком сразу ломает
 * hot reload (react-refresh обновляет только модули, где одни компоненты).
 */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));

  useEffect(() => {
    setPage(0);
  }, [items.length]);

  // Список мог укоротиться, пока мы стояли на дальней странице.
  const safe = Math.min(page, pages - 1);
  const slice = useMemo(
    () => items.slice(safe * size, safe * size + size),
    [items, safe, size],
  );

  return {
    slice,
    page: safe,
    pages,
    setPage,
    total: items.length,
    from: items.length ? safe * size + 1 : 0,
    to: Math.min((safe + 1) * size, items.length),
  };
}
