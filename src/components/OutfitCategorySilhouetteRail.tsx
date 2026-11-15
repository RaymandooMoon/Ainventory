import { memo } from 'react';
import { FITTING_SLOTS, type FittingTabKey } from '../services/fittingRenderer.ts';

export interface OutfitCategorySilhouetteRailProps {
  activeParentTab: FittingTabKey;
  equippedCountByParentTab: Partial<Record<FittingTabKey, number>>;
  lang?: string;
  isDesktopDrawer?: boolean;
  onSelectTab: (tabKey: FittingTabKey) => void;
}

function renderCategorySilhouetteSvg(slotKey: FittingTabKey) {
  switch (slotKey) {
    case 'outer':
      // Structured tailored coat / jacket silhouette
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M8.2 3.5L12 7.4L15.8 3.5L19.8 5.6L21.5 15.2L18.4 15.8L17.3 9.8V20.5H12.6V13.2H11.4V20.5H6.7V9.8L5.6 15.8L2.5 15.2L4.2 5.6L8.2 3.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'top':
      // Crisp crew-neck tee / knitwear silhouette (matches reference active icon)
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M8.6 4C9.4 5.2 10.6 5.9 12 5.9C13.4 5.9 14.6 5.2 15.4 4L20.8 6.6L19 11.2L16.4 10.1V20H7.6V10.1L5 11.2L3.2 6.6L8.6 4Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'bottom':
      // Tailored pleated wide trousers silhouette
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M6.8 3.5H17.2L18.4 20.5H13.6L12.4 9.8H11.6L10.4 20.5H5.6L6.8 3.5ZM8.3 5.7H15.7V6.9H8.3V5.7Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'onepiece':
      // Sleeveless waist-cinched dress silhouette
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M8.8 3.5C9.6 4.7 10.7 5.3 12 5.3C13.3 5.3 14.4 4.7 15.2 3.5H17L15.6 10.4L18.6 20.5H5.4L8.4 10.4L7 3.5H8.8Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'shoes':
      // Sleek heeled ankle boot silhouette
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M7.5 4.5H13.2V11.4L19.6 14.8C20.5 15.3 21 16.2 21 17.2V18.8H13.4L10.8 16.8V18.8H5.2V12.8L7.5 9.6V4.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'accessory':
      // Structured top-handle leather tote bag silhouette
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M9 7V5.8C9 4.1 10.3 2.8 12 2.8C13.7 2.8 15 4.1 15 5.8V7H18.8C19.5 7 20.1 7.5 20.2 8.2L21 18.8C21.1 19.6 20.4 20.3 19.6 20.3H4.4C3.6 20.3 2.9 19.6 3 18.8L3.8 8.2C3.9 7.5 4.5 7 5.2 7H9ZM10.8 7H13.2V5.8C13.2 5.1 12.7 4.6 12 4.6C11.3 4.6 10.8 5.1 10.8 5.8V7Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'jewelry':
      // Minimalist atelier timepiece / jewelry medallion silhouette
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M9.5 2.5H14.5L15 6.1C16.8 7.2 18 9.2 18 11.5C18 13.8 16.8 15.8 15 16.9L14.5 21.5H9.5L9 16.9C7.2 15.8 6 13.8 6 11.5C6 9.2 7.2 7.2 9 6.1L9.5 2.5ZM12 7.5C9.8 7.5 8 9.3 8 11.5C8 13.7 9.8 15.5 12 15.5C14.2 15.5 16 13.7 16 11.5C16 9.3 14.2 7.5 12 7.5ZM11.3 9.2H12.7V11.3L14.2 12.2L13.5 13.4L11.3 12.1V9.2Z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return null;
  }
}

const OutfitCategorySilhouetteRail = memo(function OutfitCategorySilhouetteRail({
  activeParentTab,
  equippedCountByParentTab,
  lang = 'ko',
  isDesktopDrawer = true,
  onSelectTab,
}: OutfitCategorySilhouetteRailProps) {
  const isEn = lang === 'en';

  return (
    <div
      className="atelier-category-rail"
      role="tablist"
      aria-orientation="vertical"
      aria-label={isEn ? 'Outfit Slots' : '코디 슬롯'}
    >
      {FITTING_SLOTS.map((slot) => {
        const active = activeParentTab === slot.key;
        const count = equippedCountByParentTab[slot.key] || 0;
        const slotText = isEn ? slot.label : slot.labelKo;

        return (
          <button
            key={slot.key}
            type="button"
            role="tab"
            data-outfit-slot-tab={isDesktopDrawer ? slot.key : undefined}
            data-mobile-sheet-slot-tab={!isDesktopDrawer ? slot.key : undefined}
            aria-selected={active}
            aria-label={slotText}
            title={slotText}
            className={`atelier-category-rail-btn ${active ? 'is-active' : ''} ${count > 0 ? 'has-equipped' : ''}`.trim()}
            onClick={() => onSelectTab(slot.key)}
          >
            <span className="atelier-category-rail-icon" aria-hidden="true">
              {renderCategorySilhouetteSvg(slot.key)}
            </span>
            {count > 1 ? (
              <span className="atelier-rail-count-badge tabular-nums" aria-hidden="true">
                {count}
              </span>
            ) : count === 1 ? (
              <span className="atelier-rail-equipped-dot" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
});

export default OutfitCategorySilhouetteRail;
