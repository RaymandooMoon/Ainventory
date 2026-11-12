import {
  type GarmentRecord,
  type WardrobeCategoryKey,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';

export type FittingSlotKey = WardrobeCategoryKey;

export interface FittingSlotDefinition {
  key: FittingSlotKey;
  label: 'Outerwear' | 'Tops' | 'Bottoms' | 'Shoes' | 'Accessories';
}

export const FITTING_SLOTS: readonly FittingSlotDefinition[] = [
  { key: 'outer', label: 'Outerwear' },
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' },
] as const;

export type FittingSlotAssignments = Partial<Record<FittingSlotKey, GarmentRecord | null>>;

export interface Studio25DLayer {
  slotKey: FittingSlotKey;
  slotLabel: string;
  garment: GarmentRecord;
  /** Center X percentage (0..100) on the 2.5D studio canvas */
  xPct: number;
  /** Center Y percentage (0..100) on the 2.5D studio canvas */
  yPct: number;
  /** Width percentage relative to studio stage */
  widthPct: number;
  zIndex: number;
  rotationDeg: number;
  parallaxDepth: number;
  shadowBlurPx: number;
  shadowOffsetY: number;
}

export interface FittingRenderRequest {
  slots: FittingSlotAssignments;
  theme?: 'light' | 'dark';
  personReferenceUrl?: string;
}

export interface FittingRenderResult {
  mode: '2.5d-studio' | 'ai-vton';
  rendererId: string;
  layers: Studio25DLayer[];
  /** Populated when an AI Virtual Try-On (VTON) image generation API returns a synthesized try-on frame */
  compositeImageUrl: string | null;
  lighting: {
    backdropGradient: string;
    keyLightGlow: string;
    floorShadowColor: string;
  };
  vtonReady: boolean;
}

export interface FittingRenderer {
  readonly id: string;
  readonly mode: '2.5d-studio' | 'ai-vton';
  render(request: FittingRenderRequest): Promise<FittingRenderResult>;
}

export function mapGarmentToFittingSlot(garment?: Partial<GarmentRecord> | null): FittingSlotKey {
  if (!garment) return 'top';
  return normalizeWardrobeCategoryKey(garment.category);
}

/**
 * Default 2.5D Studio Canvas Fitting Renderer:
 * Computes calibrated spatial layering, soft top-left studio illumination,
 * depth parallax weights, and grounded floor shadows matching the 2.5D reference aesthetic.
 */
export class Studio25DFittingRenderer implements FittingRenderer {
  readonly id = 'studio-25d-renderer-v1';
  readonly mode = '2.5d-studio' as const;

  async render(request: FittingRenderRequest): Promise<FittingRenderResult> {
    const isDark = request.theme === 'dark';
    const slots = request.slots || {};
    const hasOuter = Boolean(slots.outer);
    const hasTop = Boolean(slots.top);

    const layers: Studio25DLayer[] = [];

    if (slots.bottom) {
      layers.push({
        slotKey: 'bottom',
        slotLabel: 'Bottoms',
        garment: slots.bottom,
        xPct: 50,
        yPct: 60.5,
        widthPct: 39,
        zIndex: 20,
        rotationDeg: 0,
        parallaxDepth: 0.55,
        shadowBlurPx: 22,
        shadowOffsetY: 12,
      });
    }

    if (slots.top) {
      layers.push({
        slotKey: 'top',
        slotLabel: 'Tops',
        garment: slots.top,
        xPct: hasOuter ? 44 : 50,
        yPct: 31.5,
        widthPct: hasOuter ? 36 : 41,
        zIndex: 30,
        rotationDeg: hasOuter ? -2.5 : 0,
        parallaxDepth: 0.75,
        shadowBlurPx: 24,
        shadowOffsetY: 13,
      });
    }

    if (slots.outer) {
      layers.push({
        slotKey: 'outer',
        slotLabel: 'Outerwear',
        garment: slots.outer,
        xPct: hasTop ? 56.5 : 50,
        yPct: 33,
        widthPct: 44,
        zIndex: 40,
        rotationDeg: hasTop ? 2.5 : 0,
        parallaxDepth: 1.0,
        shadowBlurPx: 28,
        shadowOffsetY: 16,
      });
    }

    if (slots.shoes) {
      layers.push({
        slotKey: 'shoes',
        slotLabel: 'Shoes',
        garment: slots.shoes,
        xPct: 50,
        yPct: 85.5,
        widthPct: 29,
        zIndex: 25,
        rotationDeg: 0,
        parallaxDepth: 0.45,
        shadowBlurPx: 18,
        shadowOffsetY: 9,
      });
    }

    if (slots.accessory) {
      layers.push({
        slotKey: 'accessory',
        slotLabel: 'Accessories',
        garment: slots.accessory,
        xPct: 75.5,
        yPct: 57,
        widthPct: 24,
        zIndex: 45,
        rotationDeg: 3,
        parallaxDepth: 1.15,
        shadowBlurPx: 22,
        shadowOffsetY: 14,
      });
    }

    layers.sort((a, b) => a.zIndex - b.zIndex);

    return {
      mode: '2.5d-studio',
      rendererId: this.id,
      layers,
      compositeImageUrl: null,
      lighting: isDark
        ? {
            backdropGradient:
              'radial-gradient(circle at 46% 24%, #2B2E37 0%, #1B1D24 52%, #111216 100%)',
            keyLightGlow:
              'radial-gradient(ellipse at 36% 18%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 64%)',
            floorShadowColor: 'rgba(0, 0, 0, 0.56)',
          }
        : {
            backdropGradient:
              'radial-gradient(circle at 46% 24%, #FFFFFF 0%, #F3F4F7 56%, #E6E8EE 100%)',
            keyLightGlow:
              'radial-gradient(ellipse at 36% 18%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 66%)',
            floorShadowColor: 'rgba(15, 23, 42, 0.16)',
          },
      vtonReady: Boolean(import.meta.env?.VITE_VTON_API_URL),
    };
  }
}

/**
 * Plug-and-Play AI Virtual Try-On (VTON) API Fitting Renderer:
 * Connects directly to an external VTON image synthesis API (`VITE_VTON_API_URL` or custom provider)
 * without requiring any UI changes in `OutfitStudioView` or `Studio25DCanvas`.
 */
export class VtonApiFittingRenderer implements FittingRenderer {
  readonly id = 'vton-api-renderer-v1';
  readonly mode = 'ai-vton' as const;
  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly studioFallback = new Studio25DFittingRenderer();

  constructor(endpointUrl: string, apiKey = '') {
    this.endpointUrl = endpointUrl;
    this.apiKey = apiKey;
  }

  async render(request: FittingRenderRequest): Promise<FittingRenderResult> {
    const baseResult = await this.studioFallback.render(request);
    if (!this.endpointUrl || baseResult.layers.length === 0) {
      return baseResult;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const serializedSlots = Object.fromEntries(
        Object.entries(request.slots)
          .filter(([, item]) => Boolean(item))
          .map(([slot, item]) => [
            slot,
            {
              id: item!.id,
              name: item!.name,
              category: item!.category,
              image_url: item!.image_url,
              color_hex: item!.color_hex,
            },
          ])
      );

      const res = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slots: serializedSlots,
          personReferenceUrl: request.personReferenceUrl || null,
          theme: request.theme || 'light',
        }),
      });

      if (!res.ok) {
        throw new Error(`VTON API failed (${res.status})`);
      }

      const data = (await res.json()) as { compositeImageUrl?: string; imageUrl?: string };
      const compositeUrl = data.compositeImageUrl || data.imageUrl || null;
      if (!compositeUrl) {
        return baseResult;
      }

      return {
        ...baseResult,
        mode: 'ai-vton',
        rendererId: this.id,
        compositeImageUrl: compositeUrl,
        vtonReady: true,
      };
    } catch {
      return baseResult;
    }
  }
}

const vtonEndpoint = String(import.meta.env?.VITE_VTON_API_URL || '').trim();
const vtonApiKey = String(import.meta.env?.VITE_VTON_API_KEY || '').trim();

let activeFittingRenderer: FittingRenderer = vtonEndpoint
  ? new VtonApiFittingRenderer(vtonEndpoint, vtonApiKey)
  : new Studio25DFittingRenderer();

export function registerFittingRenderer(renderer: FittingRenderer): void {
  activeFittingRenderer = renderer;
}

export function getActiveFittingRenderer(): FittingRenderer {
  return activeFittingRenderer;
}

export function renderOutfitFitting(request: FittingRenderRequest): Promise<FittingRenderResult> {
  return activeFittingRenderer.render(request);
}
