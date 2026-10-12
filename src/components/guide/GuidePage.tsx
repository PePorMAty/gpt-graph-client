import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import guide from "../../docs/user-guide.md?raw";
import md from "../markdown-editor/MarkdownEditor.module.css";
import { ScreenDiagram } from "./ScreenDiagram";
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

/** Картинки-схемы руководства: в тексте — «![подпись](screen-diagram)». */
const DIAGRAMS: Record<string, FC> = { "screen-diagram": ScreenDiagram };

/** Раздел текущий, когда его заголовок поднялся выше этой линии от верха страницы. */
const SPY_LINE = 120;

/**
 * Руководство пользователя — отдельной страницей (/guide), открывается из
 * меню «?». Текст — src/docs/user-guide.md.
 *
 * Приложение занимает ровно экран (у body overflow: hidden), поэтому
 * страница прокручивается сама — своим контейнером. Оглавление слева
 * подсвечивает текущий раздел: тот, по которому щёлкнули, или тот, до
 * которого докрутили.
 */
export const GuidePage: FC = () => {
  const pageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => anchor(SECTIONS[0] ?? ""));
  // Щелчок по оглавлению: раздел выбран человеком, и прокрутка к нему его
  // не перебивает (короткий последний раздел не доезжает до верха). Снова
  // следим за прокруткой, как только человек крутит сам.
  const picked = useRef(false);

  const spy = useCallback(() => {
    const page = pageRef.current;
    if (!page || picked.current) return;
    const top = page.getBoundingClientRect().top;
    const heads = SECTIONS.map((s) => document.getElementById(anchor(s))).filter(
      (h): h is HTMLElement => Boolean(h),
    );
    if (!heads.length) return;
    // Докрутили до конца — текущий последний: выше линии он может не подняться.
    const atEnd = page.scrollTop + page.clientHeight >= page.scrollHeight - 2;
    const passed = heads.filter((h) => h.getBoundingClientRect().top - top <= SPY_LINE);
    const current = atEnd && page.scrollTop > 0 ? heads.at(-1) : (passed.at(-1) ?? heads[0]);
    if (current) setActive(current.id);
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = TITLE;
    // Клавиши прокрутки (стрелки, PageDown, пробел) — сразу, без щелчка.
    pageRef.current?.focus({ preventScroll: true });
    // Ссылка с якорем (#материальный-баланс) — сразу к разделу; так же,
    // если якорь сменили на открытой странице.
    const toHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = hash ? document.getElementById(hash) : null;
      if (!target) return;
      target.scrollIntoView();
      setActive(hash);
      picked.current = true;
    };
    toHash();
    window.addEventListener("hashchange", toHash);
    return () => {
      document.title = prev;
      window.removeEventListener("hashchange", toHash);
    };
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(spy);
    };
    const release = () => {
      picked.current = false;
    };
    page.addEventListener("scroll", onScroll, { passive: true });
    page.addEventListener("wheel", release, { passive: true });
    page.addEventListener("touchstart", release, { passive: true });
    page.addEventListener("keydown", release);
    // Полосу прокрутки тянут мышью; щелчок по оглавлению выберет раздел заново.
    page.addEventListener("pointerdown", release);
    spy();
    return () => {
      cancelAnimationFrame(frame);
      page.removeEventListener("scroll", onScroll);
      page.removeEventListener("wheel", release);
      page.removeEventListener("touchstart", release);
      page.removeEventListener("keydown", release);
      page.removeEventListener("pointerdown", release);
    };
  }, [spy]);

  const pick = (id: string) => {
    picked.current = true;
    setActive(id);
  };

  return (
    <div className={styles.page} ref={pageRef} tabIndex={-1}>
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
            {SECTIONS.map((s) => {
              const id = anchor(s);
              const on = id === active;
              return (
                <li key={s}>
                  <a
                    href={`#${id}`}
                    className={on ? styles.tocActive : undefined}
                    aria-current={on ? "location" : undefined}
                    onClick={() => pick(id)}
                  >
                    {s}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <article className={`${md.markdownBody} ${styles.article}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => <h2 id={anchor(plain(children))}>{children}</h2>,
              img: ({ src, alt }) => {
                const Diagram = typeof src === "string" ? DIAGRAMS[src] : undefined;
                return Diagram ? (
                  <span className={styles.diagram}>
                    <Diagram />
                  </span>
                ) : (
                  <img src={src} alt={alt ?? ""} />
                );
              },
              a: ({ node: _node, href, ...props }) =>
                href?.startsWith("#") ? (
                  <a href={href} {...props} />
                ) : (
                  <a href={href} {...props} target="_blank" rel="noreferrer noopener" />
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
