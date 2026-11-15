import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';
import { tx } from '../../utils/i18n.ts';
import type { BottomTabIconProps, BottomTabItem } from './navigationTabs.ts';
import { cn } from './utils.ts';
import './navigation.css';

export type { BottomTabIconProps, BottomTabItem };

export interface BottomTabBarProps {
  tabs: ReadonlyArray<BottomTabItem>;
  activeTab: string;
  onSelectTab: (tabKey: string) => void;
  id?: string;
  ariaLabel?: string;
  lang?: string;
  className?: string;
}

/**
 * Mobile-first bottom navigation dock:
 * - Safe-area bottom inset clearance
 * - Minimum 48x48dp physical hit box & >= 8px gaps across all screen widths
 * - WCAG AA (>= 4.5:1) Light/Dark contrast
 * - Morphological active state: border/ring rim + bottom accent pill + icon stroke weight
 */
export function BottomTabBar({
  tabs,
  activeTab,
  onSelectTab,
  id = CARBON_DOM_CONTRACT.floatingTabBarId,
  ariaLabel,
  lang = 'ko',
  className,
}: BottomTabBarProps) {
  const resolvedAriaLabel = ariaLabel || tx(lang, '주요 섹션 내비게이션', 'Primary Navigation');

  return (
    <nav
      id={id}
      className={cn('hig-floating-tabbar ui-bottom-tabbar pb-[env(safe-area-inset-bottom)]', className)}
      aria-label={resolvedAriaLabel}
    >
      {tabs.map(({ key, label, Icon, icon, badge, ariaLabel: itemAriaLabel }) => {
        const isActive = activeTab === key;

        return (
          <button
            key={key}
            type="button"
            data-nav-tab={key}
            data-active={isActive ? 'true' : 'false'}
            aria-current={isActive ? 'page' : undefined}
            aria-label={itemAriaLabel}
            className={cn(
              'hig-floating-tab-btn ui-bottom-tab-btn min-h-12 min-w-12',
              isActive && 'active is-active ring-2'
            )}
            onClick={() => onSelectTab(key)}
          >
            {Icon ? (
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} aria-hidden="true" />
            ) : (
              icon && <span aria-hidden="true">{icon}</span>
            )}
            <span className="ui-bottom-tab-label">{label}</span>
            {badge !== undefined && badge !== null && badge !== '' && (
              <span className="ui-bottom-tab-badge" aria-hidden="true">
                {badge}
              </span>
            )}
            {isActive && <span className="ui-bottom-tab-indicator" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
