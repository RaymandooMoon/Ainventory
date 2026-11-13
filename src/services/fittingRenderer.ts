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
 * Calibrated directly against the 8-head 2.5D Studio Fashion Model (`800x1200`, `top: 1.5%`, `height: 86%`)
 * so tops, coats, trousers, skirts, shoes, headwear, and bags dress naturally centered on the body.
 */
export class Studio25DFittingRenderer implements FittingRenderer {
  readonly id = 'studio-25d-renderer-v2';
  readonly mode = '2.5d-studio' as const;

  async render(request: FittingRenderRequest): Promise<FittingRenderResult> {
    const isDark = request.theme === 'dark';
    const slots = request.slots || {};
    const hasOuter = Boolean(slots.outer);

    const layers: Studio25DLayer[] = [];

    if (slots.bottom) {
      const bSub = String(slots.bottom.subcategory || '').toLowerCase();
      const bName = String(slots.bottom.name || '');
      const isSkirtOrShorts =
        bSub === 'skirt' ||
        bSub === 'shorts' ||
        /스커트|치마|쇼츠|반바지/.test(bName);

      layers.push({
        slotKey: 'bottom',
        slotLabel: 'Bottoms',
        garment: slots.bottom,
        xPct: 50,
        yPct: isSkirtOrShorts ? 50.0 : 56.5,
        widthPct: isSkirtOrShorts ? 38 : 48,
        zIndex: 20,
        rotationDeg: 0,
        parallaxDepth: 0.5,
        shadowBlurPx: 18,
        shadowOffsetY: 10,
      });
    }

    if (slots.shoes) {
      layers.push({
        slotKey: 'shoes',
        slotLabel: 'Shoes',
        garment: slots.shoes,
        xPct: 50,
        yPct: 79.0,
        widthPct: 21.5,
        zIndex: 25,
        rotationDeg: 0,
        parallaxDepth: 0.42,
        shadowBlurPx: 16,
        shadowOffsetY: 8,
      });
    }

    if (slots.top) {
      const tCat = String(slots.top.category || '').toLowerCase();
      const tSub = String(slots.top.subcategory || '').toLowerCase();
      const isDress = tCat === 'dress' || tCat === 'onepiece' || tSub === 'dress' || tSub === 'onepiece';

      layers.push({
        slotKey: 'top',
        slotLabel: 'Tops',
        garment: slots.top,
        xPct: 50,
        yPct: isDress ? 44.5 : hasOuter ? 28.4 : 30.8,
        widthPct: isDress ? 47 : hasOuter ? 30.5 : 46.0,
        zIndex: 30,
        rotationDeg: 0,
        parallaxDepth: 0.68,
        shadowBlurPx: 20,
        shadowOffsetY: 11,
      });
    }

    if (slots.outer) {
      layers.push({
        slotKey: 'outer',
        slotLabel: 'Outerwear',
        garment: slots.outer,
        xPct: 50,
        yPct: 30.0,
        widthPct: 48.5,
        zIndex: 40,
        rotationDeg: 0,
        parallaxDepth: 0.85,
        shadowBlurPx: 24,
        shadowOffsetY: 13,
      });
    }

    if (slots.accessory) {
      const accSub = String(slots.accessory.subcategory || '').toLowerCase();
      const accCat = String(slots.accessory.category || '').toLowerCase();
      const accName = String(slots.accessory.name || '');

      const isHeadwear =
        accCat === 'headwear' ||
        accSub === 'cap' ||
        accSub === 'beanie' ||
        accSub === 'beret' ||
        accSub === 'bucket_hat' ||
        /볼캡|비니|베레모|모자|버킷햇/.test(accName);

      const isNeckwear =
        !isHeadwear &&
        (accCat === 'neckwear' ||
          accSub === 'scarf' ||
          accSub === 'muffler' ||
          accSub === 'necktie' ||
          /머플러|스카프|넥타이|타이/.test(accName));

      layers.push({
        slotKey: 'accessory',
        slotLabel: 'Accessories',
        garment: slots.accessory,
        xPct: isHeadwear ? 50 : isNeckwear ? 61.5 : 76.5,
        yPct: isHeadwear ? 6.8 : isNeckwear ? 25.5 : 55.5,
        widthPct: isHeadwear ? 14 : isNeckwear ? 16.5 : 19.5,
        zIndex: isHeadwear ? 46 : 45,
        rotationDeg: isNeckwear ? 3 : 0,
        parallaxDepth: 0.95,
        shadowBlurPx: 18,
        shadowOffsetY: 10,
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
              'radial-gradient(circle at 48% 24%, #FFFFFF 0%, #F7F8FC 60%, #EEF0F6 100%)',
            keyLightGlow:
              'radial-gradient(ellipse at 38% 18%, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0) 68%)',
            floorShadowColor: 'rgba(15, 23, 42, 0.11)',
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
