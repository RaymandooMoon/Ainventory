import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './utils.ts';
import './uiPrimitives.css';

export type TouchButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type TouchButtonSize = 'md' | 'lg' | 'icon';

export interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TouchButtonVariant;
  size?: TouchButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/**
 * Accessible touch-first button enforcing >= 48x48dp hit targets and WCAG AA Light/Dark contrast.
 */
export const TouchButton = forwardRef<HTMLButtonElement, TouchButtonProps>(function TouchButton(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    leftIcon,
    rightIcon,
    disabled = false,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref
) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'ui-touch-btn min-h-12 min-w-12',
        `ui-touch-btn--${variant}`,
        size !== 'md' && `ui-touch-btn--${size}`,
        fullWidth && 'ui-touch-btn--full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={18} strokeWidth={2.2} className="ui-touch-btn-spinner" aria-hidden="true" />
      ) : (
        leftIcon && <span aria-hidden="true">{leftIcon}</span>
      )}
      {children}
      {!loading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </button>
  );
});

export interface TouchButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Flex group enforcing >= 8px (`gap-2`) separation between adjacent 48x48dp TouchButtons.
 */
export function TouchButtonGroup({ className, children, ...rest }: TouchButtonGroupProps) {
  return (
    <div className={cn('ui-touch-btn-group gap-2', className)} {...rest}>
      {children}
    </div>
  );
}
