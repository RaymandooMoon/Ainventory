import { isValidElement, type ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RotateCcw } from 'lucide-react';
import { TouchButton } from './TouchButton.tsx';
import { cn } from './utils.ts';
import './uiPrimitives.css';

export interface AsyncEmptyAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

export interface AsyncStateBoundaryProps {
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  emptyAction?: ReactNode | AsyncEmptyAction;
  loadingVariant?: 'skeleton' | 'spinner';
  skeletonCount?: number;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  errorTitle?: string;
  retryLabel?: string;
  lang?: 'ko' | 'en';
  className?: string;
  children?: ReactNode;
}

function isEmptyActionObject(value: unknown): value is AsyncEmptyAction {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isValidElement(value) &&
    'label' in value &&
    'onClick' in value &&
    typeof (value as AsyncEmptyAction).label === 'string' &&
    typeof (value as AsyncEmptyAction).onClick === 'function'
  );
}

/**
 * Standardized boundary rendering Loading, Empty, and Error recovery states
 * with WCAG AA Light/Dark contrast and >= 48x48dp action buttons.
 */
export function AsyncStateBoundary({
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  emptyAction,
  loadingVariant = 'skeleton',
  skeletonCount = 3,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  errorTitle,
  retryLabel,
  lang = 'ko',
  className,
  children,
}: AsyncStateBoundaryProps) {
  const isEn = lang === 'en';

  if (isLoading) {
    const resolvedLoadingText =
      loadingLabel || (isEn ? 'Loading content...' : '데이터를 불러오는 중입니다...');

    if (loadingVariant === 'spinner') {
      return (
        <div
          className={cn('ui-state-box', className)}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="ui-state-icon" aria-hidden="true">
            <Loader2 size={22} className="ui-touch-btn-spinner" />
          </span>
          <p className="ui-state-title">{resolvedLoadingText}</p>
        </div>
      );
    }

    const lineCount = Math.max(1, Math.min(8, skeletonCount));
    return (
      <div
        className={cn('ui-state-box', className)}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={resolvedLoadingText}
      >
        <div className="ui-skeleton-stack">
          {Array.from({ length: lineCount }).map((_, idx) => (
            <div
              key={idx}
              className="ui-skeleton-line"
              style={{ width: idx === lineCount - 1 ? '68%' : '100%' }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : isEn
            ? 'An unexpected error occurred. Please try again.'
            : '일시적인 오류가 발생했습니다. 다시 시도해 주세요.';

    return (
      <div className={cn('ui-state-box ui-state-box--error', className)} role="alert">
        <span className="ui-state-icon" aria-hidden="true">
          <AlertCircle size={22} strokeWidth={2.2} />
        </span>
        <h3 className="ui-state-title">
          {errorTitle || (isEn ? 'Unable to load content' : '문제가 발생했습니다')}
        </h3>
        <p className="ui-state-desc">{errorMessage}</p>
        {onRetry && (
          <div className="ui-state-actions">
            <TouchButton
              variant="destructive"
              onClick={onRetry}
              leftIcon={<RotateCcw size={17} strokeWidth={2.2} />}
            >
              {retryLabel || (isEn ? 'Try again' : '다시 시도')}
            </TouchButton>
          </div>
        )}
      </div>
    );
  }

  if (isEmpty) {
    const renderedEmptyAction = isEmptyActionObject(emptyAction) ? (
      <TouchButton
        variant="primary"
        onClick={emptyAction.onClick}
        leftIcon={emptyAction.icon}
      >
        {emptyAction.label}
      </TouchButton>
    ) : (
      emptyAction
    );

    return (
      <div className={cn('ui-state-box', className)}>
        <span className="ui-state-icon" aria-hidden="true">
          {emptyIcon || <Inbox size={22} strokeWidth={2} />}
        </span>
        <h3 className="ui-state-title">
          {emptyTitle || (isEn ? 'Nothing here yet' : '표시할 항목이 없습니다')}
        </h3>
        <p className="ui-state-desc">
          {emptyDescription ||
            (isEn
              ? 'Add an item or adjust your filters to get started.'
              : '새 항목을 추가하거나 필터 조건을 변경해 주세요.')}
        </p>
        {renderedEmptyAction && <div className="ui-state-actions">{renderedEmptyAction}</div>}
      </div>
    );
  }

  return <>{children}</>;
}
