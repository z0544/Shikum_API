/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
