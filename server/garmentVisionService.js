import dns from 'node:dns/promises';
import net from 'node:net';
import { ThinkingLevel, Type } from '@google/genai';
import { getServerGeminiClient } from './geminiClient.js';
import { decodeValidatedDataUrl, detectImageMimeType } from './vtonService.js';

const MAX_ANALYZE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_HTML_BYTES = 400 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 4 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 5500;

const ALLOWED_CATEGORIES = new Set(['top', 'bottom', 'outer', 'shoes', 'accessory', 'jewelry']);
const ALLOWED_MATERIALS = new Set([
  'Corduroy',
  'Cotton',
  'Denim',
  'Wool',
  'Cashmere',
  'Knit',
  'Linen',
  'Nylon',
  'Leather',
  'Suede',
  'Silk',
  'Fleece',
  'Polyester',
  'Fabric',
  '18K Yellow Gold',
  '925 Sterling Silver',
  'Sculptural Bronze',
  'Platinum & Pearl',
]);
const ALLOWED_FITS = new Set([
  'wide',
  'relaxed',
  'straight',
  'regular',
  'slim',
  'oversized',
  'cropped',
]);
const ALLOWED_TEXTURES = new Set(['soft', 'structured', 'crisp', 'plush', 'silky', 'airy']);
const ALLOWED_THICKNESS = new Set(['thin', 'medium', 'thick']);
const ALLOWED_MOODS = new Set(['minimal', 'casual', 'smart', 'formal', 'street', 'sporty']);
const ALLOWED_FORMALITIES = new Set(['casual', 'smart', 'formal', 'sporty']);
const ALLOWED_SEASONS = new Set(['봄', '여름', '가을', '겨울']);

function normalizeHex(raw, fallback = '#3B3D42') {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  }
  return fallback;
}

function clampInt(val, min, max, fallback) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeMaterial(raw) {
  const val = String(raw || '').trim();
  if (ALLOWED_MATERIALS.has(val)) return val;
  const lower = val.toLowerCase();
  if (lower.includes('corduroy') || lower.includes('코듀로이') || lower.includes('골덴')) return 'Corduroy';
  if (lower.includes('denim') || lower.includes('데님') || lower.includes('jean')) return 'Denim';
  if (lower.includes('cashmere') || lower.includes('캐시미어')) return 'Cashmere';
  if (lower.includes('wool') || lower.includes('울') || lower.includes('모')) return 'Wool';
  if (lower.includes('knit') || lower.includes('니트')) return 'Knit';
  if (lower.includes('linen') || lower.includes('린넨') || lower.includes('마')) return 'Linen';
  if (lower.includes('nylon') || lower.includes('나일론') || lower.includes('gore') || lower.includes('tech')) return 'Nylon';
  if (lower.includes('suede') || lower.includes('스웨이드') || lower.includes('nubuck')) return 'Suede';
  if (lower.includes('leather') || lower.includes('가죽') || lower.includes('calf')) return 'Leather';
  if (lower.includes('silk') || lower.includes('실크') || lower.includes('satin')) return 'Silk';
  if (lower.includes('fleece') || lower.includes('플리스') || lower.includes('기모')) return 'Fleece';
  if (lower.includes('cotton') || lower.includes('면') || lower.includes('코튼') || lower.includes('chino')) return 'Cotton';
  if (lower.includes('poly') || lower.includes('폴리')) return 'Polyester';
  return 'Fabric';
}

function parseJsonLoose(rawText) {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // continue
      }
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * SSRF Guard: Checks if an IPv4/IPv6 address belongs to private, loopback, link-local, or reserved ranges.
 */
function isPrivateOrReservedIp(ip) {
  const addr = String(ip || '').trim().toLowerCase();
  if (!addr) return true;

  if (net.isIPv4(addr)) {
    const octets = addr.split('.').map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(addr)) {
    if (addr === '::' || addr === '::1') return true;
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true;
    if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) {
      return true;
    }
    if (addr.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(addr.slice(7));
    }
    return false;
  }

  return true;
}

/**
 * Validates that an external URL is strictly HTTPS on a public, non-private hostname.
 */
async function validateSafePublicHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    net.isIP(host) !== 0
  ) {
    return null;
  }
  if (parsed.port && parsed.port !== '443') return null;

  try {
    const records = await dns.lookup(host, { all: true });
    if (!Array.isArray(records) || records.length === 0) return null;
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return null;
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function safeExternalFetch(rawUrl, { maxBytes, acceptHeader, maxRedirects = 2 }) {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const safeUrl = await validateSafePublicHttpsUrl(currentUrl);
    if (!safeUrl) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(safeUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AinventoryBot/1.0)',
          Accept: acceptHeader,
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        clearTimeout(timer);
        if (!loc || hop === maxRedirects) return null;
        currentUrl = new URL(loc, safeUrl).toString();
        continue;
      }

      if (!res.ok) {
        clearTimeout(timer);
        return null;
      }

      const contentLen = Number(res.headers.get('content-length') || 0);
      if (Number.isFinite(contentLen) && contentLen > maxBytes) {
        clearTimeout(timer);
        return null;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        clearTimeout(timer);
        return null;
      }
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          reader.cancel().catch(() => {});
          clearTimeout(timer);
          return null;
        }
        chunks.push(Buffer.from(value));
      }
      clearTimeout(timer);
      return {
        finalUrl: safeUrl,
        contentType: String(res.headers.get('content-type') || '').toLowerCase(),
        buffer: Buffer.concat(chunks),
      };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }
  return null;
}

function extractProductImageUrlsFromHtml(html, baseUrl) {
  const candidates = [];
  const pushUrl = (raw) => {
    if (!raw || typeof raw !== 'string') return;
    const cleaned = raw.trim().replace(/&amp;/g, '&');
    if (!cleaned || cleaned.startsWith('data:')) return;
    try {
      const resolved = new URL(cleaned, baseUrl).toString();
      if (resolved.startsWith('https://') && !candidates.includes(resolved)) {
        candidates.push(resolved);
      }
    } catch {
      // ignore invalid URL
    }
  };

  // 1. JSON-LD Product image (usually highest fidelity studio packshot)
  const ldMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed];
      for (const node of nodes) {
        const typeVal = String(node?.['@type'] || '').toLowerCase();
        if (typeVal.includes('product')) {
          const img = node.image;
          if (typeof img === 'string') pushUrl(img);
          else if (Array.isArray(img)) {
            for (const entry of img.slice(0, 3)) {
              if (typeof entry === 'string') pushUrl(entry);
              else if (typeof entry?.url === 'string') pushUrl(entry.url);
            }
          } else if (typeof img?.url === 'string') {
            pushUrl(img.url);
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  // 2. OpenGraph / Twitter image meta tags
  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/gi,
  ];
  for (const re of metaPatterns) {
    for (const match of html.matchAll(re)) {
      pushUrl(match[1]);
    }
  }

  return candidates.slice(0, 5);
}

async function fetchVerifiedImageAsDataUrl(imageUrl) {
  const fetched = await safeExternalFetch(imageUrl, {
    maxBytes: MAX_REMOTE_IMAGE_BYTES,
    acceptHeader: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
    maxRedirects: 2,
  });
  if (!fetched || fetched.buffer.length < 1024) return null;
  const mime = detectImageMimeType(fetched.buffer);
  if (!mime) return null;
  return {
    dataUrl: `data:${mime};base64,${fetched.buffer.toString('base64')}`,
    sourceImageUrl: fetched.finalUrl,
    mimeType: mime,
  };
}

/**
 * 1) Multimodal Front + Back + Optional Neck/Care Tag Garment Analysis via Gemini 4 Hydrogen
 */
export async function analyzeGarmentPhotos({
  frontImage,
  backImage = null,
  tagImages = [],
  lang = 'ko',
}) {
  const ai = getServerGeminiClient();
  if (!ai) {
    const err = new Error('GEMINI_API_KEY가 설정되지 않아 AI 의류 분석을 실행할 수 없습니다.');
    err.status = 503;
    throw err;
  }

  const frontPart = frontImage ? decodeValidatedDataUrl(frontImage, MAX_ANALYZE_IMAGE_BYTES) : null;
  const backPart = backImage ? decodeValidatedDataUrl(backImage, MAX_ANALYZE_IMAGE_BYTES) : null;
  const validTags = (Array.isArray(tagImages) ? tagImages : [])
    .slice(0, 3)
    .map((img) => decodeValidatedDataUrl(img, MAX_ANALYZE_IMAGE_BYTES))
    .filter(Boolean);

  if (!frontPart && validTags.length === 0) {
    const err = new Error('유효한 앞면 의류 이미지 또는 라벨 이미지(JPEG/PNG/WebP, 5MB 이하)가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const parts = [
    {
      text: [
        'You are a precision luxury fashion archivist and digital wardrobe specialist.',
        'Analyze the attached garment photographs carefully:',
        frontPart
          ? '- Image 1 is the FRONT view of the garment.'
          : '- Front view is not attached yet; rely on the attached NECK TAG / INTERNAL WASH CARE LABEL close-up(s) to identify brand, product/style code, fiber composition, size, and care instructions.',
        backPart ? '- The next image is the BACK view of the garment.' : '- Back view is not attached.',
        validTags.length > 0
          ? `- The remaining ${validTags.length} image(s) are NECK TAG / INTERNAL WASH CARE LABEL close-ups. Perform precision OCR for official brand name, sub-line, product/style/article/SKU code (품번/모델번호/RN/CA), exact fiber composition (소재 혼용률, e.g. 울 80%, 캐시미어 20%), size tag, and washing/care symbols.`
          : '- No tag close-up provided, but still inspect any visible brand/label text on the garment.',
        '',
        'CRITICAL RULES:',
        '1. IGNORE background floors (hardwood, tiles, beds, carpets), shadows, and any human feet/hands at the frame edges when determining the garment true color, category, and material.',
        '2. Detect construction details across BOTH front and back views: for pants/bottoms, carefully check whether the waistband is full elastic (고무줄 밴딩 -> belt_compatible=false), back-only semi-elastic (뒤밴딩), drawstring, or standard belt loops. Check rise and leg drape/length.',
        '3. Choose the MOST SPECIFIC material (e.g., if ribbed corduroy cotton, select "Corduroy", not generic "Fabric").',
        '4. Set background_has_clutter_or_body=true if the photo has wood grain/patterned floor, cluttered bed/room, or human feet/hands near the garment so our hybrid cutout pipeline knows to offer AI Studio refinement.',
        '5. If brand and/or product code is visible (luxury or SPA brand like Uniqlo, Zara, COS, Lemaire, Ralph Lauren, Musinsa Standard, Nike, etc.), set has_identifiable_product=true and craft a crisp web_search_query combining brand + style/product code.',
        '6. Carefully read all laundry care symbols and care text on any attached CARE LABEL (or infer safely from fabric like wool/cashmere/silk/denim/leather) to populate `care_profile`: wash_method (dry_clean_only | hand_wash | wool_delicate | machine_normal | spot_clean), water_temp_c (0 | 30 | 40 | 60), tumble_dry (allowed | low_heat | no_tumble_flat | no_tumble_hang), bleach (allowed | oxygen_only | no_bleach), iron (allowed | low_cloth | no_iron), color_bleed_risk (high | medium | low), color_group (white_light | dark_vivid | denim_indigo), and needs_laundry_net (boolean).',
        `7. Provide natural, concise Korean and English garment names (never filenames). Primary user language: ${lang === 'en' ? 'English' : 'Korean'}.`,
      ].join('\n'),
    },
  ];

  if (frontPart) {
    parts.push({
      inlineData: {
        mimeType: frontPart.mimeType,
        data: frontPart.base64Data,
      },
    });
  }

  if (backPart) {
    parts.push({
      inlineData: {
        mimeType: backPart.mimeType,
        data: backPart.base64Data,
      },
    });
  }
  for (const tagPart of validTags) {
    parts.push({
      inlineData: {
        mimeType: tagPart.mimeType,
        data: tagPart.base64Data,
      },
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name_ko: { type: Type.STRING, description: 'Natural Korean garment name, e.g. 차콜 와이드 코듀로이 밴딩 팬츠' },
          name_en: { type: Type.STRING, description: 'Natural English garment name, e.g. Charcoal Wide Corduroy Elastic Pants' },
          category: { type: Type.STRING, description: 'One of: top, bottom, outer, shoes, accessory, jewelry' },
          subcategory: { type: Type.STRING, description: 'Specific subtype, e.g. trousers, slacks, denim, knit, shirt, coat, sneakers, bag' },
          color_name: { type: Type.STRING, description: 'Korean true garment color name ignoring background, e.g. 차콜, 다크 브라운, 네이비' },
          color_hex: { type: Type.STRING, description: '6-digit hex color of the garment itself, e.g. #3B3D42' },
          material: {
            type: Type.STRING,
            description: 'One of: Corduroy, Cotton, Denim, Wool, Cashmere, Knit, Linen, Nylon, Leather, Suede, Silk, Fleece, Polyester, Fabric, 18K Yellow Gold, 925 Sterling Silver',
          },
          material_composition: { type: Type.STRING, description: 'Fiber composition from care tag if visible, e.g. 면 98%, 폴리우레탄 2%' },
          texture_feel: { type: Type.STRING, description: 'One of: soft, structured, crisp, plush, silky, airy' },
          fit: { type: Type.STRING, description: 'One of: wide, relaxed, straight, regular, slim, oversized, cropped' },
          seasons: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Korean seasons from: 봄, 여름, 가을, 겨울',
          },
          thickness: { type: Type.STRING, description: 'One of: thin, medium, thick' },
          min_temp: { type: Type.INTEGER, description: 'Recommended min temperature in Celsius' },
          max_temp: { type: Type.INTEGER, description: 'Recommended max temperature in Celsius' },
          water_resistant: { type: Type.BOOLEAN },
          formality: { type: Type.STRING, description: 'One of: casual, smart, formal, sporty' },
          style_mood: { type: Type.STRING, description: 'One of: minimal, casual, smart, formal, street, sporty' },
          brand: { type: Type.STRING, description: 'Brand name from tag/logo if visible, else empty string' },
          product_code: { type: Type.STRING, description: 'Product/style/article code from care/neck tag if visible, else empty string' },
          size: { type: Type.STRING, description: 'Size from tag if visible (e.g. M, L, 30, 100), else empty string' },
          care_tip_ko: { type: Type.STRING, description: 'Practical Korean washing & care tip based on material/care label' },
          care_tip_en: { type: Type.STRING, description: 'Practical English washing & care tip' },
          suggested_fit_note_ko: { type: Type.STRING, description: 'Helpful short Korean wearing/fit note inferred from front+back silhouette' },
          suggested_fit_note_en: { type: Type.STRING, description: 'Helpful short English wearing/fit note' },
          garment_details: {
            type: Type.OBJECT,
            properties: {
              waist_type: { type: Type.STRING, description: 'For bottoms: elastic, semi_elastic, belt_loops, drawstring, or empty' },
              belt_compatible: { type: Type.BOOLEAN, description: 'For bottoms: false if elastic/drawstring without belt loops' },
              rise: { type: Type.STRING, description: 'For bottoms: high, mid, low, or empty' },
              length_profile: { type: Type.STRING, description: 'For bottoms: cropped, ankle, full, long, or empty' },
              neckline: { type: Type.STRING, description: 'For tops: crew, v_neck, collar, turtle, open, or empty' },
              sleeve_length: { type: Type.STRING, description: 'For tops: sleeveless, short, half, long, or empty' },
              coat_length: { type: Type.STRING, description: 'For outer: cropped, hip, mid, long, or empty' },
              closure_type: { type: Type.STRING, description: 'For outer: single, double, zip, open, or empty' },
              heel_height: { type: Type.STRING, description: 'For shoes: flat, low, mid, high, or empty' },
              back_detail: { type: Type.STRING, description: 'Notable back detail observed from back photo (e.g. 투포켓, 백프린트, 뒷밴딩)' },
            },
          },
          care_profile: {
            type: Type.OBJECT,
            properties: {
              wash_method: {
                type: Type.STRING,
                description: 'One of: dry_clean_only, hand_wash, wool_delicate, machine_normal, spot_clean',
              },
              water_temp_c: {
                type: Type.INTEGER,
                description: 'Recommended max wash water temp in Celsius: 0 (no water), 30, 40, or 60',
              },
              tumble_dry: {
                type: Type.STRING,
                description: 'One of: allowed, low_heat, no_tumble_flat, no_tumble_hang',
              },
              bleach: {
                type: Type.STRING,
                description: 'One of: allowed, oxygen_only, no_bleach',
              },
              iron: {
                type: Type.STRING,
                description: 'One of: allowed, low_cloth, no_iron',
              },
              color_bleed_risk: {
                type: Type.STRING,
                description: 'One of: high, medium, low',
              },
              color_group: {
                type: Type.STRING,
                description: 'One of: white_light, dark_vivid, denim_indigo',
              },
              needs_laundry_net: {
                type: Type.BOOLEAN,
                description: 'True for knitwear, wool, lingerie, lace, or delicate weaves',
              },
            },
          },
          background_has_clutter_or_body: {
            type: Type.BOOLEAN,
            description: 'True if textured floor (wood/tile/bed), shadows, or human feet/hands appear in the photo',
          },
          background_reason: { type: Type.STRING, description: 'Brief explanation of background complexity if true' },
          has_identifiable_product: {
            type: Type.BOOLEAN,
            description: 'True if a real retail brand/product code or recognizable SPA/luxury item is detected for web search',
          },
          web_search_query: {
            type: Type.STRING,
            description: 'Focused search query combining brand + product code + garment name/color for official product lookup',
          },
        },
        required: [
          'name_ko',
          'name_en',
          'category',
          'subcategory',
          'color_name',
          'color_hex',
          'material',
          'fit',
          'seasons',
          'thickness',
        ],
      },
    },
  });

  const parsed = parseJsonLoose(response.text);
  if (!parsed || typeof parsed !== 'object') {
    const err = new Error('AI 의류 분석 결과를 파싱하지 못했습니다.');
    err.status = 502;
    throw err;
  }

  const category = ALLOWED_CATEGORIES.has(String(parsed.category || '').toLowerCase())
    ? String(parsed.category).toLowerCase()
    : 'top';
  const rawSeasons = Array.isArray(parsed.seasons)
    ? parsed.seasons.filter((s) => ALLOWED_SEASONS.has(s))
    : [];
  const seasons = rawSeasons.length > 0 ? [...new Set(rawSeasons)] : ['봄', '가을'];
  const thickness = ALLOWED_THICKNESS.has(parsed.thickness) ? parsed.thickness : 'medium';
  const fit = ALLOWED_FITS.has(parsed.fit) ? parsed.fit : 'regular';
  const textureFeel = ALLOWED_TEXTURES.has(parsed.texture_feel) ? parsed.texture_feel : 'soft';
  const styleMood = ALLOWED_MOODS.has(parsed.style_mood) ? parsed.style_mood : 'minimal';
  const formality = ALLOWED_FORMALITIES.has(parsed.formality) ? parsed.formality : 'smart';

  const rawDetails = parsed.garment_details && typeof parsed.garment_details === 'object'
    ? parsed.garment_details
    : {};
  const waistType = String(rawDetails.waist_type || '').trim();
  const inferredBeltCompat =
    typeof rawDetails.belt_compatible === 'boolean'
      ? rawDetails.belt_compatible
      : waistType === 'elastic' || waistType === 'drawstring'
        ? false
        : true;

  const rawCare = parsed.care_profile && typeof parsed.care_profile === 'object'
    ? parsed.care_profile
    : null;
  const ALLOWED_WASH = new Set(['dry_clean_only', 'hand_wash', 'wool_delicate', 'machine_normal', 'spot_clean']);
  const ALLOWED_TUMBLE = new Set(['allowed', 'low_heat', 'no_tumble_flat', 'no_tumble_hang']);
  const ALLOWED_BLEACH = new Set(['allowed', 'oxygen_only', 'no_bleach']);
  const ALLOWED_IRON = new Set(['allowed', 'low_cloth', 'no_iron']);
  const ALLOWED_BLEED = new Set(['high', 'medium', 'low']);
  const ALLOWED_CGROUP = new Set(['white_light', 'dark_vivid', 'denim_indigo']);
  const sanitizedCareProfile = rawCare
    ? {
        washMethod: ALLOWED_WASH.has(String(rawCare.wash_method || ''))
          ? String(rawCare.wash_method)
          : 'machine_normal',
        waterTempC: [0, 30, 40, 60].includes(Number(rawCare.water_temp_c))
          ? Number(rawCare.water_temp_c)
          : 30,
        tumbleDry: ALLOWED_TUMBLE.has(String(rawCare.tumble_dry || ''))
          ? String(rawCare.tumble_dry)
          : 'no_tumble_hang',
        bleach: ALLOWED_BLEACH.has(String(rawCare.bleach || ''))
          ? String(rawCare.bleach)
          : 'no_bleach',
        iron: ALLOWED_IRON.has(String(rawCare.iron || ''))
          ? String(rawCare.iron)
          : 'low_cloth',
        colorBleedRisk: ALLOWED_BLEED.has(String(rawCare.color_bleed_risk || ''))
          ? String(rawCare.color_bleed_risk)
          : 'medium',
        colorGroup: ALLOWED_CGROUP.has(String(rawCare.color_group || ''))
          ? String(rawCare.color_group)
          : 'dark_vivid',
        needsLaundryNet: Boolean(rawCare.needs_laundry_net),
        source: validTags.length > 0 ? 'care_label_scan' : 'inferred',
      }
    : null;

  return {
    name_ko: String(parsed.name_ko || '').trim().slice(0, 120) || '새 아이템',
    name_en: String(parsed.name_en || '').trim().slice(0, 120) || 'New Garment',
    category,
    subcategory: String(parsed.subcategory || '').trim().toLowerCase() || (category === 'bottom' ? 'trousers' : 'knit'),
    color_name: String(parsed.color_name || '차콜').trim().slice(0, 32),
    color_hex: normalizeHex(parsed.color_hex, '#3B3D42'),
    material: normalizeMaterial(parsed.material),
    material_composition: String(parsed.material_composition || '').trim().slice(0, 140),
    texture_feel: textureFeel,
    fit,
    seasons,
    thickness,
    min_temp: clampInt(parsed.min_temp, -20, 35, 8),
    max_temp: clampInt(parsed.max_temp, -10, 42, 22),
    water_resistant: Boolean(parsed.water_resistant),
    formality,
    style_mood: styleMood,
    brand: String(parsed.brand || '').trim().slice(0, 80),
    product_code: String(parsed.product_code || '').trim().slice(0, 64),
    size: String(parsed.size || '').trim().slice(0, 32),
    care_tip: String(lang === 'en' ? parsed.care_tip_en || parsed.care_tip_ko : parsed.care_tip_ko || parsed.care_tip_en || '').trim().slice(0, 220),
    care_profile: sanitizedCareProfile,
    suggested_fit_note: String(
      lang === 'en'
        ? parsed.suggested_fit_note_en || parsed.suggested_fit_note_ko
        : parsed.suggested_fit_note_ko || parsed.suggested_fit_note_en || ''
    ).trim().slice(0, 240),
    garment_details: {
      ...(waistType ? { waist_type: waistType } : {}),
      ...(category === 'bottom' ? { belt_compatible: inferredBeltCompat } : {}),
      ...(rawDetails.rise ? { rise: String(rawDetails.rise).trim() } : {}),
      ...(rawDetails.length_profile ? { length_profile: String(rawDetails.length_profile).trim() } : {}),
      ...(rawDetails.neckline ? { neckline: String(rawDetails.neckline).trim() } : {}),
      ...(rawDetails.sleeve_length ? { sleeve_length: String(rawDetails.sleeve_length).trim() } : {}),
      ...(rawDetails.coat_length ? { coat_length: String(rawDetails.coat_length).trim() } : {}),
      ...(rawDetails.closure_type ? { closure_type: String(rawDetails.closure_type).trim() } : {}),
      ...(rawDetails.heel_height ? { heel_height: String(rawDetails.heel_height).trim() } : {}),
      ...(rawDetails.back_detail ? { back_detail: String(rawDetails.back_detail).trim().slice(0, 120) } : {}),
      ...(sanitizedCareProfile ? { care_profile: sanitizedCareProfile } : {}),
    },
    background_quality: {
      hasClutterOrBodyPart: Boolean(parsed.background_has_clutter_or_body),
      reason: String(parsed.background_reason || '').trim().slice(0, 140),
    },
    has_identifiable_product: Boolean(
      parsed.has_identifiable_product ||
        (parsed.brand && String(parsed.brand).trim().length >= 2) ||
        (parsed.product_code && String(parsed.product_code).trim().length >= 3)
    ),
    web_search_query: String(parsed.web_search_query || '').trim().slice(0, 160),
    has_tag_images: validTags.length > 0,
    has_back_image: Boolean(backPart),
  };
}

/**
 * 2) Official Web Product Lookup via Gemini Google Search Grounding + SSRF-Safe Official Image Extraction
 */
export async function lookupOfficialGarmentOnWeb({
  brand = '',
  productCode = '',
  query = '',
  name = '',
  category = '',
  colorName = '',
  material = '',
  lang = 'ko',
}) {
  const ai = getServerGeminiClient();
  if (!ai) {
    const err = new Error('GEMINI_API_KEY가 설정되지 않아 공식 상품 검색을 실행할 수 없습니다.');
    err.status = 503;
    throw err;
  }

  const cleanBrand = String(brand || '').trim().slice(0, 80);
  const cleanCode = String(productCode || '').trim().slice(0, 64);
  const cleanQuery = String(query || '').trim().slice(0, 160);
  const cleanName = String(name || '').trim().slice(0, 120);

  const searchSeed = cleanQuery || [cleanBrand, cleanCode, cleanName, colorName, material].filter(Boolean).join(' ').trim();
  if (!searchSeed || searchSeed.length < 3) {
    return { found: false, reason: '검색할 브랜드나 품번 정보가 부족합니다.' };
  }

  const prompt = [
    `Find the exact official retail product listing for this garment using Google Search:`,
    `- Search query: ${searchSeed}`,
    cleanBrand ? `- Brand: ${cleanBrand}` : '',
    cleanCode ? `- Product / Style Code: ${cleanCode}` : '',
    category ? `- Category: ${category}` : '',
    colorName ? `- Color: ${colorName}` : '',
    material ? `- Material: ${material}` : '',
    '',
    'Search official brand stores or major fashion retailers (e.g., official brand site, SSENSE, Farfetch, Uniqlo, Zara, COS, Lemaire, Musinsa, 29CM, Ralph Lauren, etc.).',
    'Return ONLY a valid JSON object (no markdown commentary outside JSON) with this exact shape:',
    '{',
    '  "found": true or false,',
    '  "confidence": "high" | "medium" | "low",',
    '  "brand": "Official brand name",',
    '  "official_name": "Official product title (prefer Korean if Korean store found, or clean official English title)",',
    '  "product_code": "Official style/article code if found",',
    '  "color_name": "Official color name in Korean if possible",',
    '  "material": "One of: Corduroy, Cotton, Denim, Wool, Cashmere, Knit, Linen, Nylon, Leather, Suede, Silk, Fleece, Polyester, Fabric",',
    '  "material_composition": "Exact fiber breakdown e.g. 면 98%, 폴리우레탄 2%",',
    '  "fit": "One of: wide, relaxed, straight, regular, slim, oversized, cropped",',
    '  "retail_price_krw": 0,',
    '  "purchase_store": "Official retailer or brand store name",',
    '  "care_tip": "Official washing/care instruction",',
    '  "fit_summary": "Brief official fit/length note",',
    '  "product_page_url": "Best official product URL from search results",',
    '  "candidate_image_urls": ["Direct https product image URLs if clearly found"]',
    '}',
    `Respond in ${lang === 'en' ? 'English' : 'Korean'} for descriptive strings. If no reliable matching product exists, set found=false and confidence="low".`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      tools: [{ googleSearch: {} }],
    },
  });

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = [];
  for (const chunk of groundingChunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title;
    if (typeof uri === 'string' && uri.startsWith('https://')) {
      if (!sources.some((s) => s.uri === uri)) {
        sources.push({ uri, title: String(title || new URL(uri).hostname).slice(0, 120) });
      }
    }
  }

  const parsed = parseJsonLoose(response.text);
  if (!parsed || !parsed.found || parsed.confidence === 'low') {
    return {
      found: false,
      confidence: parsed?.confidence || 'low',
      sources: sources.slice(0, 4),
    };
  }

  // Safely attempt to fetch a clean official product image via SSRF-guarded server fetch
  const directImageCandidates = Array.isArray(parsed.candidate_image_urls)
    ? parsed.candidate_image_urls.filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, 3)
    : [];

  const pageCandidates = [
    ...(typeof parsed.product_page_url === 'string' && parsed.product_page_url.startsWith('https://')
      ? [parsed.product_page_url]
      : []),
    ...sources.map((s) => s.uri),
  ].slice(0, 3);

  let officialImage = null;
  for (const imgUrl of directImageCandidates) {
    officialImage = await fetchVerifiedImageAsDataUrl(imgUrl);
    if (officialImage) break;
  }

  if (!officialImage) {
    for (const pageUrl of pageCandidates) {
      const pageRes = await safeExternalFetch(pageUrl, {
        maxBytes: MAX_REMOTE_HTML_BYTES,
        acceptHeader: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        maxRedirects: 2,
      });
      if (!pageRes || !pageRes.contentType.includes('html')) continue;
      const html = pageRes.buffer.toString('utf8');
      const extractedImgUrls = extractProductImageUrlsFromHtml(html, pageRes.finalUrl);
      for (const imgUrl of extractedImgUrls) {
        officialImage = await fetchVerifiedImageAsDataUrl(imgUrl);
        if (officialImage) break;
      }
      if (officialImage) break;
    }
  }

  const primarySourceUrl =
    (typeof parsed.product_page_url === 'string' && parsed.product_page_url.startsWith('https://')
      ? parsed.product_page_url
      : sources[0]?.uri) || '';

  return {
    found: true,
    confidence: parsed.confidence === 'high' ? 'high' : 'medium',
    brand: String(parsed.brand || cleanBrand).trim().slice(0, 80),
    official_name: String(parsed.official_name || '').trim().slice(0, 120),
    product_code: String(parsed.product_code || cleanCode).trim().slice(0, 64),
    color_name: String(parsed.color_name || '').trim().slice(0, 32),
    material: parsed.material ? normalizeMaterial(parsed.material) : '',
    material_composition: String(parsed.material_composition || '').trim().slice(0, 140),
    fit: ALLOWED_FITS.has(parsed.fit) ? parsed.fit : '',
    retail_price_krw: Math.max(0, Math.round(Number(parsed.retail_price_krw) || 0)),
    purchase_store: String(parsed.purchase_store || '').trim().slice(0, 80),
    care_tip: String(parsed.care_tip || '').trim().slice(0, 220),
    fit_summary: String(parsed.fit_summary || '').trim().slice(0, 220),
    official_source_url: primarySourceUrl,
    official_image_data: officialImage?.dataUrl || null,
    image_fetch_blocked: !officialImage,
    sources: sources.slice(0, 4),
  };
}

/**
 * 3) AI Studio Cutout Refinement via gemini-3.1-flash-lite-image (Paid Model confirmed by user)
 * Isolates the exact garment onto a clean pure-white studio flat-lay packshot with zero floor/feet/clutter.
 */
export async function generateStudioCutoutImage({
  imageData,
  category = 'garment',
  side = 'front',
  colorName = '',
  material = '',
}) {
  const ai = getServerGeminiClient();
  if (!ai) {
    const err = new Error('GEMINI_API_KEY가 설정되지 않아 AI 스튜디오 보정을 실행할 수 없습니다.');
    err.status = 503;
    throw err;
  }

  const decoded = decodeValidatedDataUrl(imageData, MAX_ANALYZE_IMAGE_BYTES);
  if (!decoded) {
    const err = new Error('유효한 의류 이미지(JPEG/PNG/WebP, 5MB 이하)가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const viewLabel = side === 'back' ? 'BACK view' : 'FRONT view';
  const garmentHint = [colorName, material, category].filter(Boolean).join(' ').trim() || 'garment';

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: [
      {
        inlineData: {
          mimeType: decoded.mimeType,
          data: decoded.base64Data,
        },
      },
      {
        text: [
          `Transform the attached garment photograph (${viewLabel} of a ${garmentHint}) into a crisp, professional luxury e-commerce flat-lay studio product packshot.`,
          'STRICT REQUIREMENTS:',
          '- Extract ONLY the single garment itself and center it neatly upright inside the 1:1 square frame with generous clean margin (~10% padding on all sides).',
          '- Place the garment on a completely flat, uniform, pure solid white (#FFFFFF) seamless background with ZERO floor wood grain, ZERO room background, ZERO human feet/hands/body parts, ZERO drop shadows, and ZERO external objects.',
          '- Faithfully preserve the exact garment shape, silhouette, waistband construction (elastic gathers, belt loops, pockets), true color, and authentic fabric texture (e.g. corduroy ribs, knit weave, denim grain).',
          '- Strictly ZERO text, ZERO watermarks, ZERO logos added, and ZERO extra garments.',
        ].join('\n'),
      },
    ],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const err = new Error('AI 스튜디오 보정 이미지를 생성하지 못했습니다.');
    err.status = 502;
    throw err;
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  return {
    studioImageDataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    model: 'gemini-3.1-flash-lite-image',
  };
}
