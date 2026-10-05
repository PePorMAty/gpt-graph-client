// src/store/api/industry-api.ts
//
// Слой промышленных данных: проверка продуктов графа по реестру российской
// промышленной продукции (ГИСП, ПП №719).
//
// Сервер ищет по собственной копии реестра, без обращения к модели, поэтому
// ответ приходит сразу и его можно запрашивать на каждое включение слоя.

import axios from "axios";

/** Насколько уверенно название продукта легло на запись реестра. */
export type IndustryMatch =
  | "exact"
  | "all-words"
  | "core-words"
  | "partial"
  | "prefix";

export interface IndustryProducer {
  /** Сокращённое название: «ООО «Технокерамика»». */
  producer: string;
  /** Полное название из реестра — для подсказки: официальное имя нужно как есть. */
  producerFull?: string | null;
  inn: string | null;
  region: string | null;
  /**
   * Регион выведен из ИНН, а не взят из реестра.
   *
   * В выгрузке ПП №719 адрес не заполнен ни у одной записи, поэтому регион
   * определяется по коду субъекта в ИНН. Это место учёта организации, а не
   * обязательно место производства, — и подавать его стоит как подсказку.
   */
  regionFromInn?: boolean;
  /** Название продукта так, как оно записано в реестре. */
  product: string;
  okpd2: string | null;
  /** Расшифровка кода по классификатору: «Полимеры этилена в первичных формах». */
  okpd2Name?: string | null;
  /** Код товарной номенклатуры и его расшифровка. */
  tnved?: string | null;
  tnvedName?: string | null;
  tnvedPath?: string | null;
  status: "active" | "archived";
  statusLabel: string;
  regNumber: string | null;
  regDate: string | null;
  /** Когда запись реестра прекратила действовать. */
  endedAt?: string | null;
  url: string | null;
}

/**
 * Один из кодов записей реестра, найденных для продукта, — с названием по
 * классификатору и числом записей под ним. Записи одного продукта стоят под
 * разными кодами; карточка показывает самый подходящий, а этим списком
 * раскрывает «у остальных записей ещё кодов: n».
 */
export interface IndustryCodeVariant {
  code: string;
  name: string | null;
  /** Сколько записей реестра стоят под этим кодом. */
  count: number;
  /** ОКПД2: название относится к коду целиком, а не к группе над ним. */
  exact?: boolean;
  /** ОКПД2: кода нет в действующем классификаторе. */
  retired?: boolean;
  /** ТН ВЭД: полная цепочка названий — у позиции имя бывает «прочие». */
  path?: string | null;
}

/** Код, вписанный человеком, — как его прочёл классификатор. */
export interface DescribedCode {
  /** Код как он записывается: ОКПД2 с точками, ТН ВЭД цифрами. */
  code: string;
  /** ТН ВЭД по группам: «2933 71 000 0». */
  formatted?: string;
  name: string | null;
  path?: string | null;
  /** Название относится к коду целиком, а не к группе над ним. */
  exact: boolean;
  /** Такой код в классификаторе есть. */
  known: boolean;
  retired?: boolean;
}

export interface IndustryProductInfo {
  found: boolean;
  match: IndustryMatch | null;
  /**
   * Под каким названием запись нашлась, если не под спрошенным.
   *
   * По «ПЭВД» в реестре нет ничего, по «полиэтилену высокого давления» —
   * есть. Показать это стоит: иначе непонятно, почему на одно название
   * приехали записи про другое.
   */
  matchedAs?: string | null;
  /** Каноническое название вещества по справочнику синонимов. */
  canon?: string | null;
  /**
   * Номер CAS вещества, если справочник его знает.
   *
   * Единственный по-настоящему международный идентификатор в наших данных:
   * по нему вещество проверяется в любом химическом источнике. ОКПД2 и
   * ТН ВЭД — коды товарных КАТЕГОРИЙ, а не веществ, и путать их нельзя.
   * Факт справочника, а не реестра: есть и у вещества, которого в ГИСП нет.
   */
  cas?: string | null;
  /**
   * Категория классификатора ОКПД2 — по НАЗВАНИЮ вещества, без реестра.
   *
   * Приходит, когда записи в реестре нет. Классификатор и реестр — разные
   * вещи: код категории существует всегда, а запись появляется, только когда
   * завод заявил продукцию на подтверждение происхождения. Бензол в ОКПД2
   * есть, а в реестре ПП №719 его нет, и без этой строки карточка выглядела
   * так, будто мы просто не справились с поиском.
   */
  category?: { code: string; name: string } | null;
  /**
   * Продукт ещё не назван — на нём подпись-заготовка («Новый продукт»).
   *
   * Реестр про такое не спрашивали вовсе, поэтому «записи нет» здесь было бы
   * неправдой: мы не искали. Отличать важно — причина у пустой карточки
   * совсем другая, и человеку надо не читать про охват реестра, а вписать
   * название.
   */
  placeholder?: boolean;
  /** Строк реестра (один производитель может иметь их несколько). */
  entryCount: number;
  producerCount: number;
  regionCount: number;
  status: "active" | "archived" | null;
  okpd2: string | null;
  okpd2Name?: string | null;
  /**
   * Название относится к коду целиком, а не к группе над ним.
   *
   * Справочник классификатора у нас был шестизначным, а коды реестра длиннее —
   * подпись всегда была «группа такая-то». Со свежей выгрузкой у большинства
   * кодов появляется собственное название, и подписывать его группой уже
   * неправда.
   */
  okpd2NameExact?: boolean;
  /**
   * Кода нет в действующем классификаторе.
   *
   * Выгрузка ГИСП несёт код, присвоенный записи при регистрации, а
   * классификатор с тех пор менялся: обобщённый код вида «…000» исчезает,
   * когда группу расписывают подробнее. Ошибкой записи это не делает, но
   * искать такой код в классификаторе бесполезно, и сказать об этом надо.
   */
  okpd2Retired?: boolean;
  /**
   * Код записей реестра, когда сервер уточнил его по классификатору (okpd2 —
   * уже уточнённый). Заявители ставят код категории: у «Капролактама» в
   * реестре 20.14.52.110 «Соединения гетероциклические…», а позиция
   * «Капролактам» под ней — 20.14.52.111. null — код взят из реестра как есть.
   */
  okpd2Registry?: string | null;
  /** У скольких из найденных записей именно этот код. */
  okpd2Share?: number;
  /** Сколько ещё разных кодов у остальных записей. */
  okpd2Others?: number;
  /** Все коды записей, первым — выбранный (okpd2Registry или okpd2). */
  okpd2Codes?: IndustryCodeVariant[];
  tnved?: string | null;
  tnvedName?: string | null;
  /**
   * Цепочка названий ТН ВЭД сверху вниз: у позиции имя бывает «прочие», и
   * что это, видно только по уровням над ней (см. tnvedTitle).
   */
  tnvedPath?: string | null;
  /** Сколько ещё разных кодов ТН ВЭД у остальных записей. */
  tnvedOthers?: number;
  /** Все коды ТН ВЭД записей, первым — выбранный. */
  tnvedCodes?: IndustryCodeVariant[];
  /**
   * Позиция ТН ВЭД по НАЗВАНИЮ вещества — по классификатору, без реестра
   * (группы 28–29: там названия — вещества). Показывается, когда кода из
   * записей реестра нет, с пометкой «по классификатору». Идентификатором не
   * служит: под одним кодом бывают десятки веществ.
   */
  tnvedCategory?: { code: string; name: string } | null;
  /**
   * Вещество нашлось только в составе препарата: «ТОРНАДО, ВР (360 г/л
   * глифосата к-ты)». Присутствием в реестре это считается, но ОКПД2 у такой
   * записи пестицидный, а не глифосатный, и говорить об этом надо вслух.
   */
  viaFormulation?: boolean;
  /** Сколько записей отбор отбросил как «слово попало в чужое название». */
  rejected?: number;
  producers: IndustryProducer[];
}

export interface IndustryLookupResponse {
  success: boolean;
  /** false — база реестра на сервере не подключена. */
  ready: boolean;
  reason?: string;
  /** Дата, на которую актуальна выгрузка. */
  actualAt?: string | null;
  results: Record<string, IndustryProductInfo>;
}

export interface IndustryStatus {
  ready: boolean;
  reason?: string;
  entries?: number;
  products?: number;
  producers?: number;
  actualAt?: string | null;
  /** Справочник синонимов: сколько веществ и написаний прочитано. */
  synonyms?: {
    ready: boolean;
    substances: number;
    spellings: number;
    /** Одно написание у двух веществ — сервер их не разрешает молча. */
    conflicts: { spelling: string; kept: string; ignored: string }[];
  };
}

/** Что справочник знает о названии. null — не знает ничего. */
export interface ProductIdentity {
  /** Каноническое название — оно и становится идентификатором продукта. */
  id: string;
  canon: string;
  /** Совпало само каноническое название, а не синоним. */
  exact: boolean;
}

export interface IdentifyResponse {
  success: boolean;
  /** false — справочник на сервере не прочитан. */
  ready: boolean;
  results: Record<string, ProductIdentity | null>;
}

const base = () => import.meta.env.VITE_API_URL;

export async function fetchIndustryStatus(): Promise<IndustryStatus> {
  const { data } = await axios.get(`${base()}/industry/status`);
  return data;
}

export async function lookupIndustry(
  products: string[],
): Promise<IndustryLookupResponse> {
  const { data } = await axios.post(`${base()}/industry/lookup`, { products });
  return data;
}

/**
 * Прочитать код, вписанный человеком: формат и название по классификатору.
 * null — код записан не по формату; undefined — его не спрашивали.
 */
export async function describeCodes(codes: {
  okpd2?: string;
  tnved?: string;
}): Promise<{ okpd2?: DescribedCode | null; tnved?: DescribedCode | null }> {
  const { data } = await axios.post(`${base()}/industry/codes`, codes);
  return { okpd2: data?.okpd2, tnved: data?.tnved };
}

/**
 * Опознать продукты по справочнику синонимов.
 *
 * Отдельно от поиска по реестру: узнать, что «ИПБ» и «Кумол» — одно вещество,
 * можно и тогда, когда записи в ГИСП нет вовсе. Схлопывание узлов от реестра
 * не зависит.
 */
export async function identifyProducts(
  products: string[],
): Promise<IdentifyResponse> {
  const { data } = await axios.post(`${base()}/industry/identify`, { products });
  return data;
}
