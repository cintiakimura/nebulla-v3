/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** Must match server `GUARDIAN_REPORT_KEY` for silent error reports. */
  readonly VITE_GUARDIAN_REPORT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
