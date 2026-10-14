import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
//
// Адрес приложения на сайте. По умолчанию — «/gpt-graph-client/», как на
// GitHub Pages: его сборка VITE_BASE не задаёт. Сборка для своего домена
// (deploy/deploy-site.sh) задаёт VITE_BASE=/ — приложение по корню, API
// рядом, по /api.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: loadEnv(mode, process.cwd()).VITE_BASE || "/gpt-graph-client/",
}));
