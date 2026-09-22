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
  status: "active" | "archived";
  statusLabel: string;
  regNumber: string | null;
  regDate: string | null;
  /** Когда запись реестра прекратила действовать. */
  endedAt?: string | null;
  url: string | null;
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
  /** У скольких из найденных записей именно этот код. */
  okpd2Share?: number;
  /** Сколько ещё разных кодов у остальных записей. */
  okpd2Others?: number;
  tnved?: string | null;
  tnvedName?: string | null;
  /** Сколько ещё разных кодов ТН ВЭД у остальных записей. */
  tnvedOthers?: number;
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
