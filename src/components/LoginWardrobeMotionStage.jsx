import { memo, useEffect, useRef } from 'react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';

/**
 * Curated transparent RGBA studio garment cutouts (`/seed/*.webp`)
 * spanning all 5 Apple HIG wardrobe categories.
 */
const WARDROBE_STREAM_ITEMS = [
  {
    id: 'beige-trench',
    code: '01',
    category: 'Outerwear',
    categoryKo: '아우터',
    nameKo: '개버딘 트렌치',
    colorHex: '#CBB698',
    src: '/seed/beige-trench.webp',
    hangerType: 'coat',
  },
  {
    id: 'navy-knit',
    code: '02',
    category: 'Tops',
    categoryKo: '상의',
    nameKo: '메리노 크루넥',
    colorHex: '#232B3B',
    src: '/seed/navy-knit.webp',
    hangerType: 'top',
  },
  {
    id: 'indigo-denim',
    code: '03',
    category: 'Bottoms',
    categoryKo: '하의',
    nameKo: '셀비지 데님',
    colorHex: '#355376',
    src: '/seed/indigo-denim.webp',
    hangerType: 'clip',
  },
  {
    id: 'white-sneakers',
    code: '04',
    category: 'Shoes',
    categoryKo: '신발',
    nameKo: '레더 스니커즈',
    colorHex: '#EAE8E2',
    src: '/seed/white-sneakers.webp',
    hangerType: 'hook',
  },
  {
    id: 'black-blazer',
    code: '05',
    category: 'Outerwear',
    categoryKo: '아우터',
    nameKo: '테일러드 블레이저',
    colorHex: '#232428',
    src: '/seed/black-blazer.webp',
    hangerType: 'coat',
  },
  {
    id: 'white-shirt',
    code: '06',
    category: 'Tops',
    categoryKo: '상의',
    nameKo: '포플린 셔츠',
    colorHex: '#F2F3F6',
    src: '/seed/white-shirt.webp',
    hangerType: 'top',
  },
  {
    id: 'charcoal-slacks',
    code: '07',
    category: 'Bottoms',
    categoryKo: '하의',
    nameKo: '울 플리츠 슬랙스',
    colorHex: '#3E4045',
    src: '/seed/charcoal-slacks.webp',
    hangerType: 'clip',
  },
  {
    id: 'studio-bag',
    code: '08',
    category: 'Accessories',
    categoryKo: '액세서리',
    nameKo: '페블 레더 토트',
    colorHex: '#9C8B7A',
    src: '/seed/studio-bag.webp',
    hangerType: 'hook',
  },
  {
    id: 'olive-jacket',
    code: '09',
    category: 'Outerwear',
    categoryKo: '아우터',
    nameKo: '퀼팅 라이너',
    colorHex: '#7A7B68',
    src: '/seed/olive-jacket.webp',
    hangerType: 'coat',
  },
  {
    id: 'cream-knit',
    code: '10',
    category: 'Tops',
    categoryKo: '상의',
    nameKo: '캐시미어 터틀넥',
    colorHex: '#E5DDD0',
    src: '/seed/cream-knit.webp',
    hangerType: 'top',
  },
  {
    id: 'black-loafers',
    code: '11',
    category: 'Shoes',
    categoryKo: '신발',
    nameKo: '페니 로퍼',
    colorHex: '#26272B',
    src: '/seed/black-loafers.webp',
    hangerType: 'hook',
  },
  {
    id: 'studio-watch',
    code: '12',
    category: 'Accessories',
    categoryKo: '액세서리',
    nameKo: '스틸 워치',
    colorHex: '#6E5846',
    src: '/seed/studio-watch.webp',
    hangerType: 'hook',
  },
];

const INITIAL_INVENTORY_SLOTS = [
  WARDROBE_STREAM_ITEMS[4],
  WARDROBE_STREAM_ITEMS[5],
  WARDROBE_STREAM_ITEMS[6],
  WARDROBE_STREAM_ITEMS[7],
  WARDROBE_STREAM_ITEMS[8],
  WARDROBE_STREAM_ITEMS[9],
  WARDROBE_STREAM_ITEMS[10],
  WARDROBE_STREAM_ITEMS[11],
  WARDROBE_STREAM_ITEMS[3],
];

const RAIL_QUEUE_INDICES = [0, 1, 2];
const CYCLE_MS = 3700;

function easeOutCubic(t) {
  const inv = 1 - Math.max(0, Math.min(1, t));
  return 1 - inv * inv * inv;
}

function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeSpringFlight(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3.15);
}

function HangerGraphic() {
  return (
    <svg
      className="wardrobe-hanger-svg"
      viewBox="0 0 120 46"
      fill="none"
      aria-hidden="true"
    >
      {/* Shared brushed metal rail hook (centered at x=60, rod contact at y=7) */}
      <path
        d="M60 15V10.5C60 6.8 63 4 66.6 4C70.1 4 72.8 6.7 72.8 10"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="60" cy="7.5" r="2.2" fill="currentColor" opacity="0.72" />

      {/* Tailored Coat / Outerwear Wooden-Contour Shoulder Hanger */}
      <g className="hanger-variant hanger-variant-coat">
        <path
          d="M60 15L16 34.5C13.2 35.8 14.1 40 17.2 40H102.8C105.9 40 106.8 35.8 104 34.5L60 15Z"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      </g>

      {/* Slim Studio Top Hanger */}
      <g className="hanger-variant hanger-variant-top">
        <path
          d="M60 15L20 33.5C17.6 34.6 18.4 38.2 21 38.2H99C101.6 38.2 102.4 34.6 100 33.5L60 15Z"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
      </g>

      {/* Trouser / Bottoms Tailor Clip Bar */}
      <g className="hanger-variant hanger-variant-clip">
        <path d="M60 15V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M26 23H94" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="33" y="21" width="7" height="12" rx="2" fill="currentColor" />
        <rect x="80" y="21" width="7" height="12" rx="2" fill="currentColor" />
      </g>

      {/* Minimalist Atelier Display Cradle / Hook for Shoes & Accessories */}
      <g className="hanger-variant hanger-variant-hook">
        <path
          d="M60 15V26.5M42 27H78"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * Pure JavaScript + CSS Cinematic Background Stage (`LoginWardrobeMotionStage`)
 * Depicts a physical boutique closet rail continuously digitizing hanging garments
 * via an optical cutout scanner into organized 2.5D squircle inventory slots.
 * Zero `<video>` tags or `.mp4` dependencies; supports Light & Dark themes and reduced motion.
 */
const LoginWardrobeMotionStage = memo(function LoginWardrobeMotionStage({
  effectiveTheme = 'light',
  lang = 'ko',
}) {
  const isEn = lang === 'en';
  const stageRef = useRef(null);
  const cameraPlaneRef = useRef(null);
  const scannerRef = useRef(null);
  const scanBeamRef = useRef(null);
  const scanReadoutRef = useRef(null);

  const activeActorRef = useRef(null);
  const activePhysicalRef = useRef(null);
  const activePhysicalHangerRef = useRef(null);
  const activePhysicalImgRef = useRef(null);
  const activeDigitalRef = useRef(null);
  const activeDigitalImgRef = useRef(null);
  const activeDigitalCatRef = useRef(null);
  const activeDigitalCodeRef = useRef(null);
  const activeDigitalDotRef = useRef(null);

  const railActorRefs = useRef([]);
  const railHangerRefs = useRef([]);
  const railImgRefs = useRef([]);

  const slotCellRefs = useRef([]);
  const slotCardRefs = useRef([]);
  const slotImgRefs = useRef([]);
  const slotCatRefs = useRef([]);
  const slotCodeRefs = useRef([]);
  const slotDotRefs = useRef([]);
  const archiveCountRef = useRef(null);

  const langRef = useRef(isEn);
  langRef.current = isEn;

  useEffect(() => {
    // Preload transparent garment cutouts into decoded browser image cache
    const preloaded = WARDROBE_STREAM_ITEMS.map((item) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = item.src;
      return img;
    });

    const stageEl = stageRef.current;
    const scannerEl = scannerRef.current;
    if (!stageEl || !scannerEl) return undefined;

    const geom = {
      stageW: 1280,
      stageH: 800,
      scanLeft: 180,
      scanTop: 260,
      scanW: 148,
      scanH: 188,
      scanCenterX: 254,
      scanCenterY: 354,
      railStep: 146,
      isCompactStage: false,
      visibleSlots: [],
    };

    const measureGeometry = () => {
      const originEl = cameraPlaneRef.current || stageEl;
      const sRect = originEl.getBoundingClientRect();
      const scRect = scannerEl.getBoundingClientRect();
      if (sRect.width <= 0 || scRect.width <= 0) return;

      geom.stageW = sRect.width;
      geom.stageH = sRect.height;
      geom.scanLeft = scRect.left - sRect.left;
      geom.scanTop = scRect.top - sRect.top;
      geom.scanW = scRect.width;
      geom.scanH = scRect.height;
      geom.scanCenterX = geom.scanLeft + scRect.width * 0.5;
      geom.scanCenterY = geom.scanTop + scRect.height * 0.5;
      geom.isCompactStage = sRect.width < 920;
      geom.railStep = Math.max(92, scRect.width * (geom.isCompactStage ? 0.94 : 1.02));
      stageEl.style.setProperty('--scanner-w', `${scRect.width}px`);
      stageEl.style.setProperty('--scanner-h', `${scRect.height}px`);

      const slots = [];
      for (let i = 0; i < slotCellRefs.current.length; i++) {
        const cell = slotCellRefs.current[i];
        if (!cell) continue;
        const r = cell.getBoundingClientRect();
        if (r.width > 12 && r.height > 12) {
          slots.push({
            index: i,
            left: r.left - sRect.left,
            top: r.top - sRect.top,
            width: r.width,
            height: r.height,
            centerX: r.left - sRect.left + r.width * 0.5,
            centerY: r.top - sRect.top + r.height * 0.5,
          });
        }
      }
      geom.visibleSlots = slots;
    };

    measureGeometry();

    let resizeObs = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        measureGeometry();
      });
      resizeObs.observe(stageEl);
      resizeObs.observe(scannerEl);
    }
    window.addEventListener('resize', measureGeometry, { passive: true });

    // Subtle pointer parallax target
    let targetPtrX = 0;
    let targetPtrY = 0;
    let smoothPtrX = 0;
    let smoothPtrY = 0;

    const handlePointerMove = (e) => {
      if (geom.stageW <= 0 || geom.stageH <= 0) return;
      targetPtrX = (e.clientX / geom.stageW - 0.5) * 2;
      targetPtrY = (e.clientY / geom.stageH - 0.5) * 2;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const applyItemToActiveAndQueue = (cycleIdx) => {
      const total = WARDROBE_STREAM_ITEMS.length;
      const activeItem = WARDROBE_STREAM_ITEMS[((cycleIdx % total) + total) % total];
      const useEnglish = langRef.current;

      if (activePhysicalHangerRef.current) {
        activePhysicalHangerRef.current.dataset.hangerType = activeItem.hangerType;
      }
      if (activePhysicalImgRef.current && activePhysicalImgRef.current.dataset.itemId !== activeItem.id) {
        activePhysicalImgRef.current.src = activeItem.src;
        activePhysicalImgRef.current.dataset.itemId = activeItem.id;
      }
      if (activeDigitalImgRef.current && activeDigitalImgRef.current.dataset.itemId !== activeItem.id) {
        activeDigitalImgRef.current.src = activeItem.src;
        activeDigitalImgRef.current.dataset.itemId = activeItem.id;
      }
      if (activeDigitalCatRef.current) {
        activeDigitalCatRef.current.textContent = useEnglish
          ? activeItem.category
          : activeItem.categoryKo;
      }
      if (activeDigitalCodeRef.current) {
        activeDigitalCodeRef.current.textContent = `#${activeItem.code}`;
      }
      if (activeDigitalDotRef.current) {
        activeDigitalDotRef.current.style.backgroundColor = activeItem.colorHex;
      }

      for (let q = 0; q < RAIL_QUEUE_INDICES.length; q++) {
        const nextItem = WARDROBE_STREAM_ITEMS[(cycleIdx + q + 1) % total];
        const hangerEl = railHangerRefs.current[q];
        const imgEl = railImgRefs.current[q];
        if (hangerEl) {
          hangerEl.dataset.hangerType = nextItem.hangerType;
        }
        if (imgEl && imgEl.dataset.itemId !== nextItem.id) {
          imgEl.src = nextItem.src;
          imgEl.dataset.itemId = nextItem.id;
        }
      }
    };

    const commitItemToSlot = (slotDomIndex, item, archivedTotal) => {
      const useEnglish = langRef.current;
      const imgEl = slotImgRefs.current[slotDomIndex];
      const catEl = slotCatRefs.current[slotDomIndex];
      const codeEl = slotCodeRefs.current[slotDomIndex];
      const dotEl = slotDotRefs.current[slotDomIndex];

      if (imgEl && imgEl.dataset.itemId !== item.id) {
        imgEl.src = item.src;
        imgEl.dataset.itemId = item.id;
      }
      if (catEl) {
        catEl.textContent = useEnglish ? item.category : item.categoryKo;
      }
      if (codeEl) {
        codeEl.textContent = `#${item.code}`;
      }
      if (dotEl) {
        dotEl.style.backgroundColor = item.colorHex;
      }
      if (archiveCountRef.current) {
        archiveCountRef.current.textContent = `${archivedTotal} ITEMS`;
      }
    };

    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let prefersReduced = Boolean(mediaQuery?.matches);
    const handleMotionPrefChange = (ev) => {
      prefersReduced = Boolean(ev.matches);
    };
    mediaQuery?.addEventListener?.('change', handleMotionPrefChange);

    let rafId = 0;
    // Start 28% into cycle 0 so the user immediately sees live optical scanning on frame 1
    const startOffsetMs = CYCLE_MS * 0.28;
    const originMs = performance.now() - startOffsetMs;
    let lastBoundCycle = -1;
    let lastCommittedCycle = -1;
    let lastReceivingDomIdx = -1;
    let lastReadoutText = '';
    let baseArchiveCount = 24;

    const setReceivingSlot = (domIdx) => {
      if (lastReceivingDomIdx === domIdx) return;
      if (lastReceivingDomIdx >= 0 && slotCardRefs.current[lastReceivingDomIdx]) {
        delete slotCardRefs.current[lastReceivingDomIdx].dataset.receiving;
      }
      if (domIdx >= 0 && slotCardRefs.current[domIdx]) {
        slotCardRefs.current[domIdx].dataset.receiving = 'true';
      }
      lastReceivingDomIdx = domIdx;
    };

    const updateReadout = (text) => {
      if (text !== lastReadoutText && scanReadoutRef.current) {
        scanReadoutRef.current.textContent = text;
        lastReadoutText = text;
      }
    };

    const tick = (nowMs) => {
      const actorEl = activeActorRef.current;
      const physEl = activePhysicalRef.current;
      const digiEl = activeDigitalRef.current;
      const beamEl = scanBeamRef.current;
      const scEl = scannerRef.current;

      if (!actorEl || !physEl || !digiEl || !beamEl || !scEl) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (prefersReduced) {
        if (lastBoundCycle !== 0) {
          applyItemToActiveAndQueue(0);
          lastBoundCycle = 0;
        }
        actorEl.style.opacity = '1';
        actorEl.style.transform = `translate3d(${geom.scanLeft.toFixed(1)}px, ${geom.scanTop.toFixed(1)}px, 0) scale(1)`;
        physEl.style.opacity = '1';
        physEl.style.clipPath = 'inset(54% -18% -12% -18%)';
        digiEl.style.opacity = '1';
        digiEl.style.clipPath = 'inset(0% 0% 46% 0% round 20px)';
        beamEl.style.opacity = '1';
        beamEl.style.transform = `translate3d(0, ${(geom.scanH * 0.54).toFixed(1)}px, 0)`;
        updateReadout('54%');
        for (let q = 0; q < RAIL_QUEUE_INDICES.length; q++) {
          const rEl = railActorRefs.current[q];
          if (!rEl) continue;
          const rx = geom.scanLeft - geom.railStep * (q + 1);
          rEl.style.opacity = '0.9';
          rEl.style.transform = `translate3d(${rx.toFixed(1)}px, ${geom.scanTop.toFixed(1)}px, 0)`;
        }
        return;
      }

      const elapsed = Math.max(0, nowMs - originMs);
      const cycleIdx = Math.floor(elapsed / CYCLE_MS);
      const u = (elapsed % CYCLE_MS) / CYCLE_MS;

      if (cycleIdx !== lastBoundCycle) {
        applyItemToActiveAndQueue(cycleIdx);
        lastBoundCycle = cycleIdx;
      }

      // Smooth autonomous + pointer 2.5D camera drift
      const autoDriftX = Math.sin(nowMs * 0.00038) * 0.45;
      const autoDriftY = Math.cos(nowMs * 0.00029) * 0.35;
      smoothPtrX += (targetPtrX + autoDriftX - smoothPtrX) * 0.045;
      smoothPtrY += (targetPtrY + autoDriftY - smoothPtrY) * 0.045;
      if (cameraPlaneRef.current) {
        cameraPlaneRef.current.style.setProperty('--cam-shift-x', `${(smoothPtrX * 8).toFixed(2)}px`);
        cameraPlaneRef.current.style.setProperty('--cam-shift-y', `${(smoothPtrY * 6).toFixed(2)}px`);
      }

      // Closet Rail Queue Motion (C0/C1 seamless across cycle boundaries)
      const isRailAdvancing = u < 0.18;
      const tRail = isRailAdvancing ? easeOutCubic(u / 0.18) : 1;
      const advanceSwayDeg = isRailAdvancing
        ? Math.sin((u / 0.18) * Math.PI) * 3.8
        : Math.sin((u - 0.18) * Math.PI * 2.5) * Math.exp(-(u - 0.18) * 5.5) * -1.8;

      for (let q = 0; q < RAIL_QUEUE_INDICES.length; q++) {
        const rEl = railActorRefs.current[q];
        if (!rEl) continue;
        const slotDist = q + 1 + (1 - tRail);
        const rx = geom.scanLeft - geom.railStep * slotDist;
        const breezeDeg = Math.sin(nowMs * 0.0018 + q * 1.15) * 1.1 + advanceSwayDeg * (0.88 - q * 0.14);
        const fadeIn = q === RAIL_QUEUE_INDICES.length - 1 && isRailAdvancing ? 0.25 + 0.65 * tRail : 0.9;
        rEl.style.opacity = fadeIn.toFixed(3);
        rEl.style.transform = `translate3d(${rx.toFixed(1)}px, ${geom.scanTop.toFixed(1)}px, 0) rotate(${breezeDeg.toFixed(2)}deg)`;
      }

      const slots = geom.visibleSlots;
      const targetSlot =
        slots.length > 0 ? slots[cycleIdx % slots.length] : null;
      const targetDomIdx = targetSlot ? targetSlot.index : -1;

      if (u < 0.18) {
        // ACT 1: Garment glides along closet rod into the Optical Capture Frame
        setReceivingSlot(-1);
        const ax = geom.scanLeft - geom.railStep * (1 - tRail);
        actorEl.style.opacity = '1';
        actorEl.style.transform = `translate3d(${ax.toFixed(1)}px, ${geom.scanTop.toFixed(1)}px, 0) scale(1)`;
        if (activePhysicalHangerRef.current) {
          activePhysicalHangerRef.current.style.transform = `rotate(${advanceSwayDeg.toFixed(2)}deg)`;
        }
        physEl.style.opacity = '1';
        physEl.style.clipPath = 'inset(0% -18% -12% -18%)';
        digiEl.style.opacity = '0';
        beamEl.style.opacity = '0';
        scEl.dataset.scanActive = 'ready';
        updateReadout(langRef.current ? 'ALIGN' : '정렬');
      } else if (u < 0.58) {
        // ACT 2: Optical Cutout Scan Wipe (Physical Closet Hanger -> 2.5D Squircle Inventory Card)
        setReceivingSlot(-1);
        const rawScan = (u - 0.18) / 0.4;
        const scanP = easeInOutCubic(rawScan);
        const settleDeg = advanceSwayDeg * (1 - rawScan);
        const pct = scanP * 100;

        actorEl.style.opacity = '1';
        actorEl.style.transform = `translate3d(${geom.scanLeft.toFixed(1)}px, ${geom.scanTop.toFixed(1)}px, 0) scale(1)`;
        if (activePhysicalHangerRef.current) {
          activePhysicalHangerRef.current.style.transform = `rotate(${settleDeg.toFixed(2)}deg)`;
        }

        physEl.style.opacity = '1';
        physEl.style.clipPath = `inset(${pct.toFixed(2)}% -18% -12% -18%)`;

        digiEl.style.opacity = '1';
        digiEl.style.clipPath = `inset(0% 0% ${(100 - pct).toFixed(2)}% 0% round 20px)`;

        const beamAlpha = Math.sin(rawScan * Math.PI);
        beamEl.style.opacity = Math.min(1, beamAlpha * 2.4).toFixed(3);
        beamEl.style.transform = `translate3d(0, ${(geom.scanH * scanP).toFixed(1)}px, 0)`;

        scEl.dataset.scanActive = 'scanning';
        updateReadout(`${String(Math.round(pct)).padStart(2, '0')}%`);
      } else if (u < 0.88 && targetSlot) {
        // ACT 3: Newly Digitized Squircle Card Arcs into Target Digital Inventory Slot
        setReceivingSlot(targetDomIdx);
        const rawFly = (u - 0.58) / 0.3;
        const easeFly = easeSpringFlight(rawFly);

        const p0x = geom.scanCenterX;
        const p0y = geom.scanCenterY;
        const p2x = targetSlot.centerX;
        const p2y = targetSlot.centerY;

        const ctrlX = (p0x + p2x) * 0.5 + (geom.isCompactStage ? 28 : 0);
        const ctrlY = geom.isCompactStage
          ? (p0y + p2y) * 0.5 - 18
          : Math.min(p0y, p2y) - Math.min(78, geom.stageH * 0.1);

        const inv = 1 - easeFly;
        const cx = inv * inv * p0x + 2 * inv * easeFly * ctrlX + easeFly * easeFly * p2x;
        const cy = inv * inv * p0y + 2 * inv * easeFly * ctrlY + easeFly * easeFly * p2y;

        const endScaleX = targetSlot.width / geom.scanW;
        const endScaleY = targetSlot.height / geom.scanH;
        const midLift = 1 + 0.06 * Math.sin(rawFly * Math.PI);
        const sx = (1 + (endScaleX - 1) * easeFly) * midLift;
        const sy = (1 + (endScaleY - 1) * easeFly) * midLift;
        const bankDeg = Math.sin(rawFly * Math.PI) * (geom.isCompactStage ? -2.2 : 2.6);

        const drawLeft = cx - geom.scanW * 0.5;
        const drawTop = cy - geom.scanH * 0.5;

        actorEl.style.opacity = '1';
        actorEl.style.transform = `translate3d(${drawLeft.toFixed(1)}px, ${drawTop.toFixed(1)}px, 0) rotate(${bankDeg.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        if (activePhysicalHangerRef.current) {
          activePhysicalHangerRef.current.style.transform = 'rotate(0deg)';
        }

        physEl.style.opacity = '0';
        digiEl.style.opacity = '1';
        digiEl.style.clipPath = 'inset(0% 0% 0% 0% round 20px)';
        beamEl.style.opacity = '0';
        scEl.dataset.scanActive = 'synced';
        updateReadout('SYNCED');
      } else {
        // ACT 4: Docked into Structured Inventory Archive + Tactile Settle Pulse
        setReceivingSlot(-1);
        if (lastCommittedCycle !== cycleIdx && targetDomIdx >= 0) {
          const total = WARDROBE_STREAM_ITEMS.length;
          const activeItem = WARDROBE_STREAM_ITEMS[cycleIdx % total];
          baseArchiveCount = 24 + ((cycleIdx + 1) % 76);
          commitItemToSlot(targetDomIdx, activeItem, baseArchiveCount);
          lastCommittedCycle = cycleIdx;
        }

        const rawSettle = (u - 0.88) / 0.12;
        if (targetDomIdx >= 0 && slotCardRefs.current[targetDomIdx]) {
          const pulse = 1 + 0.055 * Math.sin(rawSettle * Math.PI) * (1 - rawSettle * 0.4);
          slotCardRefs.current[targetDomIdx].style.transform = `scale(${pulse.toFixed(3)})`;
        }

        actorEl.style.opacity = '0';
        beamEl.style.opacity = '0';
        scEl.dataset.scanActive = 'idle';
        updateReadout('READY');
      }

      // Subtle staggered ambient float on non-docking inventory cards
      for (let i = 0; i < slotCardRefs.current.length; i++) {
        const cardEl = slotCardRefs.current[i];
        if (!cardEl) continue;
        if (u >= 0.88 && i === targetDomIdx) continue;
        const floatY = Math.sin(nowMs * 0.0014 + i * 0.85) * 2.2;
        cardEl.style.transform = `translate3d(0, ${floatY.toFixed(2)}px, 0)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs?.disconnect?.();
      window.removeEventListener('resize', measureGeometry);
      window.removeEventListener('pointermove', handlePointerMove);
      mediaQuery?.removeEventListener?.('change', handleMotionPrefChange);
      preloaded.length = 0;
    };
  }, []);

  // Re-sync localized category captions if user switches KO <-> EN
  useEffect(() => {
    for (let i = 0; i < INITIAL_INVENTORY_SLOTS.length; i++) {
      const imgEl = slotImgRefs.current[i];
      const catEl = slotCatRefs.current[i];
      if (!imgEl || !catEl) continue;
      const currentId = imgEl.dataset.itemId;
      const found =
        WARDROBE_STREAM_ITEMS.find((it) => it.id === currentId) || INITIAL_INVENTORY_SLOTS[i];
      catEl.textContent = isEn ? found.category : found.categoryKo;
    }
  }, [isEn]);

  const firstItem = WARDROBE_STREAM_ITEMS[0];

  return (
    <div
      id={CARBON_DOM_CONTRACT.loginMotionStageId}
      ref={stageRef}
      className="hig-auth-video-stage wardrobe-motion-stage"
      data-motion-theme={effectiveTheme}
      aria-hidden="true"
    >
      {/* Architectural Atelier Daylight / Gallery Spotlight Rays */}
      <div className="wardrobe-motion-light-shafts" />
      <div className="wardrobe-motion-alcove-panels" />

      {/* 2.5D Steadicam Parallax Layer */}
      <div ref={cameraPlaneRef} className="wardrobe-motion-camera-plane">
        {/* LEFT / UPPER WING: Physical Closet Rail & Optical Cutout Scanner */}
        <div className="wardrobe-motion-closet-wing">
          <div id="wardrobe-optical-scanner" ref={scannerRef} className="wardrobe-motion-scanner">
            {/* Brushed Metal Closet Rod anchored directly to hanger hook height */}
            <div className="wardrobe-motion-rail">
              <span className="wardrobe-motion-rail-cap" />
            </div>

            {/* Scanner Header Readout */}
            <div className="wardrobe-scanner-hud">
              <span className="wardrobe-scanner-tag">
                {isEn ? 'CLOSET SCAN' : '옷장 스캔'}
              </span>
              <span ref={scanReadoutRef} className="wardrobe-scanner-pct">
                28%
              </span>
            </div>

            {/* 4 Precision Viewfinder Corner Brackets */}
            <span className="wardrobe-scanner-corner is-tl" />
            <span className="wardrobe-scanner-corner is-tr" />
            <span className="wardrobe-scanner-corner is-bl" />
            <span className="wardrobe-scanner-corner is-br" />

            {/* Luminous Optical Cutout Sweep Bar */}
            <div ref={scanBeamRef} className="wardrobe-scanner-beam">
              <div className="wardrobe-scanner-beam-veil" />
              <div className="wardrobe-scanner-beam-line" />
            </div>
          </div>
        </div>

        {/* Hanging Closet Queue Actors (gliding along the brushed closet rod) */}
        {RAIL_QUEUE_INDICES.map((q) => {
          const item = WARDROBE_STREAM_ITEMS[q + 1];
          return (
            <div
              key={`rail-queue-${q}`}
              ref={(el) => {
                railActorRefs.current[q] = el;
              }}
              className="wardrobe-rail-actor"
            >
              <div
                ref={(el) => {
                  railHangerRefs.current[q] = el;
                }}
                className="wardrobe-physical-garment"
                data-hanger-type={item.hangerType}
              >
                <HangerGraphic />
                <img
                  ref={(el) => {
                    railImgRefs.current[q] = el;
                  }}
                  src={item.src}
                  data-item-id={item.id}
                  alt=""
                  className="wardrobe-physical-img"
                  decoding="async"
                />
              </div>
            </div>
          );
        })}

        {/* Active Transformation Actor (Physical Closet Layer -> Optical Wipe -> Flying Squircle Card) */}
        <div ref={activeActorRef} className="wardrobe-active-actor">
          {/* Layer A: Raw Physical Hanging Garment */}
          <div ref={activePhysicalRef} className="wardrobe-actor-layer-physical">
            <div
              ref={activePhysicalHangerRef}
              className="wardrobe-physical-garment"
              data-hanger-type={firstItem.hangerType}
            >
              <HangerGraphic />
              <img
                ref={activePhysicalImgRef}
                src={firstItem.src}
                data-item-id={firstItem.id}
                alt=""
                className="wardrobe-physical-img"
                decoding="async"
              />
            </div>
          </div>

          {/* Layer B: Digitized 2.5D Squircle Inventory Card */}
          <div ref={activeDigitalRef} className="wardrobe-actor-layer-digital">
            <div className="wardrobe-inventory-card is-elevated">
              <div className="wardrobe-inventory-card-glow" />
              <div className="wardrobe-inventory-card-media">
                <img
                  ref={activeDigitalImgRef}
                  src={firstItem.src}
                  data-item-id={firstItem.id}
                  alt=""
                  className="wardrobe-inventory-card-img"
                  decoding="async"
                />
              </div>
              <div className="wardrobe-inventory-card-meta">
                <span className="wardrobe-inventory-card-cat-wrap">
                  <span
                    ref={activeDigitalDotRef}
                    className="wardrobe-inventory-card-dot"
                    style={{ backgroundColor: firstItem.colorHex }}
                  />
                  <span ref={activeDigitalCatRef} className="wardrobe-inventory-card-cat">
                    {isEn ? firstItem.category : firstItem.categoryKo}
                  </span>
                </span>
                <span ref={activeDigitalCodeRef} className="wardrobe-inventory-card-code">
                  #{firstItem.code}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT / LOWER WING: Structured Digital A inventory Wall */}
        <div id="wardrobe-inventory-wall" className="wardrobe-motion-inventory-wing">
          <div className="wardrobe-inventory-shelf-head">
            <span className="wardrobe-inventory-shelf-kicker">
              {isEn ? 'DIGITAL INVENTORY' : '디지털 인벤토리'}
            </span>
            <span ref={archiveCountRef} className="wardrobe-inventory-shelf-count">
              24 ITEMS
            </span>
          </div>

          <div className="wardrobe-motion-inventory-grid">
            {INITIAL_INVENTORY_SLOTS.map((slotItem, idx) => (
              <div
                key={`inv-slot-${idx}`}
                ref={(el) => {
                  slotCellRefs.current[idx] = el;
                }}
                className={`wardrobe-slot-cell ${idx >= 6 ? 'is-desktop-only' : ''}`}
                data-inventory-slot={idx}
              >
                <div
                  ref={(el) => {
                    slotCardRefs.current[idx] = el;
                  }}
                  className="wardrobe-inventory-card wardrobe-slot-card"
                >
                  <div className="wardrobe-inventory-card-glow" />
                  <div className="wardrobe-inventory-card-media">
                    <img
                      ref={(el) => {
                        slotImgRefs.current[idx] = el;
                      }}
                      src={slotItem.src}
                      data-item-id={slotItem.id}
                      alt=""
                      className="wardrobe-inventory-card-img"
                      decoding="async"
                    />
                  </div>
                  <div className="wardrobe-inventory-card-meta">
                    <span className="wardrobe-inventory-card-cat-wrap">
                      <span
                        ref={(el) => {
                          slotDotRefs.current[idx] = el;
                        }}
                        className="wardrobe-inventory-card-dot"
                        style={{ backgroundColor: slotItem.colorHex }}
                      />
                      <span
                        ref={(el) => {
                          slotCatRefs.current[idx] = el;
                        }}
                        className="wardrobe-inventory-card-cat"
                      >
                        {isEn ? slotItem.category : slotItem.categoryKo}
                      </span>
                    </span>
                    <span
                      ref={(el) => {
                        slotCodeRefs.current[idx] = el;
                      }}
                      className="wardrobe-inventory-card-code"
                    >
                      #{slotItem.code}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subtle Center Frosted Scrim cushioning the Login Card */}
      <div className="hig-auth-video-scrim" />
    </div>
  );
});

export default LoginWardrobeMotionStage;
