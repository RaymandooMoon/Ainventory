import { memo, useId, useMemo } from 'react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { computeSkinShadingPalette } from '../services/skinToneAnalyzer.ts';

/**
 * Tone-Adaptive Volumetric 2.5D Studio Character Mannequin
 * - Renders sculptural 2.5D human lookbook proportions with multi-stop studio keylight,
 *   subsurface cheek/dermal warmth, cylindrical limb shading, and personal-color backdrop aura.
 * - Dynamically re-shades head, neck, collarbone, forearms, hands, and legs in real time
 *   based on the user's analyzed `skinToneHex`, `personalColor`, and `gender` silhouette.
 */
const Character25DMannequin = memo(function Character25DMannequin({
  skinToneHex = '#DFBA9B',
  personalColor = 'autumn_warm',
  gender = 'male',
  theme = 'light',
  hasTopOrOuter = false,
  hasBottom = false,
  pointer = { x: 0, y: 0 },
  compact = false,
}) {
  const uid = useId().replace(/:/g, '');
  const palette = useMemo(
    () => computeSkinShadingPalette(skinToneHex, personalColor, theme),
    [skinToneHex, personalColor, theme]
  );

  const isFemale = gender === 'female';
  const px = Number(pointer?.x || 0);
  const py = Number(pointer?.y || 0);

  const headGradId = `skin-head-${uid}`;
  const limbLeftGradId = `skin-limb-l-${uid}`;
  const limbRightGradId = `skin-limb-r-${uid}`;
  const torsoSkinGradId = `skin-torso-${uid}`;
  const hairGradId = `hair-grad-${uid}`;
  const basewearGradId = `basewear-${uid}`;
  const softShadowFilterId = `char-shadow-${uid}`;

  return (
    <div
      id={compact ? undefined : CARBON_DOM_CONTRACT.character25dMannequinId}
      className={`character-25d-mannequin ${compact ? 'is-compact' : ''}`}
      data-skin-hex={palette.base}
      data-personal-color={personalColor}
      data-character-gender={isFemale ? 'female' : 'male'}
      style={{
        transform: compact
          ? undefined
          : `translate3d(calc(-50% + ${Math.round(px * 5)}px), ${Math.round(py * 3)}px, 0)`,
      }}
    >
      {/* Personal Color Studio Drape Halo */}
      <div
        aria-hidden="true"
        className="character-25d-aura"
        style={{
          background: `radial-gradient(circle at 50% 26%, ${palette.auraColor} 0%, rgba(0,0,0,0) 68%)`,
        }}
      />

      <svg
        viewBox="0 0 360 540"
        className="character-25d-svg"
        role="img"
        aria-label={`2.5D 피팅 캐릭터 (${palette.base})`}
      >
        <defs>
          {/* Off-center Studio Keylight Radial Skin Gradient (Head & Neck) */}
          <radialGradient id={headGradId} cx="36%" cy="28%" r="72%" fx="32%" fy="24%">
            <stop offset="0%" stopColor={palette.highlight} />
            <stop offset="44%" stopColor={palette.base} />
            <stop offset="78%" stopColor={palette.midShadow} />
            <stop offset="100%" stopColor={palette.deepShadow} />
          </radialGradient>

          {/* Cylindrical 2.5D Limb Gradients */}
          <linearGradient id={limbLeftGradId} x1="0%" y1="0%" x2="100%" y2="12%">
            <stop offset="0%" stopColor={palette.rimLight} />
            <stop offset="22%" stopColor={palette.highlight} />
            <stop offset="62%" stopColor={palette.base} />
            <stop offset="100%" stopColor={palette.deepShadow} />
          </linearGradient>

          <linearGradient id={limbRightGradId} x1="0%" y1="12%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={palette.highlight} />
            <stop offset="48%" stopColor={palette.base} />
            <stop offset="86%" stopColor={palette.midShadow} />
            <stop offset="100%" stopColor={palette.deepShadow} />
          </linearGradient>

          <linearGradient id={torsoSkinGradId} x1="18%" y1="0%" x2="88%" y2="100%">
            <stop offset="0%" stopColor={palette.highlight} />
            <stop offset="52%" stopColor={palette.base} />
            <stop offset="100%" stopColor={palette.midShadow} />
          </linearGradient>

          <linearGradient id={hairGradId} x1="25%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor={palette.hairHighlight} />
            <stop offset="55%" stopColor={palette.hairMain} />
            <stop offset="100%" stopColor="#141418" />
          </linearGradient>

          <linearGradient id={basewearGradId} x1="20%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor={palette.basewearFill} />
            <stop offset="100%" stopColor={palette.basewearShadow} />
          </linearGradient>

          <filter id={softShadowFilterId} x="-20%" y="-15%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="8"
              stdDeviation="8"
              floodColor="#0F172A"
              floodOpacity={theme === 'dark' ? '0.48' : '0.16'}
            />
          </filter>
        </defs>

        <g filter={`url(#${softShadowFilterId})`}>
          {/* Back Hair Silhouette (Female soft shoulder bob / Male tapered nape) */}
          {isFemale ? (
            <path
              d="M142 54 C132 76, 131 112, 138 128 C154 134, 206 134, 222 128 C229 112, 228 76, 218 54 Z"
              fill={`url(#${hairGradId})`}
            />
          ) : null}

          {/* Left & Right Sculpted Arms + Hands (Positioned at x~92 & x~268 so skin tone stays clearly visible beside garments) */}
          {isFemale ? (
            <>
              {/* Left Arm */}
              <path
                d="M126 144 C110 150, 98 184, 91 226 C86 254, 84 278, 86 292 C90 302, 99 302, 103 291 C106 276, 112 246, 120 214 C126 190, 133 168, 138 156 Z"
                fill={`url(#${limbLeftGradId})`}
              />
              {/* Left Hand */}
              <ellipse cx="93" cy="298" rx="8.5" ry="13" transform="rotate(8 93 298)" fill={`url(#${limbLeftGradId})`} />
              {/* Right Arm */}
              <path
                d="M234 144 C250 150, 262 184, 269 226 C274 254, 276 278, 274 292 C270 302, 261 302, 257 291 C254 276, 248 246, 240 214 C234 190, 227 168, 222 156 Z"
                fill={`url(#${limbRightGradId})`}
              />
              {/* Right Hand */}
              <ellipse cx="267" cy="298" rx="8.5" ry="13" transform="rotate(-8 267 298)" fill={`url(#${limbRightGradId})`} />
            </>
          ) : (
            <>
              {/* Male Left Arm */}
              <path
                d="M118 142 C101 150, 90 186, 84 228 C80 258, 79 282, 82 296 C87 306, 97 305, 101 294 C105 278, 111 246, 118 214 C124 190, 130 168, 135 156 Z"
                fill={`url(#${limbLeftGradId})`}
              />
              <ellipse cx="90" cy="302" rx="9.5" ry="14" transform="rotate(7 90 302)" fill={`url(#${limbLeftGradId})`} />
              {/* Male Right Arm */}
              <path
                d="M242 142 C259 150, 270 186, 276 228 C280 258, 281 282, 278 296 C273 306, 263 305, 259 294 C255 278, 249 246, 242 214 C236 190, 230 168, 225 156 Z"
                fill={`url(#${limbRightGradId})`}
              />
              <ellipse cx="270" cy="302" rx="9.5" ry="14" transform="rotate(-7 270 302)" fill={`url(#${limbRightGradId})`} />
            </>
          )}

          {/* Sculpted Legs & Ankles (Lower calves/ankles stay visible between trouser hem & shoes) */}
          <path
            d="M144 294 C142 344, 145 398, 149 452 C150 465, 163 465, 165 452 C169 400, 173 346, 175 294 Z"
            fill={`url(#${limbLeftGradId})`}
          />
          <path
            d="M185 294 C187 346, 191 400, 195 452 C197 465, 210 465, 211 452 C215 398, 218 344, 216 294 Z"
            fill={`url(#${limbRightGradId})`}
          />
          {/* Subtle Knee Subsurface Warmth */}
          <ellipse cx="158" cy="374" rx="8" ry="11" fill={palette.subsurface} opacity="0.28" />
          <ellipse cx="202" cy="374" rx="8" ry="11" fill={palette.subsurface} opacity="0.28" />
          {/* Feet Base */}
          <ellipse cx="156" cy="466" rx="14" ry="8" fill={palette.midShadow} />
          <ellipse cx="204" cy="466" rx="14" ry="8" fill={palette.midShadow} />

          {/* Neck, Collarbone & Shoulders Skin Plane */}
          <path
            d={
              isFemale
                ? 'M165 104 L195 104 L198 134 C214 138, 230 142, 236 150 L226 184 L134 184 L124 150 C130 142, 146 138, 162 134 Z'
                : 'M162 104 L198 104 L202 134 C220 138, 238 142, 245 150 L234 188 L126 188 L115 150 C122 142, 140 138, 158 134 Z'
            }
            fill={`url(#${torsoSkinGradId})`}
          />

          {/* Chin Cast Shadow on Upper Neck */}
          <ellipse cx="180" cy="112" rx="16" ry="7" fill={palette.deepShadow} opacity="0.48" />

          {/* Clavicle Specular Highlight */}
          <path
            d="M152 138 Q168 143 176 140 M208 138 Q192 143 184 140"
            stroke={palette.highlight}
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
            opacity="0.65"
          />

          {/* Torso & Seamless Studio Basewear (visible when top or bottom is unequipped) */}
          {!hasTopOrOuter && (
            <path
              d={
                isFemale
                  ? 'M135 152 C148 158, 164 161, 180 161 C196 161, 212 158, 225 152 L219 248 C206 254, 154 254, 141 248 Z'
                  : 'M127 150 C144 157, 162 160, 180 160 C198 160, 216 157, 233 150 L224 252 C208 258, 152 258, 136 252 Z'
              }
              fill={`url(#${basewearGradId})`}
            />
          )}

          {!hasBottom && (
            <path
              d="M138 246 L222 246 L220 314 L184 314 L180 292 L176 314 L140 314 Z"
              fill={`url(#${basewearGradId})`}
            />
          )}

          {/* Sculpted 2.5D Head & Ears */}
          <ellipse cx="147" cy="76" rx="5.5" ry="9.5" fill={palette.midShadow} />
          <ellipse cx="213" cy="76" rx="5.5" ry="9.5" fill={palette.deepShadow} />

          <path
            d="M180 34 C159 34, 147 50, 148 74 C149 96, 162 112, 180 112 C198 112, 211 96, 212 74 C213 50, 201 34, 180 34 Z"
            fill={`url(#${headGradId})`}
          />

          {/* Lifelike Subsurface Cheek Blush */}
          <ellipse cx="163" cy="82" rx="9.5" ry="6.5" fill={palette.subsurface} opacity="0.38" />
          <ellipse cx="197" cy="82" rx="9.5" ry="6.5" fill={palette.subsurface} opacity="0.34" />

          {/* Nose Bridge Specular Plane & Subtle Facial Sculpture */}
          <path
            d="M179 66 L178 83 Q180 86 183 84"
            stroke={palette.highlight}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            opacity="0.72"
          />
          {/* Serene Atelier Brows */}
          <path
            d="M160 65 Q167 62 173 64 M187 64 Q193 62 200 65"
            stroke={palette.browHair}
            strokeWidth="2.1"
            strokeLinecap="round"
            fill="none"
            opacity="0.62"
          />
          {/* Minimalist Closed-Lookbook Eyelash Shadow */}
          <path
            d="M162 72 Q167 74 172 72 M188 72 Q193 74 198 72"
            stroke={palette.browHair}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            opacity="0.48"
          />
          {/* Natural Tonal Lip Plane */}
          <path
            d="M173 95 Q180 98 187 95"
            stroke={palette.lipTint}
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
            opacity="0.72"
          />

          {/* Crown Hair Silhouette */}
          {isFemale ? (
            <path
              d="M146 72 C145 44, 160 28, 180 28 C201 28, 215 44, 214 72 C210 56, 198 47, 182 46 C165 46, 152 55, 146 72 Z"
              fill={`url(#${hairGradId})`}
            />
          ) : (
            <path
              d="M147 68 C146 42, 160 29, 180 29 C200 29, 214 42, 213 68 C208 54, 197 46, 180 46 C163 46, 152 54, 147 68 Z"
              fill={`url(#${hairGradId})`}
            />
          )}
        </g>
      </svg>
    </div>
  );
});

export default Character25DMannequin;
