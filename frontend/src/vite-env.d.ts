/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin; empty uses Vite dev proxy to FastAPI */
  readonly VITE_API_URL: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
