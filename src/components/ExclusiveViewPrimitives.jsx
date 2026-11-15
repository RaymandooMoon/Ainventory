import { Component, useRef } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { localizeApiMessage, tx } from '../utils/i18n.ts';

/**
 * Reusable accessible clearable input/textarea wrapper for Closet, Calendar & Stats.
 * Guarantees a minimum 48x48px Clear ('X') button on the right whenever value is non-empty.
 */
export function ClearableField({
  as = 'input',
  value = '',
  onChange,
  onClear,
  clearLabel,
  leadingIcon = null,
  wrapperClassName = '',
  className = '',
  disabled = false,
  ...rest
}) {
  const fieldRef = useRef(null);
  const strValue = value === null || value === undefined ? '' : String(value);
  const hasValue = strValue.length > 0;
  const isTextarea = as === 'textarea';

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange({ target: { value: '' }, currentTarget: { value: '' } });
    }
    requestAnimationFrame(() => {
      fieldRef.current?.focus();
    });
  };

  const mergedClassName = [
    className,
    'ux-field-control',
    hasValue ? 'has-clear-btn' : '',
    leadingIcon ? 'has-leading-icon' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={[
        'ux-clearable-wrap',
        isTextarea ? 'is-textarea' : '',
        wrapperClassName,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {leadingIcon ? (
        <span className="ux-field-leading-icon" aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}

      {isTextarea ? (
        <textarea
          ref={fieldRef}
          value={strValue}
          onChange={onChange}
          disabled={disabled}
          className={mergedClassName}
          {...rest}
        />
      ) : (
        <input
          ref={fieldRef}
          value={strValue}
          onChange={onChange}
          disabled={disabled}
          className={mergedClassName}
          {...rest}
        />
      )}

      {hasValue && !disabled && (
        <button
          type="button"
          className={`ux-clear-btn ${isTextarea ? 'is-textarea' : ''}`}
          onClick={handleClear}
          aria-label={clearLabel || 'Clear input'}
          title={clearLabel || 'Clear input'}
          data-clear-for={rest.id || undefined}
        >
          <X size={17} strokeWidth={2.3} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * High-contrast accessible Error Card (>= 48x48px Retry recovery CTA)
 * shared exclusively across Closet, Calendar & Stats.
 */
export function ExclusiveErrorCard({
  lang = 'ko',
  title,
  message,
  onRetry,
  retrying = false,
  compact = false,
}) {
  const safeMsg =
    localizeApiMessage(message, lang) ||
    tx(
      lang,
      '일시적인 데이터 불러오기 오류가 발생했습니다. 네트워크나 저장 상태를 확인한 뒤 다시 시도해 주세요.',
      'A temporary loading error occurred. Please check your connection or storage and try again.'
    );

  return (
    <div
      className={`ux-state-card is-error ${compact ? 'is-compact' : ''}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="ux-state-icon-badge is-error" aria-hidden="true">
        <AlertTriangle size={22} strokeWidth={2.2} />
      </div>
      <div className="ux-state-copy">
        <h3 className="ux-state-title">
          {title || tx(lang, '화면을 불러오지 못했습니다', 'Unable to Load Content')}
        </h3>
        <p className="ux-state-desc">{safeMsg}</p>
      </div>
      {onRetry && (
        <div className="ux-state-actions">
          <button
            type="button"
            className="ux-state-cta-btn is-primary"
            onClick={onRetry}
            disabled={retrying}
          >
            <RotateCcw size={17} strokeWidth={2.2} aria-hidden="true" />
            <span>
              {retrying
                ? tx(lang, '다시 불러오는 중...', 'Retrying...')
                : tx(lang, '다시 시도', 'Try Again')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Runtime / Render / Parsing Crash Boundary for Closet, Calendar & Stats screens.
 */
export class ExclusiveErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || ''),
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const lang = this.props.lang || 'ko';
      return (
        <section
          className={`hig-screen-container ${this.props.screenClassName || ''}`}
          aria-label={this.props.screenLabel || 'Error Recovery'}
        >
          <ExclusiveErrorCard
            lang={lang}
            title={
              this.props.errorTitle ||
              tx(lang, '화면 표시 중 문제가 발생했습니다', 'Something Went Wrong')
            }
            message={this.state.errorMessage}
            onRetry={this.handleReset}
          />
        </section>
      );
    }
    return this.props.children;
  }
}
