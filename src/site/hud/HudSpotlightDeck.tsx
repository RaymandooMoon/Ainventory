import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import { SiteIcon, type SiteIconKey } from '../SiteIcon.tsx';

export type SpotlightTone = 'mono' | 'gold' | 'live' | 'todo' | 'hybrid';

export interface HudSpotlightItem {
  readonly id: string;
  readonly icon?: SiteIconKey;
  readonly prefix?: string;
  readonly prefixTone?: SpotlightTone;
  readonly title: string;
  readonly badge?: string;
  readonly badgeTone?: SpotlightTone;
  readonly body: ReactNode;
}

export interface HudSpotlightDeckProps {
  readonly items: readonly HudSpotlightItem[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
  readonly ariaLabel: string;
  readonly scrollToTopOnSelect?: boolean;
}

function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderToneBadge(text: string, tone: SpotlightTone | undefined, kind: 'prefix' | 'badge') {
  if (tone === 'live' || tone === 'todo' || tone === 'hybrid') {
    return <span className={`hud-status-pill is-${tone}`}>{text}</span>;
  }
  if (tone === 'mono') {
    return <span className="hud-mono-num">{text}</span>;
  }
  if (kind === 'badge') {
    return <span className="hud-spot-metric">{text}</span>;
  }
  return <span className="hud-mono-num">{text}</span>;
}

/**
 * Reusable FLIP-animated expanding spotlight card deck.
 * - Tapping any collapsed card smoothly glides it upward to the top slot while
 *   expanding its content body, and smoothly glides other cards down & collapses them.
 * - Uses a non-nested <div class="hud-spot-card"> + <button> header structure so
 *   expanded card bodies can safely host interactive controls (GPS sync, node pills, etc.).
 */
export function HudSpotlightDeck({
  items,
  activeId,
  onSelect,
  ariaLabel,
  scrollToTopOnSelect = true,
}: HudSpotlightDeckProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevTopsRef = useRef<Map<string, number>>(new Map());
  const cleanupTimersRef = useRef<number[]>([]);
  const lastActiveRef = useRef<string>(activeId);

  const orderedItems = useMemo<readonly HudSpotlightItem[]>(() => {
    const activeItem = items.find((item) => item.id === activeId);
    if (!activeItem) return items;
    return [activeItem, ...items.filter((item) => item.id !== activeId)];
  }, [items, activeId]);

  const orderedIdsKey = orderedItems.map((i) => i.id).join('|');

  useLayoutEffect(() => {
    const prevTops = prevTopsRef.current;
    const nextTops = new Map<string, number>();
    const listTop = listRef.current?.getBoundingClientRect().top ?? 0;

    for (const [id, el] of itemRefs.current.entries()) {
      nextTops.set(id, el.getBoundingClientRect().top - listTop);
    }

    const activeChanged = lastActiveRef.current !== activeId;
    lastActiveRef.current = activeId;

    if (activeChanged && prevTops.size > 0 && !isReducedMotion()) {
      for (const timer of cleanupTimersRef.current) {
        window.clearTimeout(timer);
      }
      cleanupTimersRef.current = [];

      const animatedEls: HTMLDivElement[] = [];

      for (const [id, el] of itemRefs.current.entries()) {
        const prevTop = prevTops.get(id);
        const nextTop = nextTops.get(id);
        if (prevTop === undefined || nextTop === undefined) continue;
        const deltaY = prevTop - nextTop;
        if (Math.abs(deltaY) < 1) continue;

        el.style.transition = 'none';
        el.style.transform = `translate3d(0, ${deltaY}px, 0)`;
        el.style.zIndex = id === activeId ? '4' : '1';
        animatedEls.push(el);
      }

      if (animatedEls.length > 0 && listRef.current) {
        // Flush layout once so the browser commits the inverted start positions
        void listRef.current.offsetHeight;

        for (const el of animatedEls) {
          el.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
          el.style.transform = 'translate3d(0, 0, 0)';
        }

        const timerId = window.setTimeout(() => {
          for (const el of animatedEls) {
            el.style.transition = '';
            el.style.transform = '';
            el.style.zIndex = '';
          }
          // Refresh resting local positions after glide finishes
          const settledListTop = listRef.current?.getBoundingClientRect().top ?? 0;
          const settled = new Map<string, number>();
          for (const [id, el] of itemRefs.current.entries()) {
            settled.set(id, el.getBoundingClientRect().top - settledListTop);
          }
          prevTopsRef.current = settled;
        }, 440);
        cleanupTimersRef.current.push(timerId);
      }
      if (scrollToTopOnSelect && listRef.current) {
        const scrollHost = listRef.current.closest('.site-hud-scroll');
        if (scrollHost && scrollHost.scrollTop > 20) {
          scrollHost.scrollTo({
            top: 0,
            behavior: isReducedMotion() ? 'auto' : 'smooth',
          });
        }
      }
    }

    prevTopsRef.current = nextTops;
  }, [activeId, orderedIdsKey, scrollToTopOnSelect]);

  useEffect(() => {
    return () => {
      for (const timer of cleanupTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const handleCardSelect = (id: string) => {
    // Capture exact live local positions right before reordering (scroll-invariant)
    const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
    const snapshot = new Map<string, number>();
    for (const [itemId, el] of itemRefs.current.entries()) {
      snapshot.set(itemId, el.getBoundingClientRect().top - listTop);
    }
    prevTopsRef.current = snapshot;

    triggerHaptic('selection');
    onSelect(id);

    if (scrollToTopOnSelect && listRef.current) {
      const scrollHost = listRef.current.closest('.site-hud-scroll');
      if (scrollHost && scrollHost.scrollTop > 24) {
        scrollHost.scrollTo({
          top: 0,
          behavior: isReducedMotion() ? 'auto' : 'smooth',
        });
      }
    }
  };

  return (
    <div ref={listRef} className="hud-spot-deck" role="region" aria-label={ariaLabel}>
      {orderedItems.map((item) => {
        const isActive = item.id === activeId;
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) {
                itemRefs.current.set(item.id, el);
              } else {
                itemRefs.current.delete(item.id);
              }
            }}
            className={`hud-spot-card ${isActive ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className="hud-spot-trigger"
              aria-expanded={isActive}
              onClick={() => handleCardSelect(item.id)}
            >
              <span className="hud-spot-lead">
                {item.prefix && renderToneBadge(item.prefix, item.prefixTone, 'prefix')}
                {item.icon && (
                  <span className="hud-icon-badge">
                    <SiteIcon name={item.icon} size={14} />
                  </span>
                )}
                <strong className="hud-spot-title">{item.title}</strong>
              </span>

              <span className="hud-spot-trail">
                {item.badge && renderToneBadge(item.badge, item.badgeTone, 'badge')}
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={`hud-spot-chevron ${isActive ? 'is-open' : ''}`}
                />
              </span>
            </button>

            <div className="hud-spot-body-wrap" aria-hidden={!isActive}>
              <div className="hud-spot-body-inner">
                <div className="hud-spot-body">{item.body}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
