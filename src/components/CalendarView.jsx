import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Coins, Download, Flame, Plus } from 'lucide-react';
import {
  apiFetch,
  getConfiguredApiBaseUrl,
  getStoredToken,
  isStaticStandaloneWithoutApi,
} from '../utils/api.ts';
import { guardUserPermission } from '../utils/accessControl.ts';
import {
  localizeApiMessage,
  localizeCalendarNote,
  localizeOutfitTitle,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  ATTENDANCE_DAILY_REWARD_I,
  ATTENDANCE_STREAK_30_BONUS_I,
  ATTENDANCE_STREAK_7_BONUS_I,
  ECONOMY_STATE_EVENT,
  claimDailyAttendance,
  loadStoredEconomyState,
  saveStoredEconomyState,
} from '../utils/stageBackgroundCatalog.ts';
import CalendarLookbookGrid from './calendar/CalendarLookbookGrid.jsx';
import {
  formatIsoDateLocal,
  shiftIsoDate,
  shiftIsoMonth,
} from './calendar/calendarHelpers.js';
import CalendarSlideOverDrawer from './calendar/CalendarSlideOverDrawer.jsx';
import AppHeaderBrand from './common/AppHeaderBrand.tsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';
import './calendar/calendarEditorial.css';

function escapeIcsField(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildIcsText(logs, outfits, lang = 'ko') {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//A inventory//Wardrobe Calendar//${lang === 'en' ? 'EN' : 'KO'}`,
    'CALSCALE:GREGORIAN',
  ];
  for (const entry of logs) {
    const rawDate = String(entry.worn_date || '').replace(/-/g, '');
    if (rawDate.length !== 8) continue;
    const matchedOutfit = outfits.find((o) => Number(o.id) === Number(entry.outfit_id));
    const title =
      localizeOutfitTitle(matchedOutfit?.title, lang) ||
      localizeCalendarNote(entry.note, lang) ||
      'Outfit';
    lines.push(
      'BEGIN:VEVENT',
      `UID:ainventory-${entry.id}@ainventory.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${rawDate}`,
      `SUMMARY:${escapeIcsField(title)}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export default function CalendarView({
  user,
  activeCloset,
  garments = [],
  theme = 'light',
  lang = 'ko',
  skinProfile,
  onOpenProfile,
  onOpenAccount,
  refreshKey,
  onClosetUpdated,
  showToast,
}) {
  const [logs, setLogs] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [todayStr] = useState(() => formatIsoDateLocal(new Date()));
  const [viewMode, setViewMode] = useState('month');
  const [cursorDate, setCursorDate] = useState(todayStr);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [drawerEntryId, setDrawerEntryId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [economyState, setEconomyState] = useState(() => loadStoredEconomyState());

  const reloadSeqRef = useRef(0);
  const icsRevokeTimerRef = useRef(null);

  useEffect(() => {
    const syncEconomy = (ev) => {
      if (ev?.detail) {
        setEconomyState(ev.detail);
      } else {
        setEconomyState(loadStoredEconomyState());
      }
    };
    window.addEventListener(ECONOMY_STATE_EVENT, syncEconomy);
    window.addEventListener('storage', syncEconomy);
    return () => {
      window.removeEventListener(ECONOMY_STATE_EVENT, syncEconomy);
      window.removeEventListener('storage', syncEconomy);
      if (icsRevokeTimerRef.current) {
        clearTimeout(icsRevokeTimerRef.current);
      }
    };
  }, []);

  const attendanceClaimedToday = economyState.attendanceDates.includes(todayStr);

  const handleClaimAttendance = useCallback(() => {
    if (!guardUserPermission(user, 'btn:calendar:attendance')) return;
    const res = claimDailyAttendance(economyState, todayStr);
    if (!res.ok) {
      triggerHaptic('warning');
      showToast?.(tx(lang, '오늘의 출석 체크를 이미 완료했습니다.', 'Already checked in today.'));
      return;
    }
    const saved = saveStoredEconomyState(res.nextState);
    setEconomyState(saved);
    triggerHaptic(res.streak7BonusI > 0 || res.streak30BonusI > 0 ? 'heavy' : 'medium');

    if (res.streak30BonusI > 0) {
      showToast?.(
        tx(
          lang,
          `30일 연속 출석 달성! +${res.totalAwardedI} i (기본 ${res.dailyRewardI} + 한달 보너스 ${res.streak30BonusI})`,
          `30-Day Streak! +${res.totalAwardedI} i awarded`
        )
      );
    } else if (res.streak7BonusI > 0) {
      showToast?.(
        tx(
          lang,
          `7일 연속 출석 달성! +${res.totalAwardedI} i (기본 ${res.dailyRewardI} + 주간 보너스 ${res.streak7BonusI})`,
          `7-Day Streak! +${res.totalAwardedI} i awarded`
        )
      );
    } else {
      showToast?.(
        tx(
          lang,
          `출석 체크 완료! +${res.totalAwardedI} i 지급 (연속 ${res.newStreak}일)`,
          `Check-In Complete! +${res.totalAwardedI} i (Streak ${res.newStreak}d)`
        )
      );
    }
  }, [economyState, todayStr, lang, showToast, user]);

  const fetchCalendarData = useCallback(async () => {
    const q = encodeURIComponent(activeCloset || 'sample');
    const [calRes, outRes] = await Promise.all([
      apiFetch(`/calendar?closet=${q}`),
      apiFetch(`/outfits?closet=${q}`),
    ]);
    return {
      nextLogs: calRes.logs || [],
      nextOutfits: outRes.outfits || [],
    };
  }, [activeCloset]);

  const reloadCalendar = useCallback(async () => {
    const seq = ++reloadSeqRef.current;
    try {
      const { nextLogs, nextOutfits } = await fetchCalendarData();
      if (seq === reloadSeqRef.current) {
        setLogs(nextLogs);
        setOutfits(nextOutfits);
      }
      return nextLogs;
    } catch (err) {
      if (seq === reloadSeqRef.current) {
        showToast?.(
          localizeApiMessage(err?.message, lang) ||
            tx(lang, '캘린더를 불러오지 못했습니다.', 'Failed to load calendar.')
        );
      }
      return [];
    } finally {
      if (seq === reloadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [fetchCalendarData, lang, showToast]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++reloadSeqRef.current;
    (async () => {
      try {
        const { nextLogs, nextOutfits } = await fetchCalendarData();
        if (cancelled || seq !== reloadSeqRef.current) return;
        setLogs(nextLogs);
        setOutfits(nextOutfits);
      } catch (err) {
        if (!cancelled && seq === reloadSeqRef.current) {
          showToast?.(
            localizeApiMessage(err?.message, lang) ||
              tx(lang, '캘린더를 불러오지 못했습니다.', 'Failed to load calendar.')
          );
        }
      } finally {
        if (!cancelled && seq === reloadSeqRef.current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCalendarData, refreshKey, lang, showToast]);

  const garmentMap = useMemo(
    () => new Map(garments.map((g) => [Number(g.id), g])),
    [garments]
  );

  const handleNavigatePeriod = useCallback(
    (direction) => {
      setCursorDate((prev) =>
        viewMode === 'week' ? shiftIsoDate(prev, direction * 7) : shiftIsoMonth(prev, direction)
      );
    },
    [viewMode]
  );

  const handleJumpToday = useCallback(() => {
    setCursorDate(todayStr);
    setSelectedDate(todayStr);
  }, [todayStr]);

  const handleSelectDate = useCallback((dateStr, entryId = null) => {
    setSelectedDate(dateStr);
    setCursorDate(dateStr);
    setDrawerEntryId(entryId);
    setDrawerOpen(true);
  }, []);

  const handleDrawerChangeDate = useCallback((nextDate) => {
    setSelectedDate(nextDate);
    setCursorDate(nextDate);
    setDrawerEntryId(null);
  }, []);

  const handleSaveDrawerEntry = async ({
    existingEntry,
    worn_date,
    outfit_id,
    item_ids,
    status,
    weather_summary,
    temp_c,
    note,
  }) => {
    if (!guardUserPermission(user, 'btn:calendar:log_wear')) return;
    setSaving(true);
    try {
      const fallbackItemIds =
        Array.isArray(item_ids) && item_ids.length > 0
          ? item_ids
          : garments.slice(0, 2).map((g) => Number(g.id));

      if (existingEntry) {
        const prevIds = Array.isArray(existingEntry.item_ids)
          ? existingEntry.item_ids.map(Number)
          : [];
        const sameItems =
          prevIds.length === fallbackItemIds.length &&
          prevIds.every((val, i) => val === Number(fallbackItemIds[i]));
        const sameMeta =
          String(existingEntry.worn_date || '') === String(worn_date) &&
          Number(existingEntry.outfit_id || 0) === Number(outfit_id || 0) &&
          String(existingEntry.note || '').trim() === String(note || '').trim() &&
          String(existingEntry.weather_summary || '').trim() ===
            String(weather_summary || '').trim() &&
          (existingEntry.temp_c ?? null) === (temp_c ?? null) &&
          sameItems;

        if (sameMeta && existingEntry.status !== status) {
          await apiFetch(`/calendar/${existingEntry.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          });
        } else {
          await apiFetch(`/calendar/${existingEntry.id}`, { method: 'DELETE' });
          await apiFetch('/calendar', {
            method: 'POST',
            body: JSON.stringify({
              closet_owner: activeCloset || 'sample',
              worn_date,
              outfit_id,
              item_ids: fallbackItemIds,
              status,
              weather_summary,
              temp_c,
              note,
            }),
          });
        }
      } else {
        await apiFetch('/calendar', {
          method: 'POST',
          body: JSON.stringify({
            closet_owner: activeCloset || 'sample',
            worn_date,
            outfit_id,
            item_ids: fallbackItemIds,
            status,
            weather_summary,
            temp_c,
            note,
          }),
        });
      }

      triggerHaptic('selection');
      await reloadCalendar();
      onClosetUpdated?.();
      setDrawerOpen(false);
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '일정 저장에 실패했습니다.', 'Failed to save calendar entry.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDrawerEntry = async (logId) => {
    if (!guardUserPermission(user, 'btn:calendar:log_wear')) return;
    setSaving(true);
    try {
      await apiFetch(`/calendar/${logId}`, { method: 'DELETE' });
      triggerHaptic('selection');
      const nextLogs = await reloadCalendar();
      onClosetUpdated?.();
      const remainingForDay = nextLogs.filter(
        (l) => String(l.worn_date || '').slice(0, 10) === selectedDate
      );
      if (remainingForDay.length === 0) {
        setDrawerOpen(false);
      } else {
        setDrawerEntryId(remainingForDay[0].id);
      }
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '삭제에 실패했습니다.', 'Failed to delete entry.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportIcs = async () => {
    if (!guardUserPermission(user, 'btn:calendar:export_ics')) return;
    let ics = '';
    const token = getStoredToken();
    if (token && lang !== 'en' && !isStaticStandaloneWithoutApi()) {
      try {
        const res = await fetch(
          `${getConfiguredApiBaseUrl()}/calendar/ics?closet=${encodeURIComponent(activeCloset)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (res.ok) ics = await res.text();
      } catch {
        // Fallback to local ICS synthesis
      }
    }
    if (!ics) {
      ics = buildIcsText(logs, outfits, lang);
    }
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wardrobe-calendar.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (icsRevokeTimerRef.current) {
      clearTimeout(icsRevokeTimerRef.current);
    }
    icsRevokeTimerRef.current = setTimeout(() => {
      URL.revokeObjectURL(url);
      icsRevokeTimerRef.current = null;
    }, 800);
  };

  return (
    <section className="hig-screen-container" aria-label="Calendar">
      <header className="hig-top-bar">
        <div className="hig-top-bar-left ui-nav-utility-group">
          {logs.length > 0 && (
            <button
              type="button"
              className="hig-circle-icon-btn is-subtle"
              onClick={handleExportIcs}
              aria-label={tx(lang, '캘린더 내보내기', 'Export Calendar (.ics)')}
            >
              <Download size={18} />
            </button>
          )}
        </div>
        <div className="hig-top-bar-titles">
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
                type="button"
                className="hig-circle-icon-btn"
                onClick={() => {
                  if (!guardUserPermission(user, 'btn:calendar:log_wear')) return;
                  triggerHaptic('selection');
                  setDrawerEntryId(null);
                  setDrawerOpen(true);
                }}
                aria-label={tx(lang, '착용 일정 추가', 'Add Outfit Entry')}
              >
                <Plus size={20} strokeWidth={2.2} />
              </button>
            }
          />
        </div>
      </header>

      <div className="hig-sub-header-row">
        <h1 className="hig-screen-title hig-sub-screen-title">CALENDAR</h1>
        <span className="hig-item-count tabular-nums">
          {tx(lang, `${logs.length}건 기록`, `${logs.length} ENTRIES`)}
        </span>
      </div>

      {/* Daily Attendance Check-In & i Coin Economy Banner */}
      <section
        className="cal-ed-attendance-card"
        data-calendar-attendance-card="true"
        aria-label={tx(lang, '출석 체크 리워드', 'Daily Attendance Rewards')}
      >
        <div className="cal-ed-attendance-info">
          <div className="cal-ed-attendance-top-row">
            <span className="cal-ed-attendance-balance tabular-nums" data-calendar-i-balance="true">
              <Coins size={14} aria-hidden="true" />
              <strong>{economyState.iBalance} i</strong>
            </span>
            <span className="cal-ed-attendance-streak tabular-nums" data-calendar-streak="true">
              <Flame size={13} aria-hidden="true" />
              <span>
                {tx(lang, `연속 ${economyState.attendanceStreak}일`, `${economyState.attendanceStreak}d Streak`)}
              </span>
            </span>
          </div>
          <div className="cal-ed-attendance-milestones tabular-nums">
            <span>
              {tx(
                lang,
                `매일 +${ATTENDANCE_DAILY_REWARD_I} i · 7일 연속 +${ATTENDANCE_STREAK_7_BONUS_I} i · 30일 연속 +${ATTENDANCE_STREAK_30_BONUS_I} i`,
                `Daily +${ATTENDANCE_DAILY_REWARD_I} i · 7d +${ATTENDANCE_STREAK_7_BONUS_I} i · 30d +${ATTENDANCE_STREAK_30_BONUS_I} i`
              )}
            </span>
          </div>
        </div>

        <button
          type="button"
          data-calendar-attendance-btn="true"
          disabled={attendanceClaimedToday}
          className={`cal-ed-attendance-btn tabular-nums ${
            attendanceClaimedToday ? 'is-claimed' : ''
          }`.trim()}
          onClick={handleClaimAttendance}
        >
          {attendanceClaimedToday ? (
            <>
              <Check size={15} strokeWidth={2.6} aria-hidden="true" />
              <span>{tx(lang, '오늘 출석 완료', 'Checked In')}</span>
            </>
          ) : (
            <>
              <Plus size={15} strokeWidth={2.6} aria-hidden="true" />
              <span>
                {tx(lang, `출석 체크 (+${ATTENDANCE_DAILY_REWARD_I} i)`, `Check In (+${ATTENDANCE_DAILY_REWARD_I} i)`)}
              </span>
            </>
          )}
        </button>
      </section>

      {loading ? (
        <div className="hig-wardrobe-grid">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="hig-squircle-skeleton" />
          ))}
        </div>
      ) : (
        <CalendarLookbookGrid
          logs={logs}
          outfits={outfits}
          garmentMap={garmentMap}
          lang={lang}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          cursorDate={cursorDate}
          selectedDate={selectedDate}
          todayStr={todayStr}
          attendanceDates={economyState.attendanceDates}
          onNavigatePeriod={handleNavigatePeriod}
          onJumpToday={handleJumpToday}
          onSelectDate={handleSelectDate}
        />
      )}

      <CalendarSlideOverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selectedDate={selectedDate}
        initialEntryId={drawerEntryId}
        onChangeDate={handleDrawerChangeDate}
        todayStr={todayStr}
        logs={logs}
        outfits={outfits}
        garments={garments}
        garmentMap={garmentMap}
        lang={lang}
        saving={saving}
        onSaveEntry={handleSaveDrawerEntry}
        onDeleteEntry={handleDeleteDrawerEntry}
      />
    </section>
  );
}
