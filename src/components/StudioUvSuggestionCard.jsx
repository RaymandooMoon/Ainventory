import { useMemo, useState } from 'react';
import { Check, Sun, X } from 'lucide-react';
import { buildUvSmartSuggestion } from '../utils/uvSmartAccessory.ts';
import { localizeGarmentName, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';

/**
 * Non-intrusive UV Smart Accessory 1-Tap Suggestion Card.
 * - Triggers only when daytime UV >= 6 and at least one suggested item is not yet equipped.
 * - Strictly respects the user's accessory toggle & styling density (never auto-forces).
 */
export default function StudioUvSuggestionCard({
  weather,
  garments,
  slots,
  onToggleAccessorySlot,
  lang = 'ko',
}) {
  const [dismissedKey, setDismissedKey] = useState('');

  const scopeKey = `${weather?.date || 'today'}:${weather?.cityKey || 'default'}:${weather?.uvIndex || 0}`;

  const suggestion = useMemo(
    () => buildUvSmartSuggestion({ weather, garments, slots, lang }),
    [weather, garments, slots, lang]
  );

  if (!suggestion.shouldSuggest || dismissedKey === scopeKey) {
    return null;
  }

  return (
    <div
      className="w-full max-w-[540px] mx-auto px-3 pb-1.5"
      data-uv-suggestion-card="true"
      data-uv-index={suggestion.uvIndex}
    >
      <div className="rounded-2xl border border-black/10 dark:border-white/12 bg-white/90 dark:bg-neutral-950/88 backdrop-blur-md px-3.5 py-2.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <Sun
              size={15}
              className="mt-0.5 text-neutral-800 dark:text-neutral-200 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-neutral-900 dark:text-white tabular-nums">
                {lang === 'en' ? suggestion.headlineEn : suggestion.headlineKo}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                {lang === 'en' ? suggestion.tipEn : suggestion.tipKo}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label={tx(lang, 'UV 제안 닫기', 'Dismiss UV suggestion')}
            onClick={() => {
              triggerHaptic('selection');
              setDismissedKey(scopeKey);
            }}
            className="min-w-[34px] min-h-[34px] -mr-1 -mt-1 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {suggestion.candidates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestion.candidates.map((cand) => {
              const g = cand.garment;
              const thumb = g.image_url || g.thumbnail_url || '';
              const label = localizeGarmentName(g, lang) || g.name;
              return (
                <button
                  key={`${cand.slotKey}-${g.id}`}
                  type="button"
                  aria-pressed={cand.isEquipped}
                  onClick={() => {
                    triggerHaptic('medium');
                    onToggleAccessorySlot?.(cand.slotKey, g, cand.isEquipped);
                  }}
                  className={`flex-1 min-w-[148px] min-h-[44px] px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors ${
                    cand.isEquipped
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                      : 'bg-black/[0.03] dark:bg-white/[0.04] text-neutral-900 dark:text-white border-black/10 dark:border-white/12 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={label}
                        className="w-7 h-7 rounded-md object-contain bg-white/80 dark:bg-neutral-900 shrink-0"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-[10px] opacity-70 truncate">
                        {lang === 'en' ? cand.kindLabelEn : cand.kindLabelKo}
                      </div>
                      <div className="text-[11px] font-semibold truncate">{label}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold shrink-0 inline-flex items-center gap-1">
                    {cand.isEquipped ? (
                      <>
                        <Check size={12} strokeWidth={2.8} />
                        <span>{tx(lang, '착용됨', 'On')}</span>
                      </>
                    ) : (
                      <span>{tx(lang, '원탭 착용', 'Try on')}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
