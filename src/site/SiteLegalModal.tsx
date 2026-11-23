import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { LegalDocKind, SiteCopy } from './siteContent.ts';

export interface SiteLegalModalProps {
  readonly doc: LegalDocKind | null;
  readonly copy: SiteCopy['legal'];
  readonly onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export default function SiteLegalModal({ doc, copy, onClose }: SiteLegalModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const isOpen = doc !== null;

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation?.();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const card = cardRef.current;
        if (!card) return;
        const focusables = getFocusableElements(card);
        if (focusables.length === 0) {
          e.preventDefault();
          card.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (!card.contains(active) || active === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (!card.contains(active) || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      const savedTrigger = previousFocusRef.current;
      previousFocusRef.current = null;
      if (savedTrigger && savedTrigger.isConnected) {
        savedTrigger.focus();
      }
    };
  }, [isOpen]);

  if (!doc) return null;

  const title = doc === 'privacy' ? copy.privacyTitle : copy.termsTitle;
  const sections = doc === 'privacy' ? copy.privacySections : copy.termsSections;

  return (
    <div
      className="site-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-legal-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={cardRef} className="site-modal-card" tabIndex={-1}>
        <div className="site-modal-head">
          <div>
            <p className="site-modal-meta">{copy.updatedAt}</p>
            <h2 id="site-legal-modal-title" className="site-modal-title">
              {title}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="site-modal-close"
            onClick={onClose}
            aria-label={copy.closeLabel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="site-modal-body">
          {sections.map((section) => (
            <section key={section.heading} className="site-modal-section">
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
