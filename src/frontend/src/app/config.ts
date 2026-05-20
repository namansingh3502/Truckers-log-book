interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const rawApiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const config = {
  apiUrl: rawApiUrl.replace(/\/$/, ''),
} as const;
