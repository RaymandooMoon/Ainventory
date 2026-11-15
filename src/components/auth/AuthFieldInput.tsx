import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes, InputHTMLAttributes } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

export interface AuthFieldInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  id: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  lang?: string;
  errorText?: string;
  clearable?: boolean;
  tabular?: boolean;
  unitSuffix?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
}

const AuthFieldInput = forwardRef<HTMLInputElement, AuthFieldInputProps>(function AuthFieldInput(
  {
    id,
    type = 'text',
    value,
    onValueChange,
    lang = 'ko',
    errorText,
    clearable = true,
    tabular = false,
    unitSuffix,
    disabled = false,
    className = '',
    ...rest
  },
  forwardedRef
) {
  const isEn = lang === 'en';
  const isPasswordField = type === 'password';
  const [revealPassword, setRevealPassword] = useState(false);
  const innerRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

  const showClearBtn = Boolean(clearable && !unitSuffix && !disabled && value.length > 0);
  const showPasswordToggle = isPasswordField;
  const actionCount = (showClearBtn ? 1 : 0) + (showPasswordToggle ? 1 : 0);

  const resolvedType = isPasswordField ? (revealPassword ? 'text' : 'password') : type;
  const errorId = errorText ? `${id}-error` : undefined;

  const inputClasses = [
    'atelier-input',
    actionCount === 1 ? 'has-one-action' : '',
    actionCount >= 2 ? 'has-two-actions' : '',
    unitSuffix ? 'has-unit' : '',
    tabular ? 'is-tabular' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="atelier-field-block">
      <div className="atelier-input-shell">
        <input
          {...rest}
          ref={innerRef}
          id={id}
          type={resolvedType}
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(errorText)}
          aria-describedby={errorId}
          className={inputClasses}
          onChange={(e) => onValueChange(e.target.value)}
        />

        {unitSuffix && (
          <span className="atelier-unit-suffix" aria-hidden="true">
            {unitSuffix}
          </span>
        )}

        {actionCount > 0 && (
          <div className="atelier-input-actions">
            {showClearBtn && (
              <button
                type="button"
                className="atelier-icon-action-btn"
                aria-label={isEn ? 'Clear input' : '입력 지우기'}
                title={isEn ? 'Clear input' : '입력 지우기'}
                onClick={() => {
                  onValueChange('');
                  innerRef.current?.focus();
                }}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            )}

            {showPasswordToggle && (
              <button
                type="button"
                className="atelier-icon-action-btn"
                aria-label={
                  revealPassword
                    ? isEn
                      ? 'Hide password'
                      : '비밀번호 숨기기'
                    : isEn
                      ? 'Show password'
                      : '비밀번호 표시'
                }
                title={
                  revealPassword
                    ? isEn
                      ? 'Hide password'
                      : '비밀번호 숨기기'
                    : isEn
                      ? 'Show password'
                      : '비밀번호 표시'
                }
                aria-pressed={revealPassword}
                onClick={() => setRevealPassword((prev) => !prev)}
              >
                {revealPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            )}
          </div>
        )}
      </div>

      {errorText && (
        <p id={errorId} className="atelier-field-error">
          {errorText}
        </p>
      )}
    </div>
  );
});

export default AuthFieldInput;
