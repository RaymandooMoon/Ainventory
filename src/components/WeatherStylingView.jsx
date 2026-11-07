import { useEffect, useState } from 'react';
import { BookmarkPlus, CalendarCheck, CloudRain, Sun, Wind } from 'lucide-react';
import { apiFetch } from '../utils/api.js';

export default function WeatherStylingView({
  activeCloset,
  onNavigateShopping,
  onClosetUpdated,
  showToast,
}) {
  const closetOwner = activeCloset === 'all' ? 'husband' : activeCloset;
  const [city, setCity] = useState('seoul');
  const [scenario, setScenario] = useState('live');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadRecommendations = async (targetCity = city, targetScenario = scenario) => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `/weather/recommendations?closet=${closetOwner}&city=${targetCity}&scenario=${targetScenario}`
      );
      setData(res);
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

  const handleSaveOutfit = async (rec) => {
    try {
      await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: closetOwner,
          title: `${data.weather.date} ${rec.title}`,
          occasion: rec.badge.split('·')[0].trim(),
          season: '날씨 맞춤',
          item_ids: rec.items.map((i) => i.id),
          memo: rec.rationale,
        }),
      });
      showToast('코디 북(룩북)에 저장되었습니다.');
    } catch (err) {
      showToast(err.message || '코디 저장에 실패했습니다.');
    }
  };

  const handleLogWear = async (rec) => {
    try {
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: closetOwner,
          worn_date: data.weather.date,
          item_ids: rec.items.map((i) => i.id),
          weather_summary: data.weather.condition,
          temp_c: data.weather.avgTemp,
          note: `내일 날씨 추천 코디 선택 (${rec.badge})`,
        }),
      });
      onClosetUpdated?.();
      showToast(`${data.weather.date} 착용 캘린더에 등록되고 착용 횟수가 반영되었습니다.`);
    } catch (err) {
      showToast(err.message || '착용 기록에 실패했습니다.');
    }
  };

  const w = data?.weather;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>내일의 날씨 맞춤 스타일링</h1>
          <p className="page-subtitle">
            기온·일교차·강수 확률과 어제 입은 옷 기록을 함께 분석해,{' '}
            <strong>{closetOwner === 'husband' ? '남편(어드민) 옷장' : '와이프 옷장'}</strong> 속 옷으로만
            내일 입을 코디를 제안합니다.
          </p>
        </div>

        <button
          id="goto-shopping-cta"
          type="button"
          className="btn btn-primary"
          onClick={onNavigateShopping}
        >
          오프라인 매장 쇼핑 판독하기
        </button>
      </header>

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

      {loading ? (
        <div className="section-card">내일 예보와 옷장 데이터를 매칭하는 중입니다...</div>
      ) : (
        <section className="recs-grid">
          {(data?.recommendations || []).map((rec) => (
            <article key={rec.id} className="rec-card">
              <div>
                <div className="rec-card-top">
                  <span className="rec-tag">{rec.badge}</span>
                  <span className="rec-score">날씨 적합도 {rec.suitabilityScore}%</span>
                </div>
                <h3>{rec.title}</h3>

                <div className="outfit-collage">
                  {rec.items.map((item) => (
                    <div key={item.id} className="collage-piece">
                      <img src={item.image_url} alt={item.name} />
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
    </div>
  );
}
