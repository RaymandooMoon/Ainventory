import { useEffect, useRef } from 'react';
import { ArrowRight, ShieldAlert, X } from 'lucide-react';

export interface AccountEmailConflictModalProps {
  open: boolean;
  onClose: () => void;
  onContinueWithEmail: () => void;
  lang?: string;
}

/**
 * Accessible guidance modal shown when Google OAuth encounters an existing account
 * registered with the same email (`ACCOUNT_EMAIL_CONFLICT`).
 *
 * Security rationale: Ainventory never auto-merges social identities by email to
 * prevent pre-hijacking / account takeover. Users sign in with their original
 * credential once and explicitly link Google inside Account Settings.
 */
export default function AccountEmailConflictModal({
  open,
  onClose,
  onContinueWithEmail,
  lang = 'ko',
}: AccountEmailConflictModalProps) {
  const isEn = lang === 'en';
  const modalRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

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
        id="account-email-conflict-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-conflict-modal-title"
        aria-describedby="email-conflict-modal-desc"
        className="atelier-modal-card"
      >
        <div className="atelier-modal-header">
          <div className="atelier-modal-title-group">
            <span className="atelier-modal-badge">
              <ShieldAlert size={12} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 4 }} />
              {isEn ? 'Account Protection' : '계정 보호 안내'}
            </span>
            <h2 id="email-conflict-modal-title" className="atelier-modal-title">
              {isEn ? 'Email Already Registered' : '이미 가입된 이메일 계정입니다'}
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

        <p id="email-conflict-modal-desc" className="atelier-modal-desc">
          {isEn
            ? 'An iNVTRY account with this email already exists via another sign-in method. For account security, accounts are not auto-merged. Please link Google in two quick steps:'
            : '동일한 이메일로 이미 다른 방식으로 가입된 iNVTRY 계정이 있습니다. 계정 도용 방지를 위해 자동 통합되지 않으며, 아래 순서로 안전하게 연결할 수 있습니다.'}
        </p>

        <ol className="atelier-conflict-steps">
          <li className="atelier-conflict-step">
            <span className="atelier-conflict-step-num">01</span>
            <span>
              {isEn
                ? 'Sign in first with your existing email & password.'
                : '기존 이메일 · 비밀번호 방식으로 먼저 로그인해 주세요.'}
            </span>
          </li>
          <li className="atelier-conflict-step">
            <span className="atelier-conflict-step-num">02</span>
            <span>
              {isEn
                ? 'Open Account Settings and tap Connect Google Account.'
                : '계정 설정의 연결된 로그인 계정에서 Google 계정을 연결하세요.'}
            </span>
          </li>
        </ol>

        <div className="atelier-modal-actions">
          <button
            ref={primaryBtnRef}
            id="email-conflict-login-btn"
            type="button"
            className="atelier-primary-btn"
            onClick={() => {
              onClose();
              onContinueWithEmail();
            }}
          >
            <span>{isEn ? 'Sign in with Existing Email' : '기존 이메일로 로그인하기'}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>

          <button type="button" className="atelier-text-btn" onClick={onClose}>
            <span>{isEn ? 'Close' : '닫기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
