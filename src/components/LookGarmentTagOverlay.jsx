import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, X } from 'lucide-react';
import { buildLookTagPins } from '../utils/lookTagPins.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';

/**
 * Interactive garment hotspot pin overlay strictly for 0° (Front) and 180° (Back) look views.
 * - Top-right "태그 숨기기 / 태그 보기" toggle
 * - Hover/active dark tooltip ("Brand + Product Name")
 * - Compact bottom card on click: N / M prev/next carousel + ONLY Brand, Product Code, Price, Material
 */
export default function LookGarmentTagOverlay({
  slots,
  viewAngleDeg = 0,
  lang = 'ko',
}) {
  const [tagsVisible, setTagsVisible] = useState(true);
  const [hoveredPinId, setHoveredPinId] = useState(null);
  const [activePinIndex, setActivePinIndex] = useState(null);

  const pins = useMemo(
    () => buildLookTagPins({ slots, viewAngleDeg, lang }),
    [slots, viewAngleDeg, lang]
  );

  // Auto-close active detail card whenever rotation leaves 0°/180° or pins change
  useEffect(() => {
    setActivePinIndex(null);
    setHoveredPinId(null);
  }, [viewAngleDeg, pins.length]);

  if (pins.length === 0) return null;

  const activePin =
    activePinIndex !== null && pins[activePinIndex] ? pins[activePinIndex] : null;

  const handlePrev = (e) => {
    e.stopPropagation();
    triggerHaptic('selection');
    setActivePinIndex((prev) =>
      prev === null ? 0 : (prev - 1 + pins.length) % pins.length
    );
  };

  const handleNext = (e) => {
    e.stopPropagation();
    triggerHaptic('selection');
    setActivePinIndex((prev) => (prev === null ? 0 : (prev + 1) % pins.length));
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20"
      data-look-tag-overlay="true"
      data-look-tag-angle={viewAngleDeg}
    >
      {/* Top-right Tag Visibility Toggle */}
      <div className="absolute top-3 right-3 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic('selection');
            setTagsVisible((prev) => {
              const next = !prev;
              if (!next) setActivePinIndex(null);
              return next;
            });
          }}
          aria-pressed={tagsVisible}
          className="min-h-[38px] px-3 py-1.5 rounded-full bg-neutral-900/75 hover:bg-neutral-900/90 text-white backdrop-blur-md text-[11px] font-semibold flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap"
        >
          {tagsVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>
            {tagsVisible
              ? tx(lang, '태그 숨기기', 'Hide Tags')
              : tx(lang, '태그 보기', 'Show Tags')}
          </span>
        </button>
      </div>

      {/* Hotspot Pins (0° Front & 180° Back only) */}
      {tagsVisible &&
        pins.map((pin, idx) => {
          const isActive = activePinIndex === idx;
          const isHovered = hoveredPinId === pin.id;
          const showTooltip = isHovered || isActive;

          return (
            <div
              key={pin.id}
              className="absolute pointer-events-auto"
              style={{
                left: `${pin.xPct}%`,
                top: `${pin.yPct}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: showTooltip ? 30 : 22,
              }}
            >
              {/* Floating Dark Tooltip (Brand + Product Name) */}
              {showTooltip && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-full bg-neutral-950/88 text-white text-[11px] leading-tight shadow-md whitespace-nowrap max-w-[210px] truncate pointer-events-none backdrop-blur-sm"
                  role="tooltip"
                >
                  <span className="font-semibold text-neutral-300">{pin.brand}</span>
                  <span className="mx-1 opacity-50">·</span>
                  <span className="font-medium">{pin.name}</span>
                </div>
              )}

              {/* 44x44px Accessible Touch Target wrapping a crisp 24px circular ring+dot */}
              <button
                type="button"
                aria-label={`${pin.brand} ${pin.name}`}
                aria-expanded={isActive}
                onMouseEnter={() => setHoveredPinId(pin.id)}
                onMouseLeave={() => setHoveredPinId((cur) => (cur === pin.id ? null : cur))}
                onFocus={() => setHoveredPinId(pin.id)}
                onBlur={() => setHoveredPinId((cur) => (cur === pin.id ? null : cur))}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('selection');
                  setActivePinIndex((cur) => (cur === idx ? null : idx));
                }}
                className="w-11 h-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer group"
              >
                <span
                  className={`w-6 h-6 rounded-full bg-white/95 border-2 flex items-center justify-center shadow-md transition-transform duration-150 ${
                    isActive
                      ? 'border-neutral-950 scale-115'
                      : 'border-neutral-900/80 group-hover:scale-110'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-neutral-900" />
                </span>
              </button>
            </div>
          );
        })}

      {/* Compact Bottom Detail Card: N/M Carousel + ONLY Brand, Product Code, Price, Material */}
      {tagsVisible && activePin && (
        <div
          className="absolute left-3 right-3 bottom-3 pointer-events-auto rounded-2xl bg-white/96 dark:bg-neutral-950/95 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/15 shadow-xl backdrop-blur-md p-3.5"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={tx(lang, '착장 의류 태그 정보', 'Tagged Garment Info')}
        >
          {/* Carousel Header: N / M + < > X */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
              <span>
                {activePinIndex + 1} / {pins.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                {activePin.categoryLabel}
              </span>
            </div>

            <div className="flex items-center gap-0.5">
              {pins.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label={tx(lang, '이전 아이템', 'Previous item')}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label={tx(lang, '다음 아이템', 'Next item')}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePinIndex(null);
                }}
                aria-label={tx(lang, '태그 정보 닫기', 'Close tag card')}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Concise Garment Metadata Body (Zero-Pill Typography) */}
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-black/6 dark:border-white/10 overflow-hidden shrink-0 flex items-center justify-center p-1">
              {activePin.thumbnailUrl ? (
                <img
                  src={activePin.thumbnailUrl}
                  alt={activePin.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-[10px] text-neutral-400">{activePin.categoryLabel}</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 truncate">
                {activePin.brand}
              </div>
              <div className="text-sm font-semibold truncate">{activePin.name}</div>
              {activePin.priceText && (
                <div className="text-sm font-bold tabular-nums">{activePin.priceText}</div>
              )}
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate tabular-nums">
                {[
                  activePin.productCode
                    ? `${tx(lang, '품번', 'Code')} ${activePin.productCode}`
                    : '',
                  activePin.materialText,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
