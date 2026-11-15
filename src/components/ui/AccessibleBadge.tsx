import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils.ts';
import './uiPrimitives.css';

export type AccessibleBadgeVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent';

export type AccessibleBadgeSize = 'sm' | 'md';

export interface AccessibleBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: AccessibleBadgeVariant;
  size?: AccessibleBadgeSize;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Status badge engineered with WCAG AA >= 4.5:1 contrast across both Light and Dark themes.
 */
export function AccessibleBadge({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  icon,
  className,
  children,
  ...rest
}: AccessibleBadgeProps) {
  return (
    <span
      className={cn(
        'ui-accessible-badge',
        `ui-accessible-badge--${variant}`,
        size === 'md' && 'ui-accessible-badge--md',
        className
      )}
      {...rest}
    >
      {dot && <span className="ui-accessible-badge-dot" aria-hidden="true" />}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
