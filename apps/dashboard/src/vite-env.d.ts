/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the deployed API. Empty in local dev, where Vite proxies /api. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
