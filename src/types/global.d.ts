/// <reference types="vite/client" />
import type { Carbon3DTelemetry, Mannequin3DEngineHandle } from '../contracts/carbonDesignContract.ts';

declare global {
  interface Window {
    __MANNEQUIN_3D_ENGINE__?: Mannequin3DEngineHandle;
    __ainventory3DEngine?: Mannequin3DEngineHandle;
    __MANNEQUIN_3D_TELEMETRY__?: Carbon3DTelemetry;
  }

  interface HTMLCanvasElement {
    __mannequinEngine?: Mannequin3DEngineHandle;
  }

  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_ALLOW_DEV_OTP_PREVIEW?: string;
  }
}

export {};
