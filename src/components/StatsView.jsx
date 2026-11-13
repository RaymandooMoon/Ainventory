import { useMemo } from 'react';
import { Moon, Palette, SlidersHorizontal, Sun } from 'lucide-react';
import {
  WARDROBE_CATEGORY_OPTIONS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { translateSubTypeLabel } from '../services/skinToneAnalyzer.ts';
import { tx } from '../utils/i18n.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';

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
  const categoryBreakdown = useMemo(() => {
    const counts = {
      top: 0,
      bottom: 0,
      outer: 0,
      shoes: 0,
      accessory: 0,
    };
    for (const item of garments) {
      const key = normalizeWardrobeCategoryKey(item.category);
      counts[key] = (counts[key] || 0) + 1;
    }
    const total = Math.max(1, garments.length);
    return WARDROBE_CATEGORY_OPTIONS.map((opt) => ({
      key: opt.key,
      label: opt.label,
      count: counts[opt.key] || 0,
      ratioPct: Math.round(((counts[opt.key] || 0) / total) * 100),
    }));
  }, [garments]);

  const topWornGarments = useMemo(() => {
    return [...garments]
      .sort((a, b) => (Number(b.wear_count) || 0) - (Number(a.wear_count) || 0))
      .slice(0, 6);
  }, [garments]);

  const diagnosisLabel =
    lang === 'en'
      ? translateSubTypeLabel(skinProfile?.subTypeLabelKo, skinProfile?.personalColor)
      : skinProfile?.subTypeLabelKo || '가을 웜 뮤트';

  return (
    <section className="hig-screen-container" aria-label="Stats">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">STATS</h1>
          <span className="hig-item-count tabular-nums">{garments.length} ITEMS</span>
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

      <div className="hig-stats-overview-grid">
        {/* Personal Profile (Skin Tone & Body Measurements) Card — Zero 2.5D / Zero Gender Copy */}
        <div className="hig-stats-skin-card">
          <div className="hig-stats-skin-info">
            <span
              className="hig-stats-skin-swatch"
              style={{ backgroundColor: skinProfile?.skinToneHex || '#DFBA9B' }}
            />
            <div>
              <strong className="hig-stats-skin-title">{diagnosisLabel}</strong>
              <span className="hig-stats-skin-sub tabular-nums">
                {skinProfile?.skinToneHex || '#DFBA9B'}
                {bodySpec ? ` · ${bodySpec.heightCm}cm · ${bodySpec.weightKg}kg` : ''}
              </span>
            </div>
          </div>

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

        {/* Category Composition Bars */}
        <div className="hig-stats-panel">
          {categoryBreakdown.map((row) => (
            <div key={row.key} className="hig-stat-bar-row">
              <span className="hig-stat-bar-label">{row.label}</span>
              <div className="hig-stat-bar-track">
                <div
                  className="hig-stat-bar-fill"
                  style={{ width: `${Math.max(row.count > 0 ? 6 : 0, row.ratioPct)}%` }}
                />
              </div>
              <span className="hig-stat-bar-count tabular-nums">{row.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Most Worn Garments Grid */}
      {topWornGarments.length > 0 && (
        <div className="hig-wardrobe-grid">
          {topWornGarments.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className="hig-wardrobe-card"
              style={{ '--card-stagger': idx }}
              onClick={() => onSelectGarment?.(item)}
            >
              <div className="hig-squircle-card">
                <GarmentObject25D item={item} padding="13%" />
              </div>
              <div className="hig-garment-meta">
                <span className="hig-garment-name">{item.name}</span>
                <span className="hig-garment-brand tabular-nums">
                  {item.brand ||
                    tx(
                      lang,
                      `${Number(item.wear_count) || 0}회 착용`,
                      `${Number(item.wear_count) || 0} wears`
                    )}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
