import type { KeyboardEvent } from 'react';
import { triggerHaptic } from '../../utils/nativeBridge.ts';

/**
 * Shared WAI-ARIA WCAG 2.2 keyboard arrow navigation helper for HUD tablists.
 * Supports ArrowLeft / ArrowRight / ArrowUp / ArrowDown / Home / End with roving focus.
 */
export function handleTablistArrows<T extends string>(
  e: KeyboardEvent<HTMLDivElement>,
  ids: readonly T[],
  currentId: T,
  idPrefix: string,
  onSelect: (id: T) => void
): void {
  const idx = ids.indexOf(currentId);
  if (idx < 0 || ids.length === 0) return;

  let nextIdx = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextIdx = (idx + 1) % ids.length;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    nextIdx = (idx - 1 + ids.length) % ids.length;
  } else if (e.key === 'Home') {
    nextIdx = 0;
  } else if (e.key === 'End') {
    nextIdx = ids.length - 1;
  }

  if (nextIdx >= 0) {
    e.preventDefault();
    const target = ids[nextIdx];
    triggerHaptic('selection');
    onSelect(target);
    document.getElementById(`${idPrefix}-${target}`)?.focus();
  }
}
