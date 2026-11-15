import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { cn } from './utils.ts';
import './uiPrimitives.css';

export interface ClearableInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  clearLabel?: string;
  onClear?: () => void;
  leadingIcon?: ReactNode;
  containerClassName?: string;
  lang?: 'ko' | 'en';
}

/**
 * High-contrast input (`min-height >= 48px`, `line-height: 1.5`) with an automatic
 * `48x48px` clear button whenever input length >= 1, retaining focus after clearing.
 */
export const ClearableInput = forwardRef<HTMLInputElement, ClearableInputProps>(
  function ClearableInput(
    {
      id,
      label,
      helperText,
      errorText,
      clearLabel,
      onClear,
      leadingIcon,
      containerClassName,
      className,
      value,
      defaultValue,
      onChange,
      disabled = false,
      readOnly = false,
      lang = 'ko',
      ...rest
    },
    externalRef
  ) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;
    const innerRef = useRef<HTMLInputElement | null>(null);

    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState<string>(() =>
      defaultValue === undefined || defaultValue === null ? '' : String(defaultValue)
    );

    const currentValue = isControlled
      ? value === null
        ? ''
        : String(value)
      : uncontrolledValue;

    const showClear = !disabled && !readOnly && currentValue.length > 0;

    const assignRef = useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof externalRef === 'function') {
          externalRef(node);
        } else if (externalRef) {
          externalRef.current = node;
        }
      },
      [externalRef]
    );

    const handleInputChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        if (!isControlled) {
          setUncontrolledValue(e.target.value);
        }
        onChange?.(e);
      },
      [isControlled, onChange]
    );

    const handleClearClick = useCallback(() => {
      const inputEl = innerRef.current;

      if (!isControlled) {
        setUncontrolledValue('');
      }

      if (inputEl) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        if (valueSetter) {
          valueSetter.call(inputEl, '');
        } else {
          inputEl.value = '';
        }
      }

      if (onClear) {
        onClear();
      } else if (onChange && inputEl) {
        const syntheticEvent = {
          target: inputEl,
          currentTarget: inputEl,
        } as ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }

      if (inputEl) {
        inputEl.focus();
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => {
            inputEl.focus();
          });
        }
      }
    }, [isControlled, onChange, onClear]);

    const describedByParts: string[] = [];
    if (errorText) describedByParts.push(errorId);
    else if (helperText) describedByParts.push(helperId);

    const resolvedClearLabel =
      clearLabel || (lang === 'en' ? 'Clear input' : '입력 내용 전체 지우기');

    return (
      <div className={cn('ui-input-field', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="ui-input-label">
            {label}
          </label>
        )}

        <div
          className={cn(
            'ui-input-shell min-h-12',
            Boolean(errorText) && 'is-invalid',
            disabled && 'is-disabled'
          )}
        >
          {leadingIcon && (
            <span className="ui-input-leading" aria-hidden="true">
              {leadingIcon}
            </span>
          )}

          <input
            ref={assignRef}
            id={inputId}
            disabled={disabled}
            readOnly={readOnly}
            value={isControlled ? currentValue : undefined}
            defaultValue={!isControlled ? defaultValue : undefined}
            onChange={handleInputChange}
            aria-invalid={Boolean(errorText) || undefined}
            aria-describedby={describedByParts.length > 0 ? describedByParts.join(' ') : undefined}
            className={cn(
              'ui-input-control min-h-12 leading-normal',
              Boolean(leadingIcon) && 'has-leading',
              showClear && 'has-clear',
              className
            )}
            {...rest}
          />

          {showClear && (
            <button
              type="button"
              className="ui-input-clear-btn min-h-12 min-w-12"
              aria-label={resolvedClearLabel}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClearClick}
            >
              <span className="ui-input-clear-glyph" aria-hidden="true">
                <X size={14} strokeWidth={2.5} />
              </span>
            </button>
          )}
        </div>

        {errorText ? (
          <p id={errorId} className="ui-input-error" role="alert">
            {errorText}
          </p>
        ) : (
          helperText && (
            <p id={helperId} className="ui-input-helper">
              {helperText}
            </p>
          )
        )}
      </div>
    );
  }
);
