import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Crop, Crosshair, RotateCcw, RotateCw, Search, X } from 'lucide-react';
import { DEFAULT_SKIN_PINS, detectFaceAndSkinPins } from '../utils/faceLandmarkEngine.js';

export default function PortraitCropAndPinEditorModal({
  open,
  imageSource,
  initialPins = null,
  initialRotation = 0,
  onApply,
  onClose,
}) {
  const containerRef = useRef(null);
  const [rotationDeg, setRotationDeg] = useState(initialRotation || 0);
  const [cropPreset, setCropPreset] = useState('full'); // 'full' | 'upper_body' | 'head_closeup'
  const [pins, setPins] = useState(initialPins || DEFAULT_SKIN_PINS);
  const [draggingPinId, setDraggingPinId] = useState(null);
  const [detectionInfo, setDetectionInfo] = useState(null);
  const [lowConfPopup, setLowConfPopup] = useState(false);
  const [scanning, setScanning] = useState(false);

  const getCropRect = (preset) => {
    if (preset === 'upper_body') return { x: 0.15, y: 0.04, w: 0.70, h: 0.55 };
    if (preset === 'head_closeup') return { x: 0.24, y: 0.05, w: 0.52, h: 0.42 };
    return null;
  };

  const runDetection = async (rot = rotationDeg, preset = cropPreset) => {
    if (!imageSource) return;
    setScanning(true);
    try {
      const res = await detectFaceAndSkinPins(imageSource, {
        rotationDeg: rot,
        cropRect: getCropRect(preset),
      });
      setDetectionInfo(res);
      if (res.pins && res.pins.length === 4) {
        setPins(res.pins);
      }
      if (res.isLowConfidence) {
        setLowConfPopup(true);
      }
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (open && imageSource) {
      runDetection(rotationDeg, cropPreset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageSource]);

  if (!open) return null;

  const handlePointerMove = (e) => {
    if (!draggingPinId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(0.06, Math.min(0.94, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0.06, Math.min(0.94, (e.clientY - rect.top) / Math.max(1, rect.height)));
    setPins((prev) =>
      prev.map((p) =>
        p.id === draggingPinId ? { ...p, x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) } : p
      )
    );
  };

  const handleRotate = (delta) => {
    const next = (rotationDeg + delta + 360) % 360;
    setRotationDeg(next);
    runDetection(next, cropPreset);
  };

  const handleCropChange = (preset) => {
    setCropPreset(preset);
    runDetection(rotationDeg, preset);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 760, width: '94vw', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="rec-tag" style={{ marginBottom: 4, display: 'inline-block' }}>
              478 LANDMARK &amp; 4-PIN CALIBRATOR
            </span>
            <h2>얼굴 방향 보정 · 전신샷 크롭 · 피부 참조 핀 에디터</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {lowConfPopup && (
          <div
            style={{
              background: 'var(--verdict-consider-bg)',
              color: 'var(--verdict-consider-ink)',
              padding: '12px 14px',
              borderRadius: 10,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem' }}>
              <AlertTriangle size={18} />
              <span>
                <strong>얼굴 랜드마크 자동 인식 신뢰도가 낮습니다 ({detectionInfo?.confidence ?? 45}%).</strong>{' '}
                사진이 회전되어 있거나 전신샷인 경우 상단 회전/크롭 버튼을 누르거나, 4개의 피부 샘플링 핀을 직접 드래그해 피부 부위에 맞춰주세요.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setLowConfPopup(false)}
            >
              확인
            </button>
          </div>
        )}

        {/* Toolbar: Orientation Rotation & 2-Stage Full-Body Zoom Re-scan */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 14,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleRotate(-90)}
            >
              <RotateCcw size={14} /> -90° 회전
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleRotate(90)}
            >
              <RotateCw size={14} /> +90° 회전
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleRotate(180)}
            >
              180° 반전
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip ${cropPreset === 'full' ? 'active' : ''}`}
              onClick={() => handleCropChange('full')}
            >
              <Crop size={13} /> 원본 프레임
            </button>
            <button
              type="button"
              className={`chip ${cropPreset === 'upper_body' ? 'active' : ''}`}
              onClick={() => handleCropChange('upper_body')}
            >
              <Search size={13} /> 상반신 줌 크롭
            </button>
            <button
              type="button"
              className={`chip ${cropPreset === 'head_closeup' ? 'active' : ''}`}
              onClick={() => handleCropChange('head_closeup')}
            >
              <Crosshair size={13} /> 전신샷 2단계 얼굴 클로즈업 재탐색
            </button>
          </div>
        </div>

        {/* Interactive Image & Draggable 4 Skin Pins */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 240px',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div
            ref={containerRef}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDraggingPinId(null)}
            onPointerLeave={() => setDraggingPinId(null)}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              maxHeight: 380,
              background: '#141820',
              borderRadius: 12,
              overflow: 'hidden',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            {detectionInfo?.processedDataUrl || imageSource ? (
              <img
                src={detectionInfo?.processedDataUrl || imageSource}
                alt="피부 랜드마크 핀 편집"
                style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              />
            ) : null}

            {/* 478-Landmark Mesh Contour Ring */}
            {(detectionInfo?.meshPoints || []).map((pt, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${pt.x * 100}%`,
                  top: `${pt.y * 100}%`,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'rgba(0, 229, 255, 0.55)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* 4 Draggable Skin Reference Pins */}
            {pins.map((pin, idx) => (
              <div
                key={pin.id}
                role="slider"
                aria-label={pin.labelKo}
                tabIndex={0}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingPinId(pin.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${pin.x * 100}%`,
                  top: `${pin.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: draggingPinId === pin.id ? '#00e5ff' : 'rgba(18, 25, 36, 0.88)',
                  color: draggingPinId === pin.id ? '#0b1017' : '#ffffff',
                  border: '2px solid #00e5ff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                  zIndex: 5,
                }}
              >
                <span>P{idx + 1}</span>
                <span>{pin.labelKo}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--bg-subtle)',
              padding: 14,
              borderRadius: 12,
              border: '1px solid var(--border-hairline)',
              fontSize: '0.82rem',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 8 }}>
              4대 피부 언더톤 채취 핀 위치
            </strong>
            <p style={{ color: 'var(--ink-secondary)', fontSize: '0.78rem', marginBottom: 12 }}>
              머리카락·눈썹·입술·그림자를 피해 실제 피부가 노출된 부위로 핀을 드래그해 미세 조정하세요.
            </p>
            {pins.map((pin, idx) => (
              <div
                key={pin.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border-hairline)',
                }}
              >
                <span>
                  <strong>P{idx + 1}.</strong> {pin.labelKo}
                </span>
                <span style={{ color: 'var(--ink-muted)' }}>
                  ({Math.round(pin.x * 100)}%, {Math.round(pin.y * 100)}%)
                </span>
              </div>
            ))}

            <div style={{ marginTop: 12, fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
              탐색 단계: <strong>{detectionInfo?.detectionStage || 'stage1'}</strong>
              <br />
              감지 각도: <strong>{detectionInfo?.orientationDeg ?? 0}°</strong> · 회전 보정:{' '}
              <strong>{rotationDeg}°</strong>
              {scanning && <div>재탐색 중...</div>}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid var(--border-hairline)',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            id="apply-pin-editor-btn"
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onApply?.({
                pins,
                rotationDeg,
                cropRect: getCropRect(cropPreset),
                processedDataUrl: detectionInfo?.processedDataUrl || imageSource,
              })
            }
          >
            <Check size={16} /> 크롭 및 4개 피부 핀 위치 확정
          </button>
        </div>
      </div>
    </div>
  );
}
