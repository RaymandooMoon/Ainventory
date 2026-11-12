import { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Check, Download, Plus, Trash2 } from 'lucide-react';
import { apiFetch, getStoredToken } from '../utils/api.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

function buildIcsText(logs, outfits) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//A inventory//Wardrobe Calendar//KO',
    'CALSCALE:GREGORIAN',
  ];
  for (const entry of logs) {
    const rawDate = String(entry.worn_date || '').replace(/-/g, '');
    if (rawDate.length !== 8) continue;
    const matchedOutfit = outfits.find((o) => Number(o.id) === Number(entry.outfit_id));
    const title = matchedOutfit?.title || 'Outfit';
    lines.push(
      'BEGIN:VEVENT',
      `UID:ainventory-${entry.id}@ainventory.local`,
      `DTSTART;VALUE=DATE:${rawDate}`,
      `SUMMARY:${title}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export default function CalendarView({
  activeCloset,
  garments = [],
  refreshKey,
  onClosetUpdated,
  showToast,
}) {
  const [logs, setLogs] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [wornDate, setWornDate] = useState(todayStr);
  const [selectedOutfitId, setSelectedOutfitId] = useState('');
  const [note, setNote] = useState('');

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(activeCloset || 'sample');
      const [calRes, outRes] = await Promise.all([
        apiFetch(`/calendar?closet=${q}`),
        apiFetch(`/outfits?closet=${q}`),
      ]);
      const nextLogs = calRes.logs || [];
      const nextOutfits = outRes.outfits || [];
      setLogs(nextLogs);
      setOutfits(nextOutfits);
      if (nextOutfits.length > 0) {
        setSelectedOutfitId((prev) => prev || String(nextOutfits[0].id));
      }
    } catch (err) {
      showToast?.(err?.message || '캘린더를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeCloset, showToast]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar, refreshKey]);

  const handleAddLog = async (e) => {
    e.preventDefault();
    try {
      const chosenOutfit = outfits.find((o) => String(o.id) === String(selectedOutfitId));
      const fallbackItemIds = garments.slice(0, 2).map((g) => g.id);
      const isFuture = wornDate > todayStr;
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          worn_date: wornDate,
          outfit_id: chosenOutfit ? Number(chosenOutfit.id) : null,
          item_ids: chosenOutfit?.item_ids?.length ? chosenOutfit.item_ids : fallbackItemIds,
          status: isFuture ? 'planned' : 'worn',
          note: note.trim(),
        }),
      });
      triggerHaptic('selection');
      setNote('');
      setAddOpen(false);
      await loadCalendar();
      onClosetUpdated?.();
    } catch (err) {
      showToast?.(err?.message || '일정 등록에 실패했습니다.');
    }
  };

  const handleDeleteLog = async (logId) => {
    try {
      await apiFetch(`/calendar/${logId}`, { method: 'DELETE' });
      triggerHaptic('selection');
      await loadCalendar();
    } catch (err) {
      showToast?.(err?.message || '삭제에 실패했습니다.');
    }
  };

  const handleExportIcs = async () => {
    let ics = '';
    const token = getStoredToken();
    if (token) {
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
      ics = buildIcsText(logs, outfits);
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

  const garmentMap = new Map(garments.map((g) => [Number(g.id), g]));

  return (
    <section className="hig-screen-container" aria-label="Calendar">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">CALENDAR</h1>
          <span className="hig-item-count tabular-nums">{logs.length} ENTRIES</span>
        </div>
        <div className="hig-top-bar-actions">
          {logs.length > 0 && (
            <button
              type="button"
              className="hig-circle-icon-btn is-subtle"
              onClick={handleExportIcs}
              aria-label="캘린더 내보내기"
            >
              <Download size={18} />
            </button>
          )}
          <button
            type="button"
            className="hig-circle-icon-btn"
            onClick={() => setAddOpen(true)}
            aria-label="착용 일정 추가"
          >
            <Plus size={20} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="hig-wardrobe-grid">
          {[1, 2, 3].map((k) => (
            <div key={k} className="hig-squircle-skeleton" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="hig-minimal-empty">
          <CalendarIcon size={28} strokeWidth={1.6} />
          <span>No Entries</span>
        </div>
      ) : (
        <div className="hig-calendar-list">
          {logs.map((entry) => {
            const matchedOutfit = outfits.find((o) => Number(o.id) === Number(entry.outfit_id));
            const itemIds = Array.isArray(entry.item_ids)
              ? entry.item_ids
              : matchedOutfit?.item_ids || [];
            const previewItems = itemIds
              .map((id) => garmentMap.get(Number(id)))
              .filter(Boolean)
              .slice(0, 4);

            return (
              <article key={entry.id} className="hig-calendar-card">
                <div className="hig-calendar-card-head">
                  <div>
                    <strong className="hig-calendar-date tabular-nums">{entry.worn_date}</strong>
                    <span className="hig-calendar-title">
                      {matchedOutfit?.title || entry.note || 'Daily Look'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="hig-icon-ghost-btn"
                    onClick={() => handleDeleteLog(entry.id)}
                    aria-label="일정 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {previewItems.length > 0 && (
                  <div className="hig-calendar-thumbs">
                    {previewItems.map((item) => (
                      <div key={item.id} className="hig-calendar-thumb-squircle">
                        <GarmentObject25D item={item} padding="10%" />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ResponsiveSheetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Log Outfit"
        maxWidth={460}
      >
        <form onSubmit={handleAddLog} className="hig-add-garment-form">
          <div className="hig-field-group">
            <label htmlFor="calendar-date-input" className="hig-field-label">
              Date
            </label>
            <input
              id="calendar-date-input"
              type="date"
              className="hig-native-input"
              value={wornDate}
              onChange={(e) => setWornDate(e.target.value)}
              required
            />
          </div>

          {outfits.length > 0 && (
            <div className="hig-field-group">
              <label htmlFor="calendar-outfit-select" className="hig-field-label">
                Outfit
              </label>
              <select
                id="calendar-outfit-select"
                className="hig-native-input"
                value={selectedOutfitId}
                onChange={(e) => setSelectedOutfitId(e.target.value)}
              >
                {outfits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="hig-field-group">
            <label htmlFor="calendar-note-input" className="hig-field-label">
              Memo
            </label>
            <input
              id="calendar-note-input"
              type="text"
              className="hig-native-input"
              placeholder="Occasion"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
            />
          </div>

          <button type="submit" className="hig-primary-cta-btn">
            <Check size={18} />
            <span>Save Entry</span>
          </button>
        </form>
      </ResponsiveSheetModal>
    </section>
  );
}
