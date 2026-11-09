import { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  CalendarCheck,
  CloudRain,
  Layers,
  Sparkles,
  Sun,
  UserCheck,
  Wind,
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import OutfitInspectorModal from './OutfitInspectorModal.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import VirtualMannequin from './VirtualMannequin.jsx';

export default function WeatherStylingView({
  user,
  activeCloset,
  onNavigateShopping,
  onOpenProfileModal,
  onClosetUpdated,
  showToast,
}) {
  const closetOwner = activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset;
  const [city, setCity] = useState('seoul');
  const [scenario, setScenario] = useState('live');
  const [data, setData] = useState(null);
  const [closetGarments, setClosetGarments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active recommendation index + Custom 11-slot Loadout overrides for the 3D Mannequin
  const [selectedRecIdx, setSelectedRecIdx] = useState(0);
  const [customSlotOverrides, setCustomSlotOverrides] = useState({});
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSlot, setInspectorSlot] = useState('outer');

  const loadRecommendations = async (targetCity = city, targetScenario = scenario) => {
    setLoading(true);
    try {
      const [res, gRes] = await Promise.all([
        apiFetch(
          `/weather/recommendations?closet=${encodeURIComponent(closetOwner)}&city=${targetCity}&scenario=${targetScenario}`
        ),
        apiFetch(`/garments?closet=${encodeURIComponent(closetOwner)}`),
      ]);
      setData(res);
      setClosetGarments(gRes.garments || []);
      setSelectedRecIdx(0);
      setCustomSlotOverrides({});
    } catch (err) {
      showToast(err.message || '날씨 코디 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations(city, scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closetOwner, city, scenario]);

  const activeRec = data?.recommendations?.[selectedRecIdx] || data?.recommendations?.[0] || null;

  // Merge active recommendation's 11-slot loadout with user's interactive swaps
  const mergedLoadout = {
    ...(activeRec?.loadoutBySlot || {}),
    ...customSlotOverrides,
  };

  const handleConfirmSwap = (slotKey, newItem) => {
    setCustomSlotOverrides((prev) => ({
      ...prev,
      [slotKey]: newItem,
    }));
    if (newItem) {
      showToast(`'${newItem.name}' 아이템이 3D 마네킹 [${slotKey}] 슬롯에 장착되었습니다.`);
    } else {
      showToast(`[${slotKey}] 슬롯 장착이 해제되었습니다.`);
    }
  };

  const handleSaveOutfit = async (recOrItems) => {
    const itemsList = Array.isArray(recOrItems)
      ? recOrItems
      : recOrItems?.items || Object.values(mergedLoadout).filter(Boolean);
    const titleText = Array.isArray(recOrItems)
      ? `${data?.weather?.date || '커스텀'} 3D 인벤토리 풀코디`
      : `${data?.weather?.date} ${recOrItems.title}`;

    try {
      await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: closetOwner,
          title: titleText,
          occasion: '날씨 맞춤',
          season: '사계절',
          item_ids: itemsList.map((i) => i.id),
          memo: activeRec?.rationale || '3D 인벤토리 커스텀 코디',
        }),
      });
      showToast('코디 북(룩북)에 저장되었습니다.');
    } catch (err) {
      showToast(err.message || '코디 저장에 실패했습니다.');
    }
  };

  const handleLogWear = async (rec) => {
    const itemsList = rec?.items || Object.values(mergedLoadout).filter(Boolean);
    try {
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: closetOwner,
          worn_date: data.weather.date,
          item_ids: itemsList.map((i) => i.id),
          weather_summary: data.weather.condition,
          temp_c: data.weather.avgTemp,
          note: `내일 날씨 추천 코디 선택 (${rec?.badge || '3D 인벤토리'})`,
        }),
      });
      onClosetUpdated?.();
      showToast(`${data.weather.date} 착용 캘린더에 등록되고 착용 횟수가 반영되었습니다.`);
    } catch (err) {
      showToast(err.message || '착용 기록에 실패했습니다.');
    }
  };

  const w = data?.weather;
  const sp = data?.stylingProfile;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>내일의 날씨 · 체형 · 퍼스널컬러 3D 스타일링</h1>
          <p className="page-subtitle">
            기온·강수 예보와{' '}
            <strong>
              {sp?.personalColorLabel || '퍼스널컬러'} · {sp?.shapeLabelKo || '7체형'} (
              {sp?.chestCm}-{sp?.waistCm}-{sp?.hipCm}cm)
            </strong>
            을 결합해 11부위 3D 인벤토리 코디를 제안합니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            id="open-profile-pc-modal-btn"
            type="button"
            className="btn btn-secondary"
            onClick={() => onOpenProfileModal?.()}
          >
            <UserCheck size={16} /> 7체형 · 3사이즈 · 퍼스널컬러 재설정
          </button>
          <button
            id="goto-shopping-cta"
            type="button"
            className="btn btn-primary"
            onClick={onNavigateShopping}
          >
            오프라인 매장 쇼핑 판독하기
          </button>
        </div>
      </header>

      {/* Styling Profile & Personal Color Summary Ribbon */}
      {sp && (
        <section
          className="section-card"
          style={{
            marginBottom: 20,
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            background: 'var(--bg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                backgroundColor: sp.skinToneHex || '#E2C6AE',
                border: '2px solid var(--ink-primary)',
                display: 'inline-block',
              }}
              title="감지된 피부 언더톤"
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{sp.personalColorLabel}</strong>
                <span className="rec-tag">{sp.shapeLabelKo}</span>
                <span className="rec-tag">
                  BMI {sp.bmi} · 체지방 {sp.bodyFatPct}%
                </span>
                <span className="rec-tag">
                  3사이즈 {sp.chestCm}-{sp.waistCm}-{sp.hipCm}cm · 머리 {sp.headCm}cm ({sp.headToBodyRatio}등신)
                </span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginTop: 4 }}>
                {sp.stylingAdvice}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setInspectorSlot('outer');
              setInspectorOpen(true);
            }}
          >
            <Layers size={14} /> 11부위 전체 코디 인스펙터 열기
          </button>
        </section>
      )}

      {w && (
        <section className="weather-editorial-banner">
          <div className="weather-temp-block">
            <div className="weather-temp-hero">{w.tempMax}°</div>
            <div className="weather-temp-range">
              <span>최저 {w.tempMin}°C / 최고 {w.tempMax}°C</span>
              <span>체감 평균 {w.avgTemp}°C · 일교차 {w.diurnalSwing}°C</span>
            </div>
          </div>

          <div className="weather-meta-block">
            <h2>
              {w.isRainy ? <CloudRain size={19} /> : <Sun size={19} />}
              내일 ({w.date}) {w.cityName} · {w.condition}
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  color: 'var(--ink-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Wind size={14} /> 강수확률 {w.precipProb}% · 풍속 {w.windSpeed}km/h
              </span>
            </h2>
            <p>{w.weatherTip}</p>
          </div>

          <div className="weather-controls">
            <label className="field-label" htmlFor="weather-city-select" style={{ marginBottom: 2 }}>
              지역 선택
            </label>
            <select
              id="weather-city-select"
              className="select-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              {(data?.cities || []).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <div className="scenario-bar" aria-label="날씨 시나리오 전환">
        {(data?.scenarios || []).map((sc) => (
          <button
            key={sc.key}
            id={`weather-scenario-${sc.key}`}
            type="button"
            className={`chip ${scenario === sc.key ? 'active' : ''}`}
            onClick={() => setScenario(sc.key)}
          >
            {sc.label}
          </button>
        ))}
      </div>

      {/* Cyberpunk 2077 3D Character Inventory Stage */}
      {!loading && activeRec && (
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(data?.recommendations || []).map((rec, idx) => (
                <button
                  key={rec.id}
                  id={`select-3d-rec-${rec.id}`}
                  type="button"
                  className={`chip ${selectedRecIdx === idx ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRecIdx(idx);
                    setCustomSlotOverrides({});
                  }}
                >
                  <Sparkles size={13} style={{ marginRight: 4 }} />
                  {rec.badge} (적합도 {rec.suitabilityScore}%)
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
              슬롯 또는 3D 마네킹 부위를 클릭하면 카메라가 줌인되며 다른 의류로 교체할 수 있습니다
            </span>
          </div>

          <VirtualMannequin
            userProfile={sp || user}
            loadoutBySlot={mergedLoadout}
            items={activeRec.items}
            weather={w}
            title={`CP2077 LOADOUT // ${activeRec.title}`}
            onOpenBodySetup={() => onOpenProfileModal?.()}
            onOpenInspector={(slotKey) => {
              setInspectorSlot(slotKey || 'outer');
              setInspectorOpen(true);
            }}
            onSelectSlot={(slotKey) => {
              setInspectorSlot(slotKey);
              setInspectorOpen(true);
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="section-card">내일 예보와 옷장 데이터를 매칭하는 중입니다...</div>
      ) : (
        <section className="recs-grid">
          {(data?.recommendations || []).map((rec, idx) => (
            <article
              key={rec.id}
              className="rec-card"
              style={{
                border:
                  selectedRecIdx === idx
                    ? '2px solid var(--ink-primary)'
                    : '1px solid var(--border-hairline)',
              }}
            >
              <div>
                <div className="rec-card-top">
                  <span className="rec-tag">{rec.badge}</span>
                  <span className="rec-score">
                    날씨 적합도 {rec.suitabilityScore}% · 퍼스널컬러 {rec.personalColorSync || 92}%
                  </span>
                </div>
                <h3>{rec.title}</h3>

                <div className="outfit-collage">
                  {rec.items.slice(0, 6).map((item) => (
                    <div key={item.id} className="collage-piece">
                      <StudioGarmentImage
                        item={item}
                        style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 6 }}
                      />
                      <span>{item.name}</span>
                    </div>
                  ))}
                </div>

                <p className="rec-rationale">{rec.rationale}</p>
              </div>

              <div className="rec-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSelectedRecIdx(idx);
                    setCustomSlotOverrides({});
                  }}
                >
                  3D 장착
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => handleSaveOutfit(rec)}
                >
                  <BookmarkPlus size={15} /> 코디 북 저장
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => handleLogWear(rec)}
                >
                  <CalendarCheck size={15} /> 내일 입기로 기록
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <OutfitInspectorModal
        open={inspectorOpen}
        initialSlot={inspectorSlot}
        loadoutBySlot={mergedLoadout}
        closetGarments={closetGarments}
        personalColor={sp?.personalColor || user?.personalColor || 'autumn_warm'}
        onConfirmSwap={handleConfirmSwap}
        onSaveOutfit={(customItems) => handleSaveOutfit(customItems)}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}
