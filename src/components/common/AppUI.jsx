import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, FileText, ShieldCheck, Sparkles, X } from 'lucide-react';
import StudioGarmentImage from '../StudioGarmentImage.jsx';
import { HeaderUtilityNav, PageHeaderNav } from '../ui/HeaderNav.tsx';
import { apiFetch, formatKRW } from '../../utils/api.ts';
import { localizeApiMessage, localizeGarmentName, tx } from '../../utils/i18n.ts';
import {
  acknowledgeCameraNotice,
  emitStatusCapsule,
  pushBackHandler,
  setBiometricConsent,
  subscribeStatusCapsule,
  triggerHaptic,
} from '../../utils/nativeBridge.ts';

function isDocumentEnglish(lang) {
  if (lang === 'en') return true;
  if (lang === 'ko') return false;
  return typeof document !== 'undefined' && document.documentElement.lang === 'en';
}

/**
 * Persistent Top-Right Utility Controls rendered on EVERY screen (`Closet`, `Outfits`, `Calendar`, `Stats`):
 * - Optional screen-specific action (`extraActions`)
 * - Optional theme toggle button
 * - 1-tap Profile / Photo Skin-Tone / Body Profile button (`#open-profile-studio-btn`)
 * - Persistent Account Settings button (`#open-account-settings-btn`)
 */
export function TopRightUtilityActions({
  skinProfile,
  lang = 'ko',
  onOpenProfile,
  onOpenAccount,
  theme,
  onToggleTheme,
  extraActions = null,
}) {
  return (
    <HeaderUtilityNav
      skinProfile={skinProfile}
      lang={lang}
      onOpenProfile={onOpenProfile}
      onOpenAccount={onOpenAccount}
      theme={theme}
      onToggleTheme={onToggleTheme}
      extraActions={extraActions}
    />
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <PageHeaderNav
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      actions={actions}
    />
  );
}

export function HorizontalChipRail({ items = [], activeKey, onSelect, ariaLabel }) {
  const resolvedAriaLabel = ariaLabel || (isDocumentEnglish() ? 'Filter options' : '필터 선택');
  return (
    <div className="ui-chip-rail" role="tablist" aria-label={resolvedAriaLabel}>
      {items.map((item) => {
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`chip ${active ? 'active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              onSelect?.(item.key);
            }}
          >
            {item.icon ? <span className="ui-chip-icon">{item.icon}</span> : null}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="ui-chip-count tabular-nums">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function KpiMetricStrip({ items = [] }) {
  return (
    <div className="ui-kpi-strip">
      {items.map((m) => (
        <div key={m.label} className="ui-kpi-card">
          <span className="ui-kpi-label">{m.label}</span>
          <strong className="ui-kpi-value tabular-nums">{m.value}</strong>
          {m.sub && <small className="ui-kpi-sub tabular-nums">{m.sub}</small>}
        </div>
      ))}
    </div>
  );
}

/**
 * Spring Physics Bottom Sheet / Modal with Drag-to-Dismiss, Escape & Hardware Back Stack (Reqs 9.a, 13.a)
 */
export function ResponsiveSheetModal({
  id,
  open,
  onClose,
  title,
  eyebrow,
  actions,
  maxWidth = 720,
  lang = 'ko',
  expandable,
  defaultExpanded = false,
  onExpandedChange,
  children,
  footer,
}) {
  const isSheetExpandable = Boolean(expandable ?? id === 'outfit-mobile-wardrobe-sheet');
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(Boolean(defaultExpanded));
  const [hasEntered, setHasEntered] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const suppressTimerRef = useRef(null);
  const suppressChildTimerRef = useRef(null);
  const dismissTimerRef = useRef(null);
  const enterTimerRef = useRef(null);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isExpandedRef = useRef(Boolean(defaultExpanded));
  const isExpandableRef = useRef(isSheetExpandable);
  const isDismissingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onExpandedChangeRef = useRef(onExpandedChange);
  const suppressBackdropClickRef = useRef(false);
  const suppressChildClickRef = useRef(false);
  const gestureRef = useRef({
    active: false,
    fromHandle: false,
    lockedOut: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    maxDistance: 0,
    scrollEl: null,
  });
  const headingId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  useEffect(() => {
    isExpandableRef.current = isSheetExpandable;
  }, [isSheetExpandable]);

  useEffect(() => {
    if (!open) return undefined;

    const initialExpanded = isExpandableRef.current ? Boolean(defaultExpanded) : false;
    isExpandedRef.current = initialExpanded;
    isDismissingRef.current = false;
    dragYRef.current = 0;
    isDraggingRef.current = false;
    suppressBackdropClickRef.current = false;
    suppressChildClickRef.current = false;
    setIsExpanded(initialExpanded);
    setIsDismissing(false);
    setHasEntered(false);
    setDragY(0);
    setIsDragging(false);

    enterTimerRef.current = setTimeout(() => {
      setHasEntered(true);
      enterTimerRef.current = null;
    }, 340);

    if (typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement;
    }
    const popBack = pushBackHandler(() => {
      onCloseRef.current?.();
      return true;
    });

    const triggerSmoothDismiss = () => {
      if (isDismissingRef.current) return;
      isDismissingRef.current = true;
      setIsDismissing(true);
      triggerHaptic('selection');
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        isDismissingRef.current = false;
        setIsDismissing(false);
        onCloseRef.current?.();
      }, 180);
    };

    const markDragReleaseClickSuppression = () => {
      suppressBackdropClickRef.current = true;
      suppressChildClickRef.current = true;
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = setTimeout(() => {
        suppressBackdropClickRef.current = false;
        suppressTimerRef.current = null;
      }, 60);
      if (suppressChildTimerRef.current) clearTimeout(suppressChildTimerRef.current);
      suppressChildTimerRef.current = setTimeout(() => {
        suppressChildClickRef.current = false;
        suppressChildTimerRef.current = null;
      }, 80);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const readEventPoint = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        return { x: e.clientX, y: e.clientY };
      }
      return null;
    };

    const handleWindowMove = (e) => {
      const g = gestureRef.current;
      if (!g.active || g.lockedOut || isDismissingRef.current) return;
      const pt = readEventPoint(e);
      if (!pt) return;

      const dx = pt.x - g.startX;
      const dy = pt.y - g.startY;
      const dist = Math.hypot(dx, dy);
      if (dist > g.maxDistance) {
        g.maxDistance = dist;
      }

      if (!isDraggingRef.current) {
        if (!g.fromHandle && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          g.lockedOut = true;
          return;
        }

        const passedThreshold = g.fromHandle
          ? Math.abs(dy) >= 6
          : Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.25;

        if (!passedThreshold) return;

        if (!g.fromHandle && g.scrollEl) {
          if (dy > 0 && g.scrollEl.scrollTop > 2) {
            g.lockedOut = true;
            return;
          }
          if (dy < 0 && !(isExpandableRef.current && !isExpandedRef.current)) {
            g.lockedOut = true;
            return;
          }
        }

        if (dy < 0 && !isExpandableRef.current) {
          return;
        }

        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const nextDragY = dy < 0 ? (isExpandableRef.current ? dy : 0) : dy;
      dragYRef.current = nextDragY;
      setDragY(nextDragY);
    };

    const handleWindowEnd = () => {
      const g = gestureRef.current;
      if (!g.active) return;

      const wasDragging = isDraggingRef.current;
      const finalDelta = dragYRef.current;
      const elapsedMs = Math.max(1, Date.now() - g.startTime);
      const velocity = elapsedMs >= 40 ? finalDelta / elapsedMs : 0;

      g.active = false;
      g.lockedOut = false;
      g.scrollEl = null;
      isDraggingRef.current = false;
      dragYRef.current = 0;
      setIsDragging(false);
      setDragY(0);

      if (!wasDragging) return;

      markDragReleaseClickSuppression();

      const canExpand = isExpandableRef.current;
      const currentlyExpanded = isExpandedRef.current;

      // Upward swipe -> expand normal sheet to full wardrobe detent
      if ((finalDelta < -38 || velocity < -0.45) && canExpand && !currentlyExpanded) {
        isExpandedRef.current = true;
        setIsExpanded(true);
        onExpandedChangeRef.current?.(true);
        triggerHaptic('selection');
        return;
      }

      // Downward swipe handling (2-detent aware)
      if (finalDelta > 0) {
        if (canExpand && currentlyExpanded) {
          if (finalDelta > 185 || (velocity >= 0.95 && finalDelta > 60)) {
            triggerSmoothDismiss();
            return;
          }
          if (finalDelta >= 42 && finalDelta <= 185 && velocity < 0.95) {
            isExpandedRef.current = false;
            setIsExpanded(false);
            onExpandedChangeRef.current?.(false);
            triggerHaptic('selection');
          }
          return;
        }

        if (finalDelta > 64 || (velocity >= 0.55 && finalDelta > 32)) {
          triggerSmoothDismiss();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowEnd);
    window.addEventListener('pointercancel', handleWindowEnd);
    window.addEventListener('touchmove', handleWindowMove, { passive: false });
    window.addEventListener('touchend', handleWindowEnd);
    window.addEventListener('touchcancel', handleWindowEnd);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowEnd);
      window.removeEventListener('pointercancel', handleWindowEnd);
      window.removeEventListener('touchmove', handleWindowMove);
      window.removeEventListener('touchend', handleWindowEnd);
      window.removeEventListener('touchcancel', handleWindowEnd);
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = null;
      }
      if (suppressChildTimerRef.current) {
        clearTimeout(suppressChildTimerRef.current);
        suppressChildTimerRef.current = null;
      }
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      if (enterTimerRef.current) {
        clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }
      popBack();
      gestureRef.current.active = false;
      gestureRef.current.scrollEl = null;
      dragYRef.current = 0;
      isDraggingRef.current = false;
      isDismissingRef.current = false;
      suppressBackdropClickRef.current = false;
      suppressChildClickRef.current = false;
      setDragY(0);
      setIsDragging(false);
      setIsDismissing(false);
      const prevEl = previousFocusRef.current;
      if (prevEl && typeof prevEl.focus === 'function' && document.contains(prevEl)) {
        prevEl.focus();
      }
    };
  }, [open, defaultExpanded]);

  if (!open) return null;

  const findScrollableContainer = (targetEl) => {
    if (!targetEl || typeof window === 'undefined') return null;
    const gridScroll = targetEl.closest('.atelier-drawer-grid-scroll');
    if (gridScroll && dialogRef.current?.contains(gridScroll)) {
      return gridScroll;
    }
    const sheetContent = targetEl.closest('.ui-sheet-content');
    if (sheetContent && dialogRef.current?.contains(sheetContent)) {
      const style = window.getComputedStyle(sheetContent);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        sheetContent.scrollHeight > sheetContent.clientHeight + 2
      ) {
        return sheetContent;
      }
    }
    return null;
  };

  const beginSheetGesture = (e, fromHandle) => {
    if (isDismissingRef.current || gestureRef.current.active) return;
    if (e.type === 'pointerdown' && e.pointerType === 'mouse' && e.button !== 0) return;

    const targetEl = e.target instanceof Element ? e.target : null;
    if (!fromHandle && targetEl?.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    const clientX = e.touches?.[0]?.clientX ?? e.clientX ?? 0;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY ?? 0;

    if (fromHandle) {
      e.stopPropagation();
    }

    gestureRef.current = {
      active: true,
      fromHandle,
      lockedOut: false,
      startX: clientX,
      startY: clientY,
      startTime: Date.now(),
      maxDistance: 0,
      scrollEl: fromHandle ? null : findScrollableContainer(targetEl),
    };
  };

  const handleDragZoneClick = (e) => {
    e.stopPropagation();
    if (!isSheetExpandable || suppressChildClickRef.current || isDismissingRef.current) return;
    const next = !isExpandedRef.current;
    isExpandedRef.current = next;
    setIsExpanded(next);
    onExpandedChangeRef.current?.(next);
    triggerHaptic('selection');
  };

  const upwardExpandPx =
    isDragging && dragY < 0 && isSheetExpandable && !isExpanded
      ? Math.min(260, Math.round(Math.abs(dragY) * 0.9))
      : 0;

  let computedTransform;
  if (isDismissing) {
    computedTransform = 'translate3d(0, 105%, 0)';
  } else if (isDragging && dragY > 0) {
    computedTransform = `translate3d(0, ${dragY}px, 0)`;
  } else if (
    isDragging &&
    dragY < 0 &&
    isSheetExpandable &&
    !isExpanded &&
    id !== 'outfit-mobile-wardrobe-sheet'
  ) {
    computedTransform = `translate3d(0, ${Math.max(-24, Math.round(dragY * 0.25))}px, 0)`;
  }

  let computedTransition;
  if (isDismissing) {
    computedTransition = 'transform 0.18s cubic-bezier(0.32, 0.72, 0, 1)';
  } else if (isDragging) {
    computedTransition = 'none';
  }

  const sheetClassName = [
    'modal-box',
    'ui-sheet-box',
    isExpanded ? 'is-expanded' : '',
    hasEntered ? 'is-entered' : '',
    isDragging ? 'is-dragging' : '',
    isDismissing ? 'is-dismissing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const modalMarkup = (
    <div
      className="modal-backdrop ui-sheet-backdrop"
      onClick={() => {
        if (suppressBackdropClickRef.current || isDismissingRef.current) return;
        onCloseRef.current?.();
      }}
    >
      <div
        id={id}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        aria-label={title || eyebrow || tx(lang, '시트 대화상자', 'Sheet Dialog')}
        data-sheet-panel="true"
        data-sheet-expanded={isSheetExpandable ? (isExpanded ? 'true' : 'false') : undefined}
        className={sheetClassName}
        style={{
          maxWidth,
          transform: computedTransform,
          transition: computedTransition,
          '--sheet-drag-expand': upwardExpandPx > 0 ? `${upwardExpandPx}px` : undefined,
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) {
            setHasEntered(true);
          }
        }}
        onPointerDown={(e) => beginSheetGesture(e, false)}
        onTouchStart={(e) => beginSheetGesture(e, false)}
        onClickCapture={(e) => {
          if (suppressChildClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-sheet-handle="true"
          role={isSheetExpandable ? 'button' : undefined}
          tabIndex={isSheetExpandable ? 0 : undefined}
          aria-expanded={isSheetExpandable ? isExpanded : undefined}
          className="ui-sheet-drag-zone"
          onPointerDown={(e) => beginSheetGesture(e, true)}
          onTouchStart={(e) => beginSheetGesture(e, true)}
          onClick={handleDragZoneClick}
          onKeyDown={
            isSheetExpandable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    applyExpandedState(!isExpandedRef.current);
                  }
                }
              : undefined
          }
          aria-label={
            isSheetExpandable
              ? isExpanded
                ? tx(lang, '아래로 드래그하여 축소 또는 닫기', 'Drag down to collapse or close')
                : tx(
                    lang,
                    '위로 드래그하여 확장 · 아래로 드래그하여 닫기',
                    'Swipe up to expand or down to close'
                  )
              : tx(lang, '드래그하여 닫기', 'Drag down to close')
          }
        >
          <div className="ui-sheet-drag-handle" aria-hidden="true" />
        </div>

        {(title || eyebrow || actions) && (
          <div className="modal-header">
            <div style={{ minWidth: 0 }}>
              {eyebrow && (
                <span className="hig-eyebrow" style={{ display: 'block', marginBottom: 4 }}>
                  {eyebrow}
                </span>
              )}
              {title && (
                <h2 id={headingId} className="hig-headline">
                  {title}
                </h2>
              )}
            </div>
            <div className="modal-header-actions">
              {actions}
              <button
                type="button"
                className="icon-btn"
                onClick={() => onCloseRef.current?.()}
                aria-label={tx(lang, '닫기', 'Close')}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
        <div className="ui-sheet-content">{children}</div>
        {footer && <div className="ui-sheet-footer">{footer}</div>}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalMarkup, document.body);
  }
  return modalMarkup;
}

export const BottomSheet = ResponsiveSheetModal;

export function EmptyStateBox({ icon, title, description, action }) {
  return (
    <div className="ui-empty-box hig-fade-in">
      {icon && <div className="ui-empty-icon" style={{ marginBottom: 8 }}>{icon}</div>}
      <h3 className="hig-headline" style={{ marginBottom: 4 }}>{title}</h3>
      {description && (
        <p className="hig-caption" style={{ maxWidth: 380, margin: '0 auto 12px' }}>
          {description}
        </p>
      )}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

/**
 * Dynamic Island Minimal Top Status Capsule (Req 13.b, 14.a)
 */
export function StatusCapsule() {
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let timer = null;
    const unsub = subscribeStatusCapsule((next) => {
      setPayload(next);
      if (timer) clearTimeout(timer);
      if (next?.message) {
        timer = setTimeout(() => setPayload(null), next.durationMs || 2400);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);

  if (!payload?.message) return null;

  return (
    <div className="hig-status-capsule-wrap" role="status" aria-live="polite">
      <div className="hig-status-capsule hig-top-capsule hig-vibrancy-capsule">
        <Check size={13} strokeWidth={2.5} />
        <span>{payload.message}</span>
      </div>
    </div>
  );
}

/**
 * Skeleton Shimmer Placeholders (Req 13.c — Replaces Spinning Loaders)
 */
export function SkeletonShimmer({ height = 140, width = '100%', radius = 16, style = {} }) {
  return (
    <div
      className="hig-skeleton"
      aria-hidden="true"
      style={{ height, width, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonWardrobeGrid({ count = 6, lang }) {
  const isEn = isDocumentEnglish(lang);
  return (
    <div className="hig-cutout-grid" aria-label={isEn ? 'Loading wardrobe' : '옷장 로딩 중'}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="hig-skeleton"
          style={{ aspectRatio: '3 / 4', borderRadius: 16 }}
        />
      ))}
    </div>
  );
}

export function SkeletonBentoGrid({ count = 3, lang }) {
  const isEn = isDocumentEnglish(lang);
  return (
    <div className="hig-bento-grid" aria-label={isEn ? 'Loading insights' : '인사이트 로딩 중'}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="hig-skeleton" style={{ height: 156, borderRadius: 24 }} />
      ))}
    </div>
  );
}

/**
 * Button with Silent Icon Morphing + Micro-Haptics (Req 13.b)
 */
export function MorphActionButton({
  icon,
  label,
  morphedLabel,
  className = 'btn btn-secondary btn-sm',
  onClick,
  disabled = false,
  id,
  lang,
}) {
  const [morphed, setMorphed] = useState(false);
  const resolvedMorphedLabel = morphedLabel || (isDocumentEnglish(lang) ? 'Done' : '완료');

  const handlePress = async (e) => {
    if (disabled) return;
    triggerHaptic('light');
    await onClick?.(e);
    setMorphed(true);
    setTimeout(() => setMorphed(false), 1100);
  };

  return (
    <button
      id={id}
      type="button"
      className={className}
      disabled={disabled}
      onClick={handlePress}
    >
      {morphed ? <Check size={14} strokeWidth={2.5} /> : icon}
      <span>{morphed ? resolvedMorphedLabel : label}</span>
    </button>
  );
}

/**
 * Pre-Permission Rationale Modal for Camera / Photo Library (Req 10.c)
 */
export function PermissionNoticeModal({ open, mode = 'camera', lang, onConfirm, onClose }) {
  const isEn = isDocumentEnglish(lang);
  const resolvedLang = isEn ? 'en' : 'ko';
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      lang={resolvedLang}
      eyebrow="PRIVACY & PERMISSION"
      title={
        mode === 'camera'
          ? isEn
            ? 'Camera & Photo Access'
            : '카메라 및 사진 접근 안내'
          : isEn
            ? 'Photo Library Access'
            : '사진 보관함 접근 안내'
      }
      maxWidth={440}
    >
      <div className="hig-item-detail-body">
        <div className="hig-sheet-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Camera size={22} style={{ flexShrink: 0 }} />
          <p className="hig-body" style={{ fontSize: '0.88rem' }}>
            {isEn
              ? 'Selected or captured photos are used strictly for garment background removal (WebP cutout) and wardrobe registration, and are never shared with third parties without consent.'
              : '선택하거나 촬영한 사진은 의류 배경 제거(WebP 누끼) 및 옷장 등록 용도로만 사용되며, 동의 없이 외부 제3자에게 공유되지 않습니다.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {isEn ? 'Cancel' : '취소'}
          </button>
          <button
            id="confirm-camera-permission-btn"
            type="button"
            className="btn btn-primary"
            onClick={() => {
              acknowledgeCameraNotice();
              triggerHaptic('light');
              onConfirm?.();
            }}
          >
            {isEn ? 'Continue' : '확인 및 계속하기'}
          </button>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}

/**
 * Explicit Local Biometric Processing Notice & Consent Modal (Req 10.c)
 */
export function BiometricConsentModal({ open, lang, onConfirm, onClose }) {
  const [checked, setChecked] = useState(true);
  const isEn = isDocumentEnglish(lang);
  const resolvedLang = isEn ? 'en' : 'ko';

  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      lang={resolvedLang}
      eyebrow="ON-DEVICE FACE PRIVACY"
      title={isEn ? 'On-Device Skin Tone Analysis Consent' : '온디바이스 얼굴 피부톤 분석 동의'}
      maxWidth={460}
    >
      <div className="hig-item-detail-body">
        <div className="hig-sheet-card" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <ShieldCheck size={22} style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="hig-body" style={{ fontSize: '0.86rem' }}>
            <strong>
              {isEn
                ? '100% On-Device Memory Processing (Zero Server Upload)'
                : '100% 기기 내부 메모리 처리 (서버 미전송)'}
            </strong>
            <p className="hig-caption" style={{ marginTop: 6 }}>
              {isEn
                ? 'Facial landmarks (forehead, cheeks, chin) and Lab undertone sampling run strictly inside local browser memory and are discarded immediately. Raw face photos are never uploaded.'
                : '얼굴 랜드마크(이마·양볼·턱) 및 피부 명도·언더톤 추출은 브라우저 내부 온디바이스 WASM 엔진에서만 수행된 뒤 즉시 메모리에서 파기됩니다. 원본 얼굴 사진은 외부 서버로 업로드되지 않습니다.'}
            </p>
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.86rem',
            cursor: 'pointer',
          }}
        >
          <input
            id="biometric-consent-checkbox"
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            {isEn
              ? 'I understand and consent to local on-device facial skin tone analysis.'
              : '기기 내 로컬 얼굴 색상 분석 처리 안내를 확인했으며 동의합니다.'}
          </span>
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {isEn ? 'Cancel' : '취소'}
          </button>
          <button
            id="confirm-biometric-consent-btn"
            type="button"
            className="btn btn-primary"
            disabled={!checked}
            onClick={() => {
              setBiometricConsent(true);
              triggerHaptic('light');
              onConfirm?.();
            }}
          >
            {isEn ? 'Agree & Analyze' : '동의 후 분석 시작'}
          </button>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}

/**
 * App Store / Play Store Privacy Policy & Terms of Service Disclosure Modal (Req 10)
 */
function LegalDisclosureModalInner({ initialDoc = 'privacy', onClose, lang = 'ko' }) {
  const [doc, setDoc] = useState(initialDoc);
  const isEn = lang === 'en';

  return (
    <ResponsiveSheetModal
      open
      onClose={onClose}
      lang={lang}
      eyebrow="LEGAL & PRIVACY"
      title={
        doc === 'terms'
          ? isEn
            ? 'Terms of Service'
            : '서비스 이용약관'
          : isEn
            ? 'Privacy Policy'
            : '개인정보처리방침'
      }
      maxWidth={540}
    >
      <div className="hig-item-detail-body">
        <div className="hig-grid-2">
          <button
            type="button"
            className={`chip ${doc === 'privacy' ? 'active' : ''}`}
            onClick={() => setDoc('privacy')}
          >
            {isEn ? 'Privacy Policy' : '개인정보처리방침'}
          </button>
          <button
            type="button"
            className={`chip ${doc === 'terms' ? 'active' : ''}`}
            onClick={() => setDoc('terms')}
          >
            {isEn ? 'Terms of Service' : '서비스 이용약관'}
          </button>
        </div>

        {doc === 'privacy' ? (
          <div className="hig-sheet-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} />
              <strong className="hig-body">
                {isEn
                  ? '1. Collected Items & Purpose'
                  : '1. 수집하는 개인정보 항목 및 이용 목적'}
              </strong>
            </div>
            <p className="hig-caption">
              {isEn
                ? 'We process account identifiers (email/username), body sizing profile, and cropped WebP garment cutouts solely to provide digital wardrobe management, 3D fitting, and outfit recommendations.'
                : '계정 식별 정보(이메일·아이디), 체형 치수 설정값 및 사용자가 등록한 의류 크롭(WebP) 이미지는 디지털 옷장 관리, 3D 마네킹 착장 및 날씨 맞춤 코디 추천 제공 목적으로만 처리됩니다.'}
            </p>
            <strong className="hig-body">
              {isEn
                ? '2. On-Device Face Analysis (Zero Server Upload)'
                : '2. 온디바이스 얼굴 피부톤 진단 (외부 서버 미전송)'}
            </strong>
            <p className="hig-caption">
              {isEn
                ? 'Personal color face landmark & Lab undertone analysis runs 100% locally inside on-device WASM memory after explicit consent and is discarded immediately without server upload.'
                : '퍼스널컬러 진단을 위한 얼굴 랜드마크 및 Lab 언더톤 분석은 명시적 동의 후 100% 기기 내 브라우저 WASM 메모리에서만 수행되며, 원본 얼굴 사진은 서버로 전송·저장되지 않고 즉시 파기됩니다.'}
            </p>
            <strong className="hig-body">
              {isEn
                ? '3. Offline Cache & Immediate Account Deletion'
                : '3. 오프라인 캐시 및 계정·데이터 즉시 영구 파기'}
            </strong>
            <p className="hig-caption">
              {isEn
                ? 'Offline cache in IndexedDB is cleared on logout, and requesting account deletion in Settings permanently erases all account, garment, outfit, calendar, and local cache records immediately.'
                : '오프라인 조회용 IndexedDB 캐시는 로그아웃 시 즉시 정리되며, 계정 설정에서 회원 탈퇴 실행 시 계정·의류·룩북·캘린더·로컬 캐시 데이터가 유예 기간 없이 즉시 영구 파기됩니다.'}
            </p>
          </div>
        ) : (
          <div className="hig-sheet-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} />
              <strong className="hig-body">
                {isEn ? '1. Service Scope & Guest Trial' : '1. 서비스 제공 범위 및 샘플 옷장 체험'}
              </strong>
            </div>
            <p className="hig-caption">
              {isEn
                ? 'A inventory provides 3D digital wardrobe management, weather styling, shopping duplicate checks, and a login-free sample closet demo.'
                : 'A inventory는 3D 디지털 옷장 관리, 기상 연동 코디 추천, 오프라인 쇼핑 중복 판독 및 비로그인 샘플 옷장 체험 기능을 제공합니다.'}
            </p>
            <strong className="hig-body">
              {isEn ? '2. User Content Ownership' : '2. 사용자 콘텐츠 권리 및 책임'}
            </strong>
            <p className="hig-caption">
              {isEn
                ? 'Users retain full rights to garment photos uploaded to their closet and may export schedules (.ics) or delete items and accounts at any time.'
                : '사용자가 등록한 의류 사진 및 코디 기록에 대한 권리는 사용자에게 귀속되며, 언제든 개별 삭제, 캘린더(.ics) 내보내기 또는 계정 영구 삭제를 수행할 수 있습니다.'}
            </p>
          </div>
        )}

        <button type="button" className="btn btn-primary btn-full" onClick={onClose}>
          {isEn ? 'Close' : '확인'}
        </button>
      </div>
    </ResponsiveSheetModal>
  );
}

/**
 * App Store / Play Store Privacy Policy & Terms of Service Disclosure Modal (Req 10)
 */
export function LegalDisclosureModal({ open, initialDoc = 'privacy', onClose, lang = 'ko' }) {
  if (!open) return null;
  return (
    <LegalDisclosureModalInner
      key={initialDoc}
      initialDoc={initialDoc}
      onClose={onClose}
      lang={lang}
    />
  );
}

function SampleImportSheetInner({ onClose, targetOwner, onImported, lang }) {
  const [samples, setSamples] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const isEn = isDocumentEnglish(lang);
  const resolvedLang = isEn ? 'en' : 'ko';

  useEffect(() => {
    let active = true;
    apiFetch('/sample-catalog')
      .then((res) => {
        if (!active) return;
        const list = res.samples || [];
        setSamples(list);
        setSelectedKeys(list.slice(0, 5).map((item) => item.key || item.sampleKey));
      })
      .catch((err) => {
        if (active) {
          emitStatusCapsule(
            localizeApiMessage(err?.message, resolvedLang) ||
              tx(resolvedLang, '샘플 카탈로그를 불러오지 못했습니다', 'Failed to load sample catalog')
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resolvedLang]);

  const toggleKey = (key) => {
    triggerHaptic('selection');
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleImport = async () => {
    if (selectedKeys.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch('/garments/import-samples', {
        method: 'POST',
        body: JSON.stringify({
          sample_keys: selectedKeys,
          closet_owner: targetOwner,
        }),
      });
      triggerHaptic('medium');
      onImported?.(res.count ?? res.importedCount ?? selectedKeys.length);
      onClose?.();
    } catch (err) {
      emitStatusCapsule(
        localizeApiMessage(err?.message, resolvedLang) ||
          tx(resolvedLang, '샘플 아이템 가져오기에 실패했습니다', 'Failed to import sample items')
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <ResponsiveSheetModal
      open
      onClose={onClose}
      lang={resolvedLang}
      eyebrow="SAMPLE CAPSULE IMPORT"
      title={tx(resolvedLang, '샘플 아이템 선택 가져오기', 'Import Sample Closet Items')}
      maxWidth={680}
    >
      {loading ? (
        <SkeletonWardrobeGrid count={6} lang={resolvedLang} />
      ) : (
        <div className="hig-item-detail-body">
          <div className="hig-sheet-row-between">
            <span className="hig-caption tabular-nums">
              {tx(
                resolvedLang,
                `원하는 아이템만 내 옷장으로 선택 복제할 수 있습니다 (${selectedKeys.length}개 선택됨)`,
                `Select curated items to clone into your closet (${selectedKeys.length} selected)`
              )}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setSelectedKeys(
                  selectedKeys.length === samples.length
                    ? []
                    : samples.map((s) => s.key || s.sampleKey)
                )
              }
            >
              {selectedKeys.length === samples.length
                ? tx(resolvedLang, '전체 해제', 'Deselect All')
                : tx(resolvedLang, '전체 선택', 'Select All')}
            </button>
          </div>

          <div className="sample-import-grid">
            {samples.map((item) => {
              const itemKey = item.key || item.sampleKey;
              const checked = selectedKeys.includes(itemKey);
              const displayName = localizeGarmentName(item.name, resolvedLang);
              return (
                <button
                  key={itemKey}
                  type="button"
                  className={`sample-import-card ${checked ? 'is-selected' : ''}`}
                  onClick={() => toggleKey(itemKey)}
                >
                  <div className="sample-import-thumb">
                    <StudioGarmentImage
                      item={item}
                      alt={displayName}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                  <div className="hig-garment-name">{displayName}</div>
                  <div className="hig-caption tabular-nums">{formatKRW(item.price)}</div>
                  {checked && (
                    <span className="sample-import-check">
                      <Check size={13} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {tx(resolvedLang, '취소', 'Cancel')}
            </button>
            <button
              id="confirm-import-samples-btn"
              type="button"
              className="btn btn-primary"
              disabled={importing || selectedKeys.length === 0}
              onClick={handleImport}
            >
              <Sparkles size={15} />
              <span>
                {importing
                  ? tx(resolvedLang, '가져오는 중...', 'Importing...')
                  : tx(
                      resolvedLang,
                      `${selectedKeys.length}개 아이템 내 옷장에 담기`,
                      `Import ${selectedKeys.length} Items`
                    )}
              </span>
            </button>
          </div>
        </div>
      )}
    </ResponsiveSheetModal>
  );
}

/**
 * Selective Sample Closet Import Sheet for Logged-in Users (Req 8.a)
 */
export function SampleImportSheet({ open, onClose, targetOwner, onImported, lang }) {
  if (!open) return null;
  return (
    <SampleImportSheetInner
      onClose={onClose}
      targetOwner={targetOwner}
      onImported={onImported}
      lang={lang}
    />
  );
}
