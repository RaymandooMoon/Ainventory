import { useCallback, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './utils.ts';
import './uiPrimitives.css';

export const MAX_INLINE_OPTIONS = 5;

export interface InlineOptionItem<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface InlineOptionGroupProps<T extends string = string> {
  options: ReadonlyArray<InlineOptionItem<T>>;
  value: T;
  onChange: (nextValue: T) => void;
  ariaLabel?: string;
  orientation?: 'horizontal' | 'vertical';
  lang?: 'ko' | 'en';
  className?: string;
}

/**
 * Direct-exposure inline option selector replacing dropdowns for <= 5 choices.
 * Active state combines contrast + `ring-2`/thick border + check badge + bottom accent bar.
 */
export function InlineOptionGroup<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  orientation = 'horizontal',
  lang = 'ko',
  className,
}: InlineOptionGroupProps<T>) {
  const visibleOptions = options.slice(0, MAX_INLINE_OPTIONS);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowUp'
      ) {
        return;
      }
      e.preventDefault();

      const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const total = visibleOptions.length;
      if (total === 0) return;

      for (let step = 1; step <= total; step += 1) {
        const candidateIdx = (currentIndex + direction * step + total) % total;
        const candidate = visibleOptions[candidateIdx];
        if (candidate && !candidate.disabled) {
          onChange(candidate.value);
          const groupEl = e.currentTarget.closest('[role="radiogroup"]');
          const nextBtn = groupEl?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[candidateIdx];
          nextBtn?.focus();
          break;
        }
      }
    },
    [onChange, visibleOptions]
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel || (lang === 'en' ? 'Select an option' : '옵션 선택')}
      className={cn(
        'ui-inline-option-group gap-2',
        orientation === 'vertical' && 'ui-inline-option-group--vertical',
        className
      )}
    >
      {visibleOptions.map((option, idx) => {
        const isSelected = option.value === value;
        const tabFocusable = isSelected || (!visibleOptions.some((o) => o.value === value) && idx === 0);

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled}
            tabIndex={tabFocusable ? 0 : -1}
            data-selected={isSelected ? 'true' : 'false'}
            className={cn(
              'ui-inline-option-btn min-h-12 min-w-12',
              isSelected && 'is-selected ring-2'
            )}
            onClick={() => {
              if (!option.disabled) onChange(option.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            <span className="ui-inline-option-row">
              <span className="ui-inline-option-main">
                {option.icon && <span aria-hidden="true">{option.icon}</span>}
                <span>{option.label}</span>
              </span>
              {isSelected && (
                <span className="ui-inline-option-check" aria-hidden="true">
                  <Check size={13} strokeWidth={2.75} />
                </span>
              )}
            </span>

            {option.description && (
              <span className="ui-inline-option-desc">{option.description}</span>
            )}

            {isSelected && <span className="ui-inline-option-bar" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
