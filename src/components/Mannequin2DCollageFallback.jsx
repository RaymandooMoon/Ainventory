import { WEAR_SLOTS_11 } from '../shared/garmentTaxonomy.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';

/**
 * Lightweight 2D Editorial Outfit Collage Fallback Viewer (Req 9.c)
 * Used automatically when WebGL context is unavailable/recovering or when user toggles 2D mode.
 */
export default function Mannequin2DCollageFallback({
  loadoutBySlot = {},
  reasonLabel = '2D 콜라주 뷰어 모드',
  onSelectSlot,
  onRestore3D,
}) {
  const equippedEntries = WEAR_SLOTS_11.map((slot) => ({
    key: slot.key,
    label: slot.shortKo || slot.labelKo,
    item: loadoutBySlot[slot.key] || null,
  })).filter((entry) => entry.item);

  return (
    <div
      id="mannequin-2d-collage-fallback"
      className="hig-fade-in"
      style={{
        width: '100%',
        height: '100%',
        padding: '64px 16px 80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'var(--bg-canvas)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="hig-caption">{reasonLabel}</span>
        {onRestore3D && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRestore3D}
          >
            3D 뷰 복귀
          </button>
        )}
      </div>

      <div
        style={{
          width: 'min(460px, 92vw)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {equippedEntries.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: 32,
              borderRadius: 24,
              background: 'var(--bg-surface)',
              textAlign: 'center',
            }}
          >
            <span className="hig-caption">장착된 의류가 없습니다. 하단 옷장 시트를 열어 선택해 주세요.</span>
          </div>
        ) : (
          equippedEntries.map(({ key, label, item }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectSlot?.(key)}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 16,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden' }}>
                <StudioGarmentImage item={item} alt={item.name} style={{ width: '100%', height: '100%' }} />
              </div>
              <span className="hig-caption">{label}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
