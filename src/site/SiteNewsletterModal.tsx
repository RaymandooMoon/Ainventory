import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Loader2, Mail, ShieldCheck, X } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  clearStoredNewsletterSubscription,
  normalizeClientEmail,
  readStoredNewsletterSubscription,
  subscribeToNewsletter,
  syncOfflineNewsletterSubscription,
  unsubscribeFromNewsletter,
  type NewsletterSource,
  type StoredNewsletterSubscription,
} from './newsletterClient.ts';
import { SITE_META, type SiteCopy, type SiteLang } from './siteContent.ts';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export interface SiteNewsletterFormProps {
  readonly copy: SiteCopy['newsletter'];
  readonly lang: SiteLang;
  readonly source: NewsletterSource;
  readonly variant?: 'modal' | 'inline';
  readonly autoFocusEmail?: boolean;
  readonly onDone?: () => void;
}

export function SiteNewsletterForm({
  copy,
  lang,
  source,
  variant = 'modal',
  autoFocusEmail = false,
  onDone,
}: SiteNewsletterFormProps) {
  const emailId = useId();
  const consentId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoSyncedEmailRef = useRef<string | null>(null);

  const [savedSub, setSavedSub] = useState<StoredNewsletterSubscription | null>(() =>
    readStoredNewsletterSubscription()
  );
  const [email, setEmail] = useState<string>('');
  const [consent, setConsent] = useState<boolean>(true);
  const [honeypot, setHoneypot] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [slowSubmitHint, setSlowSubmitHint] = useState<boolean>(false);
  const [syncingOffline, setSyncingOffline] = useState<boolean>(false);
  const [unsubscribing, setUnsubscribing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [noticeMsg, setNoticeMsg] = useState<string>('');

  useEffect(() => {
    if (autoFocusEmail && !savedSub) {
      inputRef.current?.focus();
    }
  }, [autoFocusEmail, savedSub]);

  // Automatically upgrade previously device-saved (`offline_saved`) subscriptions once live server is online
  useEffect(() => {
    if (!savedSub || savedSub.status !== 'offline_saved') return undefined;
    if (autoSyncedEmailRef.current === savedSub.email) return undefined;
    autoSyncedEmailRef.current = savedSub.email;

    let cancelled = false;
    void syncOfflineNewsletterSubscription(savedSub, source).then((res) => {
      if (cancelled) return;
      if (res.ok && res.status !== 'offline_saved') {
        setSavedSub({
          email: res.email,
          lang: savedSub.lang,
          status: res.status,
          subscribedAt: new Date().toISOString(),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [savedSub, source]);

  useEffect(() => {
    if (!submitting) return undefined;
    const timer = window.setTimeout(() => setSlowSubmitHint(true), 3500);
    return () => window.clearTimeout(timer);
  }, [submitting]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');
    setSlowSubmitHint(false);

    const normalized = normalizeClientEmail(email);
    if (!normalized) {
      setErrorMsg(copy.invalidEmailError);
      inputRef.current?.focus();
      return;
    }
    if (!consent) {
      setErrorMsg(copy.consentRequiredError);
      return;
    }

    setSubmitting(true);
    triggerHaptic('selection');
    const result = await subscribeToNewsletter({
      email: normalized,
      consent: true,
      lang,
      source,
      website: honeypot,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.code === 'INVALID_EMAIL') {
        setErrorMsg(copy.invalidEmailError);
      } else if (result.code === 'CONSENT_REQUIRED') {
        setErrorMsg(copy.consentRequiredError);
      } else if (result.code === 'RATE_LIMITED') {
        setErrorMsg(copy.rateLimitedError);
      } else {
        setErrorMsg(copy.genericError);
      }
      return;
    }

    autoSyncedEmailRef.current = result.email;
    setSavedSub({
      email: result.email,
      lang,
      status: result.status,
      subscribedAt: new Date().toISOString(),
    });
    setEmail('');
  };

  const handleRetryOfflineSync = async () => {
    if (!savedSub || savedSub.status !== 'offline_saved' || syncingOffline) return;
    setSyncingOffline(true);
    setErrorMsg('');
    triggerHaptic('selection');
    const res = await syncOfflineNewsletterSubscription(savedSub, source);
    setSyncingOffline(false);
    if (res.ok && res.status !== 'offline_saved') {
      setSavedSub({
        email: res.email,
        lang: savedSub.lang,
        status: res.status,
        subscribedAt: new Date().toISOString(),
      });
    } else {
      setErrorMsg(
        lang === 'ko'
          ? '서버에 아직 연결할 수 없습니다. 잠시 후 다시 시도하거나 아래 이메일 버튼으로 신청해 주세요.'
          : 'Still unable to reach the server. Please retry shortly or send via email below.'
      );
    }
  };

  const handleUnsubscribe = async () => {
    if (!savedSub || unsubscribing) return;
    setUnsubscribing(true);
    setErrorMsg('');
    await unsubscribeFromNewsletter(savedSub.email);
    setUnsubscribing(false);
    setSavedSub(null);
    setNoticeMsg(copy.unsubscribedNotice);
  };

  const handleResetToForm = () => {
    clearStoredNewsletterSubscription();
    autoSyncedEmailRef.current = null;
    setSavedSub(null);
    setErrorMsg('');
    setNoticeMsg('');
  };

  if (savedSub) {
    const isAlready = savedSub.status === 'already_subscribed';
    const isOffline = savedSub.status === 'offline_saved';
    const statusTitle = isOffline
      ? copy.offlineTitle
      : isAlready
        ? copy.alreadyTitle
        : copy.successTitle;
    const statusBody = isOffline
      ? copy.offlineBody
      : isAlready
        ? copy.alreadyBody
        : copy.successBody;

    const mailtoConfirmHref = `mailto:${SITE_META.contactEmail}?subject=${encodeURIComponent(
      lang === 'ko' ? 'iNVTRY 뉴스레터 구독 신청' : 'iNVTRY Newsletter Subscription'
    )}&body=${encodeURIComponent(
      lang === 'ko'
        ? `안녕하세요, 아래 이메일로 iNVTRY 뉴스레터 구독을 신청합니다.\n\n이메일: ${savedSub.email}\n`
        : `Hello, please add this email to the iNVTRY newsletter.\n\nEmail: ${savedSub.email}\n`
    )}`;

    return (
      <div
        className={`site-newsletter-success site-newsletter-success--${variant}`}
        role="status"
        aria-live="polite"
      >
        <div className="site-newsletter-success-head">
          <span className="site-newsletter-check-icon" aria-hidden="true">
            <CheckCircle2 size={20} />
          </span>
          <div className="site-newsletter-success-copy">
            <h3>{statusTitle}</h3>
            <p className="site-newsletter-email-echo">{savedSub.email}</p>
          </div>
        </div>
        <p className="site-newsletter-success-body">{statusBody}</p>
        {errorMsg && (
          <p className="site-newsletter-error" role="alert">
            {errorMsg}
          </p>
        )}

        <div className="site-newsletter-success-actions">
          {isOffline && (
            <>
              <button
                type="button"
                className="site-newsletter-submit-btn"
                disabled={syncingOffline}
                onClick={handleRetryOfflineSync}
              >
                {syncingOffline ? (
                  <>
                    <Loader2 size={15} className="site-newsletter-spin" aria-hidden="true" />
                    <span>{copy.submittingLabel}</span>
                  </>
                ) : (
                  <span>
                    {lang === 'ko' ? '서버에 지금 등록하기' : 'Register on Server Now'}
                  </span>
                )}
              </button>
              <a
                href={mailtoConfirmHref}
                className="site-newsletter-text-btn"
                style={{ justifyContent: 'center' }}
              >
                <span>{copy.mailtoFallbackCta}</span>
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </>
          )}
          {onDone && !isOffline && (
            <button type="button" className="site-newsletter-submit-btn" onClick={onDone}>
              <span>{copy.doneCta}</span>
            </button>
          )}
          <div className="site-newsletter-secondary-row">
            <button
              type="button"
              className="site-newsletter-text-btn"
              onClick={handleResetToForm}
            >
              {copy.changeEmailCta}
            </button>
            <button
              type="button"
              className="site-newsletter-text-btn"
              disabled={unsubscribing}
              onClick={handleUnsubscribe}
            >
              {copy.unsubscribeCta}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      className={`site-newsletter-form site-newsletter-form--${variant}`}
      onSubmit={handleSubmit}
      noValidate
    >
      {/* Hidden honeypot input for automated spam prevention */}
      <div className="site-newsletter-hp" aria-hidden="true">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <div className="site-newsletter-field">
        <label htmlFor={emailId} className="site-newsletter-label">
          {copy.emailLabel}
        </label>
        <div className="site-newsletter-input-row">
          <Mail size={15} className="site-newsletter-input-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            required
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            aria-invalid={errorMsg ? 'true' : undefined}
            aria-describedby={errorMsg ? errorId : undefined}
            className="site-newsletter-input"
          />
        </div>
      </div>

      <label htmlFor={consentId} className="site-newsletter-consent">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (errorMsg) setErrorMsg('');
          }}
          className="site-newsletter-checkbox"
        />
        <span>{copy.consentLabel}</span>
      </label>

      {errorMsg && (
        <p id={errorId} className="site-newsletter-error" role="alert">
          {errorMsg}
        </p>
      )}

      {noticeMsg && !errorMsg && (
        <p className="site-newsletter-notice" role="status">
          {noticeMsg}
        </p>
      )}

      <button type="submit" className="site-newsletter-submit-btn" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 size={15} className="site-newsletter-spin" aria-hidden="true" />
            <span>{copy.submittingLabel}</span>
          </>
        ) : (
          <>
            <Mail size={14} aria-hidden="true" />
            <span>{copy.submitLabel}</span>
          </>
        )}
      </button>

      {submitting && slowSubmitHint && (
        <p className="site-newsletter-notice" role="status">
          {lang === 'ko'
            ? '서버와 연결하는 중입니다. 잠시만 기다려 주세요…'
            : 'Connecting to server. Please hold on a moment…'}
        </p>
      )}

      <p className="site-newsletter-privacy-note">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>{copy.privacyNote}</span>
      </p>
    </form>
  );
}

export interface SiteNewsletterModalProps {
  readonly isOpen: boolean;
  readonly copy: SiteCopy['newsletter'];
  readonly lang: SiteLang;
  readonly onClose: () => void;
}

export default function SiteNewsletterModal({
  isOpen,
  copy,
  lang,
  onClose,
}: SiteNewsletterModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

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

  if (!isOpen) return null;

  return (
    <div
      className="site-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-newsletter-modal-title"
      data-no-marble="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="site-modal-card site-newsletter-modal-card"
        tabIndex={-1}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="site-modal-head">
          <div>
            <p className="site-modal-meta">{copy.kicker}</p>
            <h2 id="site-newsletter-modal-title" className="site-modal-title">
              {copy.title}
            </h2>
            <p className="site-newsletter-modal-sub">{copy.subtitle}</p>
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
          <SiteNewsletterForm
            copy={copy}
            lang={lang}
            source="site_modal"
            variant="modal"
            autoFocusEmail
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
}
