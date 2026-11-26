import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  WashingMachine,
  X,
} from 'lucide-react';
import {
  LAUNDRY_BASKET_EVENT,
  addManyToLaundryBasket,
  clearLaundryBasket,
  loadLaundryBasket,
  markLaundryItemsWashed,
  removeFromLaundryBasket,
  toggleLaundryBasketItem,
} from '../services/laundryBasketStore.ts';
import { apiFetch } from '../utils/api.ts';
import {
  extractRecentCalendarGarmentIds,
  formatCareSummaryTokens,
  sortLaundryBasket,
} from '../utils/garmentCareEngine.ts';
import { localizeGarmentName, tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

export default function SmartLaundryBasketModal({
  open,
  onClose,
  activeCloset = 'sample',
  garments = [],
  lang = 'ko',
  onOpenCareMap,
  showToast,
}) {
  const [basket, setBasket] = useState(() => loadLaundryBasket());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [importingCalendar, setImportingCalendar] = useState(false);

  useEffect(() => {
    const sync = (ev) => {
      setBasket(ev?.detail || loadLaundryBasket());
    };
    window.addEventListener(LAUNDRY_BASKET_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(LAUNDRY_BASKET_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setBasket(loadLaundryBasket());
    }
  }, [open]);

  const garmentById = useMemo(() => {
    const dict = {};
    for (const g of garments) {
      if (g?.id != null) dict[String(g.id)] = g;
    }
    return dict;
  }, [garments]);

  const basketGarments = useMemo(
    () =>
      basket.garmentIds
        .map((id) => garmentById[String(id)])
        .filter(Boolean),
    [basket.garmentIds, garmentById]
  );

  const sortingPlan = useMemo(
    () => sortLaundryBasket(basketGarments, lang),
    [basketGarments, lang]
  );

  const pickerGarments = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return garments.filter((g) => {
      if (!q) return true;
      const hay = [g.name, g.name_en, g.brand, g.fabric, g.color_name, g.subcategory]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [garments, pickerQuery]);

  const handleImportRecentWorn = useCallback(async () => {
    triggerHaptic('selection');
    setImportingCalendar(true);
    try {
      const q = encodeURIComponent(activeCloset || 'sample');
      const [calRes, outRes] = await Promise.all([
        apiFetch(`/calendar?closet=${q}`),
        apiFetch(`/outfits?closet=${q}`),
      ]);
      const recentIds = extractRecentCalendarGarmentIds(
        calRes?.logs || [],
        outRes?.outfits || [],
        7
      );
      const validIds = recentIds.filter((id) => Boolean(garmentById[String(id)]));
      if (validIds.length === 0) {
        showToast?.(
          tx(
            lang,
            '최근 7일 내 캘린더 착용 기록이 없습니다. 아래에서 옷을 직접 담아 보세요.',
            'No worn records found in the past 7 days. Pick items manually below.'
          )
        );
        setPickerOpen(true);
        return;
      }
      const { state, addedCount } = addManyToLaundryBasket(validIds);
      setBasket(state);
      triggerHaptic('medium');
      showToast?.(
        addedCount > 0
          ? tx(
              lang,
              `최근 7일 착용 의류 ${addedCount}벌을 세탁 바구니에 담았습니다.`,
              `Added ${addedCount} recently worn item(s) from Calendar.`
            )
          : tx(
              lang,
              '최근 착용한 의류가 이미 세탁 바구니에 담겨 있습니다.',
              'Recently worn items are already in your laundry basket.'
            )
      );
    } catch {
      showToast?.(
        tx(
          lang,
          '캘린더 착용 기록을 불러오지 못했습니다.',
          'Failed to import worn history from Calendar.'
        )
      );
    } finally {
      setImportingCalendar(false);
    }
  }, [activeCloset, garmentById, lang, showToast]);

  const handleCompleteCourse = useCallback(
    (bucket) => {
      const ids = bucket.items.map((entry) => Number(entry.garment.id));
      const next = markLaundryItemsWashed(ids);
      setBasket(next);
      triggerHaptic('medium');
      showToast?.(
        tx(
          lang,
          `${bucket.titleKo} ${ids.length}벌을 세탁 완료 처리했습니다.`,
          `Marked ${ids.length} item(s) in ${bucket.titleEn} as washed.`
        )
      );
    },
    [lang, showToast]
  );

  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      title={tx(lang, '스마트 세탁 바구니', 'Smart Laundry Basket')}
      subtitle={tx(
        lang,
        '세탁 라벨·소재 기반으로 함께 세탁 가능 여부와 코스를 자동 분류합니다',
        'Auto-sorts wash courses and detects shrinkage or color-bleed conflicts'
      )}
      maxWidth={620}
    >
      <div className="space-y-4">
        {/* Top Action Strip: 1-Tap Calendar Import + Manual Picker + Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleImportRecentWorn}
            disabled={importingCalendar}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-opacity disabled:opacity-60"
          >
            {importingCalendar ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Calendar size={14} />
            )}
            <span>
              {tx(lang, '최근 입은 옷 불러오기 (7일)', 'Import Last 7 Days Worn')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setPickerOpen((prev) => !prev);
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-black/12 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Plus size={14} />
            <span>
              {pickerOpen
                ? tx(lang, '옷장 선택 닫기', 'Close Picker')
                : tx(lang, '옷장에서 직접 담기', 'Add from Closet')}
            </span>
          </button>

          {basketGarments.length > 0 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('warning');
                setBasket(clearLaundryBasket());
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 ml-auto whitespace-nowrap shrink-0"
            >
              <Trash2 size={13} />
              <span>{tx(lang, '비우기', 'Clear')}</span>
            </button>
          )}
        </div>

        {/* Optional Quick Closet Multi-Picker */}
        {pickerOpen && (
          <div className="rounded-2xl border border-black/10 dark:border-white/12 p-3 space-y-2.5 bg-black/[0.02] dark:bg-white/[0.03]">
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder={tx(lang, '니트, 데님, 셔츠 등 이름으로 검색…', 'Search knit, denim, shirt…')}
              className="w-full min-h-[40px] px-3 rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-neutral-900 text-xs outline-none"
            />
            <div className="max-h-[190px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {pickerGarments.slice(0, 40).map((item) => {
                const selected = basket.garmentIds.includes(Number(item.id));
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      const { state } = toggleLaundryBasketItem(Number(item.id));
                      setBasket(state);
                    }}
                    className={`min-h-[44px] px-2.5 py-1.5 rounded-xl border text-left flex items-center gap-2 transition-colors ${
                      selected
                        ? 'border-neutral-900 dark:border-white bg-neutral-900/5 dark:bg-white/10'
                        : 'border-black/8 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={localizeGarmentName(item.name, lang)}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <WashingMachine size={14} className="opacity-50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">
                        {localizeGarmentName(item.name, lang)}
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {item.fabric || item.category}
                      </div>
                    </div>
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        selected
                          ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-white dark:border-white dark:text-neutral-950'
                          : 'border-black/20 dark:border-white/25'
                      }`}
                    >
                      {selected && <Check size={12} strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Headline Diagnosis Summary */}
        {basketGarments.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-black/15 dark:border-white/15 space-y-2">
            <WashingMachine size={28} className="mx-auto opacity-45" />
            <div className="text-sm font-semibold">
              {tx(lang, '세탁 바구니가 비어 있습니다', 'Your laundry basket is empty')}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed">
              {tx(
                lang,
                '매일 니트·울 세탁탭을 뒤집어 볼 필요 없이, 최근 입은 옷을 불러오거나 담아두면 드라이클리닝·울코스·이염 주의 의류를 자동으로 분류해 드립니다.',
                'Stop checking care tags by hand every day. Import recently worn clothes or add items to auto-group safe wash courses.'
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="px-3.5 py-3 rounded-2xl border border-black/10 dark:border-white/12 bg-black/[0.025] dark:bg-white/[0.04] flex items-start gap-2.5">
              {sortingPlan.canWashTogether ? (
                <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-semibold tabular-nums">
                  {lang === 'en' ? sortingPlan.headlineEn : sortingPlan.headlineKo}
                </div>
                {sortingPlan.conflicts.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {sortingPlan.conflicts.map((conflict) => (
                      <li
                        key={conflict.id}
                        className={`text-[11px] leading-snug ${
                          conflict.severity === 'critical'
                            ? 'text-amber-800 dark:text-amber-300 font-medium'
                            : 'text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        <span>{lang === 'en' ? conflict.titleEn : conflict.titleKo}</span>
                        <span aria-hidden="true"> — </span>
                        <span className="font-normal opacity-90">
                          {lang === 'en' ? conflict.detailEn : conflict.detailKo}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Auto-Grouped Wash Course Buckets */}
            <div className="space-y-3">
              {sortingPlan.buckets.map((bucket) => (
                <section
                  key={bucket.key}
                  className="rounded-2xl border border-black/10 dark:border-white/12 overflow-hidden"
                >
                  <div className="px-3.5 py-2.5 bg-black/[0.03] dark:bg-white/[0.05] border-b border-black/8 dark:border-white/10 flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold tabular-nums">
                        {lang === 'en' ? bucket.titleEn : bucket.titleKo}
                        <span aria-hidden="true"> · </span>
                        <span>
                          {tx(lang, `${bucket.items.length}벌`, `${bucket.items.length} items`)}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {lang === 'en' ? bucket.settingsEn : bucket.settingsKo}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {bucket.recommendedMapService && onOpenCareMap && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('selection');
                            onOpenCareMap(
                              bucket.items[0]?.garment || null,
                              bucket.recommendedMapService
                            );
                          }}
                          className="min-h-[36px] px-2.5 rounded-lg border border-black/15 dark:border-white/20 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap hover:bg-neutral-900 hover:text-white dark:hover:bg-white dark:hover:text-neutral-950 transition-colors"
                        >
                          <MapPin size={12} />
                          <span>
                            {bucket.recommendedMapService === 'leather_care'
                              ? tx(lang, '주변 가죽케어', 'Leather Care Map')
                              : tx(lang, '주변 드라이클리닝', 'Find Dry Cleaner')}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCompleteCourse(bucket)}
                        className="min-h-[36px] px-2.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                      >
                        <CheckCircle2 size={12} />
                        <span>{tx(lang, '세탁 완료', 'Done')}</span>
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-black/6 dark:divide-white/8">
                    {bucket.items.map(({ garment, care }) => {
                      const tokens = formatCareSummaryTokens(care, lang);
                      return (
                        <div
                          key={garment.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                              {garment.image_url ? (
                                <img
                                  src={garment.image_url}
                                  alt={localizeGarmentName(garment.name, lang)}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <WashingMachine size={16} className="opacity-45" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold truncate">
                                {localizeGarmentName(garment.name, lang)}
                              </div>
                              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate tabular-nums">
                                {tokens.join(' · ')}
                              </div>
                              {care.source === 'inferred' && (
                                <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                                  {tx(
                                    lang,
                                    '소재 기반 자동 추정 (세탁탭 등록 시 정확도 향상)',
                                    'Inferred from fiber (scan care label for exact symbols)'
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-label={tx(lang, '바구니에서 제외', 'Remove from basket')}
                            onClick={() => {
                              triggerHaptic('selection');
                              setBasket(removeFromLaundryBasket(Number(garment.id)));
                            }}
                            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </ResponsiveSheetModal>
  );
}
