/**
 * Ссылка на источник из того, что человек набрал.
 *
 * Поле ждало готовый адрес со схемой, и «wikipedia» или «xumuk.ru» оно
 * отвергало: «ссылка должна начинаться с http:// или https://». Требовать от
 * человека помнить про схему и www не за чем — это работа программы.
 *
 * Разбираем три случая: полный адрес, домен без схемы и одно слово — название
 * известного сайта.
 */

/** Сайты, которые в этой работе называют по имени, а не по адресу. */
const KNOWN: Array<{ keys: string[]; url: string; title: string }> = [
  { keys: ["wikipedia", "википедия", "вики", "wiki"], url: "https://ru.wikipedia.org", title: "Википедия" },
  { keys: ["patents", "google patents", "патенты", "гуглпатент"], url: "https://patents.google.com", title: "Google Patents" },
  { keys: ["роспатент", "фипс", "fips"], url: "https://www.fips.ru", title: "Роспатент (ФИПС)" },
  { keys: ["pubchem", "пабкем"], url: "https://pubchem.ncbi.nlm.nih.gov", title: "PubChem" },
  { keys: ["elibrary", "елайбрари", "елибрари"], url: "https://elibrary.ru", title: "eLIBRARY" },
  { keys: ["cyberleninka", "киберленинка"], url: "https://cyberleninka.ru", title: "КиберЛенинка" },
  { keys: ["гост", "gost", "техэксперт", "cntd"], url: "https://docs.cntd.ru", title: "Техэксперт (ГОСТы)" },
  { keys: ["гисп", "gisp"], url: "https://gisp.gov.ru", title: "ГИСП" },
  { keys: ["химик", "xumuk"], url: "https://www.xumuk.ru", title: "ХиМиК" },
  { keys: ["sciencedirect", "сайенсдирект"], url: "https://www.sciencedirect.com", title: "ScienceDirect" },
  { keys: ["springer", "спрингер"], url: "https://link.springer.com", title: "Springer" },
  { keys: ["scholar", "гуглсколар"], url: "https://scholar.google.com", title: "Google Scholar" },
];

/** Подсказки для выпадающего списка под полем ввода. */
export const KNOWN_SOURCE_NAMES: string[] = KNOWN.map((k) => k.title);

export interface SourceUrlResult {
  /** Готовая ссылка; null — из введённого её не собрать. */
  url: string | null;
  /** Название, которое стоит подставить, если человек своё не написал. */
  title?: string;
  /** Почему не вышло — текст для показа под полем. */
  error?: string;
}

/** Известный сайт по имени или по названию из списка подсказок. */
function findKnown(value: string) {
  const s = value.toLowerCase().replace(/[«»"']/g, "").trim();
  return KNOWN.find(
    (k) => k.keys.includes(s) || k.title.toLowerCase() === s,
  );
}

/** Название по умолчанию: домен без www — «ru.wikipedia.org». */
function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function normalizeSourceUrl(raw: string): SourceUrlResult {
  const value = String(raw ?? "").trim().replace(/^[<«"']+|[>»"']+$/g, "");
  if (!value) return { url: null };

  // Название известного сайта — «wikipedia», «ГОСТ», «КиберЛенинка».
  const known = findKnown(value);
  if (known) return { url: known.url, title: known.title };

  // Протокол-относительная ссылка из адресной строки: «//example.com/x».
  const withScheme = value.startsWith("//") ? `https:${value}` : value;

  // Схема уже есть — проверяем и оставляем как есть.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withScheme)) {
    if (!/^https?:\/\//i.test(withScheme)) {
      return { url: null, error: "Поддерживаются ссылки http и https." };
    }
    try {
      const u = new URL(withScheme);
      if (!u.hostname.includes(".")) {
        return { url: null, error: "В адресе не хватает домена — например, example.ru." };
      }
      return { url: u.toString(), title: titleFromUrl(u.toString()) };
    } catch {
      return { url: null, error: "Не похоже на ссылку — проверьте адрес." };
    }
  }

  // Домен без схемы: «xumuk.ru», «www.example.com/page», «химик.рф».
  if (/^[^\s/]+\.[^\s/]{2,}/.test(withScheme)) {
    try {
      const u = new URL(`https://${withScheme}`);
      return { url: u.toString(), title: titleFromUrl(u.toString()) };
    } catch {
      return { url: null, error: "Не похоже на адрес сайта — проверьте написание." };
    }
  }

  // Ни ссылка, ни знакомое имя.
  return {
    url: null,
    error:
      "Не похоже ни на ссылку, ни на сайт из списка. " +
      "Напишите адрес целиком — например, xumuk.ru или https://example.ru/page.",
  };
}

/**
 * Один и тот же адрес, записанный по-разному.
 *
 * «https://example.ru», «https://example.ru/» и «https://www.example.ru» — одна
 * ссылка; без этого повторное добавление ловило «уже есть» на пустом месте, а
 * дубли всё равно проскакивали.
 */
export function sourceUrlKey(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${u.search}`;
  } catch {
    return value.toLowerCase().replace(/\/+$/, "");
  }
}
