import { useEffect, type FC, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import guide from "../../docs/user-guide.md?raw";
import md from "../markdown-editor/MarkdownEditor.module.css";
import styles from "./GuidePage.module.css";

/** Якорь раздела по заголовку: «Режим «Фокус»» → «режим-фокус». */
const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[«»"'.,:;!?()]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/** Текст заголовка из детей ReactMarkdown. */
const plain = (children: ReactNode): string =>
  Array.isArray(children)
    ? children.map(plain).join("")
    : typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";

/** Разделы руководства — заголовки второго уровня. */
const SECTIONS = guide
  .split(/\r?\n/)
  .filter((l) => l.startsWith("## "))
  .map((l) => l.slice(3).trim());

/** Текст без заголовка первого уровня: он — в шапке страницы. */
const BODY = guide.replace(/^# .*\r?\n/, "");
const TITLE = /^# (.*)$/m.exec(guide)?.[1] ?? "Руководство пользователя";

/**
 * Руководство пользователя — отдельной страницей (/guide). Открывается из
 * меню «?» в новой вкладке, поэтому граф на полотне остаётся как был.
 * Текст — src/docs/user-guide.md.
 */
export const GuidePage: FC = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = TITLE;
    // Ссылка с якорем (#материальный-баланс) — сразу к разделу.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{TITLE}</h1>
        <Link to="/" className={styles.back}>
          Открыть граф
        </Link>
      </header>
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Разделы руководства">
          <div className={styles.tocHead}>Разделы</div>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s}>
                <a href={`#${anchor(s)}`}>{s}</a>
              </li>
            ))}
          </ul>
        </nav>
        <article className={`${md.markdownBody} ${styles.article}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2 id={anchor(plain(children))}>{children}</h2>
              ),
              a: ({ node: _node, href, ...props }) =>
                href?.startsWith("#") ? (
                  <a href={href} {...props} />
                ) : (
                  <a
                    href={href}
                    {...props}
                    target="_blank"
                    rel="noreferrer noopener"
                  />
                ),
            }}
          >
            {BODY}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
};
