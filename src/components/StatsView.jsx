import { useEffect, useState } from 'react';
import { Moon, Palette, SlidersHorizontal, Sun } from 'lucide-react';
import { translateSubTypeLabel } from '../services/skinToneAnalyzer.ts';
import { apiFetch } from '../utils/api.ts';
import { tx } from '../utils/i18n.ts';
import { TopRightUtilityActions } from './common/AppUI.jsx';
import {
  MostWornRankingCard,
  UnwornSleeperCard,
} from './stats/StatsEditorialRankings.jsx';
import {
  ColorSpectrumWidget,
  InteractiveCompositionWidget,
  WardrobeHeroSummaryCard,
} from './stats/StatsSvgWidgets.jsx';
import './stats/statsBento.css';

export default function StatsView({
  garments = [],
  theme,
  lang = 'ko',
  skinProfile,
  bodySpec,
  onOpenProfile,
  onOpenSkinToneModal,
  onToggleTheme,
  onOpenAccount,
  onSelectGarment,
}) {
  const [activeOutfitCount, setActiveOutfitCount] = useState(0);
  const [wearLogCount, setWearLogCount] = useState(0);

  const closetOwner = garments[0]?.closet_owner || 'sample';

  useEffect(() => {
    let cancelled = false;
    const q = encodeURIComponent(closetOwner);
    (async () => {
      try {
        const [outRes, calRes] = await Promise.all([
          apiFetch(`/outfits?closet=${q}`),
          apiFetch(`/calendar?closet=${q}`),
        ]);
        if (cancelled) return;
        setActiveOutfitCount(Array.isArray(outRes?.outfits) ? outRes.outfits.length : 0);
        setWearLogCount(Array.isArray(calRes?.logs) ? calRes.logs.length : 0);
      } catch {
        if (!cancelled) {
          setActiveOutfitCount(0);
          setWearLogCount(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [closetOwner, garments.length]);

  const diagnosisLabel =
    lang === 'en'
      ? translateSubTypeLabel(skinProfile?.subTypeLabelKo, skinProfile?.personalColor)
      : skinProfile?.subTypeLabelKo || '가을 웜 뮤트';

  const swatchHex = skinProfile?.skinToneHex || '#DFBA9B';

  return (
    <section className="hig-screen-container" aria-label="Stats">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">STATS</h1>
          <span className="hig-item-count tabular-nums">
            {tx(lang, `${garments.length}개 아이템`, `${garments.length} ITEMS`)}
          </span>
        </div>
        <div className="hig-top-bar-actions">
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
            extraActions={
              <button
                type="button"
                className="hig-circle-icon-btn is-subtle"
                onClick={onToggleTheme}
                aria-label={
                  theme === 'dark'
                    ? tx(lang, '라이트 모드로 전환', 'Switch to Light Mode')
                    : tx(lang, '다크 모드로 전환', 'Switch to Dark Mode')
                }
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            }
          />
        </div>
      </header>

      <div className="stats-bento-grid">
        {/* 1. Wardrobe Vitality Hero Card + Utilization Gauge Ring (Span 7) */}
        <WardrobeHeroSummaryCard
          garments={garments}
          activeOutfitCount={activeOutfitCount}
          wearLogCount={wearLogCount}
          lang={lang}
          bentoIndex={0}
        />

        {/* 2. Personal Palette & Body Profile Card (Span 5 — preserves .hig-stats-skin-card contract) */}
        <div
          className="hig-stats-skin-card stats-bento-profile stats-span-5"
          style={{ '--bento-idx': 1 }}
        >
          <div className="stats-card-head">
            <div className="stats-title-stack">
              <span className="stats-eyebrow">
                {tx(lang, '퍼스널 톤 · 체형 스펙', 'PERSONAL PALETTE & FIT')}
              </span>
              <h2 className="stats-card-title">
                {tx(lang, '아틀리에 피팅 프로필', 'Atelier Fitting Profile')}
              </h2>
            </div>
            <span className="stats-glass-pill tabular-nums">{swatchHex}</span>
          </div>

          <div className="hig-stats-skin-info">
            <span
              className="hig-stats-skin-swatch"
              style={{ backgroundColor: swatchHex }}
            />
            <div>
              <strong className="hig-stats-skin-title">{diagnosisLabel}</strong>
              <span className="hig-stats-skin-sub tabular-nums">
                {swatchHex}
                {bodySpec ? ` · ${bodySpec.heightCm}cm · ${bodySpec.weightKg}kg` : ''}
              </span>
            </div>
          </div>

          {bodySpec && (
            <div className="stats-profile-specs">
              <span className="stats-spec-chip">{bodySpec.heightCm} cm</span>
              <span className="stats-spec-chip">{bodySpec.weightKg} kg</span>
              {bodySpec.chestCm ? (
                <span className="stats-spec-chip">
                  {tx(lang, `가슴 ${bodySpec.chestCm}`, `Chest ${bodySpec.chestCm}`)}
                </span>
              ) : null}
              {bodySpec.waistCm ? (
                <span className="stats-spec-chip">
                  {tx(lang, `허리 ${bodySpec.waistCm}`, `Waist ${bodySpec.waistCm}`)}
                </span>
              ) : null}
            </div>
          )}

          <div className="hig-stats-skin-actions">
            <button
              type="button"
              className="hig-secondary-btn"
              onClick={() => {
                if (onOpenProfile) onOpenProfile('skin');
                else onOpenSkinToneModal?.();
              }}
            >
              <Palette size={15} />
              <span>{tx(lang, '사진 · 피부톤', 'Photo & Skin')}</span>
            </button>
            <button
              type="button"
              className="hig-secondary-btn"
              onClick={() => {
                if (onOpenProfile) onOpenProfile('body');
                else onOpenSkinToneModal?.();
              }}
            >
              <SlidersHorizontal size={15} />
              <span>{tx(lang, '체형 설정', 'Body Profile')}</span>
            </button>
          </div>
        </div>

        {/* 3. Interactive Category & Season Donut + Bar Chart (Span 7) */}
        <InteractiveCompositionWidget
          garments={garments}
          lang={lang}
          bentoIndex={2}
        />

        {/* 4. Chromatic Color Palette Spectrum Bar (Span 5) */}
        <ColorSpectrumWidget
          garments={garments}
          lang={lang}
          bentoIndex={3}
        />

        {/* 5. Most Worn Signature Pieces Ranking (Span 6) */}
        <MostWornRankingCard
          garments={garments}
          lang={lang}
          onSelectGarment={onSelectGarment}
          bentoIndex={4}
        />

        {/* 6. Unworn Sleeper Archive Ranking (Span 6) */}
        <UnwornSleeperCard
          garments={garments}
          lang={lang}
          onSelectGarment={onSelectGarment}
          bentoIndex={5}
        />
      </div>
    </section>
  );
}
