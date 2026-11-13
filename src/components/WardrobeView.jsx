import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_PILL_FILTERS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import AddGarmentModal from './AddGarmentModal.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';

/**
 * MY WARDROBE — Apple HIG Inventory-First Closet Screen
 * - Screen copy strictly restricted to:
 *   [Screen Title ('MY WARDROBE') + Total Item Count ('N ITEMS') + Category Filter Pills + Item Name / Brand (max 2 lines)]
 * - 85%+ visual & whitespace dominance, #F5F5F7 rounded squircle cards (22px), 2.5D multi-shadow objects.
 * - Clicking any card routes to `/item/:id` Item Detail view.
 */
export default function WardrobeView({
  activeCloset,
  garments = [],
  loading = false,
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
      {/* Top Bar: Left Title + Item Count | Right Circular '+' Button ONLY */}
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

        <button
          id={CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}
          type="button"
          className="hig-circle-icon-btn"
          aria-label="옷 등록"
          onClick={() => {
            triggerHaptic('selection');
            setAddModalOpen(true);
          }}
        >
          <Plus size={21} strokeWidth={2.2} />
        </button>
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
              <span>No Items</span>
            </div>
          ) : (
            filteredGarments.map((item, idx) => (
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
                  <GarmentObject25D item={item} padding="13%" />
                </div>
                <div className="hig-garment-meta">
                  <span className="hig-garment-name">{item.name}</span>
                  {item.brand ? (
                    <span className="hig-garment-brand">{item.brand}</span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <AddGarmentModal
        open={addModalOpen}
        activeCloset={activeCloset}
        onClose={() => setAddModalOpen(false)}
        onRegistered={(created) => {
          onGarmentRegistered?.(created);
        }}
        showToast={showToast}
      />
    </section>
  );
}
