import { useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  localizeCalendarNote,
  localizeGarmentName,
  tx,
} from '../../utils/i18n.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import GarmentObject25D from '../GarmentObject25D.jsx';
import {
  formatIsoDateLocal,
  parseIsoDateLocal,
  resolveEntryItems,
  resolveEntryTitle,
  resolveWeatherVisual,
} from './calendarHelpers.js';

const MONTH_NAMES_EN = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

const SHORT_MONTH_EN = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

const DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function StackedGarmentPreview({ items = [], lang = 'ko', large = false }) {
  if (!items || items.length === 0) return null;
  const visible = items.slice(0, 3);
  const extraCount = Math.max(0, items.length - visible.length);

  return (
    <div className={`cal-ed-stack-stage ${large ? 'is-large' : ''}`} aria-hidden="true">
      {visible.map((item, idx) => (
        <div
          key={`${item.id}-${idx}`}
          className="cal-ed-stack-card"
          data-stack-pos={String(idx)}
          data-stack-total={String(visible.length)}
        >
          <GarmentObject25D
            item={item}
            alt={localizeGarmentName(item.name, lang)}
            padding={large ? '11%' : '9%'}
          />
        </div>
      ))}
      {extraCount > 0 && <span className="cal-ed-stack-more">+{extraCount}</span>}
    </div>
  );
}

export default function CalendarLookbookGrid({
  logs = [],
  outfits = [],
  garmentMap,
  lang = 'ko',
  viewMode = 'month',
  onChangeViewMode,
  cursorDate,
  selectedDate,
  todayStr,
  onNavigatePeriod,
  onJumpToday,
  onSelectDate,
}) {
  const logsByDate = useMemo(() => {
    const map = new Map();
    for (const entry of logs) {
      const d = String(entry.worn_date || '').slice(0, 10);
      if (!d) continue;
      const bucket = map.get(d) || [];
      bucket.push(entry);
      map.set(d, bucket);
    }
    return map;
  }, [logs]);

  const cursorDt = useMemo(() => parseIsoDateLocal(cursorDate), [cursorDate]);

  const monthCells = useMemo(() => {
    const year = cursorDt.getFullYear();
    const month = cursorDt.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDow = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = startDow + daysInMonth > 35 ? 42 : 35;

    const gridStart = new Date(year, month, 1 - startDow);
    const cells = [];
    for (let i = 0; i < totalCells; i += 1) {
      const dt = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const dateStr = formatIsoDateLocal(dt);
      cells.push({
        dateStr,
        dayNum: dt.getDate(),
        dow: dt.getDay(),
        isCurrentMonth: dt.getMonth() === month,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        entries: logsByDate.get(dateStr) || [],
      });
    }
    return cells;
  }, [cursorDt, logsByDate, selectedDate, todayStr]);

  const weekCells = useMemo(() => {
    const startOffset = cursorDt.getDay();
    const sunday = new Date(
      cursorDt.getFullYear(),
      cursorDt.getMonth(),
      cursorDt.getDate() - startOffset
    );
    const cells = [];
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
      const dateStr = formatIsoDateLocal(dt);
      cells.push({
        dateStr,
        dayNum: dt.getDate(),
        monthIdx: dt.getMonth(),
        dow: dt.getDay(),
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        entries: logsByDate.get(dateStr) || [],
      });
    }
    return cells;
  }, [cursorDt, logsByDate, selectedDate, todayStr]);

  const periodHeading = useMemo(() => {
    if (viewMode === 'week' && weekCells.length === 7) {
      const first = weekCells[0];
      const last = weekCells[6];
      if (lang === 'en') {
        return `${SHORT_MONTH_EN[first.monthIdx]} ${String(first.dayNum).padStart(2, '0')} – ${SHORT_MONTH_EN[last.monthIdx]} ${String(last.dayNum).padStart(2, '0')}, ${cursorDt.getFullYear()}`;
      }
      return `${cursorDt.getFullYear()}. ${String(first.monthIdx + 1).padStart(2, '0')}.${String(first.dayNum).padStart(2, '0')} – ${String(last.monthIdx + 1).padStart(2, '0')}.${String(last.dayNum).padStart(2, '0')}`;
    }
    const y = cursorDt.getFullYear();
    const m = cursorDt.getMonth();
    if (lang === 'en') {
      return `${y}. ${String(m + 1).padStart(2, '0')} · ${MONTH_NAMES_EN[m]}`;
    }
    return `${y}년 ${m + 1}월`;
  }, [cursorDt, lang, viewMode, weekCells]);

  const kpiSummary = useMemo(() => {
    const wornTotal = logs.filter((l) => l.status !== 'planned').length;
    const plannedTotal = logs.filter((l) => l.status === 'planned').length;
    const activeCells = viewMode === 'week' ? weekCells : monthCells.filter((c) => c.isCurrentMonth);
    const activeDays = activeCells.filter((c) => c.entries.length > 0).length;
    return { wornTotal, plannedTotal, activeDays };
  }, [logs, monthCells, viewMode, weekCells]);

  const recentArchive = useMemo(() => {
    return [...logs]
      .sort((a, b) => String(b.worn_date || '').localeCompare(String(a.worn_date || '')))
      .slice(0, 4);
  }, [logs]);

  const dowHeaders = lang === 'en' ? DOW_EN : DOW_KO;

  return (
    <div className="cal-ed-root">
      {/* Editorial Bento Control Header */}
      <div className="cal-ed-bento-bar">
        <div className="cal-ed-nav-card">
          <div className="cal-ed-period-meta">
            <span className="cal-ed-eyebrow">
              {viewMode === 'month'
                ? tx(lang, '월간 에디토리얼 캘린더', 'MONTHLY EDITORIAL ISSUE')
                : tx(lang, '주간 룩북 스트립', 'WEEKLY LOOKBOOK STRIP')}
            </span>
            <strong className="cal-ed-period-title">{periodHeading}</strong>
          </div>

          <div className="cal-ed-nav-controls">
            <button
              type="button"
              className="cal-ed-icon-pill"
              onClick={() => {
                triggerHaptic('selection');
                onNavigatePeriod?.(-1);
              }}
              aria-label={tx(lang, '이전 기간', 'Previous Period')}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              className="cal-ed-today-pill"
              onClick={() => {
                triggerHaptic('selection');
                onJumpToday?.();
              }}
            >
              {tx(lang, '오늘', 'Today')}
            </button>
            <button
              type="button"
              className="cal-ed-icon-pill"
              onClick={() => {
                triggerHaptic('selection');
                onNavigatePeriod?.(1);
              }}
              aria-label={tx(lang, '다음 기간', 'Next Period')}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        <div className="cal-ed-switch-card">
          <div className="cal-ed-kpi-cluster">
            <div className="cal-ed-kpi-item">
              <strong className="cal-ed-kpi-val">{kpiSummary.wornTotal}</strong>
              <span className="cal-ed-kpi-lbl">{tx(lang, '착용 완료', 'Worn')}</span>
            </div>
            <span className="cal-ed-kpi-divider" aria-hidden="true" />
            <div className="cal-ed-kpi-item">
              <strong className="cal-ed-kpi-val">{kpiSummary.plannedTotal}</strong>
              <span className="cal-ed-kpi-lbl">{tx(lang, '예정 코디', 'Planned')}</span>
            </div>
            <span className="cal-ed-kpi-divider" aria-hidden="true" />
            <div className="cal-ed-kpi-item">
              <strong className="cal-ed-kpi-val">{kpiSummary.activeDays}</strong>
              <span className="cal-ed-kpi-lbl">
                {viewMode === 'month'
                  ? tx(lang, '이달 착장일', 'Active Days')
                  : tx(lang, '주간 착장일', 'Week Days')}
              </span>
            </div>
          </div>

          <div
            className="cal-ed-seg-track"
            role="tablist"
            aria-label={tx(lang, '캘린더 뷰 전환', 'Calendar View Switcher')}
            style={{ '--seg-idx': viewMode === 'month' ? 0 : 1 }}
          >
            <span className="cal-ed-seg-thumb" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'month'}
              className={`cal-ed-seg-btn ${viewMode === 'month' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                onChangeViewMode?.('month');
              }}
            >
              <CalendarDays size={14} />
              <span>{tx(lang, '월간 캘린더', 'Monthly')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'week'}
              className={`cal-ed-seg-btn ${viewMode === 'week' ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                onChangeViewMode?.('week');
              }}
            >
              <Columns3 size={14} />
              <span>{tx(lang, '주간 룩북', 'Weekly Strip')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main View: Monthly Editorial Calendar vs Weekly Lookbook Strip */}
      {viewMode === 'month' ? (
        <div className="cal-ed-month-bento">
          <div className="cal-ed-dow-grid" aria-hidden="true">
            {dowHeaders.map((lbl, idx) => (
              <span key={lbl} className={`cal-ed-dow-cell ${idx === 0 ? 'is-sun' : ''}`}>
                {lbl}
              </span>
            ))}
          </div>

          <div className="cal-ed-month-grid">
            {monthCells.map((cell, idx) => {
              const primaryEntry = cell.entries[0] || null;
              const previewItems = resolveEntryItems(primaryEntry, outfits, garmentMap);
              const weatherInfo = resolveWeatherVisual(primaryEntry, lang);
              const WeatherIcon = weatherInfo?.IconComp || null;
              const lookTitle = primaryEntry ? resolveEntryTitle(primaryEntry, outfits, lang) : '';

              const ariaText = primaryEntry
                ? `${cell.dateStr} · ${lookTitle}`
                : `${cell.dateStr} · ${tx(lang, '착장 추가', 'Add Outfit')}`;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  data-calendar-date={cell.dateStr}
                  style={{ '--cell-idx': idx }}
                  aria-label={ariaText}
                  className={[
                    'cal-ed-day-cell',
                    cell.entries.length > 0 ? 'has-entry' : '',
                    !cell.isCurrentMonth ? 'is-outside' : '',
                    cell.isToday ? 'is-today' : '',
                    cell.isSelected ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    triggerHaptic('selection');
                    onSelectDate?.(cell.dateStr);
                  }}
                >
                  <div className="cal-ed-day-top">
                    <span className="cal-ed-day-num">{cell.dayNum}</span>
                    {weatherInfo && (
                      <span className="cal-ed-weather-pill">
                        {WeatherIcon ? <WeatherIcon size={10} /> : null}
                        {weatherInfo.tempLabel ? (
                          <span>{weatherInfo.tempLabel}</span>
                        ) : (
                          <span className="cal-ed-weather-txt">{weatherInfo.condLabel}</span>
                        )}
                      </span>
                    )}
                  </div>

                  {previewItems.length > 0 ? (
                    <StackedGarmentPreview items={previewItems} lang={lang} />
                  ) : primaryEntry ? (
                    <div className="cal-ed-empty-plus" style={{ opacity: 0.72 }}>
                      <Sparkles size={13} />
                    </div>
                  ) : (
                    <div className="cal-ed-empty-plus" aria-hidden="true">
                      <Plus size={13} />
                    </div>
                  )}

                  {primaryEntry ? (
                    <div className="cal-ed-day-foot">
                      <span
                        className={`cal-ed-status-dot ${primaryEntry.status === 'planned' ? 'is-planned' : ''}`}
                        aria-hidden="true"
                      />
                      <span className="cal-ed-day-look-title">{lookTitle}</span>
                      {cell.entries.length > 1 && (
                        <span className="cal-ed-multi-count">+{cell.entries.length - 1}</span>
                      )}
                    </div>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="cal-ed-week-grid">
          {weekCells.map((cell, idx) => {
            const primaryEntry = cell.entries[0] || null;
            const previewItems = resolveEntryItems(primaryEntry, outfits, garmentMap);
            const weatherInfo = resolveWeatherVisual(primaryEntry, lang);
            const WeatherIcon = weatherInfo?.IconComp || null;
            const lookTitle = primaryEntry ? resolveEntryTitle(primaryEntry, outfits, lang) : '';
            const noteText = primaryEntry ? localizeCalendarNote(primaryEntry.note, lang) : '';

            return (
              <button
                key={cell.dateStr}
                type="button"
                data-calendar-date={cell.dateStr}
                style={{ '--cell-idx': idx }}
                className={[
                  'cal-ed-week-card',
                  cell.isToday ? 'is-today' : '',
                  cell.isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectDate?.(cell.dateStr);
                }}
              >
                <div className="cal-ed-week-head">
                  <div className="cal-ed-week-date-block">
                    <span className="cal-ed-week-dow">
                      {dowHeaders[cell.dow]}
                      {cell.isToday ? ` · ${tx(lang, '오늘', 'TODAY')}` : ''}
                    </span>
                    <strong className="cal-ed-week-dom">
                      {String(cell.monthIdx + 1).padStart(2, '0')}.
                      {String(cell.dayNum).padStart(2, '0')}
                    </strong>
                  </div>

                  {primaryEntry ? (
                    <span
                      className={`cal-ed-status-pill ${primaryEntry.status === 'planned' ? 'is-planned' : ''}`}
                    >
                      {primaryEntry.status === 'planned'
                        ? tx(lang, '예정', 'PLANNED')
                        : tx(lang, '착용', 'WORN')}
                    </span>
                  ) : null}
                </div>

                <div className="cal-ed-week-body">
                  {previewItems.length > 0 ? (
                    <StackedGarmentPreview items={previewItems} lang={lang} large />
                  ) : (
                    <div className="cal-ed-week-empty-frame">
                      <Plus size={18} strokeWidth={1.8} />
                      <span>{tx(lang, 'OOTD 배정', 'Assign OOTD')}</span>
                    </div>
                  )}
                </div>

                <div className="cal-ed-week-foot">
                  {primaryEntry ? (
                    <>
                      <strong className="cal-ed-week-title">{lookTitle}</strong>
                      <span className="cal-ed-week-sub">
                        {weatherInfo ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {WeatherIcon ? <WeatherIcon size={11} /> : null}
                            {[weatherInfo.condLabel, weatherInfo.tempLabel]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        ) : (
                          noteText ||
                          tx(
                            lang,
                            `${previewItems.length}개 아이템 구성`,
                            `${previewItems.length} curated pieces`
                          )
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong className="cal-ed-week-title" style={{ color: 'var(--ink-muted)' }}>
                        {tx(lang, '비어 있는 룩북', 'Open Lookbook Slot')}
                      </strong>
                      <span className="cal-ed-week-sub">
                        {tx(lang, '클릭하여 착장 기록·예약', 'Select to curate daily look')}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Editorial Quick-Jump Archive / Zero-State Guide */}
      <div className="cal-ed-archive-strip">
        <div className="cal-ed-archive-head">
          <span className="cal-ed-archive-title">
            {logs.length > 0
              ? tx(lang, '최근 큐레이션 아카이브', 'Recent Curated Lookbook')
              : tx(lang, 'OOTD 플래너 시작 가이드', 'Editorial OOTD Planner Guide')}
          </span>
          <span className="cal-ed-eyebrow tabular-nums">
            {logs.length > 0
              ? tx(lang, `총 ${logs.length}건`, `${logs.length} LOGS`)
              : tx(lang, '날짜를 선택해 시작', 'TAP ANY DATE TO CURATE')}
          </span>
        </div>

        {recentArchive.length > 0 ? (
          <div className="cal-ed-archive-list">
            {recentArchive.map((entry) => {
              const items = resolveEntryItems(entry, outfits, garmentMap);
              const leadItem = items[0] || null;
              const title = resolveEntryTitle(entry, outfits, lang);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="cal-ed-archive-chip"
                  onClick={() => {
                    triggerHaptic('selection');
                    onSelectDate?.(String(entry.worn_date || todayStr).slice(0, 10), entry.id);
                  }}
                >
                  {leadItem ? (
                    <div className="cal-ed-archive-thumb">
                      <GarmentObject25D
                        item={leadItem}
                        alt={localizeGarmentName(leadItem.name, lang)}
                        padding="10%"
                      />
                    </div>
                  ) : (
                    <div
                      className="cal-ed-archive-thumb"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Sparkles size={15} />
                    </div>
                  )}
                  <div className="cal-ed-archive-meta">
                    <span className="cal-ed-archive-date">{entry.worn_date}</span>
                    <strong className="cal-ed-archive-name">{title}</strong>
                  </div>
                  <span
                    className={`cal-ed-status-pill ${entry.status === 'planned' ? 'is-planned' : ''}`}
                  >
                    {entry.status === 'planned'
                      ? tx(lang, '예정', 'PLANNED')
                      : tx(lang, '착용', 'WORN')}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="cal-ed-week-sub" style={{ margin: 0 }}>
            {tx(
              lang,
              '캘린더의 원하는 날짜 셀을 클릭하면 우측 슬라이드 드로어에서 착장 구성, 날씨·기온, 착용 메모를 즉시 기록하거나 예약할 수 있습니다.',
              'Select any date in the calendar or weekly strip to open the slide-over lookbook drawer and schedule outfits, weather notes, and wear logs.'
            )}
          </p>
        )}
      </div>
    </div>
  );
}
