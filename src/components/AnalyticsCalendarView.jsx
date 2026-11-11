import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronRight,
  Download,
  Luggage,
  Plus,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { CATEGORIES, apiFetch, formatKRW } from '../utils/api.js';
import { triggerHaptic } from '../utils/nativeBridge.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import {
  PageHeader,
  ResponsiveSheetModal,
  SkeletonBentoGrid,
} from './common/AppUI.jsx';

const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

/**
 * Apple HIG Bento Insights, CPW Dashboard, OOTD Calendar & Trip Packing List View (Reqs 7.a, 7.c, 12.d, 13.a-c)
 * - Main screen presents concise Apple Fitness-style Bento Summary Cards with tabular-nums
 * - Tapping each card drills down into a spring physics Bottom Sheet
 */
export default function AnalyticsCalendarView({
  activeCloset,
  user,
  refreshKey,
  onClosetUpdated,
  showToast,
}) {
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [packingLists, setPackingLists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Drill-Down Sheet: null | 'cpw' | 'dormant' | 'balance' | 'calendar' | 'packing'
  const [activeSheet, setActiveSheet] = useState(null);

  // Calendar Form State
  const todayStr = new Date().toISOString().slice(0, 10);
  const [logForm, setLogForm] = useState({
    worn_date: todayStr,
    outfit_id: '',
    status: 'worn', // 'worn' | 'planned'
    note: '',
  });

  // Trip Packing Form State
  const [tripForm, setTripForm] = useState({
    title: '주말 여행 패킹',
    destination: '도쿄',
    start_date: todayStr,
    end_date: todayStr,
    climate: 'mild',
  });
  const [creatingTrip, setCreatingTrip] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(activeCloset);
      const [anaRes, calRes, outRes, packRes] = await Promise.all([
        apiFetch(`/analytics?closet=${q}`),
        apiFetch(`/calendar?closet=${q}`),
        apiFetch(`/outfits?closet=${q}`),
        apiFetch(`/packing-lists?closet=${q}`),
      ]);
      setAnalytics(anaRes);
      setLogs(calRes.logs || []);
      const loadedOutfits = outRes.outfits || [];
      setOutfits(loadedOutfits);
      setPackingLists(packRes.lists || packRes.packingLists || []);
      if (loadedOutfits.length > 0) {
        setLogForm((prev) => ({
          ...prev,
          outfit_id: prev.outfit_id || String(loadedOutfits[0].id),
        }));
      }
    } catch (err) {
      showToast?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeCloset, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

  const handleAddCalendarEntry = async (e) => {
    e.preventDefault();
    const isFuture = logForm.worn_date > todayStr;
    const resolvedStatus = isFuture ? 'planned' : logForm.status;
    try {
      const targetOwner =
        activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset;
      const chosenOutfit = outfits.find((o) => String(o.id) === String(logForm.outfit_id));
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          worn_date: logForm.worn_date,
          outfit_id: logForm.outfit_id ? Number(logForm.outfit_id) : null,
          item_ids: chosenOutfit?.item_ids || [],
          status: resolvedStatus,
          weather_summary: resolvedStatus === 'planned' ? '예약된 코디 일정' : '착용 기록',
          note: logForm.note,
        }),
      });
      setLogForm((prev) => ({ ...prev, note: '' }));
      await loadAll();
      onClosetUpdated?.();
      showToast?.(
        resolvedStatus === 'planned'
          ? '미래 일정 코디가 예약되었습니다'
          : 'OOTD 착용 기록이 저장되었습니다'
      );
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleMarkPlannedAsWorn = async (entryId) => {
    try {
      await apiFetch(`/calendar/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'worn' }),
      });
      await loadAll();
      onClosetUpdated?.();
      showToast?.('예약 코디를 착용 완료로 전환했습니다');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleDeleteCalendarEntry = async (entryId) => {
    try {
      await apiFetch(`/calendar/${entryId}`, { method: 'DELETE' });
      await loadAll();
      showToast?.('캘린더 일정이 삭제되었습니다');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleCreatePackingList = async (e) => {
    e.preventDefault();
    setCreatingTrip(true);
    try {
      const targetOwner =
        activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset;
      await apiFetch('/packing-lists', {
        method: 'POST',
        body: JSON.stringify({
          ...tripForm,
          closet_owner: targetOwner,
        }),
      });
      await loadAll();
      showToast?.('여행 기간·기후 맞춤 패킹 체크리스트가 생성되었습니다');
    } catch (err) {
      showToast?.(err.message);
    } finally {
      setCreatingTrip(false);
    }
  };

  const handleTogglePackingItem = async (listObj, itemIdx) => {
    const nextItems = (listObj.items || []).map((it, idx) =>
      idx === itemIdx ? { ...it, packed: !it.packed, checked: !(it.packed || it.checked) } : it
    );
    triggerHaptic('selection');
    setPackingLists((prev) =>
      prev.map((pl) => (pl.id === listObj.id ? { ...pl, items: nextItems } : pl))
    );
    try {
      await apiFetch(`/packing-lists/${listObj.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ items: nextItems }),
      });
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleDeletePackingList = async (listId) => {
    try {
      await apiFetch(`/packing-lists/${listId}`, { method: 'DELETE' });
      await loadAll();
      showToast?.('패킹 리스트가 삭제되었습니다');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  if (loading || !analytics) {
    return (
      <div>
        <PageHeader title="인사이트" subtitle="데이터 집계 중" />
        <SkeletonBentoGrid count={3} />
      </div>
    );
  }

  const summary = analytics.summary || {
    totalItems: analytics.totalItems ?? 0,
    totalValue: analytics.totalValue ?? 0,
    avgCpw: analytics.avgCpw ?? 0,
    utilizationRate: analytics.utilizationRate ?? 0,
    unwornCount: (analytics.sleepingItems || []).length,
  };
  const dormantItems = analytics.sleepingItems || analytics.dormantItems || [];
  const bestCpwList = analytics.bestValueItems || analytics.bestCpw || [];
  const worstCpwList =
    analytics.worstCpw || [...(analytics.cpwRanking || [])].reverse().slice(0, 6);
  const colorDistList = analytics.colorDist || analytics.colorDistribution || [];
  const catDistList = analytics.sortedCategories || analytics.categoryDistribution || [];
  const topColor = colorDistList[0];
  const topCat = catDistList[0];
  const plannedCount = logs.filter((l) => l.status === 'planned').length;
  const wornCount = logs.length - plannedCount;

  const openSheet = (key) => {
    triggerHaptic('selection');
    setActiveSheet(key);
  };

  return (
    <div>
      <PageHeader
        title="인사이트"
        subtitle={
          <span className="tabular-nums">
            총 {summary.totalItems}벌 · 활용률 {summary.utilizationRate}%
          </span>
        }
        actions={
          <button
            id="open-ootd-calendar-sheet-btn"
            type="button"
            className="btn btn-secondary btn-sm tabular-nums"
            onClick={() => openSheet('calendar')}
          >
            <Calendar size={14} />
            <span>캘린더 ({wornCount + plannedCount})</span>
          </button>
        }
      />

      {/* Primary Apple Fitness-Style Bento Grid (3 Summary Metric Cards — Req 12.d) */}
      <div className="hig-bento-grid">
        {/* Bento 1: Average CPW */}
        <button
          id="bento-cpw-card"
          type="button"
          className="hig-bento-card"
          onClick={() => openSheet('cpw')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span className="hig-caption">1회 착용 비용 (CPW)</span>
            <TrendingDown size={16} />
          </div>
          <div>
            <div className="hig-large-title tabular-nums">{formatKRW(summary.avgCpw)}</div>
            <div className="hig-caption tabular-nums" style={{ marginTop: 8 }}>
              총 자산 {formatKRW(summary.totalValue)} · 순위 보기
            </div>
          </div>
        </button>

        {/* Bento 2: Closet Utilization, Dormant Alert & Balance (#bento-utilization-card) */}
        <button
          id="bento-utilization-card"
          type="button"
          className="hig-bento-card"
          onClick={() => openSheet('utilization')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span className="hig-caption">옷장 가동률 · 미착용 리포트</span>
            <AlertCircle size={16} />
          </div>
          <div>
            <div className="hig-large-title tabular-nums">{summary.utilizationRate}%</div>
            <div className="hig-caption tabular-nums" style={{ marginTop: 8 }}>
              미착용 {dormantItems.length || summary.unwornCount}벌
              {topColor
                ? ` · 최다 컬러 ${topColor.name} ${topColor.sharePct ?? topColor.pct ?? Math.round((topColor.count / Math.max(1, summary.totalItems)) * 100)}%`
                : ''}
            </div>
          </div>
        </button>

        {/* Bento 3: Trip Packing Checklists (#bento-packing-card) */}
        <button
          id="bento-packing-card"
          type="button"
          className="hig-bento-card"
          onClick={() => openSheet('packing')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span className="hig-caption">여행 패킹 리스트</span>
            <Luggage size={16} />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              width: '100%',
            }}
          >
            <div>
              <div className="hig-large-title tabular-nums">{packingLists.length}개</div>
              <div className="hig-caption tabular-nums" style={{ marginTop: 8 }}>
                OOTD 기록 {wornCount}건 · 예약 {plannedCount}건
              </div>
            </div>
            <ChevronRight size={18} />
          </div>
        </button>
      </div>

      {/* Sheet 1: CPW Drill-Down */}
      <ResponsiveSheetModal
        open={activeSheet === 'cpw'}
        onClose={() => setActiveSheet(null)}
        eyebrow="COST PER WEAR"
        title="아이템별 1회 착용 비용(CPW) 상세"
        maxWidth={580}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
              최고 효율 아이템 (Best CPW)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bestCpwList.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    borderRadius: 16,
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: 'var(--bg-canvas)',
                      padding: 4,
                    }}
                  >
                    <StudioGarmentImage
                      item={item}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hig-body" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="hig-caption tabular-nums">
                      구매가 {formatKRW(item.price)} · {item.wear_count}회 착용
                    </div>
                  </div>
                  <strong className="hig-headline tabular-nums">{formatKRW(item.cpw)}/회</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
              개선 필요 아이템 (High CPW)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {worstCpwList.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    borderRadius: 16,
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: 'var(--bg-canvas)',
                      padding: 4,
                    }}
                  >
                    <StudioGarmentImage
                      item={item}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hig-body" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="hig-caption tabular-nums">
                      구매가 {formatKRW(item.price)} · {item.wear_count}회 착용
                    </div>
                  </div>
                  <strong className="hig-headline tabular-nums">{formatKRW(item.cpw)}/회</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Sheet 2: Utilization, Dormant Garments & Wardrobe Balance Drill-Down */}
      <ResponsiveSheetModal
        open={activeSheet === 'utilization' || activeSheet === 'dormant' || activeSheet === 'balance'}
        onClose={() => setActiveSheet(null)}
        eyebrow="UTILIZATION & BALANCE"
        title="옷장 가동률 · 미착용 및 편중도"
        maxWidth={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="hig-caption">장기간 미착용 의류 ({dormantItems.length}벌)</span>
            {dormantItems.length === 0 ? (
              <p className="hig-caption">현재 모든 의류가 고르게 착용되고 있습니다.</p>
            ) : (
              dormantItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    borderRadius: 16,
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: 'var(--bg-canvas)',
                      padding: 4,
                    }}
                  >
                    <StudioGarmentImage
                      item={item}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="hig-body" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="hig-caption tabular-nums">
                      착용 {item.wear_count || 0}회 ·{' '}
                      {item.daysUnworn && item.daysUnworn < 900
                        ? `${item.daysUnworn}일 경과`
                        : item.daysSinceWorn
                          ? `${item.daysSinceWorn}일 경과`
                          : '미착용 상태'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      await apiFetch(`/garments/${item.id}/wear`, { method: 'POST' });
                      await loadAll();
                      onClosetUpdated?.();
                      showToast?.('오늘 착용으로 전환되었습니다');
                    }}
                  >
                    착용 +1
                  </button>
                </div>
              ))
            )}
          </div>

          <div>
            <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
              색상 분포 · 최다 분류 ({topCat ? CATEGORY_LABEL_MAP[topCat.category] || topCat.category : '-'})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {colorDistList.map((c) => {
                const pct = c.sharePct ?? Math.round((c.count / Math.max(1, summary.totalItems)) * 100);
                return (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: c.hex,
                        flexShrink: 0,
                      }}
                    />
                    <span className="hig-caption" style={{ width: 80 }}>
                      {c.name}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 999,
                        background: 'var(--bg-surface)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'var(--accent-mono)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span className="hig-caption tabular-nums" style={{ width: 48, textAlign: 'right' }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
              카테고리 비중
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catDistList.map((cat) => {
                const pct =
                  cat.sharePct ?? Math.round((cat.count / Math.max(1, summary.totalItems)) * 100);
                return (
                  <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="hig-caption" style={{ width: 96 }}>
                      {CATEGORY_LABEL_MAP[cat.category] || cat.category}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 999,
                        background: 'var(--bg-surface)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'var(--accent-mono)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span className="hig-caption tabular-nums" style={{ width: 56, textAlign: 'right' }}>
                      {cat.count}벌 ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Sheet 4: OOTD Outfit Calendar & Future Schedule Reservation (Req 7.a) */}
      <ResponsiveSheetModal
        open={activeSheet === 'calendar'}
        onClose={() => setActiveSheet(null)}
        eyebrow="OOTD CALENDAR & SCHEDULE"
        title="OOTD 기록 · 미래 일정 코디 예약"
        maxWidth={580}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form
            onSubmit={handleAddCalendarEntry}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                id="calendar-date-input"
                type="date"
                className="text-input tabular-nums"
                style={{ background: 'var(--bg-canvas)' }}
                value={logForm.worn_date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setLogForm((prev) => ({
                    ...prev,
                    worn_date: nextDate,
                    status: nextDate > todayStr ? 'planned' : 'worn',
                  }));
                }}
              />
              <select
                className="select-input"
                style={{ background: 'var(--bg-canvas)' }}
                value={logForm.status}
                onChange={(e) => setLogForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="worn">착용 완료 (OOTD)</option>
                <option value="planned">미래 일정 코디 예약</option>
              </select>
            </div>

            <select
              className="select-input"
              style={{ background: 'var(--bg-canvas)' }}
              value={logForm.outfit_id}
              onChange={(e) => setLogForm((prev) => ({ ...prev, outfit_id: e.target.value }))}
            >
              <option value="">자유 코디 기록</option>
              {outfits.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title || o.name}
                </option>
              ))}
            </select>

            <input
              className="text-input"
              style={{ background: 'var(--bg-canvas)' }}
              placeholder="일정 메모 (예: 출장 미팅, 주말 브런치)"
              value={logForm.note}
              onChange={(e) => setLogForm((prev) => ({ ...prev, note: e.target.value }))}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a
                href={`/api/calendar/ics?closet=${encodeURIComponent(activeCloset)}`}
                download="ainventory-ootd.ics"
                className="btn btn-secondary btn-sm"
              >
                <Download size={14} /> .ics 내보내기
              </a>
              <button id="save-calendar-entry-btn" type="submit" className="btn btn-primary btn-sm">
                <Plus size={14} />
                <span>{logForm.status === 'planned' || logForm.worn_date > todayStr ? '일정 코디 예약' : '착용 기록 추가'}</span>
              </button>
            </div>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logs.map((entry) => {
              const matchedOutfit = outfits.find((o) => Number(o.id) === Number(entry.outfit_id));
              return (
                <div
                  key={entry.id}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 16,
                    padding: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <div className="hig-body" style={{ fontWeight: 600 }}>
                      <span className="tabular-nums">{entry.worn_date}</span> ·{' '}
                      {matchedOutfit?.title || entry.outfit?.name || '데일리 코디'}
                    </div>
                  <div className="hig-caption">
                    {entry.status === 'planned' ? '예약됨' : '착용 완료'}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {entry.status === 'planned' && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleMarkPlannedAsWorn(entry.id)}
                    >
                      <Check size={13} /> 착용 완료
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="기록 삭제"
                    onClick={() => handleDeleteCalendarEntry(entry.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Sheet 5: Trip Packing Checklist Generator (Req 7.a) */}
      <ResponsiveSheetModal
        open={activeSheet === 'packing'}
        onClose={() => setActiveSheet(null)}
        eyebrow="TRIP PACKING CHECKLIST"
        title="여행 기간 · 목적지별 패킹 리스트"
        maxWidth={580}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form
            onSubmit={handleCreatePackingList}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 18,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                id="packing-title-input"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder="여행 제목"
                value={tripForm.title}
                onChange={(e) => setTripForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
              <input
                id="packing-dest-input"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder="목적지 (예: 도쿄, 제주)"
                value={tripForm.destination}
                onChange={(e) => setTripForm((prev) => ({ ...prev, destination: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <input
                type="date"
                className="text-input tabular-nums"
                style={{ background: 'var(--bg-canvas)' }}
                value={tripForm.start_date}
                onChange={(e) => setTripForm((prev) => ({ ...prev, start_date: e.target.value }))}
              />
              <input
                type="date"
                className="text-input tabular-nums"
                style={{ background: 'var(--bg-canvas)' }}
                value={tripForm.end_date}
                onChange={(e) => setTripForm((prev) => ({ ...prev, end_date: e.target.value }))}
              />
              <select
                className="select-input"
                style={{ background: 'var(--bg-canvas)' }}
                value={tripForm.climate}
                onChange={(e) => setTripForm((prev) => ({ ...prev, climate: e.target.value }))}
              >
                <option value="mild">선선·온화</option>
                <option value="warm">더움·휴양지</option>
                <option value="cold">추움·겨울</option>
                <option value="rainy">비·우천 대비</option>
              </select>
            </div>

            <button
              id="create-packing-list-btn"
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={creatingTrip}
              style={{ alignSelf: 'flex-end' }}
            >
              <Plus size={14} /> {creatingTrip ? '구성 중...' : '패킹 체크리스트 자동 생성'}
            </button>
          </form>

          {packingLists.map((pl) => {
            const items = pl.items || [];
            const checkedCount = items.filter((i) => i.packed || i.checked).length;
            return (
              <div
                key={pl.id}
                data-packing-list-id={pl.id}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 18,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="hig-headline">
                      {pl.title} · {pl.destination}
                    </div>
                    <div className="hig-caption tabular-nums">
                      {pl.start_date} ~ {pl.end_date} ({checkedCount}/{items.length} 챙김)
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="패킹 리스트 삭제"
                    onClick={() => handleDeletePackingList(pl.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((it, idx) => {
                    const isChecked = Boolean(it.packed || it.checked);
                    return (
                      <button
                        key={`${pl.id}-${idx}`}
                        type="button"
                        onClick={() => handleTogglePackingItem(pl, idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: 'var(--bg-canvas)',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          className="hig-body"
                          style={{
                            textDecoration: isChecked ? 'line-through' : 'none',
                            opacity: isChecked ? 0.55 : 1,
                          }}
                        >
                          {it.label || it.name}
                        </span>
                        <span className="hig-caption tabular-nums">
                          {isChecked ? '완료 ✓' : `x${it.qty || 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ResponsiveSheetModal>
    </div>
  );
}
