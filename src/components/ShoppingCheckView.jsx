import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  CATEGORIES,
  COLOR_PALETTE,
  SUBCATEGORIES_BY_CAT,
  apiFetch,
  formatKRW,
} from '../utils/api.js';
import { processUploadedImage } from '../utils/imageTools.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';

const STORE_SAMPLES = [
  {
    key: 'navy_sweater',
    label: '매장 샘플 1 · 네이비 니트',
    sublabel: '중복 주의 케이스',
    candidate_name: '매장 촬영 · 메리노 다크 네이비 니트',
    category: 'top',
    subcategory: 'knit',
    color_name: '네이비',
    color_hex: '#1D273B',
    price: 89000,
    image_url: '/seed/store-navy-sweater.jpg',
  },
  {
    key: 'terracotta_cardigan',
    label: '매장 샘플 2 · 테라코타 가디건',
    sublabel: '구매 추천 케이스',
    candidate_name: '매장 촬영 · 브릭 테라코타 울 가디건',
    category: 'top',
    subcategory: 'cardigan',
    color_name: '테라코타',
    color_hex: '#A64B2A',
    price: 148000,
    image_url: '/seed/store-terracotta-cardigan.jpg',
  },
  {
    key: 'olive_jacket',
    label: '매장 샘플 3 · 올리브 자켓',
    sublabel: '빈틈 아이템 + 커플팁',
    candidate_name: '매장 촬영 · 세이지 올리브 퀼팅 자켓',
    category: 'outer',
    subcategory: 'jacket',
    color_name: '카키/올리브',
    color_hex: '#7B826B',
    price: 179000,
    image_url: '/seed/olive-jacket.jpg',
  },
];

export default function ShoppingCheckView({ activeCloset, onClosetUpdated, showToast }) {
  const closetOwner = activeCloset === 'all' ? 'husband' : activeCloset;
  const fileInputRef = useRef(null);

  const [selectedPreset, setSelectedPreset] = useState('navy_sweater');
  const [candidateName, setCandidateName] = useState(STORE_SAMPLES[0].candidate_name);
  const [category, setCategory] = useState(STORE_SAMPLES[0].category);
  const [subcategory, setSubcategory] = useState(STORE_SAMPLES[0].subcategory);
  const [colorName, setColorName] = useState(STORE_SAMPLES[0].color_name);
  const [colorHex, setColorHex] = useState(STORE_SAMPLES[0].color_hex);
  const [price, setPrice] = useState(STORE_SAMPLES[0].price);
  const [previewUrl, setPreviewUrl] = useState(STORE_SAMPLES[0].image_url);
  const [imageData, setImageData] = useState(null);

  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [decisionDone, setDecisionDone] = useState('');
  const [history, setHistory] = useState([]);

  const loadHistory = async () => {
    try {
      const data = await apiFetch(`/shopping/history?closet=${encodeURIComponent(closetOwner)}`);
      setHistory(data.history || []);
    } catch {
      // ignore
    }
  };

  const runAnalysis = async (payloadOverride = null, saveHistory = false) => {
    setAnalyzing(true);
    setDecisionDone('');
    try {
      const body = payloadOverride || {
        closet_owner: closetOwner,
        candidate_name: candidateName,
        category,
        subcategory,
        color_name: colorName,
        color_hex: colorHex,
        price: Number(price) || 0,
        image_data: imageData,
        image_url: previewUrl,
        save_history: saveHistory,
      };
      const res = await apiFetch('/shopping/analyze', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(res);
      if (saveHistory) loadHistory();
    } catch (err) {
      showToast(err.message || '판독 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    loadHistory();
    runAnalysis(
      {
        closet_owner: closetOwner,
        candidate_name: candidateName,
        category,
        subcategory,
        color_name: colorName,
        color_hex: colorHex,
        price: Number(price) || 0,
        image_data: imageData,
        image_url: previewUrl,
        save_history: false,
      },
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closetOwner]);

  const applySample = (sample) => {
    setSelectedPreset(sample.key);
    setCandidateName(sample.candidate_name);
    setCategory(sample.category);
    setSubcategory(sample.subcategory);
    setColorName(sample.color_name);
    setColorHex(sample.color_hex);
    setPrice(sample.price);
    setPreviewUrl(sample.image_url);
    setImageData(null);

    runAnalysis(
      {
        closet_owner: closetOwner,
        candidate_name: sample.candidate_name,
        category: sample.category,
        subcategory: sample.subcategory,
        color_name: sample.color_name,
        color_hex: sample.color_hex,
        price: sample.price,
        image_url: sample.image_url,
        save_history: true,
      },
      true
    );
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await processUploadedImage(file);
      setSelectedPreset('custom');
      setPreviewUrl(processed.dataUrl);
      setImageData(processed.dataUrl);
      setColorName(processed.matchedColor.name);
      setColorHex(processed.detectedHex);
      const autoName = `오프라인 촬영 · ${processed.matchedColor.name} 아이템`;
      setCandidateName(autoName);
      showToast(`사진에서 '${processed.matchedColor.name}' 컬러를 자동 추출했습니다.`);

      await runAnalysis(
        {
          closet_owner: closetOwner,
          candidate_name: autoName,
          category,
          subcategory,
          color_name: processed.matchedColor.name,
          color_hex: processed.detectedHex,
          price: Number(price) || 0,
          image_data: processed.dataUrl,
          save_history: true,
        },
        true
      );
    } catch (err) {
      showToast(err.message || '사진 처리에 실패했습니다.');
    }
  };

  const handleDecision = async (decision, addToCloset = false) => {
    try {
      let checkId = result?.checkId;
      if (!checkId) {
        const saved = await apiFetch('/shopping/analyze', {
          method: 'POST',
          body: JSON.stringify({
            closet_owner: closetOwner,
            candidate_name: candidateName,
            category,
            subcategory,
            color_name: colorName,
            color_hex: colorHex,
            price: Number(price) || 0,
            image_data: imageData,
            image_url: previewUrl,
            save_history: true,
          }),
        });
        checkId = saved.checkId;
        setResult(saved);
      }

      await apiFetch('/shopping/decision', {
        method: 'POST',
        body: JSON.stringify({
          checkId,
          decision,
          addToCloset,
        }),
      });

      setDecisionDone(decision);
      loadHistory();
      if (addToCloset) {
        onClosetUpdated?.();
        showToast('새 옷이 내 디지털 옷장에 스튜디오 팩샷으로 등록되었습니다!');
      } else {
        showToast(`구매 보류 완료! ${formatKRW(price)} 충동구매 방어 기록에 반영되었습니다.`);
      }
    } catch (err) {
      showToast(err.message || '결정 저장에 실패했습니다.');
    }
  };

  const subOptions = SUBCATEGORIES_BY_CAT[category] || SUBCATEGORIES_BY_CAT.top;
  const analysis = result?.analysis;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>오프라인 쇼핑 구매 판독기</h1>
          <p className="page-subtitle">
            매장에서 마음에 드는 옷을 촬영하면, 현재 선택된 옷장의 11부위 보유 의류와 비교해 구매 판단을 지지해드립니다.
          </p>
        </div>
      </header>

      <div className="shopping-layout">
        <section className="capture-panel">
          <div className="sample-presets">
            <span className="sample-presets-label">원클릭 매장 촬영 시나리오 체험</span>
            <div className="sample-preset-grid">
              {STORE_SAMPLES.map((s) => (
                <button
                  key={s.key}
                  id={`sample-btn-${s.key}`}
                  type="button"
                  className={`sample-preset-btn ${selectedPreset === s.key ? 'active' : ''}`}
                  onClick={() => applySample(s)}
                >
                  <StudioGarmentImage
                    src={s.image_url}
                    category={s.category}
                    subcategory={s.subcategory}
                    alt={s.label}
                    allowStorePhoto={true}
                    style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 5, marginBottom: 5 }}
                  />
                  <span>{s.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            className="photo-dropzone"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            {previewUrl ? (
              <StudioGarmentImage
                src={previewUrl}
                category={category}
                subcategory={subcategory}
                colorHex={colorHex}
                alt="촬영된 의류 미리보기"
                allowStorePhoto={true}
                style={{ width: '100%', maxHeight: 280, borderRadius: 8 }}
              />
            ) : (
              <div>
                <Camera size={28} />
                <p>매장에서 옷 사진 찍기 또는 업로드</p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            id="shopping-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <button
            id="trigger-camera-upload-btn"
            type="button"
            className="btn btn-secondary btn-full"
            style={{ marginBottom: 16 }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} /> 내 스마트폰 카메라 · 앨범 사진 불러오기
          </button>

          <div className="color-detected-row">
            <span className="color-dot" style={{ backgroundColor: colorHex }} />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: '0.84rem' }}>감지된 색상 · {colorName}</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                사진 중앙 영역에서 자동 추출 (직접 변경 가능)
              </div>
            </div>
            <select
              id="shopping-color-select"
              className="select-input"
              style={{ width: 'auto', padding: '6px 10px', fontSize: '0.82rem' }}
              value={colorName}
              onChange={(e) => {
                const found = COLOR_PALETTE.find((c) => c.name === e.target.value);
                setColorName(e.target.value);
                if (found) setColorHex(found.hex);
              }}
            >
              {COLOR_PALETTE.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="shopping-item-name">
              촬영 아이템 메모
            </label>
            <input
              id="shopping-item-name"
              className="text-input"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label" htmlFor="shopping-category">
                카테고리 (11부위)
              </label>
              <select
                id="shopping-category"
                className="select-input"
                value={category}
                onChange={(e) => {
                  const nextCat = e.target.value;
                  setCategory(nextCat);
                  const firstSub = SUBCATEGORIES_BY_CAT[nextCat]?.[0]?.value || 'knit';
                  setSubcategory(firstSub);
                }}
              >
                {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="shopping-subcategory">
                세부 종류
              </label>
              <select
                id="shopping-subcategory"
                className="select-input"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
              >
                {subOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="shopping-price">
              매장 가격 태그 (원)
            </label>
            <input
              id="shopping-price"
              className="text-input"
              type="number"
              min="0"
              step="1000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <button
            id="run-shopping-analysis-btn"
            type="button"
            className="btn btn-primary btn-full"
            disabled={analyzing}
            onClick={() => runAnalysis(null, true)}
          >
            <Sparkles size={16} />
            {analyzing ? '옷장 데이터 대조 중...' : '내 옷장과 정밀 비교 판독하기'}
          </button>
        </section>

        <section className="verdict-panel">
          {analysis && (
            <>
              <div className="verdict-hero-card">
                <div className={`verdict-badge ${analysis.verdict}`}>
                  {analysis.verdict === 'buy' && <CheckCircle2 size={16} />}
                  {analysis.verdict === 'consider' && <HelpCircle size={16} />}
                  {analysis.verdict === 'skip' && <AlertTriangle size={16} />}
                  {analysis.confidenceLabel}
                </div>

                <h2>{analysis.headline}</h2>
                <p className="verdict-summary">{analysis.summary}</p>

                <div className="verdict-metrics">
                  <div className="verdict-metric">
                    <span>옷장 내 유사 아이템</span>
                    <strong>{analysis.similarCount}벌</strong>
                  </div>
                  <div className="verdict-metric">
                    <span>최고 유사도</span>
                    <strong>{analysis.maxSimilarity}%</strong>
                  </div>
                  <div className="verdict-metric">
                    <span>즉시 매칭 가능 보유템</span>
                    <strong>{analysis.compatibleCount}벌</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    id="decision-pass-btn"
                    type="button"
                    className="btn btn-secondary"
                    disabled={decisionDone === 'passed'}
                    onClick={() => handleDecision('passed', false)}
                  >
                    {decisionDone === 'passed'
                      ? '보류 기록 완료 (절약 성공)'
                      : `안 사기로 결정 (${formatKRW(price)} 절약 기록)`}
                  </button>
                  <button
                    id="decision-buy-btn"
                    type="button"
                    className="btn btn-sage"
                    disabled={decisionDone === 'bought'}
                    onClick={() => handleDecision('bought', true)}
                  >
                    {decisionDone === 'bought'
                      ? '옷장에 등록 완료됨'
                      : '구매 완료 → 내 옷장에 바로 넣기'}
                  </button>
                </div>

                {analysis.partnerInsight && (
                  <div className="couple-insight-box">
                    <Sparkles size={16} />
                    <span>{analysis.partnerInsight}</span>
                  </div>
                )}
              </div>

              <div className="section-card">
                <h3>
                  {analysis.similarItems.length > 0
                    ? `내 옷장 속 비슷한 옷 (${analysis.similarItems.length}벌 발견)`
                    : '같은 카테고리 내 가장 가까운 보유 아이템 (중복 없음)'}
                </h3>

                {analysis.similarItems.length === 0 && analysis.closestOtherItems.length === 0 ? (
                  <p style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem' }}>
                    현재 이 카테고리에 등록된 옷이 전혀 없어 첫 에센셜 아이템으로 추천합니다!
                  </p>
                ) : (
                  <div className="similar-items-grid">
                    {(analysis.similarItems.length > 0
                      ? analysis.similarItems
                      : analysis.closestOtherItems
                    ).map((item) => (
                      <div key={item.id} className="similar-card">
                        <div className="similar-card-img">
                          <StudioGarmentImage
                            item={item}
                            style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 6 }}
                          />
                          <span className="similarity-pill">유사도 {item.similarity}%</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                          {item.brand || '내 옷장'} · {item.color_name}
                        </div>
                        <strong style={{ display: 'block', fontSize: '0.88rem', margin: '2px 0 6px' }}>
                          {item.name}
                        </strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                          누적 착용 <strong>{item.wear_count}회</strong> · 1회당 {formatKRW(item.cpw)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {analysis.pairingOutfits?.length > 0 && (
                <div className="section-card">
                  <h3>이 옷을 사면 바로 입을 수 있는 내 옷장 매칭 시뮬레이션</h3>
                  <div className="recs-grid" style={{ marginTop: 12 }}>
                    {analysis.pairingOutfits.map((combo) => (
                      <div
                        key={combo.key}
                        style={{
                          background: 'var(--bg-canvas)',
                          padding: 14,
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-hairline)',
                        }}
                      >
                        <span className="rec-tag" style={{ display: 'inline-block', marginBottom: 10 }}>
                          {combo.label}
                        </span>
                        <div className="outfit-collage" style={{ marginBottom: 0 }}>
                          <div className="collage-piece">
                            <StudioGarmentImage
                              src={previewUrl}
                              category={category}
                              subcategory={subcategory}
                              colorHex={colorHex}
                              alt="새 옷 후보"
                              allowStorePhoto={true}
                              style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 6 }}
                            />
                            <span>[새 옷] {colorName}</span>
                          </div>
                          {combo.existingItems.map((ex) => (
                            <div key={ex.id} className="collage-piece">
                              <StudioGarmentImage
                                item={ex}
                                style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 6 }}
                              />
                              <span>{ex.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div className="section-card">
                  <h3>최근 오프라인 매장 판독 히스토리</h3>
                  <div>
                    {history.slice(0, 5).map((h) => (
                      <div key={h.id} className="cpw-row">
                        <StudioGarmentImage
                          item={h}
                          allowStorePhoto={true}
                          style={{ width: 48, height: 62, borderRadius: 6, flexShrink: 0 }}
                        />
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: '0.9rem' }}>{h.candidate_name}</strong>
                          <div style={{ fontSize: '0.79rem', color: 'var(--ink-secondary)' }}>
                            유사 옷 {h.similar_count}벌 (최고 {h.max_similarity}%) · {formatKRW(h.price)}
                          </div>
                        </div>
                        <span
                          className={`verdict-badge ${h.verdict}`}
                          style={{ marginBottom: 0, fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          {h.decision === 'passed'
                            ? '패스 · 절약함'
                            : h.decision === 'bought'
                              ? '구매 · 등록됨'
                              : h.verdict === 'buy'
                                ? '구매 추천'
                                : '중복 주의'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
