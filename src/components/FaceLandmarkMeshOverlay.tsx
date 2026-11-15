import { memo, useId, useMemo } from 'react';

export interface FaceBoxNormalized {
  x: number;
  y: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
}

export interface FaceLandmarkMeshOverlayProps {
  faceBox?: FaceBoxNormalized | null;
  hasPhoto?: boolean;
  className?: string;
}

interface LandmarkVertexDef {
  id: string;
  nx: number;
  ny: number;
  tone: 'gold' | 'white';
  emphasis?: boolean;
}

const CANONICAL_VERTICES: readonly LandmarkVertexDef[] = [
  // Forehead crown & glabella
  { id: 'fh_l', nx: 0.26, ny: 0.08, tone: 'gold', emphasis: true },
  { id: 'fh_c', nx: 0.5, ny: 0.05, tone: 'white' },
  { id: 'fh_r', nx: 0.74, ny: 0.08, tone: 'gold', emphasis: true },

  // Brow arch & glabella
  { id: 'brow_lo', nx: 0.13, ny: 0.25, tone: 'gold', emphasis: true },
  { id: 'brow_la', nx: 0.3, ny: 0.21, tone: 'white' },
  { id: 'glabella', nx: 0.5, ny: 0.25, tone: 'gold' },
  { id: 'brow_ra', nx: 0.7, ny: 0.21, tone: 'white' },
  { id: 'brow_ro', nx: 0.87, ny: 0.25, tone: 'gold', emphasis: true },

  // Orbital rim (outer/inner canthi & infraorbital)
  { id: 'eye_lo', nx: 0.19, ny: 0.34, tone: 'white' },
  { id: 'eye_li', nx: 0.37, ny: 0.35, tone: 'white' },
  { id: 'orb_l', nx: 0.27, ny: 0.41, tone: 'white' },
  { id: 'eye_ri', nx: 0.63, ny: 0.35, tone: 'white' },
  { id: 'eye_ro', nx: 0.81, ny: 0.34, tone: 'white' },
  { id: 'orb_r', nx: 0.73, ny: 0.41, tone: 'white' },

  // Nasal bridge, tip & alar base
  { id: 'nasal_mid', nx: 0.5, ny: 0.43, tone: 'white' },
  { id: 'nasal_tip', nx: 0.5, ny: 0.57, tone: 'gold', emphasis: true },
  { id: 'alar_l', nx: 0.4, ny: 0.59, tone: 'white' },
  { id: 'alar_r', nx: 0.6, ny: 0.59, tone: 'white' },

  // Zygomatic arches & nasolabial contours
  { id: 'zygo_l', nx: 0.11, ny: 0.49, tone: 'gold', emphasis: true },
  { id: 'cheek_l', nx: 0.27, ny: 0.55, tone: 'white' },
  { id: 'cheek_r', nx: 0.73, ny: 0.55, tone: 'white' },
  { id: 'zygo_r', nx: 0.89, ny: 0.49, tone: 'gold', emphasis: true },

  // Lips (commissures, cupid's bow & lower vermilion)
  { id: 'mouth_l', nx: 0.33, ny: 0.72, tone: 'gold', emphasis: true },
  { id: 'lip_top', nx: 0.5, ny: 0.69, tone: 'white' },
  { id: 'mouth_r', nx: 0.67, ny: 0.72, tone: 'gold', emphasis: true },
  { id: 'lip_bot', nx: 0.5, ny: 0.78, tone: 'white' },

  // Gonion jaw angles & mentalis chin
  { id: 'jaw_l', nx: 0.2, ny: 0.82, tone: 'gold', emphasis: true },
  { id: 'jaw_r', nx: 0.8, ny: 0.82, tone: 'gold', emphasis: true },
  { id: 'chin', nx: 0.5, ny: 0.95, tone: 'gold', emphasis: true },
] as const;

const SYMMETRIC_TRIANGULATION_EDGES: ReadonlyArray<readonly [string, string, 'gold' | 'white']> = [
  // Outer perimeter contour
  ['fh_l', 'fh_c', 'gold'],
  ['fh_c', 'fh_r', 'gold'],
  ['fh_l', 'brow_lo', 'gold'],
  ['fh_r', 'brow_ro', 'gold'],
  ['brow_lo', 'zygo_l', 'gold'],
  ['brow_ro', 'zygo_r', 'gold'],
  ['zygo_l', 'jaw_l', 'gold'],
  ['zygo_r', 'jaw_r', 'gold'],
  ['jaw_l', 'chin', 'gold'],
  ['jaw_r', 'chin', 'gold'],

  // Forehead & brow triangulation
  ['fh_l', 'brow_la', 'white'],
  ['fh_c', 'brow_la', 'white'],
  ['fh_c', 'glabella', 'gold'],
  ['fh_c', 'brow_ra', 'white'],
  ['fh_r', 'brow_ra', 'white'],
  ['brow_lo', 'brow_la', 'gold'],
  ['brow_la', 'glabella', 'gold'],
  ['glabella', 'brow_ra', 'gold'],
  ['brow_ra', 'brow_ro', 'gold'],

  // Orbital rims & nasal bridge
  ['brow_lo', 'eye_lo', 'white'],
  ['brow_la', 'eye_lo', 'white'],
  ['brow_la', 'eye_li', 'white'],
  ['glabella', 'eye_li', 'white'],
  ['glabella', 'nasal_mid', 'gold'],
  ['glabella', 'eye_ri', 'white'],
  ['brow_ra', 'eye_ri', 'white'],
  ['brow_ra', 'eye_ro', 'white'],
  ['brow_ro', 'eye_ro', 'white'],
  ['eye_lo', 'orb_l', 'white'],
  ['orb_l', 'eye_li', 'white'],
  ['eye_lo', 'eye_li', 'white'],
  ['eye_ri', 'orb_r', 'white'],
  ['orb_r', 'eye_ro', 'white'],
  ['eye_ri', 'eye_ro', 'white'],

  // Midface cheekbones, nasal pyramid & nasolabial folds
  ['eye_lo', 'zygo_l', 'white'],
  ['eye_ro', 'zygo_r', 'white'],
  ['zygo_l', 'orb_l', 'white'],
  ['zygo_r', 'orb_r', 'white'],
  ['zygo_l', 'cheek_l', 'gold'],
  ['zygo_r', 'cheek_r', 'gold'],
  ['orb_l', 'cheek_l', 'white'],
  ['orb_r', 'cheek_r', 'white'],
  ['eye_li', 'nasal_mid', 'white'],
  ['eye_ri', 'nasal_mid', 'white'],
  ['eye_li', 'alar_l', 'white'],
  ['eye_ri', 'alar_r', 'white'],
  ['nasal_mid', 'nasal_tip', 'gold'],
  ['nasal_mid', 'alar_l', 'white'],
  ['nasal_mid', 'alar_r', 'white'],
  ['alar_l', 'nasal_tip', 'gold'],
  ['alar_r', 'nasal_tip', 'gold'],
  ['cheek_l', 'alar_l', 'white'],
  ['cheek_r', 'alar_r', 'white'],

  // Nasolabial, oral contour & jawline chin
  ['cheek_l', 'mouth_l', 'gold'],
  ['cheek_r', 'mouth_r', 'gold'],
  ['zygo_l', 'mouth_l', 'white'],
  ['zygo_r', 'mouth_r', 'white'],
  ['alar_l', 'mouth_l', 'white'],
  ['alar_r', 'mouth_r', 'white'],
  ['alar_l', 'lip_top', 'white'],
  ['alar_r', 'lip_top', 'white'],
  ['nasal_tip', 'lip_top', 'gold'],
  ['mouth_l', 'lip_top', 'gold'],
  ['lip_top', 'mouth_r', 'gold'],
  ['mouth_l', 'lip_bot', 'gold'],
  ['lip_bot', 'mouth_r', 'gold'],
  ['jaw_l', 'mouth_l', 'gold'],
  ['jaw_r', 'mouth_r', 'gold'],
  ['mouth_l', 'chin', 'white'],
  ['lip_bot', 'chin', 'gold'],
  ['mouth_r', 'chin', 'white'],
];

function clampNum(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Pure SVG Computational Geometry Facial Landmark Mesh Overlay.
 * Strictly zero `<canvas>` elements (`pointer-events: none`, `aria-hidden="true"`).
 */
const FaceLandmarkMeshOverlay = memo(function FaceLandmarkMeshOverlay({
  faceBox = null,
  hasPhoto = false,
  className = '',
}: FaceLandmarkMeshOverlayProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const glowFilterId = `atelier-landmark-glow-${uid}`;

  const mappedGeometry = useMemo(() => {
    const rawW = faceBox ? (faceBox.w ?? faceBox.width ?? 0.52) : 0.52;
    const rawH = faceBox ? (faceBox.h ?? faceBox.height ?? 0.66) : 0.66;
    const safeW = clampNum(rawW, 0.36, 0.72);
    const safeH = clampNum(rawH, 0.44, 0.76);

    const defaultX = (1 - safeW) * 0.5;
    const defaultY = (1 - safeH) * 0.48;
    const rawX = faceBox ? faceBox.x : defaultX;
    const rawY = faceBox ? faceBox.y : defaultY;

    const boxX = clampNum(rawX, 0.08, 0.92 - safeW) * 100;
    const boxY = clampNum(rawY, 0.07, 0.93 - safeH) * 100;
    const boxW = safeW * 100;
    const boxH = safeH * 100;

    const pointMap = new Map<
      string,
      { x: number; y: number; tone: 'gold' | 'white'; emphasis: boolean }
    >();

    for (const v of CANONICAL_VERTICES) {
      pointMap.set(v.id, {
        x: Number((boxX + v.nx * boxW).toFixed(2)),
        y: Number((boxY + v.ny * boxH).toFixed(2)),
        tone: v.tone,
        emphasis: Boolean(v.emphasis),
      });
    }

    const lines: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      tone: 'gold' | 'white';
    }> = [];

    for (const [aId, bId, edgeTone] of SYMMETRIC_TRIANGULATION_EDGES) {
      const a = pointMap.get(aId);
      const b = pointMap.get(bId);
      if (!a || !b) continue;
      lines.push({
        key: `${aId}-${bId}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        tone: edgeTone,
      });
    }

    return {
      vertices: Array.from(pointMap.entries()).map(([id, pt]) => ({ id, ...pt })),
      lines,
    };
  }, [faceBox]);

  return (
    <svg
      className={`atelier-face-landmark-svg ${hasPhoto ? 'is-photo-active' : 'is-silhouette-idle'} ${className}`.trim()}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-face-landmark-mesh="true"
      style={{ pointerEvents: 'none' }}
    >
      <defs>
        <filter id={glowFilterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.15" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="atelier-face-landmark-edges">
        {mappedGeometry.lines.map((edge) => (
          <line
            key={edge.key}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={
              edge.tone === 'gold'
                ? 'var(--atelier-mesh-gold-soft, rgba(232, 208, 169, 0.34))'
                : 'rgba(255, 255, 255, 0.28)'
            }
            strokeWidth={edge.tone === 'gold' ? '0.75' : '0.65'}
            strokeLinecap="round"
          />
        ))}
      </g>

      <g className="atelier-face-landmark-nodes" filter={`url(#${glowFilterId})`}>
        {mappedGeometry.vertices.map((node) =>
          node.tone === 'gold' ? (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.emphasis ? 1.85 : 1.4}
                fill="var(--atelier-mesh-gold, rgba(232, 208, 169, 0.86))"
                opacity={node.emphasis ? 0.34 : 0.24}
              />
              <circle
                cx={node.x}
                cy={node.y}
                r={node.emphasis ? 1.05 : 0.86}
                fill="var(--atelier-mesh-gold, rgba(232, 208, 169, 0.86))"
              />
              {node.emphasis && (
                <circle cx={node.x} cy={node.y} r={0.46} fill="rgba(255, 255, 255, 0.92)" />
              )}
            </g>
          ) : (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={0.82}
              fill="var(--atelier-mesh-white, rgba(255, 255, 255, 0.74))"
            />
          )
        )}
      </g>
    </svg>
  );
});

export default FaceLandmarkMeshOverlay;
