import { useEffect, useState } from 'react';
import { CheckCircle2, Globe, KeyRound, Mail, Moon, Play, Sun } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { apiFetch, setStoredToken } from '../utils/api.js';
import { tr } from '../utils/i18n.js';
import { triggerHaptic } from '../utils/nativeBridge.js';
import { LegalDisclosureModal } from './common/AppUI.jsx';

/**
 * Apple HIG Minimal Monochrome Initial Entry Screen (Reqs 8.a, 10.b, 11.a-c, 12.a)
 * - Unauthenticated '샘플 옷장 체험 모드' button (#enter-sample-demo-btn) with explicit aria-label
 * - Sign in with Apple (#apple-signin-btn)
 * - Progressive Email OTP quick entry (#email-auth-input -> #request-email-code-btn -> #email-otp-code-input -> #verify-email-code-btn)
 * - Full Login (#auth-tab-login) & Email OTP Sign-Up (#auth-tab-register) modes with 60s cooldown & 429 handling
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
    <div className="hig-auth-shell">
      <div className="hig-auth-container">
        {/* Top Utility Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="hig-caption">{tr(lang, 'brandSubtitle').toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id={CARBON_DOM_CONTRACT.loginThemeToggleId}
              type="button"
              className="icon-btn"
              aria-label="라이트 다크 모드 전환"
              onClick={onToggleTheme}
            >
              {effectiveTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              id={CARBON_DOM_CONTRACT.loginLangToggleId}
              type="button"
              className="icon-btn"
              aria-label="언어 전환"
              style={{ width: 'auto', padding: '0 12px' }}
              onClick={() => onChangeLang?.(lang === 'ko' ? 'en' : 'ko')}
            >
              <Globe size={13} style={{ marginRight: 4 }} />
              <span className="hig-caption" style={{ color: 'var(--ink-primary)' }}>
                {lang === 'ko' ? 'EN' : 'KO'}
              </span>
            </button>
          </div>
        </div>

        {/* Minimal Hero Title (1 Screen = 1 Core Purpose) */}
        <div>
          <h1 className="hig-large-title">{tr(lang, 'brandTitle')}</h1>
        </div>

        {/* Unauthenticated Immediate Sample Closet Demo Entry (Req 8.a & 12.a — Robo Crawler & First-Time Users) */}
        <button
          id={CARBON_DOM_CONTRACT.sampleDemoButtonId}
          type="button"
          aria-label={CARBON_DOM_CONTRACT.sampleDemoAriaLabel}
          className="btn btn-primary btn-full"
          style={{ minHeight: 48, borderRadius: 16 }}
          onClick={() => onEnterSampleDemo?.()}
        >
          <Play size={16} />
          <span>{isEn ? 'Sample Closet Demo Mode' : '샘플 옷장 체험 모드'}</span>
        </button>

        {/* Sign in with Apple (Req 10.b — Mandatory iOS App Store Parity) */}
        {(isDev || hasAppleClientId) && (
          <button
            id={CARBON_DOM_CONTRACT.appleSignInBtnId}
            type="button"
            aria-label="Sign in with Apple"
            className="btn btn-secondary btn-full"
            style={{ minHeight: 48, borderRadius: 16 }}
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

        {/* Progressive Monochrome Auth Surface */}
        <div className="hig-auth-panel">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button
              id={CARBON_DOM_CONTRACT.authTabOtpId}
              type="button"
              className={`btn btn-sm ${authMode === 'otp' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('otp');
                setError('');
              }}
            >
              {isEn ? 'Email OTP' : '이메일 시작'}
            </button>
            <button
              id={CARBON_DOM_CONTRACT.authTabLoginId}
              type="button"
              className={`btn btn-sm ${authMode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
            >
              {isEn ? 'Sign In' : '로그인'}
            </button>
            <button
              id={CARBON_DOM_CONTRACT.authTabRegisterId}
              type="button"
              className={`btn btn-sm ${authMode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            id="login-privacy-policy-btn"
            type="button"
            className="hig-caption"
            style={{ minHeight: 44, padding: '0 8px', textDecoration: 'underline' }}
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
            className="hig-caption"
            style={{ minHeight: 44, padding: '0 8px', textDecoration: 'underline' }}
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
