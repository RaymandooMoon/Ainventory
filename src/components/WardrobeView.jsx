import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, Search, X } from 'lucide-react';
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
import AppHeaderBrand from './common/AppHeaderBrand.tsx';
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

const SORT_OPTIONS = [
  { key: 'recent', ko: '최신순', en: 'Recent' },
  { key: 'worn', ko: '착용순', en: 'Most Worn' },
  { key: 'name', ko: '이름순', en: 'A–Z' },
];

/**
 * MY WARDROBE — Apple HIG Inventory-First Closet Screen
 */
export default function WardrobeView({
  activeCloset,
  garments = [],
  loading = false,
  theme = 'light',
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const ensuredSeedRef = useRef(new Set());

  const categoryFilteredGarments = useMemo(() => {
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

  const filteredGarments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? categoryFilteredGarments.filter((item) => {
          const hay = [
            item.name,
            item.name_en,
            localizeGarmentName(item.name, lang),
            item.brand,
            localizeBrandName(item.brand, lang),
            item.color_name,
            item.fabric,
            item.subcategory,
            item.memo,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : categoryFilteredGarments;

    if (sortBy === 'worn') {
      return [...searched].sort(
        (a, b) => Number(b.wear_count || 0) - Number(a.wear_count || 0)
      );
    }
    if (sortBy === 'name') {
      return [...searched].sort((a, b) =>
        localizeGarmentName(a.name, lang).localeCompare(
          localizeGarmentName(b.name, lang),
          lang === 'en' ? 'en' : 'ko'
        )
      );
    }
    return searched;
  }, [categoryFilteredGarments, searchQuery, sortBy, lang]);

  // Auto-seed 5 material items when user opens Jewelry or a specific Accessory/Jewelry sub-part that has 0 items
  useEffect(() => {
    if (loading) return;
    if (activeCategory !== 'jewelry' && activeCategory !== 'accessory') return;
    if (categoryFilteredGarments.length > 0) return;

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
  }, [
    activeCategory,
    activeSubPart,
    categoryFilteredGarments.length,
    loading,
    activeCloset,
    onGarmentRegistered,
  ]);

  const activeSubPartOptions =
    activeCategory === 'jewelry'
      ? JEWELRY_WARDROBE_SUBPARTS
      : activeCategory === 'accessory'
        ? ACCESSORY_WARDROBE_SUBPARTS
        : null;

  const hasActiveFilterOrSearch =
    activeCategory !== 'all' || activeSubPart !== 'all' || searchQuery.trim().length > 0;

  // Search + sort stay folded until requested; an active query keeps them visible.
  const toolbarOpen = searchOpen || searchQuery.length > 0;

  return (
    <section className="hig-screen-container hig-closet-screen" aria-label="Closet">
      {/* Top Bar: Left Search | Center iNVTRY Brand | Right '+' + Profile + Account Settings */}
      <header className="hig-top-bar">
        <div className="hig-top-bar-left ui-nav-utility-group">
          <button
            type="button"
            className={`hig-circle-icon-btn hig-wardrobe-search-toggle ${toolbarOpen ? 'active' : ''}`}
            data-wardrobe-search-toggle="true"
            aria-expanded={toolbarOpen}
            aria-controls="wardrobe-search-toolbar"
            aria-label={tx(lang, '검색·정렬 열기', 'Open search and sort')}
            onClick={() => {
              triggerHaptic('selection');
              if (toolbarOpen && !searchQuery) {
                setSearchOpen(false);
              } else {
                setSearchOpen(true);
              }
            }}
          >
            <Search size={19} strokeWidth={2.1} />
          </button>
        </div>

        <div className="hig-top-bar-titles">
          <h1 className="sr-only">Closet</h1>
          <AppHeaderBrand effectiveTheme={theme} lang={lang} />
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

      {/* Progressive Disclosure: Search + Sort live behind the header toggle */}
      <div
        id="wardrobe-search-toolbar"
        className="hig-wardrobe-toolbar"
        data-open={toolbarOpen ? 'true' : 'false'}
        hidden={!toolbarOpen}
      >
        <div className="hig-wardrobe-search-wrap">
          <Search size={15} className="hig-wardrobe-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tx(
              lang,
              '아이템명, 브랜드, 소재 검색...',
              'Search name, brand, material...'
            )}
            aria-label={tx(lang, '옷장 아이템 검색', 'Search wardrobe items')}
            className="hig-wardrobe-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="hig-wardrobe-search-clear"
              aria-label={tx(lang, '검색어 지우기', 'Clear search')}
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div
          className="hig-wardrobe-sort-group"
          role="group"
          aria-label={tx(lang, '정렬 기준', 'Sort order')}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                className={`hig-wardrobe-sort-pill ${active ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setSortBy(opt.key);
                }}
              >
                {tx(lang, opt.ko, opt.en)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Relocated Wardrobe Item Count Pill (Cleanly clear of top-bar utilities) */}
      <div className="hig-wardrobe-meta-row">
        <span
          id={CARBON_DOM_CONTRACT.wardrobeItemCountId}
          className="hig-item-count tabular-nums"
        >
          {garments.length} ITEMS
        </span>
      </div>

      {/* Single Horizontal Pill Category Axis (Jewelry included — no duplicate row) */}
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
              data-wardrobe-jewelry-pill={pill.key === 'jewelry' ? 'true' : undefined}
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

      {/* Sub-Part Rail — disclosed only for Accessories / Jewelry */}
      {activeSubPartOptions && (
        <div
          className="hig-wardrobe-subtree-wrap"
          data-wardrobe-subtree="true"
          role="group"
          aria-label={tx(lang, '세부 분류', 'Sub-category')}
        >
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
        </div>
      )}

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
              <span>
                {searchQuery.trim()
                  ? tx(lang, '검색 조건에 맞는 의류가 없습니다', 'No matching items found')
                  : tx(lang, '등록된 의류가 없습니다', 'No Items')}
              </span>
              <div className="hig-empty-actions">
                {hasActiveFilterOrSearch && (
                  <button
                    type="button"
                    className="hig-pill-action-btn"
                    onClick={() => {
                      setActiveCategory('all');
                      setActiveSubPart('all');
                      setSearchQuery('');
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>{tx(lang, '필터 초기화', 'Reset Filters')}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="hig-pill-action-btn"
                  onClick={() => setAddModalOpen(true)}
                >
                  <Plus size={15} />
                  <span>{tx(lang, '+ 옷 등록', '+ Add Item')}</span>
                </button>
              </div>
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
              const wearCount = Number(item.wear_count || 0);

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
                    {wearCount > 0 && (
                      <span className="hig-card-wear-badge tabular-nums">
                        {tx(lang, `${wearCount}회`, `${wearCount}×`)}
                      </span>
                    )}
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
