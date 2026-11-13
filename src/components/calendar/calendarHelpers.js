import { Cloud, CloudRain, CloudSun, Snowflake, Sun } from 'lucide-react';
import {
  localizeCalendarNote,
  localizeOutfitTitle,
  tx,
} from '../../utils/i18n.ts';

const WEATHER_KO_TO_EN = {
  맑음: 'Clear',
  쾌청: 'Sunny',
  '구름 조금': 'Partly Cloudy',
  구름조금: 'Partly Cloudy',
  구름많음: 'Mostly Cloudy',
  흐림: 'Cloudy',
  비: 'Rain',
  소나기: 'Showers',
  눈: 'Snow',
  선선함: 'Crisp',
  쌀쌀함: 'Chilly',
  포근함: 'Mild',
};

export function parseIsoDateLocal(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatIsoDateLocal(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftIsoDate(dateStr, deltaDays) {
  const dt = parseIsoDateLocal(dateStr);
  dt.setDate(dt.getDate() + deltaDays);
  return formatIsoDateLocal(dt);
}

export function shiftIsoMonth(dateStr, deltaMonths) {
  const dt = parseIsoDateLocal(dateStr);
  const targetDay = dt.getDate();
  const shifted = new Date(dt.getFullYear(), dt.getMonth() + deltaMonths, 1);
  const maxDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(targetDay, maxDay));
  return formatIsoDateLocal(shifted);
}

export function localizeWeatherText(rawSummary, lang = 'ko') {
  const raw = String(rawSummary || '').trim();
  if (!raw) return '';
  if (lang !== 'en') return raw;
  if (Object.hasOwn(WEATHER_KO_TO_EN, raw)) {
    return WEATHER_KO_TO_EN[raw];
  }
  return localizeCalendarNote(raw, 'en');
}

export function resolveWeatherVisual(entry, lang = 'ko') {
  const rawSummary = String(entry?.weather_summary || '').trim();
  const rawNote = String(entry?.note || '').trim();
  const combined = `${rawSummary} ${rawNote}`.toLowerCase();

  let tempLabel = '';
  if (entry?.temp_c !== null && entry?.temp_c !== undefined && entry?.temp_c !== '') {
    const num = Number(entry.temp_c);
    if (Number.isFinite(num)) {
      tempLabel = `${Math.round(num)}°`;
    }
  }
  if (!tempLabel) {
    const rangeMatch = rawNote.match(/\((-?\d+°\/-?\d+°)\)/);
    if (rangeMatch) {
      tempLabel = rangeMatch[1];
    } else {
      const singleMatch = `${rawSummary} ${rawNote}`.match(/(-?\d+)\s*°C?/i);
      if (singleMatch) {
        tempLabel = `${singleMatch[1]}°`;
      }
    }
  }

  let IconComp = Sun;
  if (/비|소나기|우천|rain|shower|drizzle/.test(combined)) {
    IconComp = CloudRain;
  } else if (/눈|설경|snow|sleet/.test(combined)) {
    IconComp = Snowflake;
  } else if (/구름\s*조금|구름조금|partly/.test(combined)) {
    IconComp = CloudSun;
  } else if (/흐림|구름|안개|cloud|overcast|fog/.test(combined)) {
    IconComp = Cloud;
  }

  const condLabel = localizeWeatherText(rawSummary, lang);
  if (!tempLabel && !condLabel) return null;

  return {
    IconComp,
    tempLabel,
    condLabel,
  };
}

export function resolveEntryItems(entry, outfits, garmentMap) {
  if (!entry) return [];
  const matchedOutfit = outfits.find((o) => Number(o.id) === Number(entry.outfit_id));
  const rawIds =
    Array.isArray(entry.item_ids) && entry.item_ids.length > 0
      ? entry.item_ids
      : Array.isArray(matchedOutfit?.item_ids)
        ? matchedOutfit.item_ids
        : [];

  const fromMap = rawIds.map((id) => garmentMap.get(Number(id))).filter(Boolean);
  if (fromMap.length > 0) return fromMap;

  if (Array.isArray(entry.items) && entry.items.length > 0) {
    return entry.items.filter(Boolean);
  }
  return [];
}

export function resolveEntryTitle(entry, outfits, lang = 'ko') {
  if (!entry) return '';
  const matchedOutfit = outfits.find((o) => Number(o.id) === Number(entry.outfit_id));
  return (
    localizeOutfitTitle(matchedOutfit?.title, lang) ||
    localizeCalendarNote(entry.note, lang) ||
    tx(lang, '데일리 룩', 'Daily Look')
  );
}
