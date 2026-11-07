import { useEffect, useState } from 'react';
import { CalendarPlus, Trash2, X } from 'lucide-react';
import { apiFetch, formatKRW } from '../utils/api.js';

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

  const [wornDate, setWornDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState([]);
  const [note, setNote] = useState('');

  const loadAll = async () => {
    try {
      const [aRes, cRes, gRes] = await Promise.all([
        apiFetch(`/analytics?closet=${activeCloset}`),
        apiFetch(`/calendar?closet=${activeCloset}`),
        apiFetch(`/garments?closet=${activeCloset}`),
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
      <header className="page-header">
        <div>
          <h1>착용 캘린더 & 옷장 리포트</h1>
          <p className="page-subtitle">
            겟워드롭의 CPW(1회 착용당 비용), 에이클로젯의 컬러 분포, 웨어링의 잠자는 옷 깨우기를 결합한 인사이트입니다.
          </p>
        </div>

        <button
          id="open-ootd-log-btn"
          type="button"
          className="btn btn-primary"
          onClick={() => setLogModalOpen(true)}
        >
          <CalendarPlus size={17} /> 오늘 입은 옷 기록
        </button>
      </header>

      {analytics && (
        <>
          <section className="summary-strip">
            <div className="stat-tile">
              <span>옷장 총 가치</span>
              <strong>{formatKRW(analytics.totalValue)}</strong>
              <small>총 {analytics.totalItems}벌 등록됨</small>
            </div>
            <div className="stat-tile">
              <span>평균 1회 착용당 비용 (CPW)</span>
              <strong>{formatKRW(analytics.avgCpw)}</strong>
              <small>누적 {analytics.totalWears}회 착용</small>
            </div>
            <div className="stat-tile">
              <span>옷장 실사용률</span>
              <strong>{analytics.utilizationRate}%</strong>
              <small>3회 이상 착용된 활성 비율</small>
            </div>
            <div className="stat-tile">
              <span>충동구매 방어 절약액</span>
              <strong>{formatKRW(analytics.savedMoney)}</strong>
              <small>오프라인 판독 후 {analytics.passedCount}건 패스</small>
            </div>
          </section>

          <section className="two-col-panels">
            <div className="section-card">
              <h3>최고 가성비 에센셜 (Best CPW)</h3>
              {analytics.bestValueItems.map((item) => (
                <div key={item.id} className="cpw-row">
                  <img src={item.image_url} alt={item.name} />
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
                    <img src={item.image_url} alt={item.name} />
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
        <h3>최근 OOTD 착용 캘린더 로그</h3>
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
                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                      {log.closet_owner === 'husband' ? '남편' : '와이프'}
                    </span>
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
                        <img
                          src={it.image_url}
                          alt={it.name}
                          style={{ width: 26, height: 32, objectFit: 'cover', borderRadius: 4 }}
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

      {logModalOpen && (
        <div className="modal-backdrop" onClick={() => setLogModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>착용 기록 (OOTD) 추가</h2>
              <button type="button" className="icon-btn" onClick={() => setLogModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

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
                    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
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
                        <img
                          src={g.image_url}
                          alt={g.name}
                          style={{
                            width: '100%',
                            aspectRatio: '3 / 4',
                            objectFit: 'cover',
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
          </div>
        </div>
      )}
    </div>
  );
}
