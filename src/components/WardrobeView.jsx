import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, RotateCcw, Search, Shirt } from 'lucide-react';
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
  localizeApiMessage,
  localizeBrandName,
  localizeColorName,
  localizeGarmentMemo,
  localizeGarmentName,
  localizeMaterialLabel,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import AddGarmentModal from './AddGarmentModal.jsx';
import {
  ClearableField,
  ExclusiveErrorBoundary,
  ExclusiveErrorCard,
} from './ExclusiveViewPrimitives.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';
import './wardrobe/wardrobeUx.css';

const SEASON_FILTER_CHIPS = [
  { key: 'all', ko: '전체 계절', en: 'All Seasons', matchRe: null },
  { key: 'spring', ko: '봄', en: 'Spring', matchRe: /봄|spring|사계절|all/i },
  { key: 'summer', ko: '여름', en: 'Summer', matchRe: /여름|summer|사계절|all/i },
  { key: 'autumn', ko: '가을', en: 'Autumn', matchRe: /가을|autumn|fall|사계절|all/i },
  { key: 'winter', ko: '겨울', en: 'Winter', matchRe: /겨울|winter|사계절|all/i },
];

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

function matchesSeasonChip(item, seasonKey) {
  if (seasonKey === 'all') return true;
  const spec = SEASON_FILTER_CHIPS.find((s) => s.key === seasonKey);
  if (!spec?.matchRe) return true;
  const rawList = Array.isArray(item?.seasons) ? item.seasons : [];
  const combined = [...rawList, item?.primary_season].filter(Boolean).join(' ').trim();
  if (!combined) return false;
  return spec.matchRe.test(combined);
}

function matchesSearchQuery(item, normalizedQuery, lang) {
  if (!normalizedQuery) return true;
  const displayName =
    lang === 'en' && typeof item.name_en === 'string' && item.name_en.trim()
      ? item.name_en.trim()
      : localizeGarmentName(item.name, lang);
  const haystack = [
    item.name,
    item.name_en,
    displayName,
    item.brand,
    localizeBrandName(item.brand, lang),
    item.fabric,
    localizeMaterialLabel(item.fabric, lang),
    item.color_name,
    localizeColorName(item.color_name, lang),
    item.size,
    item.memo,
    item.notes,
    localizeGarmentMemo(item.memo ?? item.notes, lang),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function WardrobeViewContent({
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
  const [activeSeason, setActiveSeason] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const [wardrobeError, setWardrobeError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const ensuredSeedRef = useRef(new Set());
  const verifiedEmptyClosetRef = useRef('');

  // Support deep-link /?action=add (e.g. from Stats empty CTA)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add') {
      setAddModalOpen(true);
      params.delete('action');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  // Verify empty wardrobe vs API/storage failure (since parent manages fetch toast)
  useEffect(() => {
    if (loading) return;
    if (garments.length > 0) {
      setWardrobeError(null);
      verifiedEmptyClosetRef.current = activeCloset || 'sample';
      return;
    }

    const closetKey = activeCloset || 'sample';
    if (verifiedEmptyClosetRef.current === closetKey) return;

    let cancelled = false;
    apiFetch(`/garments?closet=${encodeURIComponent(closetKey)}`)
      .then((res) => {
        if (cancelled) return;
        verifiedEmptyClosetRef.current = closetKey;
        setWardrobeError(null);
        if (Array.isArray(res?.garments) && res.garments.length > 0) {
          onGarmentRegistered?.(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setWardrobeError(
          localizeApiMessage(err?.message, lang) ||
            tx(
              lang,
              '옷장 데이터를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
              'Could not load wardrobe data. Please check your connection and try again.'
            )
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeCloset, garments.length, lang, loading, onGarmentRegistered]);

  const handleRetryWardrobe = useCallback(async () => {
    const closetKey = activeCloset || 'sample';
    triggerHaptic('selection');
    setRetrying(true);
    setWardrobeError(null);
    try {
      const res = await apiFetch(`/garments?closet=${encodeURIComponent(closetKey)}`);
      verifiedEmptyClosetRef.current = closetKey;
      setWardrobeError(null);
      onGarmentRegistered?.(null);
      if (!res?.garments?.length) {
        showToast?.(tx(lang, '옷장을 확인했습니다.', 'Wardrobe refreshed.'));
      }
    } catch (err) {
      setWardrobeError(
        localizeApiMessage(err?.message, lang) ||
          tx(
            lang,
            '옷장 데이터를 다시 불러오지 못했습니다.',
            'Failed to reload wardrobe items.'
          )
      );
    } finally {
      setRetrying(false);
    }
  }, [activeCloset, lang, onGarmentRegistered, showToast]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasActiveFilters =
    activeCategory !== 'all' ||
    activeSubPart !== 'all' ||
    activeSeason !== 'all' ||
    normalizedSearch.length > 0;

  const handleResetFilters = useCallback(() => {
    triggerHaptic('selection');
    setActiveCategory('all');
    setActiveSubPart('all');
    setActiveSeason('all');
    setSearchQuery('');
  }, []);

  const filteredGarments = useMemo(() => {
    return garments.filter((item) => {
      if (activeCategory === 'jewelry') {
        if (!isJewelryGarment(item)) return false;
        if (activeSubPart !== 'all' && classifyAccessoryOrJewelryPart(item) !== activeSubPart) {
          return false;
        }
      } else if (activeCategory === 'accessory') {
        if (isJewelryGarment(item)) return false;
        if (normalizeWardrobeCategoryKey(item.category) !== 'accessory') return false;
        if (activeSubPart !== 'all' && classifyAccessoryOrJewelryPart(item) !== activeSubPart) {
          return false;
        }
      } else if (activeCategory !== 'all') {
        if (
          isJewelryGarment(item) ||
          normalizeWardrobeCategoryKey(item.category) !== activeCategory
        ) {
          return false;
        }
      }

      if (!matchesSeasonChip(item, activeSeason)) return false;
      if (!matchesSearchQuery(item, normalizedSearch, lang)) return false;
      return true;
    });
  }, [garments, activeCategory, activeSubPart, activeSeason, normalizedSearch, lang]);

  // Auto-seed 5 material items when user opens Jewelry or Accessory with no season/search filter and 0 items
  useEffect(() => {
    if (loading || retrying || wardrobeError) return;
    if (activeCategory !== 'jewelry' && activeCategory !== 'accessory') return;
    if (activeSeason !== 'all' || normalizedSearch) return;
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
  }, [
    activeCategory,
    activeSubPart,
    activeSeason,
    normalizedSearch,
    filteredGarments.length,
    loading,
    retrying,
    wardrobeError,
    activeCloset,
    onGarmentRegistered,
  ]);

  const activeSubPartOptions =
    activeCategory === 'jewelry'
      ? JEWELRY_WARDROBE_SUBPARTS
      : activeCategory === 'accessory'
        ? ACCESSORY_WARDROBE_SUBPARTS
        : null;

  const isBusyLoading = loading || retrying;

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
                <Plus size={21} strokeWidth={2.2} aria-hidden="true" />
              </button>
            }
          />
        </div>
      </header>

      {/* Controls Stack: Clearable Search + 6 Category Pills + Inline Season 5-Chips + Subparts */}
      <div className="wd-ux-controls-stack">
        <div className="wd-ux-search-bar">
          <ClearableField
            id="wardrobe-search-input"
            type="text"
            inputMode="search"
            className="hig-native-input"
            leadingIcon={<Search size={18} strokeWidth={2.1} />}
            placeholder={tx(
              lang,
              '아이템명, 브랜드, 소재, 색상 검색',
              'Search item name, brand, material, or color'
            )}
            aria-label={tx(lang, '옷장 아이템 검색', 'Search wardrobe items')}
            clearLabel={tx(lang, '검색어 전체 지우기', 'Clear search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            maxLength={80}
          />

          {hasActiveFilters && !isBusyLoading && !wardrobeError && (
            <div className="wd-ux-search-status">
              <span className="wd-ux-result-summary tabular-nums">
                {tx(
                  lang,
                  `전체 ${garments.length}벌 중 ${filteredGarments.length}벌 표시`,
                  `Showing ${filteredGarments.length} of ${garments.length} pieces`
                )}
              </span>
              <button
                type="button"
                className="wd-ux-reset-inline-btn"
                onClick={handleResetFilters}
              >
                <RotateCcw size={15} strokeWidth={2.2} aria-hidden="true" />
                <span>{tx(lang, '필터 초기화', 'Reset Filters')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Horizontal Scrollable Pill Category Filter — Contract exact pill labels */}
        <nav
          id={CARBON_DOM_CONTRACT.wardrobeCategoryRailId}
          className="hig-pill-rail"
          aria-label={tx(lang, '카테고리 필터', 'Category Filter')}
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
                {active && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                {pill.label}
              </button>
            );
          })}
        </nav>

        {/* Inline Season Chips (5 options, no <select> dropdown) */}
        <div
          className="wd-ux-season-rail"
          role="group"
          aria-label={tx(lang, '계절 필터', 'Season Filter')}
        >
          <span className="wd-ux-season-label">{tx(lang, '계절', 'Season')}</span>
          {SEASON_FILTER_CHIPS.map((chip) => {
            const active = activeSeason === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                data-wardrobe-season-chip={chip.key}
                aria-pressed={active}
                className={`wd-ux-inline-chip ${active ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveSeason(chip.key);
                }}
              >
                {active && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                <span>{tx(lang, chip.ko, chip.en)}</span>
              </button>
            );
          })}
        </div>

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
            {activeCategory === 'jewelry' && (
              <Check size={14} strokeWidth={2.6} aria-hidden="true" />
            )}
            <span>{tx(lang, '주얼리', 'Jewelry')}</span>
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
                    {active && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                    <span>{tx(lang, sub.ko, sub.en)}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Exception State 1: CLS-Free Skeleton Loading UI */}
      {isBusyLoading ? (
        <div
          className="hig-wardrobe-grid"
          aria-busy="true"
          aria-label={tx(lang, '옷장 불러오는 중', 'Loading wardrobe items')}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="wd-ux-skeleton-card">
              <div className="hig-squircle-skeleton" />
              <div className="wd-ux-skeleton-meta">
                <div className="wd-ux-skeleton-line" />
                <div className="wd-ux-skeleton-line is-short" />
              </div>
            </div>
          ))}
        </div>
      ) : wardrobeError ? (
        /* Exception State 3: Error State with >= 48px Recovery CTA */
        <ExclusiveErrorCard
          lang={lang}
          title={tx(lang, '옷장을 불러오지 못했습니다', 'Unable to Load Wardrobe')}
          message={wardrobeError}
          onRetry={handleRetryWardrobe}
          retrying={retrying}
        />
      ) : (
        <div id={CARBON_DOM_CONTRACT.wardrobeGridId} className="hig-wardrobe-grid">
          {filteredGarments.length === 0 ? (
            /* Exception State 2: Empty Wardrobe or 0 Filter Matches with Immediate Recovery CTAs */
            <div className="ux-state-card" role="status">
              <div className="ux-state-icon-badge" aria-hidden="true">
                {garments.length === 0 ? (
                  <Shirt size={22} strokeWidth={2.1} />
                ) : (
                  <Search size={22} strokeWidth={2.1} />
                )}
              </div>
              <div className="ux-state-copy">
                <h2 className="ux-state-title">
                  {garments.length === 0
                    ? tx(lang, '아직 등록된 옷이 없습니다', 'Your Wardrobe Is Empty')
                    : tx(lang, '조건에 맞는 옷이 없습니다', 'No Matching Pieces')}
                </h2>
                <p className="ux-state-desc">
                  {garments.length === 0
                    ? tx(
                        lang,
                        '자주 입는 상의나 아우터 한 벌부터 등록해 보세요. 피팅과 캘린더 기록이 바로 활성화됩니다.',
                        'Add your first piece from your camera or gallery to unlock studio styling and calendar logs.'
                      )
                    : tx(
                        lang,
                        '선택한 검색어, 카테고리 또는 계절 필터에 해당하는 의류가 없습니다. 필터를 초기화해 전체 옷장을 확인해 보세요.',
                        'No items match the current search, category, or season filter. Reset filters to view your full wardrobe.'
                      )}
                </p>
              </div>
              <div className="ux-state-actions">
                {garments.length === 0 ? (
                  <button
                    type="button"
                    className="ux-state-cta-btn is-primary"
                    onClick={() => {
                      triggerHaptic('selection');
                      setAddModalOpen(true);
                    }}
                  >
                    <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>{tx(lang, '+ 새 옷 등록하기', '+ Add New Item')}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ux-state-cta-btn is-primary"
                      onClick={handleResetFilters}
                    >
                      <RotateCcw size={17} strokeWidth={2.3} aria-hidden="true" />
                      <span>{tx(lang, '필터 초기화', 'Reset Filters')}</span>
                    </button>
                    <button
                      type="button"
                      className="ux-state-cta-btn is-secondary"
                      onClick={() => {
                        triggerHaptic('selection');
                        setAddModalOpen(true);
                      }}
                    >
                      <Plus size={17} strokeWidth={2.3} aria-hidden="true" />
                      <span>{tx(lang, '새 옷 등록하기', 'Add New Item')}</span>
                    </button>
                  </>
                )}
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

/**
 * MY WARDROBE — Apple HIG Inventory-First Closet Screen
 */
export default function WardrobeView(props) {
  return (
    <ExclusiveErrorBoundary
      lang={props.lang}
      screenClassName="hig-closet-screen"
      screenLabel="MY WARDROBE"
      errorTitle={tx(props.lang, '옷장 화면 오류', 'Wardrobe Error')}
      onRetry={() => props.onGarmentRegistered?.(null)}
    >
      <WardrobeViewContent {...props} />
    </ExclusiveErrorBoundary>
  );
}
