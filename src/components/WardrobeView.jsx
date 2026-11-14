import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_PILL_FILTERS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import {
  classifyAccessoryOrJewelryPart,
  isJewelryGarment,
} from '../services/fittingRenderer.ts';
import { apiFetch } from '../utils/api.ts';
import {
  localizeBrandName,
  localizeGarmentName,
  localizeMaterialLabel,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import AddGarmentModal from './AddGarmentModal.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';

const ACCESSORY_WARDROBE_SUBPARTS = [
  { key: 'all', ko: '전체', en: 'All' },
  { key: 'bag', ko: '가방', en: 'Bag' },
  { key: 'umbrella', ko: '우산', en: 'Umbrella' },
  { key: 'watch', ko: '시계', en: 'Watch' },
  { key: 'gloves', ko: '장갑', en: 'Gloves' },
  { key: 'eyewear', ko: '아이웨어', en: 'Eyewear' },
  { key: 'headwear', ko: '머리·모자', en: 'Headwear' },
  { key: 'neckwear', ko: '목·머플러', en: 'Neckwear' },
  { key: 'belt', ko: '벨트', en: 'Belt' },
];

const JEWELRY_WARDROBE_SUBPARTS = [
  { key: 'all', ko: '전체', en: 'All' },
  { key: 'necklace', ko: '목걸이', en: 'Necklace' },
  { key: 'earring', ko: '귀걸이', en: 'Earring' },
  { key: 'bracelet', ko: '팔찌', en: 'Bracelet' },
  { key: 'ring', ko: '반지', en: 'Ring' },
  { key: 'brooch', ko: '브로치', en: 'Brooch' },
];

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
  const [activeSubPart, setActiveSubPart] = useState('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const ensuredSeedRef = useRef(new Set());

  const filteredGarments = useMemo(() => {
    if (activeCategory === 'all') return garments;
    if (activeCategory === 'jewelry') {
      return garments.filter((item) => {
        if (!isJewelryGarment(item)) return false;
        if (activeSubPart === 'all') return true;
        return classifyAccessoryOrJewelryPart(item) === activeSubPart;
      });
    }
    if (activeCategory === 'accessory') {
      return garments.filter((item) => {
        if (isJewelryGarment(item)) return false;
        if (normalizeWardrobeCategoryKey(item.category) !== 'accessory') return false;
        if (activeSubPart === 'all') return true;
        return classifyAccessoryOrJewelryPart(item) === activeSubPart;
      });
    }
    return garments.filter(
      (item) =>
        !isJewelryGarment(item) && normalizeWardrobeCategoryKey(item.category) === activeCategory
    );
  }, [garments, activeCategory, activeSubPart]);

  // Auto-seed 5 material items when user opens Jewelry or a specific Accessory/Jewelry sub-part that has 0 items
  useEffect(() => {
    if (loading) return;
    if (activeCategory !== 'jewelry' && activeCategory !== 'accessory') return;
    if (filteredGarments.length > 0) return;

    const closetKey = activeCloset || 'sample';
    const guardKey = `${closetKey}:${activeCategory}:${activeSubPart}`;
    if (ensuredSeedRef.current.has(guardKey)) return;
    ensuredSeedRef.current.add(guardKey);

    let cancelled = false;
    apiFetch('/garments/ensure-material-seeds', {
      method: 'POST',
      body: JSON.stringify({ closet_owner: closetKey }),
    })
      .then((res) => {
        if (!cancelled && res?.inserted > 0) {
          onGarmentRegistered?.(null);
        }
      })
      .catch(() => {
        // ignore offline race
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeSubPart, filteredGarments.length, loading, activeCloset, onGarmentRegistered]);

  const activeSubPartOptions =
    activeCategory === 'jewelry'
      ? JEWELRY_WARDROBE_SUBPARTS
      : activeCategory === 'accessory'
        ? ACCESSORY_WARDROBE_SUBPARTS
        : null;

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
                setActiveSubPart('all');
              }}
            >
              {pill.label}
            </button>
          );
        })}
      </nav>

      {/* Sibling Jewelry Collection & Accessory/Jewelry Sub-Part Filter Bar */}
      <div className="hig-wardrobe-subtree-wrap" data-wardrobe-subtree="true">
        <button
          type="button"
          data-wardrobe-jewelry-pill="true"
          aria-pressed={activeCategory === 'jewelry'}
          className={`hig-wardrobe-sub-pill ${activeCategory === 'jewelry' ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('selection');
            if (activeCategory === 'jewelry') {
              setActiveCategory('all');
              setActiveSubPart('all');
            } else {
              setActiveCategory('jewelry');
              setActiveSubPart('all');
            }
          }}
        >
          {tx(lang, '주얼리', 'Jewelry')}
        </button>

        {activeSubPartOptions && (
          <>
            <span className="hig-wardrobe-subtree-divider" aria-hidden="true" />
            {activeSubPartOptions.map((sub) => {
              const active = activeSubPart === sub.key;
              return (
                <button
                  key={sub.key}
                  type="button"
                  data-wardrobe-subpart-pill={sub.key}
                  aria-pressed={active}
                  className={`hig-wardrobe-sub-pill ${active ? 'active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setActiveSubPart(sub.key);
                  }}
                >
                  {tx(lang, sub.ko, sub.en)}
                </button>
              );
            })}
          </>
        )}
      </div>

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
              const displayName =
                lang === 'en' && typeof item.name_en === 'string' && item.name_en.trim()
                  ? item.name_en.trim()
                  : localizeGarmentName(item.name, lang);
              const displayBrand = localizeBrandName(item.brand, lang);
              const isAccOrJwl =
                isJewelryGarment(item) ||
                normalizeWardrobeCategoryKey(item.category) === 'accessory';
              const materialText =
                isAccOrJwl && item.fabric ? localizeMaterialLabel(item.fabric, lang) : '';
              const subtitle = [displayBrand, materialText].filter(Boolean).join(' · ');

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
                    {subtitle ? <span className="hig-garment-brand">{subtitle}</span> : null}
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
