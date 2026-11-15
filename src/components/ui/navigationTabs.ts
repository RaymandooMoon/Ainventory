import type { ComponentType, ReactNode } from 'react';
import { BarChart3, Calendar, Layers, LayoutGrid } from 'lucide-react';

export interface BottomTabIconProps {
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
  className?: string;
}

export interface BottomTabItem {
  key: string;
  label: string;
  path?: string;
  Icon?: ComponentType<BottomTabIconProps>;
  icon?: ReactNode;
  badge?: string | number;
  ariaLabel?: string;
}

/**
 * Returns the 4 primary wardrobe routes while preserving existing route contracts.
 */
export function getDefaultAppTabs(
  lang: string = 'ko',
  labelMode: 'localized' | 'english' = 'localized'
): ReadonlyArray<BottomTabItem> {
  const useKorean = labelMode === 'localized' && lang !== 'en';
  return [
    { key: 'closet', label: useKorean ? '옷장' : 'Closet', path: '/', Icon: LayoutGrid },
    { key: 'outfits', label: useKorean ? '코디' : 'Outfits', path: '/outfits', Icon: Layers },
    {
      key: 'calendar',
      label: useKorean ? '캘린더' : 'Calendar',
      path: '/calendar',
      Icon: Calendar,
    },
    { key: 'stats', label: useKorean ? '통계' : 'Stats', path: '/stats', Icon: BarChart3 },
  ];
}
