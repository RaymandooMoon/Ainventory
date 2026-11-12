/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_ALLOW_DEV_OTP_PREVIEW?: string;
    readonly VITE_BG_REMOVAL_API_URL?: string;
    readonly VITE_BG_REMOVAL_API_KEY?: string;
    readonly VITE_VTON_API_URL?: string;
    readonly VITE_VTON_API_KEY?: string;
  }
}

export {};
