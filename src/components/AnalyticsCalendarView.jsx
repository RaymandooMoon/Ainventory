import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { apiFetch, formatKRW } from '../utils/api.js';
import { KpiMetricStrip, PageHeader, ResponsiveSheetModal } from './common/AppUI.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';

function buildGoogleCalendarUrl(log) {
  const dateCompact = String(log.worn_date || '').replace(/-/g, '');
  if (!dateCompact) return 'https://calendar.google.com';
  const itemNames = (log.items || []).map((i) => i.name).join(', ');
  const title = encodeURIComponent(`[A inventory OOTD] ${log.note || '오늘의 착용 코디'}`);
  const details = encodeURIComponent(
    `착용 아이템: ${itemNames}\n날씨: ${log.weather_summary || '-'} (${log.temp_c ?? '-'}°C)\n메모: ${log.note || '-'}`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateCompact}/${dateCompact}&details=${details}`;
}

function downloadLogsAsIcs(logs = []) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//A inventory//Smart Wardrobe Atelier//KO',
    'CALSCALE:GREGORIAN',
  ];

  for (const log of logs) {
    const dt = String(log.worn_date || '').replace(/-/g, '');
    if (!dt) continue;
    const itemNames = (log.items || []).map((i) => i.name).join(', ');
    const summary = `[A inventory OOTD] ${log.note || itemNames.slice(0, 32) || '착용 기록'}`;
    const desc = `착용 의류: ${itemNames} | 날씨: ${log.weather_summary || '-'}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:ainventory-log-${log.id}@ainventory.kr`,
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:${summary.replace(/[\r\n]/g, ' ')}`,
      `DESCRIPTION:${desc.replace(/[\r\n]/g, ' ')}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ainventory-wear-calendar-${new Date().toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AnalyticsCalendarView({
  activeCloset,
  refreshKey,
  onClosetUpdated,
  showToast,
}) {
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [garments, setGarments] = useState([]);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDayStr, setSelectedDayStr] = useState(today.toISOString().slice(0, 10));

  const [wornDate, setWornDate] = useState(today.toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState([]);
  const [note, setNote] = useState('');

  const loadAll = async () => {
    try {
      const [aRes, cRes, gRes] = await Promise.all([
        apiFetch(`/analytics?closet=${encodeURIComponent(activeCloset)}`),
        apiFetch(`/calendar?closet=${encodeURIComponent(activeCloset)}`),
        apiFetch(`/garments?closet=${encodeURIComponent(activeCloset)}`),
      ]);
      setAnalytics(aRes);
      setLogs(cRes.logs || []);
      setGarments(gRes.garments || []);
    } catch (err) {
      showToast(err.message || '리포트를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCloset, refreshKey]);

  const logsByDate = useMemo(() => {
    const map = new Map();
    for (const log of logs) {
      if (!map.has(log.worn_date)) map.set(log.worn_date, []);
      map.get(log.worn_date).push(log);
    }
    return map;
  }, [logs]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr, logs: logsByDate.get(dateStr) || [] });
    }
    return cells;
  }, [calYear, calMonth, logsByDate]);

  const stepMonth = (delta) => {
    const next = new Date(calYear, calMonth + delta, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  };

  const toggleItemSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateLog = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      showToast('착용한 옷을 1벌 이상 선택해주세요.');
      return;
    }
    try {
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset === 'all' ? 'husband' : activeCloset,
          worn_date: wornDate,
          item_ids: selectedIds,
          note,
        }),
      });
      setLogModalOpen(false);
      setSelectedIds([]);
      setNote('');
      loadAll();
      onClosetUpdated?.();
      showToast('OOTD 착용 기록이 저장되고 아이템별 CPW가 갱신되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteLog = async (id) => {
    try {
      await apiFetch(`/calendar/${id}`, { method: 'DELETE' });
      loadAll();
      showToast('기록이 삭제되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="OOTD CALENDAR & CPW REPORT · WHERING & GETWARDROBE STANDARD"
        title="월간 착용 캘린더 & CPW 리포트"
        subtitle="월간 착용 캘린더, Google Calendar 일정 연동, .ics 내보내기 및 1회 착용당 비용(CPW) 인사이트를 제공합니다."
        actions={
          <>
            <button
              id="export-ics-btn"
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                downloadLogsAsIcs(logs);
                showToast('착용 캘린더(.ics) 파일이 다운로드되었습니다.');
              }}
            >
              <Download size={16} /> .ics 캘린더 내보내기
            </button>
            <button
              id="open-ootd-log-btn"
              type="button"
              className="btn btn-primary"
              onClick={() => setLogModalOpen(true)}
            >
              <CalendarPlus size={17} /> 오늘 입은 옷 기록
            </button>
          </>
        }
      />

      {analytics && (
        <>
          <KpiMetricStrip
            items={[
              {
                key: 'totalValue',
                label: '옷장 총 가치',
                value: formatKRW(analytics.totalValue),
                sub: `총 ${analytics.totalItems}벌 등록됨`,
              },
              {
                key: 'avgCpw',
                label: '평균 1회 착용당 비용 (CPW)',
                value: formatKRW(analytics.avgCpw),
                sub: `누적 ${analytics.totalWears}회 착용`,
              },
              {
                key: 'utilizationRate',
                label: '옷장 실사용률',
                value: `${analytics.utilizationRate}%`,
                sub: '3회 이상 착용된 활성 비율',
              },
              {
                key: 'savedMoney',
                label: '충동구매 방어 절약액',
                value: formatKRW(analytics.savedMoney),
                sub: `오프라인 판독 후 ${analytics.passedCount}건 패스`,
              },
            ]}
          />

          {/* Monthly Wear Calendar Grid */}
          <section className="section-card" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h3 style={{ marginBottom: 2 }}>
                  {calYear}년 {calMonth + 1}월 OOTD 착용 캘린더
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                  날짜를 클릭하면 해당 날짜에 착용을 기록하거나 Google Calendar로 바로 전송할 수 있습니다.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => stepMonth(-1)}>
                  <ChevronLeft size={15} /> 이전 달
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCalYear(today.getFullYear());
                    setCalMonth(today.getMonth());
                  }}
                >
                  이번 달
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => stepMonth(1)}>
                  다음 달 <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 6,
                textAlign: 'center',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
                marginBottom: 6,
              }}
            >
              {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 6,
              }}
            >
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      style={{
                        minHeight: 74,
                        borderRadius: 8,
                        background: 'rgba(28,25,23,0.02)',
                      }}
                    />
                  );
                }
                const hasLogs = cell.logs.length > 0;
                const isSelected = selectedDayStr === cell.dateStr;
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedDayStr(cell.dateStr);
                      setWornDate(cell.dateStr);
                    }}
                    style={{
                      minHeight: 78,
                      padding: 6,
                      borderRadius: 10,
                      border: isSelected
                        ? '2px solid var(--ink-primary)'
                        : hasLogs
                          ? '1px solid var(--accent-sage)'
                          : '1px solid var(--border-hairline)',
                      background: hasLogs ? 'var(--verdict-buy-bg)' : 'var(--bg-canvas)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{cell.day}</span>
                    {hasLogs && (
                      <div style={{ width: '100%' }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--verdict-buy-ink)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cell.logs[0].items?.[0]?.name || '착용 기록'}
                        </span>
                        <span style={{ fontSize: '0.64rem', color: 'var(--ink-muted)' }}>
                          {cell.logs[0].items?.length || 0}벌 착용
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="two-col-panels">
            <div className="section-card">
              <h3>최고 가성비 에센셜 (Best CPW)</h3>
              {analytics.bestValueItems.map((item) => (
                <div key={item.id} className="cpw-row">
                  <StudioGarmentImage
                    item={item}
                    style={{ width: 48, height: 62, borderRadius: 6, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.9rem' }}>{item.name}</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                      구매가 {formatKRW(item.price)} · {item.wear_count}회 착용
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: 'var(--accent-sage)', fontSize: '0.92rem' }}>
                      {formatKRW(item.cpw)}
                    </strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>1회당</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="section-card">
              <h3>서랍 속 잠자는 옷 (착용 2회 이하)</h3>
              {analytics.sleepingItems.length === 0 ? (
                <p style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem' }}>
                  모든 옷이 3회 이상 알차게 활용되고 있습니다!
                </p>
              ) : (
                analytics.sleepingItems.map((item) => (
                  <div key={item.id} className="cpw-row">
                    <StudioGarmentImage
                      item={item}
                      style={{ width: 48, height: 62, borderRadius: 6, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.9rem' }}>{item.name}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                        {item.brand || '내 옷장'} · 마지막 착용 {item.last_worn_date || '기록 없음'}
                      </div>
                    </div>
                    <span className="verdict-badge skip" style={{ marginBottom: 0 }}>
                      {item.wear_count}회 착용
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="section-card" style={{ marginBottom: 24 }}>
            <h3>내 옷장 컬러 팔레트 비중</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              {analytics.colorDist.map((c) => (
                <div
                  key={c.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '0.84rem',
                  }}
                >
                  <span className="color-dot" style={{ width: 14, height: 14, backgroundColor: c.hex }} />
                  <strong>{c.name}</strong>
                  <span style={{ color: 'var(--ink-muted)' }}>{c.count}벌</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="section-card">
        <h3>최근 OOTD 착용 캘린더 로그 (Google Calendar 연동)</h3>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--ink-secondary)' }}>아직 기록된 착용 일지가 없습니다.</p>
        ) : (
          <div>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '16px 0',
                  borderBottom: '1px solid var(--border-hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <strong>{log.worn_date}</strong>
                    {log.weather_summary && (
                      <span className="rec-tag">
                        {log.weather_summary} {log.temp_c !== null ? `${log.temp_c}°C` : ''}
                      </span>
                    )}
                    <a
                      href={buildGoogleCalendarUrl(log)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '3px 8px', fontSize: '0.73rem' }}
                    >
                      <ExternalLink size={12} /> Google Calendar에 추가
                    </a>
                  </div>
                  {log.note && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)', marginBottom: 8 }}>
                      {log.note}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {log.items.map((it) => (
                      <div
                        key={it.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'var(--bg-canvas)',
                          padding: '4px 10px 4px 4px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-hairline)',
                          fontSize: '0.79rem',
                        }}
                      >
                        <StudioGarmentImage
                          item={it}
                          style={{ width: 26, height: 32, borderRadius: 4, flexShrink: 0 }}
                        />
                        <span>{it.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDeleteLog(log.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ResponsiveSheetModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        eyebrow="OOTD WEAR LOG"
        title="착용 기록 (OOTD) 추가"
        maxWidth={680}
      >
        <form onSubmit={handleCreateLog}>
          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label">착용 날짜</label>
              <input
                type="date"
                className="text-input"
                value={wornDate}
                onChange={(e) => setWornDate(e.target.value)}
                required
              />
            </div>
            <div className="field-group">
              <label className="field-label">메모</label>
              <input
                className="text-input"
                placeholder="예: 결혼식 하객룩, 성수동 데이트"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">
              착용한 아이템 선택 ({selectedIds.length}벌 선택됨)
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                gap: 8,
                maxHeight: 280,
                overflowY: 'auto',
                padding: 4,
              }}
            >
              {garments.map((g) => {
                const checked = selectedIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleItemSelection(g.id)}
                    style={{
                      padding: 8,
                      borderRadius: 'var(--radius-sm)',
                      border: checked
                        ? '2px solid var(--ink-primary)'
                        : '1px solid var(--border-hairline)',
                      background: checked ? 'var(--bg-subtle)' : 'var(--bg-canvas)',
                      textAlign: 'center',
                    }}
                  >
                    <StudioGarmentImage
                      item={g}
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 4',
                        borderRadius: 4,
                        marginBottom: 4,
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', display: 'block' }}>{g.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full">
            캘린더에 기록하기
          </button>
        </form>
      </ResponsiveSheetModal>
    </div>
  );
}
