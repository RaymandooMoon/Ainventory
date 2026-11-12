import { useMemo } from 'react';
import { Moon, Sun, User } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import GarmentObject25D from './GarmentObject25D.jsx';

export default function StatsView({
  garments = [],
  theme,
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

  return (
    <section className="hig-screen-container" aria-label="Stats">
      <header className="hig-top-bar">
        <div className="hig-top-bar-titles">
          <h1 className="hig-screen-title">STATS</h1>
          <span className="hig-item-count tabular-nums">{garments.length} ITEMS</span>
        </div>
        <div className="hig-top-bar-actions">
          <button
            type="button"
            className="hig-circle-icon-btn is-subtle"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            id={CARBON_DOM_CONTRACT.openAccountSettingsBtnId}
            type="button"
            className="hig-circle-icon-btn is-subtle"
            onClick={onOpenAccount}
            aria-label="계정 설정"
          >
            <User size={18} />
          </button>
        </div>
      </header>

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

      {/* Most Worn Garments Grid */}
      {topWornGarments.length > 0 && (
        <div className="hig-wardrobe-grid" style={{ marginTop: 24 }}>
          {topWornGarments.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hig-wardrobe-card"
              onClick={() => onSelectGarment?.(item)}
            >
              <div className="hig-squircle-card">
                <GarmentObject25D item={item} padding="13%" />
              </div>
              <div className="hig-garment-meta">
                <span className="hig-garment-name">{item.name}</span>
                <span className="hig-garment-brand tabular-nums">
                  {item.brand || `${Number(item.wear_count) || 0} wears`}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
