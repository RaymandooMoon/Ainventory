import { memo, useId } from 'react';

export interface FittingAtelierBackdropProps {
  effectiveWeather?: string;
  scenarioKey?: string;
  theme?: 'light' | 'dark';
}

/**
 * Pure HTML/CSS/SVG 3D Luxury Architectural Showroom Backdrop (`z-index: 2`).
 * Modeled after the reference atelier space:
 * - Left honed-plaster gallery wall + minimalist curved tubular garment rack with cast shadow
 * - Architectural corner seam (`x ≈ 57%`) with realistic ambient occlusion & skylight gradient
 * - Right raised travertine stepped podium with warm concealed LED linear cove underglow
 * - Right monolithic stone plinth topped with a matte dome floor lamp & glowing warm bulb pool
 * - Perspective floor plane (`y: 76% -> 100%`) catching cove & skylight reflections
 * - Harmonized across all 9 weather scenarios (`live`, `clear`, `mild/warm_spring`, `cloudy`,
 *   `rain`, `snow`, `wind`, `heatwave`, `coldwave`)
 * - Strictly ZERO `<canvas>` elements & `pointer-events: none` (`aria-hidden="true"`).
 */
const FittingAtelierBackdrop = memo(function FittingAtelierBackdrop({
  effectiveWeather = 'clear',
  scenarioKey = 'live',
  theme = 'light',
}: FittingAtelierBackdropProps) {
  const uid = useId().replace(/:/g, '');
  const isDark = theme === 'dark';
  const isRain = effectiveWeather === 'rain';
  const isWarmSpring = scenarioKey === 'warm_spring';
  const isLiveForecast = scenarioKey === 'live';
  const isSunnyGobo =
    effectiveWeather === 'clear' ||
    effectiveWeather === 'heatwave' ||
    effectiveWeather === 'wind';

  const wallLeftGradId = `atelier-wall-left-${uid}`;
  const wallRightGradId = `atelier-wall-right-${uid}`;
  const floorGradId = `atelier-floor-base-${uid}`;
  const podiumTopGradId = `atelier-podium-top-${uid}`;
  const podiumRiserGradId = `atelier-podium-riser-${uid}`;
  const coveGlowGradId = `atelier-cove-glow-${uid}`;
  const coveFloorSpillId = `atelier-cove-spill-${uid}`;
  const plinthGradId = `atelier-plinth-${uid}`;
  const lampWallHaloId = `atelier-lamp-halo-${uid}`;
  const lampDomeGradId = `atelier-lamp-dome-${uid}`;
  const lampBulbGlowId = `atelier-lamp-bulb-${uid}`;

  return (
    <div
      className={[
        'atelier-stage-backdrop',
        isDark ? 'is-dark' : 'is-light',
        `is-weather-${effectiveWeather}`,
        isWarmSpring ? 'is-scenario-warm-spring' : '',
        isLiveForecast ? 'is-scenario-live' : '',
        isSunnyGobo ? 'has-sun-gobos' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-atelier-backdrop="true"
      data-backdrop-weather={effectiveWeather}
      data-backdrop-scenario={scenarioKey}
      aria-hidden="true"
    >
      {/* Weather-adaptive skylight & atmospheric depth wash */}
      <div className="atelier-backdrop-skylight-wash" />

      {/* Architectural Showroom 3D Geometry (Walls, Stepped Cove Podium, Rack, Dome Lamp, Floor) */}
      <svg
        className="atelier-backdrop-props-svg"
        viewBox="0 0 440 580"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* Left plaster gallery wall */}
          <linearGradient id={wallLeftGradId} x1="0" y1="0" x2="262" y2="444" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#3A352F' : '#F4EFE6'} stopOpacity={isDark ? '0.94' : '0.92'} />
            <stop offset="62%" stopColor={isDark ? '#2D2924' : '#EAE2D5'} stopOpacity={isDark ? '0.96' : '0.95'} />
            <stop offset="100%" stopColor={isDark ? '#221F1B' : '#DFD5C5'} stopOpacity={isDark ? '0.98' : '0.98'} />
          </linearGradient>

          {/* Right recessed corner wall */}
          <linearGradient id={wallRightGradId} x1="252" y1="0" x2="440" y2="436" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#27231F' : '#E4DBCD'} stopOpacity={isDark ? '0.96' : '0.95'} />
            <stop offset="55%" stopColor={isDark ? '#322C25' : '#DDD2C1'} stopOpacity={isDark ? '0.97' : '0.96'} />
            <stop offset="100%" stopColor={isDark ? '#1E1B18' : '#CFC3B0'} stopOpacity="0.98" />
          </linearGradient>

          {/* Perspective honed-stone foreground floor plane */}
          <linearGradient id={floorGradId} x1="220" y1="432" x2="220" y2="580" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#2C2824' : '#DDD4C6'} stopOpacity={isDark ? '0.95' : '0.9'} />
            <stop offset="48%" stopColor={isDark ? '#211E1B' : '#D2C7B6'} stopOpacity={isDark ? '0.98' : '0.94'} />
            <stop offset="100%" stopColor={isDark ? '#171513' : '#C5B9A6'} stopOpacity="0.99" />
          </linearGradient>

          {/* Stepped showroom podium top deck */}
          <linearGradient id={podiumTopGradId} x1="168" y1="414" x2="440" y2="448" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#3D3730' : '#EFE9DE'} />
            <stop offset="100%" stopColor={isDark ? '#2E2924' : '#DFD6C7'} />
          </linearGradient>

          {/* Stepped podium vertical riser */}
          <linearGradient id={podiumRiserGradId} x1="168" y1="432" x2="440" y2="466" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#24201B' : '#C9BFA E'.replace(' ', '')} />
            <stop offset="100%" stopColor={isDark ? '#1A1714' : '#B7AC9A'} />
          </linearGradient>

          {/* Warm concealed LED cove strip under stepped podium */}
          <linearGradient id={coveGlowGradId} x1="176" y1="464" x2="440" y2="432" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF6DC" stopOpacity="0" />
            <stop offset="18%" stopColor="#FFE9B3" stopOpacity={isDark ? '0.92' : '0.88'} />
            <stop offset="68%" stopColor="#FFF5D6" stopOpacity={isDark ? '0.98' : '0.95'} />
            <stop offset="100%" stopColor="#FAD089" stopOpacity={isDark ? '0.85' : '0.8'} />
          </linearGradient>

          {/* Warm cove light spill onto the foreground floor */}
          <radialGradient
            id={coveFloorSpillId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(324 462) rotate(-7) scale(168 38)"
          >
            <stop offset="0%" stopColor="#FFE6AA" stopOpacity={isDark ? '0.38' : '0.42'} />
            <stop offset="55%" stopColor="#F6C87A" stopOpacity={isDark ? '0.14' : '0.18'} />
            <stop offset="100%" stopColor="#F6C87A" stopOpacity="0" />
          </radialGradient>

          {/* Right monolithic travertine plinth */}
          <linearGradient id={plinthGradId} x1="306" y1="286" x2="428" y2="424" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#3C3630' : '#C8BFB1'} />
            <stop offset="100%" stopColor={isDark ? '#25211D' : '#ABA090'} />
          </linearGradient>

          {/* Warm radial wall pool behind the mushroom dome lamp */}
          <radialGradient
            id={lampWallHaloId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(366 238) scale(132 126)"
          >
            <stop offset="0%" stopColor="#FFF5D9" stopOpacity={isDark ? '0.52' : '0.56'} />
            <stop offset="42%" stopColor="#FBD38D" stopOpacity={isDark ? '0.22' : '0.24'} />
            <stop offset="100%" stopColor="#FBD38D" stopOpacity="0" />
          </radialGradient>

          {/* Matte espresso/charcoal mushroom dome shade */}
          <linearGradient id={lampDomeGradId} x1="316" y1="168" x2="418" y2="226" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#4A433C' : '#574F47'} />
            <stop offset="55%" stopColor={isDark ? '#2B2723' : '#3B352F'} />
            <stop offset="100%" stopColor={isDark ? '#1B1816' : '#282420'} />
          </linearGradient>

          {/* Glowing warm diffuser hemisphere under dome shade */}
          <radialGradient
            id={lampBulbGlowId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(367 224) scale(36 22)"
          >
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="58%" stopColor="#FFE9B5" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#F5BD68" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        {/* 1. Left & Right Architectural Plaster Walls meeting at x=254 corner */}
        <polygon points="0,0 256,0 256,442 0,458" fill={`url(#${wallLeftGradId})`} />
        <polygon points="256,0 440,0 440,422 256,442" fill={`url(#${wallRightGradId})`} />

        {/* Subtle vertical corner seam & gallery reveal lines */}
        <line
          x1="256"
          y1="0"
          x2="256"
          y2="442"
          stroke={isDark ? '#0E0D0B' : '#B9B0A0'}
          strokeOpacity={isDark ? '0.55' : '0.42'}
          strokeWidth="1.2"
        />
        <line
          x1="34"
          y1="0"
          x2="34"
          y2="455"
          stroke={isDark ? '#FFFFFF' : '#8C8273'}
          strokeOpacity={isDark ? '0.05' : '0.12'}
          strokeWidth="1"
        />

        {/* 2. Warm Radial Wall Pool cast by the Dome Lamp */}
        <ellipse cx="366" cy="238" rx="132" ry="126" fill={`url(#${lampWallHaloId})`} />

        {/* 3. Base Foreground Perspective Showroom Floor */}
        <polygon points="0,458 256,442 440,422 440,580 0,580" fill={`url(#${floorGradId})`} />

        {/* 4. Raised Diagonal Stepped Podium + Concealed Warm LED Cove Underglow */}
        {/* Podium top surface */}
        <polygon
          points="174,448 256,434 440,414 440,434 196,462"
          fill={`url(#${podiumTopGradId})`}
        />
        {/* Podium vertical riser */}
        <polygon
          points="174,448 196,462 440,434 440,447 196,474 174,458"
          fill={`url(#${podiumRiserGradId})`}
        />
        {/* Warm LED cove floor spill */}
        <ellipse cx="322" cy="464" rx="166" ry="36" fill={`url(#${coveFloorSpillId})`} />
        {/* Crisp glowing concealed LED strip along step underside */}
        <line
          x1="192"
          y1="473"
          x2="440"
          y2="446"
          stroke={`url(#${coveGlowGradId})`}
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* 5. Left Minimalist Curved Cream/Ivory Tubular Garment Rack + Soft Wall Shadow */}
        {/* Soft cast shadow of rack on left wall */}
        <path
          d="M44 452 V146 C44 126 60 110 80 110 H126 C146 110 162 126 162 146 V446"
          stroke={isDark ? '#090807' : '#9E9484'}
          strokeOpacity={isDark ? '0.32' : '0.16'}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        {/* Subtle out-of-focus draped neutral showroom coats on rack for spatial depth */}
        <path
          d="M62 126 C55 152 53 212 56 266 L82 264 C83 212 80 152 74 126 Z"
          fill={isDark ? '#4A433B' : '#E5DDD0'}
          fillOpacity={isDark ? '0.44' : '0.62'}
        />
        <path
          d="M86 126 C81 156 80 224 84 282 L112 279 C114 222 110 156 102 126 Z"
          fill={isDark ? '#38332D' : '#D5CBB9'}
          fillOpacity={isDark ? '0.46' : '0.56'}
        />
        {/* Tubular ivory/brushed-champagne arch frame */}
        <path
          d="M34 456 V140 C34 120 50 104 70 104 H118 C138 104 154 120 154 140 V448"
          stroke={isDark ? '#D8CFC2' : '#FAF7F2'}
          strokeOpacity={isDark ? '0.48' : '0.88'}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Splayed minimalist rack feet on floor */}
        <path
          d="M18 463 L34 456 L49 462 M139 454 L154 448 L168 453"
          stroke={isDark ? '#CFC5B6' : '#F5F1EA'}
          strokeOpacity={isDark ? '0.44' : '0.84'}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Minimalist hanger hooks */}
        <path
          d="M68 104 V120 M94 104 V120 M118 104 V118"
          stroke={isDark ? '#C8BFA F'.replace(' ', '') : '#BFB5A5'}
          strokeOpacity={isDark ? '0.42' : '0.65'}
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* 6. Right Monolithic Stone Plinth + Warm Glowing Mushroom Dome Lamp */}
        {/* Plinth side depth face */}
        <polygon
          points="296,294 312,286 312,424 296,432"
          fill={isDark ? '#1D1A17' : '#9C9181'}
          fillOpacity={isDark ? '0.88' : '0.72'}
        />
        {/* Plinth front stone face */}
        <rect
          x="312"
          y="286"
          width="114"
          height="138"
          rx="2"
          fill={`url(#${plinthGradId})`}
        />
        {/* Warm light bounce on top edge of plinth */}
        <line
          x1="312"
          y1="286.5"
          x2="426"
          y2="286.5"
          stroke="#FFE8B5"
          strokeOpacity={isDark ? '0.52' : '0.68'}
          strokeWidth="1.4"
        />

        {/* Glowing warm diffuser bulb under dome */}
        <ellipse cx="367" cy="222" rx="34" ry="20" fill={`url(#${lampBulbGlowId})`} />
        {/* Brushed brass/bronze lamp stem */}
        <rect
          x="362"
          y="220"
          width="10"
          height="66"
          rx="3"
          fill={isDark ? '#786852' : '#6E5F4B'}
        />
        {/* Lamp base disc */}
        <ellipse
          cx="367"
          cy="286"
          rx="22"
          ry="3.5"
          fill={isDark ? '#4B4237' : '#574D41'}
        />
        {/* Iconic matte charcoal mushroom dome shade */}
        <path
          d="M314 221 C314 184 338 166 367 166 C396 166 420 184 420 221 Z"
          fill={`url(#${lampDomeGradId})`}
        />
        {/* Warm rim highlight along underside lip of dome shade */}
        <path
          d="M316 220.5 Q367 225 418 220.5"
          stroke="#FFF2CC"
          strokeOpacity="0.82"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Ultra-soft diagonal window-blind sunlight gobos for sunny/breezy modes */}
      <div className="atelier-backdrop-sunlight-gobos" />

      {/* Atmospheric perspective horizon mist blending wall-to-floor depth */}
      <div className="atelier-backdrop-atmospheric-haze" />

      {/* Rain moody slate ambiance (strictly activated ONLY when effectiveWeather === 'rain') */}
      {isRain && <div className="atelier-backdrop-rain-tint" />}
    </div>
  );
});

export default FittingAtelierBackdrop;
