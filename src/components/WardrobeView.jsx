import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_PILL_FILTERS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { localizeBrandName, localizeGarmentName, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import AddGarmentModal from './AddGarmentModal.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';

/**
 * MY WARDROBE — Apple HIG Inventory-First Closet Screen
 */
export default function WardrobeView({
  activeCloset,
  garments = [],
  loading = false,
  lang = 'ko',
  skinProfile,
  onOpenProfile,
  onOpenAccount,
  onSelectGarment,
  onGarmentRegistered,
  showToast,
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const filteredGarments = useMemo(() => {
    if (activeCategory === 'all') return garments;
    return garments.filter(
      (item) => normalizeWardrobeCategoryKey(item.category) === activeCategory
    );
  }, [garments, activeCategory]);

  return (
    <section className="hig-screen-container hig-closet-screen" aria-label="MY WARDROBE">
      {/* Top Bar: Left Title + Item Count | Right '+' + Profile + Account Settings */}
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 id={CARBON_DOM_CONTRACT.wardrobeHeaderTitleId} className="hig-screen-title">
            MY WARDROBE
          </h1>
          <span
            id={CARBON_DOM_CONTRACT.wardrobeItemCountId}
            className="hig-item-count tabular-nums"
          >
            {garments.length} ITEMS
          </span>
        </div>

        <div className="hig-top-bar-actions">
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
            extraActions={
              <button
                id={CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}
                type="button"
                className="hig-circle-icon-btn"
                aria-label={tx(lang, '옷 등록', 'Add Item')}
                onClick={() => {
                  triggerHaptic('selection');
                  setAddModalOpen(true);
                }}
              >
                <Plus size={21} strokeWidth={2.2} />
              </button>
            }
          />
        </div>
      </header>

      {/* Horizontal Scrollable Pill Category Filter */}
      <nav
        id={CARBON_DOM_CONTRACT.wardrobeCategoryRailId}
        className="hig-pill-rail"
        aria-label="Category Filter"
      >
        {WARDROBE_PILL_FILTERS.map((pill) => {
          const active = activeCategory === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              data-category-pill={pill.key}
              aria-pressed={active}
              className={`hig-filter-pill ${active ? 'active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setActiveCategory(pill.key);
              }}
            >
              {pill.label}
            </button>
          );
        })}
      </nav>

      {/* Main 2~4 Column Squircle Inventory Grid */}
      {loading ? (
        <div className="hig-wardrobe-grid" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="hig-squircle-skeleton" />
          ))}
        </div>
      ) : (
        <div id={CARBON_DOM_CONTRACT.wardrobeGridId} className="hig-wardrobe-grid">
          {filteredGarments.length === 0 ? (
            <div className="hig-minimal-empty" style={{ gridColumn: '1 / -1' }}>
              <span>{tx(lang, '등록된 의류가 없습니다', 'No Items')}</span>
            </div>
          ) : (
            filteredGarments.map((item, idx) => {
              const displayName = localizeGarmentName(item.name, lang);
              const displayBrand = localizeBrandName(item.brand, lang);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-garment-id={item.id}
                  className="hig-wardrobe-card"
                  style={{ '--card-stagger': Math.min(idx, 11) }}
                  onClick={() => {
                    triggerHaptic('selection');
                    onSelectGarment?.(item);
                  }}
                >
                  <div className={CARBON_DOM_CONTRACT.cutoutTileClass}>
                    <GarmentObject25D item={item} alt={displayName} padding="13%" />
                  </div>
                  <div className="hig-garment-meta">
                    <span className="hig-garment-name">{displayName}</span>
                    {displayBrand ? (
                      <span className="hig-garment-brand">{displayBrand}</span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      <AddGarmentModal
        open={addModalOpen}
        activeCloset={activeCloset}
        lang={lang}
        onClose={() => setAddModalOpen(false)}
        onRegistered={(created) => {
          onGarmentRegistered?.(created);
        }}
        showToast={showToast}
      />
    </section>
  );
}
