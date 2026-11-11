import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crop,
  HelpCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  COLOR_PALETTE,
  SUBCATEGORIES_BY_CAT,
  apiFetch,
  formatKRW,
} from '../utils/api.js';
import { infer3DRegistrationSpec } from '../utils/garment3DPhysicsSpecs.js';
import { hasAcknowledgedCameraNotice } from '../utils/nativeBridge.js';
import {
  PageHeader,
  PermissionNoticeModal,
  ResponsiveSheetModal,
} from './common/AppUI.jsx';
import SmartPhotoCropEditorModal from './SmartPhotoCropEditorModal.jsx';
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
    image_url: '/seed/navy-knit.jpg',
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
    image_url: '/seed/studio-cardigan.png',
  },
  {
    key: 'olive_jacket',
    label: '매장 샘플 3 · 올리브 자켓',
    sublabel: '빈틈 아이템 + 커플팁',
    candidate_name: '매장 촬영 · 세이지 올리브 필드 자켓',
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
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const camReqIdRef = useRef(0);

  const [selectedPreset, setSelectedPreset] = useState('navy_sweater');
  const [candidateName, setCandidateName] = useState(STORE_SAMPLES[0].candidate_name);
  const [category, setCategory] = useState(STORE_SAMPLES[0].category);
  const [subcategory, setSubcategory] = useState(STORE_SAMPLES[0].subcategory);
  const [colorName, setColorName] = useState(STORE_SAMPLES[0].color_name);
  const [colorHex, setColorHex] = useState(STORE_SAMPLES[0].color_hex);
  const [price, setPrice] = useState(STORE_SAMPLES[0].price);
  const [previewUrl, setPreviewUrl] = useState(STORE_SAMPLES[0].image_url);
  const [imageData, setImageData] = useState(null);

  // Live Camera + Permission Notice + Immediate Photo Crop Editor (Req 4 & Req 10.c)
  const [liveCamOpen, setLiveCamOpen] = useState(false);
  const [pendingPickerMode, setPendingPickerMode] = useState(null); // null | 'camera' | 'gallery'
  const [rawUploadSource, setRawUploadSource] = useState('');
  const [cropEditorOpen, setCropEditorOpen] = useState(false);

  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [decisionDone, setDecisionDone] = useState('');
  const [history, setHistory] = useState([]);
  const [detailSheet, setDetailSheet] = useState(null); // null | 'pairing' | 'history'

  const stopLiveCam = useCallback(() => {
    camReqIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLiveCamOpen(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopLiveCam();
    };
  }, [stopLiveCam]);

  const live3DSpec = useMemo(
    () =>
      infer3DRegistrationSpec({
        name: candidateName,
        category,
        subcategory,
      }),
    [candidateName, category, subcategory]
  );

  const loadHistory = async () => {
    try {
      const data = await apiFetch(`/shopping/history?closet=${encodeURIComponent(closetOwner)}`);
      if (mountedRef.current) {
        setHistory(data.history || []);
      }
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
      if (mountedRef.current) {
        setResult(res);
      }
      if (saveHistory) loadHistory();
    } catch (err) {
      showToast?.(err.message || '판독 중 오류가 발생했습니다.');
    } finally {
      if (mountedRef.current) {
        setAnalyzing(false);
      }
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
    stopLiveCam();
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

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopLiveCam();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setRawUploadSource(reader.result);
      setCropEditorOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startLiveCamera = async () => {
    stopLiveCam();
    const reqId = ++camReqIdRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
      if (!mountedRef.current || reqId !== camReqIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setLiveCamOpen(true);
      requestAnimationFrame(() => {
        if (!mountedRef.current || streamRef.current !== stream) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      if (mountedRef.current) {
        cameraInputRef.current?.click();
      }
    }
  };

  const requestShoppingPicker = (mode) => {
    if (!hasAcknowledgedCameraNotice()) {
      setPendingPickerMode(mode);
      return;
    }
    if (mode === 'camera') {
      startLiveCamera();
    } else {
      fileInputRef.current?.click();
    }
  };

  const snapLiveCameraFrame = () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    const c = document.createElement('canvas');
    c.width = vw;
    c.height = vh;
    const ctx = c.getContext('2d');
    if (!ctx) {
      showToast?.('카메라 프레임을 캡처할 수 없습니다.');
      return;
    }
    ctx.drawImage(videoRef.current, 0, 0, vw, vh);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    stopLiveCam();
    setRawUploadSource(dataUrl);
    setCropEditorOpen(true);
  };

  const handleCroppedPhotoApply = async (cropped) => {
    setCropEditorOpen(false);
    if (!cropped?.dataUrl) return;
    const matchedName = cropped?.matchedColor?.name || colorName;
    const detectedHex = cropped?.detectedHex || cropped?.matchedColor?.hex || colorHex;

    setSelectedPreset('custom');
    setPreviewUrl(cropped.dataUrl);
    setImageData(cropped.dataUrl);
    setColorName(matchedName);
    setColorHex(detectedHex);
    const autoName = `오프라인 촬영 · ${matchedName} 아이템`;
    setCandidateName(autoName);
    showToast?.(`크롭 및 '${matchedName}' 색상 자동 추출 완료`);

    await runAnalysis(
      {
        closet_owner: closetOwner,
        candidate_name: autoName,
        category,
        subcategory,
        color_name: matchedName,
        color_hex: detectedHex,
        price: Number(price) || 0,
        image_data: cropped.dataUrl,
        save_history: true,
      },
      true
    );
  };

  const handleCandidateNameChange = (val) => {
    setCandidateName(val);
    const inferred = infer3DRegistrationSpec({ name: val, category: '', subcategory: '' });
    if (
      inferred &&
      /서류가방|브리프케이스|토트|쇼퍼|머플러|목도리|넥타이|트렌치|코트|스커트|장갑|시계|벨트|안경/i.test(val)
    ) {
      setCategory(inferred.category);
      setSubcategory(inferred.subcategory);
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
        showToast?.('새 옷이 내 디지털 옷장 및 3D 마네킹 슬롯에 등록되었습니다');
      } else {
        showToast?.(`구매 보류 완료 · ${formatKRW(price)} 절약 기록 반영`);
      }
    } catch (err) {
      showToast?.(err.message || '결정 저장에 실패했습니다.');
    }
  };

  const subOptions = SUBCATEGORIES_BY_CAT[category] || SUBCATEGORIES_BY_CAT.top;
  const analysis = result?.analysis;

  return (
    <div>
      <PageHeader
        title="구매 판독"
        subtitle="매장 촬영 사진과 내 옷장의 유사도 · 활용도를 즉시 대조합니다"
        actions={
          history.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm tabular-nums"
              style={{ minHeight: 44 }}
              onClick={() => setDetailSheet('history')}
            >
              히스토리 ({history.length})
            </button>
          ) : null
        }
      />

      <div className="shopping-layout">
        <section className="capture-panel">
          <div className="sample-presets">
            <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
              매장 촬영 시나리오 프리셋
            </span>
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
                    colorHex={s.color_hex}
                    alt={s.label}
                    style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 8, marginBottom: 8 }}
                  />
                  <span className="hig-caption">{s.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          {liveCamOpen ? (
            <div
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                background: 'var(--bg-surface)',
                marginBottom: 16,
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }}
              />
              <div style={{ display: 'flex', gap: 8, padding: 8, background: 'var(--bg-surface)' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={snapLiveCameraFrame}
                >
                  <Camera size={15} /> 촬영 후 크롭 열기
                </button>
                <button type="button" className="btn btn-secondary" onClick={stopLiveCam}>
                  <X size={15} /> 닫기
                </button>
              </div>
            </div>
          ) : (
            <div
              className="photo-dropzone"
              onClick={() => requestShoppingPicker('gallery')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  requestShoppingPicker('gallery');
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="매장 피팅샷 또는 제품 사진 업로드"
            >
              {previewUrl ? (
                <StudioGarmentImage
                  src={previewUrl}
                  category={category}
                  subcategory={subcategory}
                  colorHex={colorHex}
                  alt="촬영된 의류 미리보기"
                  allowStorePhoto={Boolean(imageData)}
                  style={{ width: '100%', maxHeight: 280, borderRadius: 8 }}
                />
              ) : (
                <div>
                  <Camera size={24} />
                  <p className="hig-caption" style={{ marginTop: 8 }}>
                    매장 피팅샷 · 제품 사진 업로드 후 크롭하기
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Gallery / Full-Body File Input */}
          <input
            ref={fileInputRef}
            id="shopping-photo-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {/* Native Mobile Camera Fallback Input */}
          <input
            ref={cameraInputRef}
            id="shopping-camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              id="trigger-live-camera-btn"
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => requestShoppingPicker('camera')}
            >
              <Camera size={15} /> 카메라 촬영
            </button>
            <button
              id="trigger-camera-upload-btn"
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => requestShoppingPicker('gallery')}
            >
              <Upload size={15} /> 앨범 업로드
            </button>
            {(rawUploadSource || imageData) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ minHeight: 44 }}
                onClick={() => {
                  if (!rawUploadSource && imageData) setRawUploadSource(imageData);
                  setCropEditorOpen(true);
                }}
              >
                <Crop size={14} /> 다시 크롭
              </button>
            )}
          </div>

          <div className="color-detected-row">
            <span className="color-dot" style={{ backgroundColor: colorHex }} />
            <div style={{ flex: 1 }}>
              <div className="hig-body" style={{ fontWeight: 600 }}>
                감지된 색상 · {colorName}
              </div>
              <div className="hig-caption">크롭 영역 중심에서 자동 추출</div>
            </div>
            <select
              id="shopping-color-select"
              className="select-input"
              aria-label="감지된 색상 선택"
              style={{ width: 'auto', padding: '8px 16px', minHeight: 44 }}
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
              style={{ background: 'var(--bg-canvas)' }}
              value={candidateName}
              onChange={(e) => handleCandidateNameChange(e.target.value)}
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
                style={{ background: 'var(--bg-canvas)' }}
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
                style={{ background: 'var(--bg-canvas)' }}
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

          <div
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              background: 'var(--bg-canvas)',
              marginBottom: 16,
            }}
          >
            <span className="hig-caption" style={{ color: 'var(--ink-primary)', fontWeight: 600 }}>
              3D 물리 규격: {live3DSpec.preset.labelKo}
            </span>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="shopping-price">
              매장 가격 태그 (원)
            </label>
            <input
              id="shopping-price"
              className="text-input tabular-nums"
              style={{ background: 'var(--bg-canvas)' }}
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
            <span>{analyzing ? '옷장 데이터 대조 중...' : '내 옷장과 비교 판독하기'}</span>
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
                  <span>{analysis.confidenceLabel}</span>
                </div>

                <h2 className="hig-headline" style={{ marginBottom: 8 }}>
                  {analysis.headline}
                </h2>
                <p className="hig-caption" style={{ marginBottom: 16 }}>
                  {analysis.summary}
                </p>

                <div className="verdict-metrics">
                  <div className="verdict-metric">
                    <span className="hig-caption">유사 아이템</span>
                    <strong className="hig-headline tabular-nums">{analysis.similarCount}벌</strong>
                  </div>
                  <div className="verdict-metric">
                    <span className="hig-caption">최고 유사도</span>
                    <strong className="hig-headline tabular-nums">{analysis.maxSimilarity}%</strong>
                  </div>
                  <div className="verdict-metric">
                    <span className="hig-caption">매칭 보유템</span>
                    <strong className="hig-headline tabular-nums">{analysis.compatibleCount}벌</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    id="decision-pass-btn"
                    type="button"
                    className="btn btn-secondary tabular-nums"
                    disabled={decisionDone === 'passed'}
                    onClick={() => handleDecision('passed', false)}
                  >
                    {decisionDone === 'passed'
                      ? '보류 기록 완료'
                      : `보류하기 (${formatKRW(price)} 절약)`}
                  </button>
                  <button
                    id="decision-buy-btn"
                    type="button"
                    className="btn btn-primary"
                    disabled={decisionDone === 'bought'}
                    onClick={() => handleDecision('bought', true)}
                  >
                    {decisionDone === 'bought' ? '옷장 등록 완료' : '구매 완료 · 옷장에 넣기'}
                  </button>
                  {analysis.pairingOutfits?.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm tabular-nums"
                      style={{ minHeight: 44 }}
                      onClick={() => setDetailSheet('pairing')}
                    >
                      매칭 시뮬레이션 ({analysis.pairingOutfits.length})
                    </button>
                  )}
                </div>

                {analysis.partnerInsight && (
                  <div className="couple-insight-box">
                    <Sparkles size={16} />
                    <span className="hig-caption">{analysis.partnerInsight}</span>
                  </div>
                )}
              </div>

              <div className="section-card">
                <h3 className="hig-headline tabular-nums">
                  {analysis.similarItems.length > 0
                    ? `유사 보유 의류 (${analysis.similarItems.length}벌)`
                    : '카테고리 내 가장 가까운 보유 의류'}
                </h3>

                {analysis.similarItems.length === 0 && analysis.closestOtherItems.length === 0 ? (
                  <p className="hig-caption">
                    현재 이 카테고리에 등록된 옷이 없어 첫 에센셜 아이템으로 적합합니다.
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
                            style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 8 }}
                          />
                          <span className="similarity-pill tabular-nums">
                            유사도 {item.similarity}%
                          </span>
                        </div>
                        <div className="hig-caption">
                          {item.brand || '내 옷장'} · {item.color_name}
                        </div>
                        <div className="hig-body" style={{ fontWeight: 600, margin: '4px 0' }}>
                          {item.name}
                        </div>
                        <div className="hig-caption tabular-nums">
                          착용 {item.wear_count}회 · 1회 {formatKRW(item.cpw)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Pairing Outfit Simulation Bottom Sheet */}
      <ResponsiveSheetModal
        open={detailSheet === 'pairing'}
        onClose={() => setDetailSheet(null)}
        eyebrow="PAIRING SIMULATION"
        title="보유 옷장 매칭 코디 시뮬레이션"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(analysis?.pairingOutfits || []).map((combo) => (
            <div
              key={combo.key}
              style={{
                background: 'var(--bg-surface)',
                padding: 16,
                borderRadius: 16,
              }}
            >
              <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
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
                    allowStorePhoto={Boolean(imageData)}
                    style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 8 }}
                  />
                  <span className="hig-caption">[새 옷] {colorName}</span>
                </div>
                {combo.existingItems.map((ex) => (
                  <div key={ex.id} className="collage-piece">
                    <StudioGarmentImage
                      item={ex}
                      style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 8 }}
                    />
                    <span className="hig-caption">{ex.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ResponsiveSheetModal>

      {/* Shopping Check History Bottom Sheet */}
      <ResponsiveSheetModal
        open={detailSheet === 'history'}
        onClose={() => setDetailSheet(null)}
        eyebrow="SHOPPING CHECK HISTORY"
        title={`최근 매장 판독 기록 (${history.length})`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.slice(0, 10).map((h) => (
            <div
              key={h.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 16,
                background: 'var(--bg-surface)',
              }}
            >
              <StudioGarmentImage
                item={h}
                allowStorePhoto={true}
                style={{ width: 48, height: 64, borderRadius: 8, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div className="hig-body" style={{ fontWeight: 600 }}>
                  {h.candidate_name}
                </div>
                <div className="hig-caption tabular-nums">
                  유사 {h.similar_count}벌 ({h.max_similarity}%) · {formatKRW(h.price)}
                </div>
              </div>
              <span className="hig-caption">
                {h.decision === 'passed'
                  ? '보류됨'
                  : h.decision === 'bought'
                    ? '구매됨'
                    : h.verdict === 'buy'
                      ? '추천'
                      : '중복 주의'}
              </span>
            </div>
          ))}
        </div>
      </ResponsiveSheetModal>

      <PermissionNoticeModal
        open={Boolean(pendingPickerMode)}
        mode={pendingPickerMode === 'camera' ? 'camera' : 'gallery'}
        onClose={() => setPendingPickerMode(null)}
        onConfirm={() => {
          const mode = pendingPickerMode;
          setPendingPickerMode(null);
          if (mode === 'camera') {
            startLiveCamera();
          } else {
            fileInputRef.current?.click();
          }
        }}
      />

      <SmartPhotoCropEditorModal
        open={cropEditorOpen}
        imageSource={rawUploadSource}
        mode="garment"
        title="매장 촬영 · 피팅샷 크롭 에디터"
        onApply={handleCroppedPhotoApply}
        onClose={() => setCropEditorOpen(false)}
      />
    </div>
  );
}
