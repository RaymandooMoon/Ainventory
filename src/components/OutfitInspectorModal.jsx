import { useMemo, useState } from 'react';
import { Check, Layers, ShieldAlert, Sparkles, X } from 'lucide-react';
import { computeItemTier, formatKRW } from '../utils/api.js';
import { inferFabricMaterialSpec } from '../utils/mannequin3DRenderer.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import { ALL_11_SLOTS } from './VirtualMannequin.jsx';

export default function OutfitInspectorModal({
  open,
  initialSlot = 'outer',
  loadoutBySlot = {},
  closetGarments = [],
  personalColor = 'autumn_warm',
  onConfirmSwap,
  onSaveOutfit,
  onClose,
}) {
  const [activeSlot, setActiveSlot] = useState(initialSlot || 'outer');
  const [pendingCandidate, setPendingCandidate] = useState(null);

  const candidatesForSlot = useMemo(() => {
    return (closetGarments || []).filter((g) => {
      if (activeSlot === 'accessory') {
        return g.category === 'accessory' || g.category === 'bag';
      }
      return g.category === activeSlot;
    });
  }, [closetGarments, activeSlot]);

  if (!open) return null;

  const currentEquipped = loadoutBySlot[activeSlot] || null;

  const handleRequestChange = (candidateItem) => {
    if (currentEquipped && currentEquipped.id === candidateItem.id) return;
    setPendingCandidate(candidateItem);
  };

  const handleConfirmChange = () => {
    if (!pendingCandidate) return;
    onConfirmSwap?.(activeSlot, pendingCandidate);
    setPendingCandidate(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box inspector-modal-box"
        style={{ maxWidth: 980, width: '95vw', padding: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: 18 }}>
          <div>
            <span className="rec-tag" style={{ marginBottom: 6, display: 'inline-block' }}>
              HEAD-TO-TOE 11-SLOT INSPECTOR
            </span>
            <h2>머리부터 발끝까지 11부위 전체 코디 인스펙터</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {/* 11-Slot Horizontal Strip (Head -> Feet) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
            gap: 8,
            marginBottom: 20,
          }}
        >
          {ALL_11_SLOTS.map((slot) => {
            const item = loadoutBySlot[slot.key] || null;
            const isSelected = activeSlot === slot.key;
            const tier = computeItemTier(item, personalColor);
            return (
              <button
                key={slot.key}
                id={`inspector-slot-tab-${slot.key}`}
                type="button"
                onClick={() => {
                  setActiveSlot(slot.key);
                  setPendingCandidate(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: isSelected
                    ? '2px solid var(--ink-primary)'
                    : '1px solid var(--border-hairline)',
                  background: isSelected ? 'var(--bg-subtle)' : 'var(--bg-canvas)',
                  textAlign: 'left',
                }}
              >
                <div style={{ width: 36, height: 46, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                  {item ? (
                    <StudioGarmentImage item={item} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: '#e7e2d8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.62rem',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      비어있음
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: tier.color }}>
                    {slot.labelKo.split('·')[0].trim()}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item ? item.name : '미장착'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Slot Inspector & Wardrobe Alternatives */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '280px 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* Currently Equipped Item Card */}
          <div
            style={{
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              border: '1px solid var(--border-hairline)',
            }}
          >
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 8 }}>
              현재 장착 중인 아이템
            </div>
            {currentEquipped ? (
              <>
                <div style={{ aspectRatio: '3 / 4', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                  <StudioGarmentImage
                    item={currentEquipped}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
                <span className="rec-tag">{currentEquipped.brand || 'Personal Archive'}</span>
                <h3 style={{ fontSize: '1rem', margin: '6px 0' }}>{currentEquipped.name}</h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', marginBottom: 8 }}>
                  컬러: <strong>{currentEquipped.color_name}</strong> · 소재:{' '}
                  <strong>{inferFabricMaterialSpec(currentEquipped).labelKo}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  누적 착용 {currentEquipped.wear_count}회 · 1회당 CPW {formatKRW(currentEquipped.cpw)}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-full"
                  style={{ marginTop: 12 }}
                  onClick={() => onConfirmSwap?.(activeSlot, null)}
                >
                  이 부위 장착 해제하기
                </button>
              </>
            ) : (
              <div style={{ padding: '36px 12px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                현재 이 부위에 장착된 아이템이 없습니다. 우측 목록에서 아이템을 선택해 장착하세요.
              </div>
            )}
          </div>

          {/* Wardrobe Alternatives Grid for Active Slot */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <h3 style={{ fontSize: '1.02rem' }}>
                옷장 내 교체 가능한 아이템 ({candidatesForSlot.length}벌)
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                아이템 클릭 시 확인 팝업 후 3D 마네킹에 즉시 반영됩니다
              </span>
            </div>

            {candidatesForSlot.length === 0 ? (
              <div className="section-card" style={{ textAlign: 'center', padding: 32 }}>
                이 부위에 등록된 보유 의류가 없습니다.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 12,
                  maxHeight: 370,
                  overflowY: 'auto',
                  padding: 4,
                }}
              >
                {candidatesForSlot.map((cand) => {
                  const isEquipped = currentEquipped?.id === cand.id;
                  const tier = computeItemTier(cand, personalColor);
                  return (
                    <button
                      key={cand.id}
                      id={`inspector-candidate-${cand.id}`}
                      type="button"
                      onClick={() => handleRequestChange(cand)}
                      style={{
                        background: isEquipped ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                        border: isEquipped
                          ? '2px solid var(--accent-sage)'
                          : '1px solid var(--border-hairline)',
                        borderRadius: 12,
                        padding: 10,
                        textAlign: 'left',
                        transition: 'transform 0.16s ease',
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: '3 / 4',
                          borderRadius: 8,
                          overflow: 'hidden',
                          marginBottom: 8,
                          position: 'relative',
                        }}
                      >
                        <StudioGarmentImage item={cand} style={{ width: '100%', height: '100%' }} />
                        <span
                          style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            background: 'rgba(15,21,32,0.82)',
                            color: tier.color,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {tier.tier}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--ink-muted)' }}>
                        {cand.brand || 'Archive'} · {cand.color_name}
                      </div>
                      <strong
                        style={{
                          fontSize: '0.82rem',
                          display: 'block',
                          margin: '2px 0 4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cand.name}
                      </strong>
                      <div style={{ fontSize: '0.73rem', color: 'var(--ink-secondary)' }}>
                        {isEquipped ? '현재 장착 중' : `교체 선택 · CPW ${formatKRW(cand.cpw)}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Popup: "다른 아이템으로 변경하시겠습니까?" */}
        {pendingCandidate && (
          <div
            id="confirm-item-swap-popup"
            style={{
              marginTop: 18,
              padding: '16px 20px',
              borderRadius: 12,
              background: '#121924',
              color: '#f5f7fa',
              border: '1px solid #00e5ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldAlert size={22} color="#00e5ff" />
              <div>
                <strong style={{ fontSize: '0.96rem', display: 'block' }}>
                  다른 아이템으로 변경하시겠습니까?
                </strong>
                <span style={{ fontSize: '0.82rem', color: '#b8c4d4' }}>
                  {currentEquipped ? `'${currentEquipped.name}'` : '미장착 상태'} →{' '}
                  <strong style={{ color: '#00e5ff' }}>&lsquo;{pendingCandidate.name}&rsquo;</strong>
                  (으)로 교체하고 3D 마네킹에 즉시 입힙니다.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                id="cancel-swap-btn"
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPendingCandidate(null)}
              >
                취소
              </button>
              <button
                id="confirm-swap-btn"
                type="button"
                className="btn btn-sage btn-sm"
                onClick={handleConfirmChange}
              >
                <Check size={15} /> 변경 확정하기
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--border-hairline)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <span style={{ fontSize: '0.83rem', color: 'var(--ink-secondary)' }}>
            <Layers size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            머리부터 발끝까지 커스텀한 현재 코디를 코디 북에 바로 저장할 수 있습니다.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {onSaveOutfit && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSaveOutfit(Object.values(loadoutBySlot).filter(Boolean))}
              >
                <Sparkles size={15} /> 현재 커스텀 코디 룩북 저장
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              인스펙터 완료 및 닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
