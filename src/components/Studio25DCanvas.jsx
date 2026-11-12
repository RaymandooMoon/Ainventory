import { memo, useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import StudioGarmentImage from './StudioGarmentImage.jsx';

/**
 * 2.5D Studio Fitting Canvas (Middle '2.5D' Reference Aesthetic)
 * - Soft radial studio lighting + subtle volumetric silhouette + grounded floor contact shadow.
 * - Composes equipped slot layers with subtle 2.5D parallax & multi-layered soft drop shadows,
 *   or displays synthesized AI Virtual Try-On (`compositeImageUrl`) when provided by `FittingRenderer`.
 */
const Studio25DCanvas = memo(function Studio25DCanvas({
  renderResult,
  activeSlotKey,
  onSelectSlot,
  onUnequipSlot,
}) {
  const stageRef = useRef(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const handlePointerMove = useCallback((e) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
    setPointer({ x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) });
  }, []);

  const resetPointer = useCallback(() => {
    setPointer({ x: 0, y: 0 });
  }, []);

  const layers = renderResult?.layers || [];
  const lighting = renderResult?.lighting;
  const compositeUrl = renderResult?.compositeImageUrl || null;

  return (
    <div
      id={CARBON_DOM_CONTRACT.studio25dCanvasId}
      ref={stageRef}
      className="studio-25d-canvas"
      data-fitting-mode={renderResult?.mode || '2.5d-studio'}
      data-equipped-count={layers.length}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      style={{
        background: lighting?.backdropGradient,
      }}
    >
      {/* Studio Top-Left Key Illumination */}
      <div
        aria-hidden="true"
        className="studio-25d-keylight"
        style={{
          background: lighting?.keyLightGlow,
          transform: `translate3d(${Math.round(pointer.x * 10)}px, ${Math.round(pointer.y * 10)}px, 0)`,
        }}
      />

      {/* Soft Sculptural 2.5D Studio Form Silhouette (Subtle Ambient Presence, Zero 3D Plastic Mesh) */}
      <div
        aria-hidden="true"
        className="studio-25d-silhouette"
        style={{
          opacity: compositeUrl ? 0 : layers.length > 0 ? 0.42 : 0.72,
          transform: `translate3d(calc(-50% + ${Math.round(pointer.x * 4)}px), ${Math.round(pointer.y * 3)}px, 0)`,
        }}
      >
        <div className="studio-25d-silhouette-head" />
        <div className="studio-25d-silhouette-torso" />
        <div className="studio-25d-silhouette-legs" />
      </div>

      {/* Grounded Floor Contact Shadow */}
      <div
        aria-hidden="true"
        className="studio-25d-floor-shadow"
        style={{
          background: lighting?.floorShadowColor
            ? `radial-gradient(ellipse at center, ${lighting.floorShadowColor} 0%, rgba(0,0,0,0) 72%)`
            : undefined,
          transform: `translate3d(calc(-50% + ${Math.round(-pointer.x * 8)}px), 0, 0)`,
        }}
      />

      {/* AI Virtual Try-On Composite Output (when VtonApiFittingRenderer is active) */}
      {compositeUrl ? (
        <img
          src={compositeUrl}
          alt="2.5D Virtual Try-On Look"
          className="studio-25d-vton-composite"
        />
      ) : (
        /* Layered 2.5D Garment Objects */
        <div className="studio-25d-layers-stage">
          {layers.map((layer) => {
            const shiftX = Math.round(pointer.x * 9 * layer.parallaxDepth);
            const shiftY = Math.round(pointer.y * 7 * layer.parallaxDepth);
            const isSelectedSlot = activeSlotKey === layer.slotKey;

            return (
              <div
                key={`${layer.slotKey}-${layer.garment.id}`}
                data-studio-slot={layer.slotKey}
                className={`studio-25d-layer-item ${isSelectedSlot ? 'is-focused' : ''}`}
                onClick={() => onSelectSlot?.(layer.slotKey)}
                style={{
                  left: `${layer.xPct}%`,
                  top: `${layer.yPct}%`,
                  width: `${layer.widthPct}%`,
                  zIndex: layer.zIndex,
                  transform: `translate3d(calc(-50% + ${shiftX}px), calc(-50% + ${shiftY}px), 0) rotate(${layer.rotationDeg}deg)`,
                }}
              >
                <StudioGarmentImage
                  item={layer.garment}
                  allowStorePhoto={Boolean(
                    layer.garment.image_url &&
                      (layer.garment.image_url.startsWith('data:') ||
                        layer.garment.image_url.startsWith('/uploads/'))
                  )}
                  style={{ width: '100%', aspectRatio: '1 / 1' }}
                  imgStyle={{
                    filter: `drop-shadow(0 ${layer.shadowOffsetY}px ${layer.shadowBlurPx}px var(--garment-shadow-ambient)) drop-shadow(0 4px 8px var(--garment-shadow-key))`,
                  }}
                />
                <button
                  type="button"
                  className="studio-25d-layer-remove"
                  aria-label={`${layer.garment.name} 착장 해제`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnequipSlot?.(layer.slotKey);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default Studio25DCanvas;
