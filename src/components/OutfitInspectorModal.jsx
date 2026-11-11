import { useEffect, useMemo, useState } from 'react';
import { Check, Layers, ShieldAlert, Sparkles } from 'lucide-react';
import { WEAR_SLOTS_11 } from '../shared/garmentTaxonomy.js';
import { computeItemTier, formatKRW } from '../utils/api.js';
import { inferFabricMaterialSpec } from '../utils/mannequin3DRenderer.js';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';

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

  useEffect(() => {
    if (open && initialSlot) {
      setActiveSlot(initialSlot);
      setPendingCandidate(null);
    }
  }, [open, initialSlot]);

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
    <ResponsiveSheetModal
      id="outfit-inspector-sheet"
      open={open}
      onClose={onClose}
      eyebrow="HEAD-TO-TOE 11-SLOT INSPECTOR"
      title="11부위 전체 코디 인스펙터"
      maxWidth={960}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 11-Slot Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
            gap: 8,
          }}
        >
          {WEAR_SLOTS_11.map((slot) => {
            const item = loadoutBySlot[slot.key] || null;
            const isSelected = activeSlot === slot.key;
            const slotShortLabel = slot.shortKo || (slot.labelKo || '').split('·')[0].trim();
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
                  padding: 8,
                  borderRadius: 12,
                  background: isSelected ? 'var(--accent-mono)' : 'var(--bg-surface)',
                  color: isSelected ? 'var(--ink-inverse)' : 'var(--ink-primary)',
                  textAlign: 'left',
                  transition: 'transform 0.24s var(--spring-ease), background 0.24s var(--spring-ease)',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 48,
                    borderRadius: 8,
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: 'var(--bg-canvas)',
                  }}
                >
                  {item ? (
                    <StudioGarmentImage item={item} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <div
                      className="hig-caption"
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      비어있음
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="hig-caption"
                    style={{ color: isSelected ? 'var(--ink-inverse)' : 'var(--ink-secondary)' }}
                  >
                    {slotShortLabel}
                  </div>
                  <div
                    className="hig-body"
                    style={{
                      fontWeight: 600,
                      color: isSelected ? 'var(--ink-inverse)' : 'var(--ink-primary)',
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Currently Equipped Item Card */}
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div className="hig-caption" style={{ marginBottom: 8 }}>
              현재 장착 중인 아이템
            </div>
            {currentEquipped ? (
              <>
                <div
                  style={{
                    aspectRatio: '3 / 4',
                    borderRadius: 12,
                    overflow: 'hidden',
                    marginBottom: 16,
                    background: 'var(--bg-canvas)',
                  }}
                >
                  <StudioGarmentImage
                    item={currentEquipped}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
                <span className="rec-tag">{currentEquipped.brand || 'Personal Archive'}</span>
                <h3 className="hig-headline" style={{ margin: '8px 0' }}>
                  {currentEquipped.name}
                </h3>
                <div className="hig-caption" style={{ marginBottom: 8 }}>
                  컬러: <strong>{currentEquipped.color_name}</strong> · 소재:{' '}
                  <strong>{inferFabricMaterialSpec(currentEquipped).labelKo}</strong>
                </div>
                <div className="hig-caption tabular-nums">
                  누적 착용 {currentEquipped.wear_count}회 · 1회당 CPW {formatKRW(currentEquipped.cpw)}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-full"
                  style={{ marginTop: 16 }}
                  onClick={() => onConfirmSwap?.(activeSlot, null)}
                >
                  이 부위 장착 해제하기
                </button>
              </>
            ) : (
              <div className="hig-caption" style={{ padding: '32px 16px', textAlign: 'center' }}>
                현재 이 부위에 장착된 아이템이 없습니다. 목록에서 아이템을 선택해 장착하세요.
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
                marginBottom: 8,
                gap: 8,
              }}
            >
              <h3 className="hig-headline tabular-nums">
                교체 가능한 아이템 ({candidatesForSlot.length}벌)
              </h3>
            </div>

            {candidatesForSlot.length === 0 ? (
              <div className="section-card" style={{ textAlign: 'center', padding: 32 }}>
                <span className="hig-caption">이 부위에 등록된 보유 의류가 없습니다.</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(144px, 1fr))',
                  gap: 8,
                  maxHeight: 368,
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
                        borderRadius: 16,
                        padding: 8,
                        textAlign: 'left',
                        transition: 'transform 0.24s var(--spring-ease)',
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: '3 / 4',
                          borderRadius: 8,
                          overflow: 'hidden',
                          marginBottom: 8,
                          position: 'relative',
                          background: 'var(--bg-canvas)',
                        }}
                      >
                        <StudioGarmentImage item={cand} style={{ width: '100%', height: '100%' }} />
                        <span
                          className="hig-caption"
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            background: 'var(--bg-surface)',
                            color: 'var(--ink-primary)',
                            padding: '4px 8px',
                            borderRadius: 999,
                          }}
                        >
                          {tier.tier}
                        </span>
                      </div>
                      <div className="hig-caption">
                        {cand.brand || 'Archive'} · {cand.color_name}
                      </div>
                      <div
                        className="hig-body"
                        style={{
                          fontWeight: 600,
                          margin: '4px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cand.name}
                      </div>
                      <div className="hig-caption tabular-nums">
                        {isEquipped ? '장착 중' : `CPW ${formatKRW(cand.cpw)}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Monochrome Confirmation Banner */}
        {pendingCandidate && (
          <div
            id="confirm-item-swap-popup"
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <ShieldAlert size={20} />
              <div>
                <div className="hig-body" style={{ fontWeight: 600 }}>
                  다른 아이템으로 변경하시겠습니까?
                </div>
                <span className="hig-caption">
                  {currentEquipped ? `'${currentEquipped.name}'` : '미장착 상태'} → &lsquo;{pendingCandidate.name}&rsquo;
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
                className="btn btn-primary btn-sm"
                onClick={handleConfirmChange}
              >
                <Check size={15} /> 변경 확정하기
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span className="hig-caption">
            <Layers size={14} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            커스텀한 현재 코디를 룩북에 바로 저장할 수 있습니다.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {onSaveOutfit && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onSaveOutfit(Object.values(loadoutBySlot).filter(Boolean))}
              >
                <Sparkles size={15} /> 룩북 저장
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              완료
            </button>
          </div>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
