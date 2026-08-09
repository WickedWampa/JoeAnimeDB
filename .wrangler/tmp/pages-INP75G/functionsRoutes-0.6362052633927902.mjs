import { onRequestGet as __api_watchmode_js_onRequestGet } from "C:\\Users\\joe\\Downloads\\JoeAnimeDB-4.3.1-SQLite-Foundation\\JoeAnimeDB-4.3-Repository-Refactor\\functions\\api\\watchmode.js"
import { onRequestOptions as __api_watchmode_js_onRequestOptions } from "C:\\Users\\joe\\Downloads\\JoeAnimeDB-4.3.1-SQLite-Foundation\\JoeAnimeDB-4.3-Repository-Refactor\\functions\\api\\watchmode.js"

export const routes = [
    {
      routePath: "/api/watchmode",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_watchmode_js_onRequestGet],
    },
  {
      routePath: "/api/watchmode",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_watchmode_js_onRequestOptions],
    },
  ]