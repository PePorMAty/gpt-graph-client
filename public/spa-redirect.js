// Single Page Apps for GitHub Pages — восстановление пути из 404.html
// https://github.com/rafgraph/spa-github-pages
//
// Отдельным файлом, а не встроенным в index.html: политика безопасности
// сайта (CSP) разрешает только скрипты со своего домена.
(function (l) {
  if (l.search[1] === "/") {
    var decoded = l.search
      .slice(1)
      .split("&")
      .map(function (s) {
        return s.replace(/~and~/g, "&");
      })
      .join("?");
    window.history.replaceState(
      null,
      null,
      l.pathname.slice(0, -1) + decoded + l.hash
    );
  }
})(window.location);
