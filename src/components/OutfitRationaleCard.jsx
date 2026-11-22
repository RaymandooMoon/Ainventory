import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { buildOutfitRationaleNote } from '../utils/outfitRationaleEngine.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';

/**
 * Collapsible Outfit Rationale Note ("코디안 스타일링 노트")
 * Placed cleanly at the bottom of the Studio.
 * - Collapsed by default: quiet 1-line summary bar (preserves canvas & 15% sticky budget)
 * - Expanded: 4 structured rationale rows (Place/TPO, Temp/Weather, Density, Color/Skin Harmony)
 */
export default function OutfitRationaleCard({
  slots,
  weather,
  selectedPlace,
  stylingPref,
  skinProfile,
  lang = 'ko',
}) {
  const [expanded, setExpanded] = useState(false);

  const note = useMemo(
    () =>
      buildOutfitRationaleNote({
        slots,
        weather,
        selectedPlace,
        stylingPref,
        skinProfile,
        lang,
      }),
    [slots, weather, selectedPlace, stylingPref, skinProfile, lang]
  );

  if (note.equippedCount === 0) return null;

  return (
    <div
      className="w-full max-w-[540px] mx-auto px-3 pb-2"
      data-outfit-rationale-card="true"
    >
      <div className="rounded-2xl border border-black/10 dark:border-white/12 bg-white/90 dark:bg-neutral-950/88 backdrop-blur-md overflow-hidden transition-colors">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            triggerHaptic('selection');
            setExpanded((prev) => !prev);
          }}
          className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-black/[0.025] dark:hover:bg-white/[0.04] transition-colors"
        >
          <div className="min-w-0 flex items-center gap-2 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-white shrink-0">
              {tx(lang, '코디안', 'Style Note')}
            </span>
            <span aria-hidden="true" className="text-neutral-400 shrink-0">
              ·
            </span>
            <span className="text-neutral-600 dark:text-neutral-300 truncate tabular-nums">
              {note.headline}
            </span>
          </div>
          <span className="text-neutral-500 dark:text-neutral-400 shrink-0 flex items-center">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>

        {expanded && (
          <div className="px-3.5 pb-3 pt-1 border-t border-black/8 dark:border-white/10 divide-y divide-black/6 dark:divide-white/8">
            {note.items.map((item) => (
              <div
                key={item.key}
                className="py-2 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 text-xs"
              >
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 sm:w-24 shrink-0">
                  {item.label}
                </span>
                <span className="text-neutral-600 dark:text-neutral-300 leading-relaxed tabular-nums">
                  {item.summary}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
