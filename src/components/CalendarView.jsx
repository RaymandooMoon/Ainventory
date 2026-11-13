import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { apiFetch, getStoredToken } from '../utils/api.ts';
import {
  localizeApiMessage,
  localizeCalendarNote,
  localizeOutfitTitle,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import CalendarLookbookGrid from './calendar/CalendarLookbookGrid.jsx';
import {
  formatIsoDateLocal,
  shiftIsoDate,
  shiftIsoMonth,
} from './calendar/calendarHelpers.js';
import CalendarSlideOverDrawer from './calendar/CalendarSlideOverDrawer.jsx';
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
  activeCloset,
  garments = [],
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
    try {
      const { nextLogs, nextOutfits } = await fetchCalendarData();
      setLogs(nextLogs);
      setOutfits(nextOutfits);
      return nextLogs;
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '캘린더를 불러오지 못했습니다.', 'Failed to load calendar.')
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchCalendarData, lang, showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { nextLogs, nextOutfits } = await fetchCalendarData();
        if (cancelled) return;
        setLogs(nextLogs);
        setOutfits(nextOutfits);
      } catch (err) {
        if (!cancelled) {
          showToast?.(
            localizeApiMessage(err?.message, lang) ||
              tx(lang, '캘린더를 불러오지 못했습니다.', 'Failed to load calendar.')
          );
        }
      } finally {
        if (!cancelled) {
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
    let ics = '';
    const token = getStoredToken();
    if (token && lang !== 'en') {
      try {
        const res = await fetch(`/api/calendar/ics?closet=${encodeURIComponent(activeCloset)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
    setTimeout(() => URL.revokeObjectURL(url), 800);
  };

  return (
    <section className="hig-screen-container" aria-label="Calendar">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">CALENDAR</h1>
          <span className="hig-item-count tabular-nums">
            {tx(lang, `${logs.length}건 기록`, `${logs.length} ENTRIES`)}
          </span>
        </div>
        <div className="hig-top-bar-actions">
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
            extraActions={
              <>
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
                <button
                  type="button"
                  className="hig-circle-icon-btn"
                  onClick={() => {
                    triggerHaptic('selection');
                    setDrawerEntryId(null);
                    setDrawerOpen(true);
                  }}
                  aria-label={tx(lang, '착용 일정 추가', 'Add Outfit Entry')}
                >
                  <Plus size={20} strokeWidth={2.2} />
                </button>
              </>
            }
          />
        </div>
      </header>

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
