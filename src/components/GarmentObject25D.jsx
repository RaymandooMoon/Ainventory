import { memo, useCallback, useRef, useState } from 'react';
import StudioGarmentImage from './StudioGarmentImage.jsx';

/**
 * 2.5D Sculptural Garment Object Viewer
 * - Renders background-removed garment cutouts with multi-layered soft drop shadows,
 *   top-left studio key illumination, and grounded elliptical floor contact shadow.
 * - When `interactive` is true (Item Detail & Add Preview), responds smoothly to
 *   mouse hover and touch drag tilt (`rotateX` / `rotateY` + dynamic shadow shift).
 */
const GarmentObject25D = memo(function GarmentObject25D({
  item,
  src,
  category,
  subcategory,
  colorHex,
  alt,
  interactive = false,
  maxTiltDeg = 12,
  padding = '13%',
  className = '',
  stageId,
  style = {},
}) {
  const stageRef = useRef(null);
  const [tilt, setTilt] = useState({ nx: 0, ny: 0, active: false });

  const updateTiltFromClientXY = useCallback(
    (clientX, clientY) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const rawX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const rawY = ((clientY - rect.top) / rect.height) * 2 - 1;
      const nx = Math.max(-1, Math.min(1, rawX));
      const ny = Math.max(-1, Math.min(1, rawY));
      setTilt({ nx: Number(nx.toFixed(3)), ny: Number(ny.toFixed(3)), active: true });
    },
    []
  );

  const resetTilt = useCallback(() => {
    setTilt({ nx: 0, ny: 0, active: false });
  }, []);

  const handlePointerMove = useCallback(
    (e) => {
      if (!interactive) return;
      updateTiltFromClientXY(e.clientX, e.clientY);
    },
    [interactive, updateTiltFromClientXY]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!interactive || !e.touches?.[0]) return;
      updateTiltFromClientXY(e.touches[0].clientX, e.touches[0].clientY);
    },
    [interactive, updateTiltFromClientXY]
  );

  const rotX = Number((-tilt.ny * maxTiltDeg).toFixed(2));
  const rotY = Number((tilt.nx * maxTiltDeg).toFixed(2));
  const shadowShiftX = Math.round(-tilt.nx * 14);
  const shadowShiftY = Math.round(14 - tilt.ny * 8);

  const dynamicDropShadow = interactive
    ? `drop-shadow(${shadowShiftX}px ${shadowShiftY}px 22px var(--garment-shadow-ambient)) drop-shadow(${Math.round(shadowShiftX * 0.35)}px 5px 8px var(--garment-shadow-key))`
    : undefined;

  return (
    <div
      id={stageId}
      ref={stageRef}
      className={`garment-object-25d ${interactive ? 'is-interactive' : ''} ${className}`.trim()}
      data-tilt-x={rotY}
      data-tilt-y={rotX}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerLeave={interactive ? resetTilt : undefined}
      onTouchStart={
        interactive
          ? (e) => {
              if (e.touches?.[0]) {
                updateTiltFromClientXY(e.touches[0].clientX, e.touches[0].clientY);
              }
            }
          : undefined
      }
      onTouchMove={interactive ? handleTouchMove : undefined}
      onTouchEnd={interactive ? resetTilt : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: interactive ? '960px' : undefined,
        touchAction: interactive ? 'none' : 'manipulation',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Subtle 2.5D Studio Key-Light Halo */}
      <div
        aria-hidden="true"
        className="garment-25d-studio-glow"
        style={{
          transform: interactive
            ? `translate3d(${Math.round(tilt.nx * 12)}px, ${Math.round(tilt.ny * 12)}px, 0)`
            : undefined,
        }}
      />

      {/* Grounded Elliptical Contact Shadow */}
      <div
        aria-hidden="true"
        className="garment-25d-floor-shadow"
        style={{
          transform: interactive
            ? `translate3d(calc(-50% + ${Math.round(-tilt.nx * 10)}px), 0, 0) scale(${tilt.active ? 1.04 : 1})`
            : 'translate3d(-50%, 0, 0)',
        }}
      />

      {/* 2.5D Volumetric Garment Plane */}
      <div
        className="garment-25d-plane"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          padding,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transformStyle: 'preserve-3d',
          transform: interactive
            ? `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${tilt.active ? 1.03 : 1})`
            : undefined,
          transition: tilt.active
            ? 'transform 80ms linear'
            : 'transform 460ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <StudioGarmentImage
          item={item}
          src={src}
          category={category}
          subcategory={subcategory}
          colorHex={colorHex}
          alt={alt}
          allowStorePhoto={Boolean(src && (src.startsWith('data:') || src.startsWith('/uploads/')))}
          className="garment-25d-cutout"
          style={{
            width: '100%',
            height: '100%',
          }}
          imgStyle={{
            filter: dynamicDropShadow,
          }}
        />
      </div>
    </div>
  );
});

export default GarmentObject25D;
