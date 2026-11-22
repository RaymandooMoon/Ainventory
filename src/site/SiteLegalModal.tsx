import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { LegalDocKind, SiteCopy } from './siteContent.ts';

export interface SiteLegalModalProps {
  readonly doc: LegalDocKind | null;
  readonly copy: SiteCopy['legal'];
  readonly onClose: () => void;
}

export default function SiteLegalModal({ doc, copy, onClose }: SiteLegalModalProps) {
  useEffect(() => {
    if (!doc) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc, onClose]);

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
      <div className="site-modal-card">
        <div className="site-modal-head">
          <div>
            <p className="site-modal-meta">{copy.updatedAt}</p>
            <h2 id="site-legal-modal-title" className="site-modal-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="site-modal-close"
            onClick={onClose}
            aria-label={copy.closeLabel}
          >
            <X size={18} />
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
