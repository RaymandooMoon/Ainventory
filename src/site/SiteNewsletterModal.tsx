import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  clearPendingNewsletterVerification,
  clearStoredNewsletterSubscription,
  normalizeClientEmail,
  readPendingNewsletterVerification,
  readStoredNewsletterSubscription,
  resendNewsletterVerification,
  subscribeToNewsletter,
  syncOfflineNewsletterSubscription,
  unsubscribeFromNewsletter,
  verifyNewsletterEmail,
  type NewsletterSource,
  type PendingNewsletterVerification,
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
  readonly externalNotice?: string;
  readonly externalError?: string;
  readonly onDone?: () => void;
}

export function SiteNewsletterForm({
  copy,
  lang,
  source,
  variant = 'modal',
  autoFocusEmail = false,
  externalNotice = '',
  externalError = '',
  onDone,
}: SiteNewsletterFormProps) {
  const emailId = useId();
  const consentId = useId();
  const otpId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const autoSyncedEmailRef = useRef<string | null>(null);

  const [savedSub, setSavedSub] = useState<StoredNewsletterSubscription | null>(() =>
    readStoredNewsletterSubscription()
  );
  const [pendingVerify, setPendingVerify] = useState<PendingNewsletterVerification | null>(() =>
    readPendingNewsletterVerification()
  );
  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [consent, setConsent] = useState<boolean>(true);
  const [honeypot, setHoneypot] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [slowSubmitHint, setSlowSubmitHint] = useState<boolean>(false);
  const [syncingOffline, setSyncingOffline] = useState<boolean>(false);
  const [unsubscribing, setUnsubscribing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showMailtoFallback, setShowMailtoFallback] = useState<boolean>(false);
  const [noticeMsg, setNoticeMsg] = useState<string>('');
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (autoFocusEmail && !savedSub && !pendingVerify) {
      inputRef.current?.focus();
    }
  }, [autoFocusEmail, savedSub, pendingVerify]);

  useEffect(() => {
    if (pendingVerify) {
      otpInputRef.current?.focus();
    }
  }, [pendingVerify]);

  // 1-second tick for live resend cooldown & 10-minute code expiration countdown
  useEffect(() => {
    if (!pendingVerify) return undefined;
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingVerify]);

  // Automatically upgrade previously device-saved (`offline_saved`) subscriptions when server is online
  useEffect(() => {
    if (!savedSub || savedSub.status !== 'offline_saved') return undefined;
    if (autoSyncedEmailRef.current === savedSub.email) return undefined;
    autoSyncedEmailRef.current = savedSub.email;

    let cancelled = false;
    void syncOfflineNewsletterSubscription(savedSub, source).then((res) => {
      if (cancelled || !res.ok) return;
      if (res.status === 'pending_verification') {
        const now = Date.now();
        setSavedSub(null);
        setPendingVerify({
          email: res.email,
          lang: savedSub.lang,
          source,
          expiresAt: now + res.expiresInSec * 1000,
          cooldownUntil: now + res.cooldownSec * 1000,
          challengeToken: res.challengeToken,
          devPreviewCode: res.devPreviewCode,
        });
        setNowTs(now);
      } else if (res.status !== 'offline_saved') {
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
    if (!submitting && !verifying) return undefined;
    const timer = window.setTimeout(() => setSlowSubmitHint(true), 3500);
    return () => window.clearTimeout(timer);
  }, [submitting, verifying]);

  const cooldownSecLeft = pendingVerify
    ? Math.max(0, Math.ceil((pendingVerify.cooldownUntil - nowTs) / 1000))
    : 0;
  const expirySecLeft = pendingVerify
    ? Math.max(0, Math.ceil((pendingVerify.expiresAt - nowTs) / 1000))
    : 0;
  const expiryMinDisplay = `${Math.floor(expirySecLeft / 60)}:${String(expirySecLeft % 60).padStart(2, '0')}`;

  const activeError = errorMsg || externalError;
  const activeNotice = noticeMsg || externalNotice;

  const handleSubmitEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');
    setShowMailtoFallback(false);
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
      } else if (result.code === 'RESEND_COOLDOWN') {
        const sec = result.retryAfterSec ?? 60;
        setErrorMsg(
          result.error || copy.resendCooldownTemplate.replace('{sec}', String(sec))
        );
      } else if (result.code === 'RATE_LIMITED') {
        setErrorMsg(copy.rateLimitedError);
      } else if (result.code === 'EMAIL_DELIVERY_NOT_CONFIGURED') {
        setErrorMsg(copy.deliveryNotConfiguredError);
        setShowMailtoFallback(true);
      } else {
        setErrorMsg(result.error || copy.genericError);
      }
      return;
    }

    if (result.status === 'pending_verification') {
      const now = Date.now();
      setPendingVerify({
        email: result.email,
        lang,
        source,
        expiresAt: now + result.expiresInSec * 1000,
        cooldownUntil: now + result.cooldownSec * 1000,
        challengeToken: result.challengeToken,
        devPreviewCode: result.devPreviewCode,
      });
      setNowTs(now);
      setOtpCode('');
      return;
    }

    autoSyncedEmailRef.current = result.email;
    setPendingVerify(null);
    setSavedSub({
      email: result.email,
      lang,
      status: result.status,
      subscribedAt: new Date().toISOString(),
    });
    setEmail('');
  };

  const handleVerifyCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pendingVerify || verifying) return;
    setErrorMsg('');
    setNoticeMsg('');
    setSlowSubmitHint(false);

    const cleanCode = otpCode.replace(/\D+/g, '').slice(0, 6);
    if (cleanCode.length !== 6) {
      setErrorMsg(copy.invalidCodeError);
      otpInputRef.current?.focus();
      return;
    }

    setVerifying(true);
    triggerHaptic('selection');
    const result = await verifyNewsletterEmail({
      email: pendingVerify.email,
      code: cleanCode,
      challengeToken: pendingVerify.challengeToken,
      lang: pendingVerify.lang,
    });
    setVerifying(false);

    if (!result.ok) {
      if (result.code === 'OTP_EXPIRED') {
        setErrorMsg(copy.expiredCodeError);
      } else if (result.code === 'OTP_ATTEMPTS_EXCEEDED') {
        setErrorMsg(copy.attemptsExceededError);
      } else if (result.code === 'INVALID_CODE') {
        setErrorMsg(
          result.error ||
            (typeof result.remainingAttempts === 'number'
              ? `${copy.invalidCodeError} (${result.remainingAttempts})`
              : copy.invalidCodeError)
        );
      } else if (result.code === 'RATE_LIMITED') {
        setErrorMsg(copy.rateLimitedError);
      } else {
        setErrorMsg(result.error || copy.genericError);
      }
      return;
    }

    autoSyncedEmailRef.current = result.email;
    setPendingVerify(null);
    setOtpCode('');
    setSavedSub({
      email: result.email,
      lang: pendingVerify.lang,
      status: result.status,
      subscribedAt: new Date().toISOString(),
    });
    setEmail('');
  };

  const handleResendCode = async () => {
    if (!pendingVerify || resending || cooldownSecLeft > 0) return;
    setResending(true);
    setErrorMsg('');
    setNoticeMsg('');
    triggerHaptic('selection');
    const result = await resendNewsletterVerification({
      email: pendingVerify.email,
      lang: pendingVerify.lang,
      source: pendingVerify.source,
    });
    setResending(false);

    if (!result.ok) {
      if (result.code === 'RESEND_COOLDOWN') {
        const sec = result.retryAfterSec ?? 60;
        const now = Date.now();
        setPendingVerify((prev) => (prev ? { ...prev, cooldownUntil: now + sec * 1000 } : prev));
        setNowTs(now);
        setErrorMsg(result.error || copy.resendCooldownTemplate.replace('{sec}', String(sec)));
      } else if (result.code === 'RATE_LIMITED') {
        setErrorMsg(copy.rateLimitedError);
      } else {
        setErrorMsg(result.error || copy.genericError);
      }
      return;
    }

    if (result.status === 'pending_verification') {
      const now = Date.now();
      setPendingVerify({
        email: result.email,
        lang: pendingVerify.lang,
        source: pendingVerify.source,
        expiresAt: now + result.expiresInSec * 1000,
        cooldownUntil: now + result.cooldownSec * 1000,
        challengeToken: result.challengeToken,
        devPreviewCode: result.devPreviewCode,
      });
      setNowTs(now);
      setOtpCode('');
      setNoticeMsg(copy.resentNotice);
      otpInputRef.current?.focus();
    } else if (result.status === 'already_subscribed') {
      setPendingVerify(null);
      setSavedSub({
        email: result.email,
        lang: pendingVerify.lang,
        status: 'already_subscribed',
        subscribedAt: new Date().toISOString(),
      });
    }
  };

  const handleCancelPending = () => {
    clearPendingNewsletterVerification();
    if (pendingVerify?.email) {
      setEmail(pendingVerify.email);
    }
    setPendingVerify(null);
    setOtpCode('');
    setErrorMsg('');
    setNoticeMsg('');
  };

  const handleRetryOfflineSync = async () => {
    if (!savedSub || savedSub.status !== 'offline_saved' || syncingOffline) return;
    setSyncingOffline(true);
    setErrorMsg('');
    triggerHaptic('selection');
    const res = await syncOfflineNewsletterSubscription(savedSub, source);
    setSyncingOffline(false);
    if (res.ok && res.status === 'pending_verification') {
      const now = Date.now();
      setSavedSub(null);
      setPendingVerify({
        email: res.email,
        lang: savedSub.lang,
        source,
        expiresAt: now + res.expiresInSec * 1000,
        cooldownUntil: now + res.cooldownSec * 1000,
        challengeToken: res.challengeToken,
        devPreviewCode: res.devPreviewCode,
      });
      setNowTs(now);
    } else if (res.ok && res.status !== 'offline_saved') {
      setSavedSub({
        email: res.email,
        lang: savedSub.lang,
        status: res.status,
        subscribedAt: new Date().toISOString(),
      });
    } else if (!res.ok && res.code === 'EMAIL_DELIVERY_NOT_CONFIGURED') {
      setErrorMsg(copy.deliveryNotConfiguredError);
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
    setPendingVerify(null);
    setNoticeMsg(copy.unsubscribedNotice);
  };

  const handleResetToForm = () => {
    clearStoredNewsletterSubscription();
    clearPendingNewsletterVerification();
    autoSyncedEmailRef.current = null;
    setSavedSub(null);
    setPendingVerify(null);
    setOtpCode('');
    setErrorMsg('');
    setNoticeMsg('');
  };

  /* -------------------- STATE 2: 6-DIGIT EMAIL VERIFICATION STEP -------------------- */
  if (pendingVerify && !savedSub) {
    const cleanDigits = otpCode.replace(/\D+/g, '').slice(0, 6);
    const expired = expirySecLeft <= 0;

    return (
      <form
        className={`site-newsletter-success site-newsletter-verify site-newsletter-success--${variant}`}
        onSubmit={handleVerifyCode}
        data-newsletter-step="verify"
        noValidate
      >
        <div className="site-newsletter-success-head">
          <span className="site-newsletter-check-icon" aria-hidden="true">
            <KeyRound size={18} />
          </span>
          <div className="site-newsletter-success-copy">
            <h3>{copy.verifyTitle}</h3>
            <p className="site-newsletter-email-echo">{pendingVerify.email}</p>
          </div>
          <span className="site-newsletter-expiry-pill" aria-live="off">
            {expired ? (lang === 'ko' ? '만료됨' : 'Expired') : expiryMinDisplay}
          </span>
        </div>

        <p className="site-newsletter-success-body">{copy.verifySubtitle}</p>

        {pendingVerify.devPreviewCode && (
          <button
            type="button"
            className="site-newsletter-dev-chip"
            data-newsletter-dev-code={pendingVerify.devPreviewCode}
            onClick={() => setOtpCode(pendingVerify.devPreviewCode || '')}
          >
            <span>DEV OTP: {pendingVerify.devPreviewCode}</span>
            <span>({lang === 'ko' ? '탭하여 자동 입력' : 'Tap to fill'})</span>
          </button>
        )}

        <div className="site-newsletter-field">
          <label htmlFor={otpId} className="site-newsletter-label">
            {copy.verifyCodeLabel}
          </label>
          <div className="site-newsletter-input-row">
            <KeyRound size={15} className="site-newsletter-input-icon" aria-hidden="true" />
            <input
              ref={otpInputRef}
              id={otpId}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder={copy.verifyCodePlaceholder}
              value={otpCode}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D+/g, '').slice(0, 6);
                setOtpCode(digits);
                if (errorMsg) setErrorMsg('');
              }}
              aria-invalid={activeError ? 'true' : undefined}
              aria-describedby={activeError ? errorId : undefined}
              className="site-newsletter-input site-newsletter-otp-input"
              data-newsletter-otp-input="true"
            />
          </div>
        </div>

        {activeError && (
          <p id={errorId} className="site-newsletter-error" role="alert">
            {activeError}
          </p>
        )}

        {activeNotice && !activeError && (
          <p className="site-newsletter-notice" role="status">
            {activeNotice}
          </p>
        )}

        <button
          type="submit"
          className="site-newsletter-submit-btn"
          disabled={verifying || cleanDigits.length !== 6 || expired}
          data-newsletter-verify-submit="true"
        >
          {verifying ? (
            <>
              <Loader2 size={15} className="site-newsletter-spin" aria-hidden="true" />
              <span>{copy.verifyingLabel}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>{copy.verifySubmitLabel}</span>
            </>
          )}
        </button>

        <div className="site-newsletter-secondary-row">
          <button
            type="button"
            className="site-newsletter-text-btn"
            disabled={resending || cooldownSecLeft > 0}
            onClick={handleResendCode}
            data-newsletter-resend-btn="true"
          >
            <RotateCcw size={12} aria-hidden="true" style={{ marginRight: 5 }} />
            <span>
              {cooldownSecLeft > 0
                ? copy.resendCooldownTemplate.replace('{sec}', String(cooldownSecLeft))
                : copy.resendCta}
            </span>
          </button>
          <button
            type="button"
            className="site-newsletter-text-btn"
            onClick={handleCancelPending}
          >
            {copy.changeEmailCta}
          </button>
        </div>

        <p className="site-newsletter-privacy-note">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>{copy.verifyLinkHint}</span>
        </p>
      </form>
    );
  }

  /* -------------------- STATE 3: VERIFIED / SUBSCRIBED CARD -------------------- */
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
        data-newsletter-step="done"
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
        {activeError && (
          <p className="site-newsletter-error" role="alert">
            {activeError}
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
                    {lang === 'ko' ? '이메일 인증 진행하기' : 'Verify Email Now'}
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

  /* -------------------- STATE 1: EMAIL ENTRY FORM -------------------- */
  const directMailtoHref = `mailto:${SITE_META.contactEmail}?subject=${encodeURIComponent(
    lang === 'ko' ? 'iNVTRY 뉴스레터 구독 신청' : 'iNVTRY Newsletter Subscription'
  )}&body=${encodeURIComponent(
    lang === 'ko'
      ? `안녕하세요, 아래 이메일로 iNVTRY 뉴스레터 구독을 신청합니다.\n\n이메일: ${email.trim()}\n`
      : `Hello, please add this email to the iNVTRY newsletter.\n\nEmail: ${email.trim()}\n`
  )}`;

  return (
    <form
      className={`site-newsletter-form site-newsletter-form--${variant}`}
      onSubmit={handleSubmitEmail}
      data-newsletter-step="email"
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
            aria-invalid={activeError ? 'true' : undefined}
            aria-describedby={activeError ? errorId : undefined}
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

      {activeError && (
        <p id={errorId} className="site-newsletter-error" role="alert">
          {activeError}
        </p>
      )}

      {showMailtoFallback && (
        <a
          href={directMailtoHref}
          className="site-newsletter-text-btn"
          style={{ justifyContent: 'center' }}
        >
          <span>{copy.mailtoFallbackCta}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}

      {activeNotice && !activeError && (
        <p className="site-newsletter-notice" role="status">
          {activeNotice}
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
            ? '인증 메일을 준비하는 중입니다. 잠시만 기다려 주세요…'
            : 'Preparing your verification email. Please hold on…'}
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
  readonly externalNotice?: string;
  readonly externalError?: string;
  readonly onClose: () => void;
}

export default function SiteNewsletterModal({
  isOpen,
  copy,
  lang,
  externalNotice = '',
  externalError = '',
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

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusables = getFocusableElements(cardRef.current);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        window.requestAnimationFrame(() => prev.focus());
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="site-modal-card site-newsletter-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="site-modal-header">
          <div>
            <span className="hud-eyebrow">{copy.kicker}</span>
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
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="site-modal-body">
          <SiteNewsletterForm
            copy={copy}
            lang={lang}
            source="site_modal"
            variant="modal"
            autoFocusEmail
            externalNotice={externalNotice}
            externalError={externalError}
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
}
