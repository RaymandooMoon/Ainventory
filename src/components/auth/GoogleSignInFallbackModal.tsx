import { useEffect, useRef } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';

export interface GoogleSignInFallbackModalProps {
  open: boolean;
  onClose: () => void;
  onSampleDemo: () => void;
  onContinueWithEmail: () => void;
  lang?: string;
}

/**
 * Non-blocking, accessible modal shown when Google Sign-In is invoked
 * but not configured in the active deployment environment (e.g., GitHub Pages).
 *
 * Requirements:
 * - Natural Korean copy (keeps ko/en toggle)
 * - Focus trapped, Esc key closes
 * - Non-blocking options: '샘플 옷장으로 계속' (primary CTA), '이메일로 로그인', '닫기'
 * - Touch targets >= 48dp, 8pt spacing
 */
export default function GoogleSignInFallbackModal({
  open,
  onClose,
  onSampleDemo,
  onContinueWithEmail,
  lang = 'ko',
}: GoogleSignInFallbackModalProps) {
  const isEn = lang === 'en';
  const modalRef = useRef<HTMLDivElement>(null);
  const sampleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus primary CTA when opened
    const timer = setTimeout(() => {
      sampleBtnRef.current?.focus();
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Simple focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="atelier-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-fallback-title"
        aria-describedby="google-fallback-desc"
        className="atelier-modal-card"
      >
        <div className="atelier-modal-header">
          <div className="atelier-modal-title-group">
            <span className="atelier-modal-badge">
              {isEn ? 'Google Account' : 'Google 계정 안내'}
            </span>
            <h2 id="google-fallback-title" className="atelier-modal-title">
              {isEn ? 'Google Sign-In Preview' : 'Google 로그인 준비 중'}
            </h2>
          </div>
          <button
            type="button"
            className="atelier-modal-close-btn"
            aria-label={isEn ? 'Close modal' : '창 닫기'}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p id="google-fallback-desc" className="atelier-modal-desc">
          {isEn
            ? 'Google Sign-In is not connected to this static demo build. You can immediately experience all 3D VTON, capsule wardrobe, and AI styling features using the Sample Closet or continue with your email account.'
            : '현재 데모 버전에서는 Google 로그인이 아직 지원되지 않습니다. 샘플 옷장 체험으로 3D 가상 피팅과 캡슐 옷장의 모든 기능을 바로 둘러보시거나, 이메일 계정으로 로그인해 주세요.'}
        </p>

        <div className="atelier-modal-actions">
          <button
            ref={sampleBtnRef}
            id="google-fallback-sample-btn"
            type="button"
            className="atelier-primary-btn"
            onClick={() => {
              onClose();
              onSampleDemo();
            }}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>{isEn ? 'Continue with Sample Closet' : '샘플 옷장으로 계속'}</span>
          </button>

          <button
            id="google-fallback-email-btn"
            type="button"
            className="atelier-secondary-btn"
            onClick={() => {
              onClose();
              onContinueWithEmail();
            }}
          >
            <span>{isEn ? 'Sign in with Email / ID' : '이메일 또는 아이디로 로그인'}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="atelier-text-btn"
            onClick={onClose}
          >
            <span>{isEn ? 'Cancel' : '닫기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
