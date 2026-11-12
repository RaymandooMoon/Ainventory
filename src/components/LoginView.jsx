import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Globe, KeyRound, Mail, Moon, Play, Sun } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { apiFetch, setStoredToken } from '../utils/api.ts';
import { tr } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { LegalDisclosureModal } from './common/AppUI.jsx';

/**
 * Apple HIG Frosted Glass Initial Entry Screen with Dual-Theme 2.5D Atelier Video Background
 * - Light & Dark mode seamless-looping 2.5D wardrobe showcase videos (`/media/login-bg-light.mp4`, `/media/login-bg-dark.mp4`)
 * - Unauthenticated '샘플 옷장 체험 모드' button (#enter-sample-demo-btn) with explicit aria-label
 * - Sign in with Apple (#apple-signin-btn)
 * - Progressive Email OTP, Sign In (#auth-tab-login), and Sign Up (#auth-tab-register)
 */
export default function LoginView({
  onLoginSuccess,
  onEnterSampleDemo,
  lang = 'ko',
  onChangeLang,
  effectiveTheme = 'light',
  onToggleTheme,
}) {
  const isEn = lang === 'en';
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isDev = Boolean(import.meta.env.DEV) || isLocalHost;
  const hasAppleClientId = Boolean(import.meta.env.VITE_APPLE_CLIENT_ID);

  const lightVideoRef = useRef(null);
  const darkVideoRef = useRef(null);

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'otp' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email OTP States (shared cleanly between quick 'otp' mode and detailed 'register' mode)
  const [regEmail, setRegEmail] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regClosetName, setRegClosetName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regGender, setRegGender] = useState('male');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devPreviewCode, setDevPreviewCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [legalModalDoc, setLegalModalDoc] = useState(null); // null | 'privacy' | 'terms'

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const lightEl = lightVideoRef.current;
    const darkEl = darkVideoRef.current;
    if (prefersReducedMotion) {
      lightEl?.pause();
      darkEl?.pause();
      return;
    }

    const activeEl = effectiveTheme === 'dark' ? darkEl : lightEl;
    const inactiveEl = effectiveTheme === 'dark' ? lightEl : darkEl;

    if (activeEl && inactiveEl && !Number.isNaN(inactiveEl.currentTime) && inactiveEl.currentTime > 0) {
      try {
        activeEl.currentTime = inactiveEl.currentTime;
      } catch {
        // ignore seek before metadata ready
      }
    }
    activeEl?.play?.().catch(() => {});
    const pauseTimer = setTimeout(() => {
      inactiveEl?.pause?.();
    }, 650);
    return () => clearTimeout(pauseTimer);
  }, [effectiveTheme]);

  useEffect(() => {
    if (cooldownSec <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(data.token);
      triggerHaptic('light');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError('');
    if (!isDev && !hasAppleClientId) {
      setError(
        isEn
          ? 'Apple Sign-In client ID is not configured in this build. Please use Email OTP.'
          : '현재 빌드에 Apple 로그인 클라이언트(VITE_APPLE_CLIENT_ID)가 설정되지 않았습니다. 이메일 인증을 이용해 주세요.'
      );
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/auth/apple', {
        method: 'POST',
        body: JSON.stringify({
          appleSub: 'apple_hig_member_01',
          email: 'apple.user@privaterelay.appleid.com',
          fullName: 'Apple 사용자',
        }),
      });
      setStoredToken(data.token);
      triggerHaptic('light');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError('');
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError(
        isEn ? 'Please enter a valid email address.' : '유효한 이메일 주소를 입력해 주세요.'
      );
      return;
    }
    if (cooldownSec > 0) return;

    setLoading(true);
    try {
      const res = await apiFetch('/auth/send-verification', {
        method: 'POST',
        body: JSON.stringify({ email: regEmail.trim() }),
      });
      setOtpSent(true);
      setOtpVerified(false);
      setCooldownSec(Number(res.resendCooldownSec || 60));
      if (isDev && res.devPreviewCode) {
        setDevPreviewCode(res.devPreviewCode);
        setOtpCode(res.devPreviewCode);
      }
      triggerHaptic('light');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    if (!otpCode.trim()) {
      setError(
        isEn ? 'Please enter the 6-digit verification code.' : '6자리 인증코드를 입력해 주세요.'
      );
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/auth/verify-email-code', {
        method: 'POST',
        body: JSON.stringify({ email: regEmail.trim(), code: otpCode.trim() }),
      });
      setOtpVerified(true);
      triggerHaptic('medium');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyQuickEmailCode = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!otpCode.trim()) {
      setError(
        isEn ? 'Please enter the 6-digit verification code.' : '6자리 인증코드를 입력해 주세요.'
      );
      return;
    }
    setLoading(true);
    try {
      const cleanEmail = regEmail.trim();
      await apiFetch('/auth/verify-email-code', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, code: otpCode.trim() }),
      });
      setOtpVerified(true);
      const resolvedName = regDisplayName.trim() || cleanEmail.split('@')[0];
      const data = await apiFetch('/auth/register-email', {
        method: 'POST',
        body: JSON.stringify({
          email: cleanEmail,
          code: otpCode.trim(),
          password: regPassword.length >= 4 ? regPassword : 'otp12345',
          displayName: resolvedName,
          closetName: regClosetName.trim() || `${resolvedName}의 옷장`,
          gender: regGender,
        }),
      });
      setStoredToken(data.token);
      triggerHaptic('medium');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!otpVerified) {
      setError(
        isEn
          ? 'Please verify your email code first.'
          : '먼저 이메일 인증코드 확인을 완료해 주세요.'
      );
      return;
    }
    if (regPassword.length < 4) {
      setError(
        isEn
          ? 'Password must be at least 4 characters.'
          : '비밀번호는 최소 4자 이상 입력해 주세요.'
      );
      return;
    }
    setLoading(true);
    try {
      const resolvedName = regDisplayName.trim() || regEmail.split('@')[0];
      const data = await apiFetch('/auth/register-email', {
        method: 'POST',
        body: JSON.stringify({
          email: regEmail.trim(),
          code: otpCode.trim(),
          password: regPassword,
          displayName: resolvedName,
          closetName: regClosetName.trim() || `${resolvedName}의 옷장`,
          gender: regGender,
        }),
      });
      setStoredToken(data.token);
      triggerHaptic('medium');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hig-auth-shell" data-auth-theme={effectiveTheme}>
      {/* Dual-Theme Seamless Looping 2.5D Wardrobe Showcase Video Stage */}
      <div className="hig-auth-video-stage" aria-hidden="true">
        <video
          id="login-bg-video-light"
          ref={lightVideoRef}
          className={`hig-auth-bg-video ${effectiveTheme !== 'dark' ? 'is-active' : ''}`}
          src="/media/login-bg-light.mp4"
          poster="/media/login-bg-light-poster.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <video
          id="login-bg-video-dark"
          ref={darkVideoRef}
          className={`hig-auth-bg-video ${effectiveTheme === 'dark' ? 'is-active' : ''}`}
          src="/media/login-bg-dark.mp4"
          poster="/media/login-bg-dark-poster.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <div className="hig-auth-video-scrim" />
      </div>

      <div className="hig-auth-container">
        {/* Top Utility Controls (Theme Switcher + Language Switcher) */}
        <div className="hig-auth-topbar">
          <span className="hig-auth-brand-kicker">MY WARDROBE · 2.5D</span>
          <div className="hig-auth-utility-group">
            <button
              id={CARBON_DOM_CONTRACT.loginThemeToggleId}
              type="button"
              className="hig-auth-utility-pill"
              aria-label="라이트 다크 모드 전환"
              onClick={onToggleTheme}
            >
              {effectiveTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{effectiveTheme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              id={CARBON_DOM_CONTRACT.loginLangToggleId}
              type="button"
              className="hig-auth-utility-pill"
              aria-label="언어 전환"
              onClick={() => onChangeLang?.(lang === 'ko' ? 'en' : 'ko')}
            >
              <Globe size={13} />
              <span>{lang === 'ko' ? 'EN' : 'KO'}</span>
            </button>
          </div>
        </div>

        {/* Minimal Hero Title */}
        <div className="hig-auth-hero-head">
          <h1 className="hig-auth-brand-title">{tr(lang, 'brandTitle')}</h1>
        </div>

        {/* Quick Entry CTAs */}
        <div className="hig-auth-cta-row">
          <button
            id={CARBON_DOM_CONTRACT.sampleDemoButtonId}
            type="button"
            aria-label={CARBON_DOM_CONTRACT.sampleDemoAriaLabel}
            className="btn btn-primary btn-full"
            style={{ minHeight: 46 }}
            onClick={() => onEnterSampleDemo?.()}
          >
            <Play size={15} />
            <span>{isEn ? 'Sample Closet Demo Mode' : '샘플 옷장 체험 모드'}</span>
          </button>

          {(isDev || hasAppleClientId) && (
            <button
              id={CARBON_DOM_CONTRACT.appleSignInBtnId}
              type="button"
              aria-label="Sign in with Apple"
              className="btn btn-secondary btn-full"
              style={{ minHeight: 46, background: 'var(--auth-input-bg)' }}
              disabled={loading}
              onClick={handleAppleSignIn}
            >
              <span>
                {isEn
                  ? hasAppleClientId
                    ? 'Continue with Apple'
                    : 'Continue with Apple (Sandbox)'
                  : hasAppleClientId
                    ? 'Apple로 계속하기'
                    : 'Apple로 계속하기 (개발 샌드박스)'}
              </span>
            </button>
          )}
        </div>

        {/* Progressive Frosted Glass Auth Surface */}
        <div className="hig-auth-panel">
          <div className="hig-auth-segmented" role="tablist">
            <button
              id={CARBON_DOM_CONTRACT.authTabLoginId}
              type="button"
              role="tab"
              aria-selected={authMode === 'login'}
              className={`hig-auth-seg-btn ${authMode === 'login' ? 'is-active' : ''}`}
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
            >
              {isEn ? 'Sign In' : '로그인'}
            </button>
            <button
              id={CARBON_DOM_CONTRACT.authTabOtpId}
              type="button"
              role="tab"
              aria-selected={authMode === 'otp'}
              className={`hig-auth-seg-btn ${authMode === 'otp' ? 'is-active' : ''}`}
              onClick={() => {
                setAuthMode('otp');
                setError('');
              }}
            >
              {isEn ? 'Email OTP' : '이메일 시작'}
            </button>
            <button
              id={CARBON_DOM_CONTRACT.authTabRegisterId}
              type="button"
              role="tab"
              aria-selected={authMode === 'register'}
              className={`hig-auth-seg-btn ${authMode === 'register' ? 'is-active' : ''}`}
              onClick={() => {
                setAuthMode('register');
                setError('');
              }}
            >
              {isEn ? 'Sign Up' : '회원가입'}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="hig-caption"
              style={{
                padding: '8px 16px',
                borderRadius: 12,
                background: 'var(--bg-canvas)',
                color: 'var(--ink-primary)',
              }}
            >
              {error}
            </div>
          )}

          {authMode === 'otp' && (
            <form
              onSubmit={handleVerifyQuickEmailCode}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id={CARBON_DOM_CONTRACT.emailAuthInputId}
                  type="email"
                  className="text-input"
                  style={{ flex: 1, background: 'var(--bg-canvas)' }}
                  placeholder="name@example.com"
                  aria-label={isEn ? 'Email address' : '이메일 주소'}
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    setOtpVerified(false);
                  }}
                  required
                />
                <button
                  id={CARBON_DOM_CONTRACT.requestEmailCodeBtnId}
                  type="button"
                  className="btn btn-secondary btn-sm tabular-nums"
                  disabled={loading || cooldownSec > 0}
                  onClick={handleSendOtp}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Mail size={14} />
                  <span>
                    {cooldownSec > 0
                      ? isEn
                        ? `Resend ${cooldownSec}s`
                        : `재발송 ${cooldownSec}s`
                      : otpSent
                        ? isEn
                          ? 'Resend'
                          : '재발송'
                        : isEn
                          ? 'Get Code'
                          : '코드 받기'}
                  </span>
                </button>
              </div>

              {otpSent && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      id={CARBON_DOM_CONTRACT.emailOtpCodeInputId}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="text-input tabular-nums"
                      style={{
                        flex: 1,
                        background: 'var(--bg-canvas)',
                        letterSpacing: '0.18em',
                        fontWeight: 700,
                      }}
                      placeholder={isEn ? '6-digit code' : '6자리 인증코드'}
                      aria-label={isEn ? '6-digit verification code' : '6자리 인증코드'}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                    <button
                      id={CARBON_DOM_CONTRACT.verifyEmailCodeBtnId}
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={loading}
                    >
                      <KeyRound size={14} />
                      <span>{isEn ? 'Verify' : '인증 시작'}</span>
                    </button>
                  </div>
                  {isDev && devPreviewCode && !otpVerified && (
                    <span className="hig-caption tabular-nums">
                      {isEn
                        ? `Local dev code: ${devPreviewCode}`
                        : `로컬 테스트 코드: ${devPreviewCode}`}
                    </span>
                  )}
                </div>
              )}
            </form>
          )}

          {authMode === 'login' && (
            <form
              onSubmit={handleLoginSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <input
                id="login-username"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isEn ? 'Username or email' : '아이디 또는 이메일'}
                aria-label={isEn ? 'Username or email' : '아이디 또는 이메일'}
                autoComplete="username"
                required
              />
              <input
                id="login-password"
                type="password"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEn ? 'Password' : '비밀번호'}
                aria-label={isEn ? 'Password' : '비밀번호'}
                autoComplete="current-password"
                required
              />
              {isDev && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span className="hig-caption">{isEn ? 'Dev Seed' : '개발 시드 계정'}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setUsername('admin');
                        setPassword('admin');
                        setError('');
                      }}
                    >
                      {tr(lang, 'closetHusband')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setUsername('wife');
                        setPassword('wife1234');
                        setError('');
                      }}
                    >
                      {tr(lang, 'closetWife')}
                    </button>
                  </div>
                </div>
              )}
              <button
                id="login-submit-btn"
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading
                  ? isEn
                    ? 'Signing in...'
                    : '로그인 중...'
                  : tr(lang, 'loginSubmit')}
              </button>
            </form>
          )}

          {authMode === 'register' && (
            <form
              onSubmit={handleCompleteRegister}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="register-email-input"
                  type="email"
                  className="text-input"
                  style={{ flex: 1, background: 'var(--bg-canvas)' }}
                  placeholder="name@example.com"
                  aria-label={isEn ? 'Email address' : '이메일 주소'}
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    setOtpVerified(false);
                  }}
                  required
                />
                <button
                  id="send-otp-btn"
                  type="button"
                  className="btn btn-secondary btn-sm tabular-nums"
                  disabled={loading || cooldownSec > 0}
                  onClick={handleSendOtp}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Mail size={14} />
                  <span>
                    {cooldownSec > 0
                      ? isEn
                        ? `Resend ${cooldownSec}s`
                        : `재발송 ${cooldownSec}s`
                      : otpSent
                        ? isEn
                          ? 'Resend'
                          : '재발송'
                        : isEn
                          ? 'Send Code'
                          : '코드 발송'}
                  </span>
                </button>
              </div>

              {otpSent && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      id="register-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="text-input tabular-nums"
                      style={{
                        flex: 1,
                        background: 'var(--bg-canvas)',
                        letterSpacing: '0.18em',
                        fontWeight: 700,
                      }}
                      placeholder={isEn ? '6-digit code' : '6자리 코드'}
                      aria-label={isEn ? '6-digit code' : '6자리 코드'}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                    <button
                      id="verify-otp-btn"
                      type="button"
                      className={`btn btn-sm ${otpVerified ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={loading || otpVerified}
                      onClick={handleVerifyOtp}
                    >
                      {otpVerified ? (
                        <>
                          <CheckCircle2 size={14} /> {isEn ? 'Verified' : '인증됨'}
                        </>
                      ) : (
                        <>
                          <KeyRound size={14} /> {isEn ? 'Verify' : '확인'}
                        </>
                      )}
                    </button>
                  </div>
                  {isDev && devPreviewCode && !otpVerified && (
                    <span className="hig-caption tabular-nums">
                      {isEn
                        ? `Local dev code: ${devPreviewCode}`
                        : `로컬 테스트 코드: ${devPreviewCode}`}
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  id="register-name-input"
                  type="text"
                  className="text-input"
                  style={{ background: 'var(--bg-canvas)' }}
                  placeholder={isEn ? 'Display name' : '이름 / 닉네임'}
                  aria-label={isEn ? 'Display name' : '이름 / 닉네임'}
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                />
                <select
                  className="select-input"
                  style={{ background: 'var(--bg-canvas)' }}
                  value={regGender}
                  onChange={(e) => setRegGender(e.target.value)}
                  aria-label={isEn ? 'Select gender' : '성별 선택'}
                >
                  <option value="male">{isEn ? 'Male' : '남성'}</option>
                  <option value="female">{isEn ? 'Female' : '여성'}</option>
                </select>
              </div>

              <input
                id="register-closet-input"
                type="text"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder={isEn ? 'Closet name (optional)' : '내 옷장 이름 (선택)'}
                aria-label={isEn ? 'Closet name' : '내 옷장 이름'}
                value={regClosetName}
                onChange={(e) => setRegClosetName(e.target.value)}
              />

              <input
                id="register-password-input"
                type="password"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder={isEn ? 'Password (4+ chars)' : '비밀번호 (4자 이상)'}
                aria-label={isEn ? 'Password' : '비밀번호'}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
              />

              <button
                id="complete-register-btn"
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading || !otpVerified}
              >
                {loading
                  ? isEn
                    ? 'Creating account...'
                    : '가입 처리 중...'
                  : isEn
                    ? 'Start with Empty Closet'
                    : '빈 옷장으로 시작하기'}
              </button>
            </form>
          )}
        </div>

        {/* Store Compliance Footer: Privacy Policy & Terms of Service */}
        <div className="hig-auth-footer">
          <button
            id="login-privacy-policy-btn"
            type="button"
            className="hig-auth-legal-link"
            onClick={() => setLegalModalDoc('privacy')}
          >
            {isEn ? 'Privacy Policy' : '개인정보처리방침'}
          </button>
          <span className="hig-caption" aria-hidden="true">
            ·
          </span>
          <button
            id="login-terms-btn"
            type="button"
            className="hig-auth-legal-link"
            onClick={() => setLegalModalDoc('terms')}
          >
            {isEn ? 'Terms of Service' : '이용약관'}
          </button>
        </div>
      </div>

      <LegalDisclosureModal
        open={Boolean(legalModalDoc)}
        initialDoc={legalModalDoc || 'privacy'}
        onClose={() => setLegalModalDoc(null)}
        lang={lang}
      />
    </div>
  );
}
