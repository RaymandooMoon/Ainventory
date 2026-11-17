import type { MouseEvent, ReactNode } from 'react';
import { Moon, Sun, UserCog } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';
import { tx } from '../../utils/i18n.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { cn } from './utils.ts';
import './navigation.css';

export interface HeaderSkinProfileLike {
  skinToneHex?: string | null;
}

export interface HeaderUtilityNavProps {
  skinProfile?: HeaderSkinProfileLike | null;
  lang?: string;
  onOpenProfile?: (tab?: 'skin' | 'body') => void;
  onOpenAccount?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: (event?: MouseEvent<HTMLButtonElement>) => void;
  extraActions?: ReactNode;
  className?: string;
}

/**
 * Standardized top-right utility cluster across all main views.
 * Guarantees >= 48x48dp hit targets and >= 8px gaps for theme, profile, settings, and screen actions.
 */
export function HeaderUtilityNav({
  skinProfile,
  lang = 'ko',
  onOpenProfile,
  onOpenAccount,
  theme,
  onToggleTheme,
  extraActions = null,
  className,
}: HeaderUtilityNavProps) {
  const swatchHex = skinProfile?.skinToneHex || '#DFBA9B';

  return (
    <div className={cn('hig-top-right-utility-group ui-nav-utility-group gap-2', className)}>
      {extraActions}

      {onToggleTheme && (
        <button
          type="button"
          className="hig-circle-icon-btn is-subtle min-h-12 min-w-12"
          onClick={(e) => {
            triggerHaptic('selection');
            onToggleTheme(e);
          }}
          aria-label={
            theme === 'dark'
              ? tx(lang, '라이트 모드로 전환', 'Switch to Light Mode')
              : tx(lang, '다크 모드로 전환', 'Switch to Dark Mode')
          }
          title={
            theme === 'dark'
              ? tx(lang, '라이트 모드', 'Light Mode')
              : tx(lang, '다크 모드', 'Dark Mode')
          }
        >
          {theme === 'dark' ? (
            <Sun size={18} strokeWidth={2.1} aria-hidden="true" />
          ) : (
            <Moon size={18} strokeWidth={2.1} aria-hidden="true" />
          )}
        </button>
      )}

      <button
        id="open-profile-studio-btn"
        type="button"
        className="hig-profile-quick-pill min-h-12 min-w-12"
        aria-label={tx(lang, '사진·피부톤·체형 설정 열기', 'Open Photo, Skin Tone & Body Profile')}
        title={tx(lang, '사진 · 피부톤 · 체형 설정', 'Photo, Skin Tone & Body Profile')}
        onClick={() => {
          triggerHaptic('selection');
          onOpenProfile?.('skin');
        }}
      >
        <span
          className="hig-profile-quick-swatch"
          style={{ backgroundColor: swatchHex }}
          aria-hidden="true"
        />
        <span className="hig-profile-quick-label">{tx(lang, '프로필', 'Profile')}</span>
      </button>

      <button
        id={CARBON_DOM_CONTRACT.openAccountSettingsBtnId}
        type="button"
        className="hig-circle-icon-btn is-subtle min-h-12 min-w-12"
        aria-label={tx(lang, '계정 설정', 'Account Settings')}
        title={tx(lang, '계정 설정', 'Account Settings')}
        onClick={() => {
          triggerHaptic('selection');
          onOpenAccount?.();
        }}
      >
        <UserCog size={18} strokeWidth={2.1} aria-hidden="true" />
      </button>
    </div>
  );
}

export interface PageHeaderNavProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Standardized screen header layout without hamburger drawer clutter.
 */
export function PageHeaderNav({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: PageHeaderNavProps) {
  return (
    <header className={cn('ui-page-header ui-header-nav', className)} style={{ marginBottom: 16 }}>
      <div className="ui-page-header-text">
        {eyebrow && (
          <div className="hig-caption" style={{ marginBottom: 4 }}>
            {eyebrow}
          </div>
        )}
        {title && <h1 className="hig-large-title">{title}</h1>}
        {subtitle && (
          <p className="hig-caption" style={{ marginTop: 4 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="ui-page-header-actions ui-header-nav-actions gap-2">{actions}</div>
      )}
    </header>
  );
}
