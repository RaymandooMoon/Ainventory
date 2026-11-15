import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { apiFetch, setStoredToken } from '../utils/api.ts';
import { localizeApiMessage, tr } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import AuthFieldInput from './auth/AuthFieldInput.tsx';
import LoginBackdropCanvas from './auth/LoginBackdropCanvas.tsx';
import { LegalDisclosureModal } from './common/AppUI.jsx';
import './auth/loginAtelier.css';

/**
 * Investor-Grade Adaptive Login & Kinetic AI Wardrobe Atelier Entry Screen
 * - Pure TypeScript HTML5 Canvas 2D Silk/Cashmere Aurora + Adaptive 3D Parallax Curation Cards
 * - Centered Single-Column Adaptive Frosted-Glass Monolith (360px Mobile -> 4K Desktop)
 * - 2-Way High-Contrast Segmented Control (Sign In | Sign Up)
 * - 48x48px Touch Targets, Instant Clear (X) + Password Visibility Toggles, 3-State Exception UX
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

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Sign-Up & Email OTP States (synced with anthropometric 2D/VTON avatar profile)
  const [regEmail, setRegEmail] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regClosetName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regGender, setRegGender] = useState('male');
  const [regHeightCm, setRegHeightCm] = useState('176');
  const [regWeightKg, setRegWeightKg] = useState('70');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devPreviewCode, setDevPreviewCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  // Exception UX States: Loading Action, Inline Validation Errors, Server Alert & Micro-Shake
  const [loadingAction, setLoadingAction] = useState(null); // 'login' | 'apple' | 'otp-send' | 'otp-verify' | 'register' | 'sample' | null
  const [error, setError] = useState('');
  const [lastAttempt, setLastAttempt] = useState(null); // 'login' | 'apple' | 'otp-send' | 'otp-verify' | 'register' | null
  const [fieldErrors, setFieldErrors] = useState({});
  const [isShaking, setIsShaking] = useState(false);
  const [legalModalDoc, setLegalModalDoc] = useState(null); // null | 'privacy' | 'terms'

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const regEmailRef = useRef(null);
  const regOtpRef = useRef(null);
  const regPasswordRef = useRef(null);
  const shakeTimerRef = useRef(null);

  const loading = Boolean(loadingAction);

  const triggerValidationShake = () => {
    triggerHaptic('light');
    setIsShaking(false);
    if (shakeTimerRef.current) {
      clearTimeout(shakeTimerRef.current);
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        setIsShaking(true);
        shakeTimerRef.current = setTimeout(() => setIsShaking(false), 400);
      });
    } else {
      setIsShaking(true);
      shakeTimerRef.current = setTimeout(() => setIsShaking(false), 400);
    }
  };

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) {
        clearTimeout(shakeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const clearFieldError = (key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSelectSignupGender = (nextGender) => {
    const g = nextGender === 'female' ? 'female' : 'male';
    setRegGender(g);
    setRegHeightCm((prev) =>
      prev === '176' || prev === '164' || !prev ? (g === 'female' ? '164' : '176') : prev
    );
    setRegWeightKg((prev) =>
      prev === '70' || prev === '52' || !prev ? (g === 'female' ? '52' : '70') : prev
    );
  };

  const executeLogin = async () => {
    if (loading) return;
    setError('');
    const nextFieldErrors = {};
    if (!username.trim()) {
      nextFieldErrors.username = isEn
        ? 'Please enter your username or email.'
        : '아이디 또는 이메일을 입력해 주세요.';
    }
    if (!password) {
      nextFieldErrors.password = isEn
        ? 'Please enter your password.'
        : '비밀번호를 입력해 주세요.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      triggerValidationShake();
      if (nextFieldErrors.username) {
        usernameRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setLastAttempt('login');
    setLoadingAction('login');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setStoredToken(data.token);
      triggerHaptic('light');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(localizeApiMessage(err.message, lang));
      triggerValidationShake();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    executeLogin();
  };

  const handleEnterSampleDemo = () => {
    if (loading) return;
    setError('');
    setFieldErrors({});
    setLoadingAction('sample');
    triggerHaptic('light');
    try {
      onEnterSampleDemo?.();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (loading) return;
    setError('');
    setFieldErrors({});
    if (!isDev && !hasAppleClientId) {
      setError(
        isEn
          ? 'Apple Sign-In client ID is not configured in this build. Please sign up with email or try the Sample Closet.'
          : '현재 빌드에 Apple 로그인 클라이언트가 설정되지 않았습니다. 회원가입 탭의 이메일 인증 또는 샘플 옷장 체험을 이용해 주세요.'
      );
      triggerValidationShake();
      return;
    }

    setLastAttempt('apple');
    setLoadingAction('apple');
    try {
      const data = await apiFetch('/auth/apple', {
        method: 'POST',
        body: JSON.stringify({
          appleSub: 'apple_hig_member_01',
          email: 'apple.user@privaterelay.appleid.com',
          fullName: isEn ? 'Apple Member' : 'Apple 사용자',
        }),
      });
      setStoredToken(data.token);
      triggerHaptic('light');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(localizeApiMessage(err.message, lang));
      triggerValidationShake();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendOtp = async () => {
    if (loading || cooldownSec > 0) return;
    setError('');
    const cleanEmail = regEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFieldErrors((prev) => ({
        ...prev,
        regEmail: isEn
          ? 'Please enter a valid email address.'
          : '유효한 이메일 주소를 입력해 주세요.',
      }));
      triggerValidationShake();
      regEmailRef.current?.focus();
      return;
    }

    clearFieldError('regEmail');
    setLastAttempt('otp-send');
    setLoadingAction('otp-send');
    try {
      const res = await apiFetch('/auth/send-verification', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail }),
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
      setError(localizeApiMessage(err.message, lang));
      triggerValidationShake();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (loading || otpVerified) return;
    setError('');
    if (!otpCode.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        otpCode: isEn
          ? 'Please enter the 6-digit verification code.'
          : '6자리 인증코드를 입력해 주세요.',
      }));
      triggerValidationShake();
      regOtpRef.current?.focus();
      return;
    }

    clearFieldError('otpCode');
    setLastAttempt('otp-verify');
    setLoadingAction('otp-verify');
    try {
      await apiFetch('/auth/verify-email-code', {
        method: 'POST',
        body: JSON.stringify({ email: regEmail.trim(), code: otpCode.trim() }),
      });
      setOtpVerified(true);
      clearFieldError('regEmail');
      triggerHaptic('medium');
    } catch (err) {
      setError(localizeApiMessage(err.message, lang));
      triggerValidationShake();
    } finally {
      setLoadingAction(null);
    }
  };

  const executeRegister = async () => {
    if (loading) return;
    setError('');
    const nextErrors = {};
    if (!regEmail.trim() || !regEmail.includes('@')) {
      nextErrors.regEmail = isEn
        ? 'Please enter a valid email address.'
        : '유효한 이메일 주소를 입력해 주세요.';
    } else if (!otpVerified) {
      if (otpSent) {
        nextErrors.otpCode = isEn
          ? 'Please click Verify to confirm your 6-digit email code first.'
          : '먼저 인증코드 우측의 확인 버튼을 눌러 이메일 인증을 완료해 주세요.';
      } else {
        nextErrors.regEmail = isEn
          ? 'Please request and verify your email code first.'
          : '먼저 코드 발송을 눌러 이메일 인증을 진행해 주세요.';
      }
    }

    if (regPassword.length < 4) {
      nextErrors.regPassword = isEn
        ? 'Password must be at least 4 characters.'
        : '비밀번호는 최소 4자 이상 입력해 주세요.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      triggerValidationShake();
      if (nextErrors.regEmail) {
        regEmailRef.current?.focus();
      } else if (nextErrors.otpCode) {
        regOtpRef.current?.focus();
      } else {
        regPasswordRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setLastAttempt('register');
    setLoadingAction('register');
    try {
      const resolvedName = regDisplayName.trim() || regEmail.trim().split('@')[0];
      const data = await apiFetch('/auth/register-email', {
        method: 'POST',
        body: JSON.stringify({
          email: regEmail.trim(),
          code: otpCode.trim(),
          password: regPassword,
          displayName: resolvedName,
          closetName:
            regClosetName.trim() || (isEn ? `${resolvedName}'s Closet` : `${resolvedName}의 옷장`),
          gender: regGender,
          heightCm: Number(regHeightCm) || undefined,
          weightKg: Number(regWeightKg) || undefined,
        }),
      });
      setStoredToken(data.token);
      triggerHaptic('medium');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(localizeApiMessage(err.message, lang));
      triggerValidationShake();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCompleteRegister = (e) => {
    e.preventDefault();
    executeRegister();
  };

  const handleRetryAfterError = () => {
    setError('');
    if (lastAttempt === 'login') {
      executeLogin();
      return;
    }
    if (lastAttempt === 'apple') {
      handleAppleSignIn();
      return;
    }
    if (lastAttempt === 'otp-send') {
      handleSendOtp();
      return;
    }
    if (lastAttempt === 'otp-verify') {
      handleVerifyOtp();
      return;
    }
    if (lastAttempt === 'register') {
      executeRegister();
      return;
    }
    if (authMode === 'login') {
      usernameRef.current?.focus();
    } else {
      regEmailRef.current?.focus();
    }
  };

  return (
    <div className="atelier-auth-root" data-auth-theme={effectiveTheme}>
      {/* Seamless Fullscreen Kinetic Silk/Cashmere Canvas + 3D Parallax Couture Curation Stage */}
      <LoginBackdropCanvas effectiveTheme={effectiveTheme} lang={lang} />

      <main className="atelier-auth-stage">
        <div className="atelier-auth-column">
          {/* Top Utility Controls (>= 48x48px Touch Targets, 8px Gap) */}
          <header className="atelier-topbar">
            <span className="atelier-brand-mark">
              <span className="atelier-brand-gem" aria-hidden="true" />
              <span>A INVENTORY</span>
            </span>

            <div className="atelier-utility-group">
              <button
                id={CARBON_DOM_CONTRACT.loginThemeToggleId}
                type="button"
                className="atelier-utility-btn"
                aria-label={isEn ? 'Toggle light or dark mode' : '라이트 다크 모드 전환'}
                onClick={onToggleTheme}
              >
                {effectiveTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>{effectiveTheme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>

              <button
                id={CARBON_DOM_CONTRACT.loginLangToggleId}
                type="button"
                className="atelier-utility-btn"
                aria-label={isEn ? 'Switch language' : '언어 전환'}
                onClick={() => onChangeLang?.(lang === 'ko' ? 'en' : 'ko')}
              >
                <Globe size={15} />
                <span>{lang === 'ko' ? 'EN' : 'KO'}</span>
              </button>
            </div>
          </header>

          {/* Couture Hero Title & Subtitle */}
          <div className="atelier-hero">
            <h1 className="atelier-hero-title">{tr(lang, 'brandTitle')}</h1>
            <p className="atelier-hero-subtitle">
              {isEn
                ? 'AI Weather Styling & Minimal Digital Wardrobe'
                : '날씨 맞춤 AI 스타일링 · 미니멀 디지털 옷장'}
            </p>
          </div>

          {/* Centered Adaptive Frosted-Glass Auth Monolith */}
          <section
            className={`atelier-monolith ${isShaking ? 'is-shaking' : ''}`}
            aria-label={isEn ? 'Authentication panel' : '로그인 및 회원가입 패널'}
          >
            {/* 2-Way Segmented Control: Sign In | Sign Up */}
            <div className="atelier-segmented" role="tablist">
              <button
                id={CARBON_DOM_CONTRACT.authTabLoginId}
                type="button"
                role="tab"
                aria-selected={authMode === 'login'}
                className={`atelier-seg-tab ${authMode === 'login' ? 'is-active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setFieldErrors({});
                }}
              >
                <span>{isEn ? 'Sign In' : '로그인'}</span>
              </button>

              <button
                id={CARBON_DOM_CONTRACT.authTabRegisterId}
                type="button"
                role="tab"
                aria-selected={authMode === 'register'}
                className={`atelier-seg-tab ${authMode === 'register' ? 'is-active' : ''}`}
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                  setFieldErrors({});
                }}
              >
                <span>{isEn ? 'Sign Up' : '회원가입'}</span>
              </button>
            </div>

            {/* High-Contrast Error Banner + Immediate Recovery Actions */}
            {error && (
              <div role="alert" className="atelier-error-card">
                <div className="atelier-error-head">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p className="atelier-error-msg">{error}</p>
                </div>

                <div className="atelier-recovery-row">
                  <button
                    type="button"
                    className="atelier-recovery-btn"
                    disabled={loading}
                    onClick={handleRetryAfterError}
                  >
                    <RotateCcw size={14} />
                    <span>{isEn ? 'Try Again' : '다시 시도'}</span>
                  </button>

                  <button
                    type="button"
                    className="atelier-recovery-btn"
                    disabled={loading}
                    onClick={handleEnterSampleDemo}
                  >
                    <Sparkles size={14} />
                    <span>
                      {isEn ? 'Try Sample Closet Now' : '샘플 옷장으로 바로 체험하기'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Mode 1: Minimal Sign-In Form */}
            {authMode === 'login' && (
              <form onSubmit={handleLoginSubmit} noValidate className="atelier-form">
                <AuthFieldInput
                  ref={usernameRef}
                  id="login-username"
                  value={username}
                  onValueChange={(next) => {
                    setUsername(next);
                    clearFieldError('username');
                  }}
                  lang={lang}
                  errorText={fieldErrors.username}
                  placeholder={isEn ? 'Username or email' : '아이디 또는 이메일'}
                  aria-label={isEn ? 'Username or email' : '아이디 또는 이메일'}
                  autoComplete="username"
                  disabled={loading}
                />

                <AuthFieldInput
                  ref={passwordRef}
                  id="login-password"
                  type="password"
                  value={password}
                  onValueChange={(next) => {
                    setPassword(next);
                    clearFieldError('password');
                  }}
                  lang={lang}
                  errorText={fieldErrors.password}
                  placeholder={isEn ? 'Password' : '비밀번호'}
                  aria-label={isEn ? 'Password' : '비밀번호'}
                  autoComplete="current-password"
                  disabled={loading}
                />

                {isDev && (
                  <div className="atelier-seed-bar">
                    <span className="atelier-seed-label">
                      {isEn ? 'Quick Seed' : '빠른 시드 계정'}
                    </span>
                    <div className="atelier-seed-btns">
                      <button
                        type="button"
                        className="atelier-seed-pill"
                        disabled={loading}
                        onClick={() => {
                          setUsername('admin');
                          setPassword('admin');
                          setError('');
                          setFieldErrors({});
                        }}
                      >
                        {tr(lang, 'closetHusband')}
                      </button>
                      <button
                        type="button"
                        className="atelier-seed-pill"
                        disabled={loading}
                        onClick={() => {
                          setUsername('wife');
                          setPassword('wife1234');
                          setError('');
                          setFieldErrors({});
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
                  className="atelier-primary-btn"
                  disabled={loading}
                  aria-busy={loadingAction === 'login'}
                >
                  {loadingAction === 'login' ? (
                    <>
                      <Loader2 size={18} className="atelier-spin" />
                      <span>{isEn ? 'Signing in...' : '로그인 확인 중...'}</span>
                    </>
                  ) : (
                    <span>{tr(lang, 'loginSubmit')}</span>
                  )}
                </button>
              </form>
            )}

            {/* Mode 2: Progressive Sign-Up Form with Anthropometric Avatar Setup */}
            {authMode === 'register' && (
              <form onSubmit={handleCompleteRegister} noValidate className="atelier-form">
                <div className="atelier-inline-row">
                  <AuthFieldInput
                    ref={regEmailRef}
                    id="register-email-input"
                    type="email"
                    value={regEmail}
                    onValueChange={(next) => {
                      setRegEmail(next);
                      setOtpVerified(false);
                      clearFieldError('regEmail');
                    }}
                    lang={lang}
                    errorText={fieldErrors.regEmail}
                    placeholder="name@example.com"
                    aria-label={isEn ? 'Email address' : '이메일 주소'}
                    autoComplete="email"
                    disabled={loading}
                  />

                  <button
                    id="send-otp-btn"
                    type="button"
                    className="atelier-inline-btn"
                    disabled={loading || cooldownSec > 0}
                    aria-busy={loadingAction === 'otp-send'}
                    onClick={handleSendOtp}
                  >
                    {loadingAction === 'otp-send' ? (
                      <Loader2 size={15} className="atelier-spin" />
                    ) : (
                      <Mail size={15} />
                    )}
                    <span>
                      {loadingAction === 'otp-send'
                        ? isEn
                          ? 'Sending...'
                          : '발송 중...'
                        : cooldownSec > 0
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
                  <div className="atelier-field-block">
                    <div className="atelier-inline-row">
                      <AuthFieldInput
                        ref={regOtpRef}
                        id="register-otp-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        tabular
                        value={otpCode}
                        onValueChange={(next) => {
                          setOtpCode(next);
                          clearFieldError('otpCode');
                        }}
                        lang={lang}
                        errorText={fieldErrors.otpCode}
                        placeholder={isEn ? '6-digit code' : '6자리 인증코드'}
                        aria-label={isEn ? '6-digit verification code' : '6자리 인증코드'}
                        autoComplete="one-time-code"
                        disabled={loading || otpVerified}
                      />

                      <button
                        id="verify-otp-btn"
                        type="button"
                        className={`atelier-inline-btn ${otpVerified ? 'is-verified' : ''}`}
                        disabled={loading || otpVerified}
                        aria-busy={loadingAction === 'otp-verify'}
                        onClick={handleVerifyOtp}
                      >
                        {otpVerified ? (
                          <>
                            <CheckCircle2 size={15} />
                            <span>{isEn ? 'Verified' : '인증됨'}</span>
                          </>
                        ) : loadingAction === 'otp-verify' ? (
                          <>
                            <Loader2 size={15} className="atelier-spin" />
                            <span>{isEn ? 'Checking...' : '확인 중...'}</span>
                          </>
                        ) : (
                          <>
                            <KeyRound size={15} />
                            <span>{isEn ? 'Verify' : '확인'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isDev && devPreviewCode && !otpVerified && (
                      <span className="atelier-dev-otp-hint">
                        {isEn
                          ? `Local dev code: ${devPreviewCode}`
                          : `로컬 테스트 코드: ${devPreviewCode}`}
                      </span>
                    )}
                  </div>
                )}

                <div
                  className="atelier-segmented"
                  role="radiogroup"
                  aria-label={isEn ? 'Select gender' : '성별 선택'}
                >
                  {[
                    { key: 'male', label: isEn ? 'Male' : '남성' },
                    { key: 'female', label: isEn ? 'Female' : '여성' },
                  ].map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      data-signup-gender={g.key}
                      aria-pressed={regGender === g.key}
                      className={`atelier-seg-tab ${regGender === g.key ? 'is-active' : ''}`}
                      disabled={loading}
                      onClick={() => handleSelectSignupGender(g.key)}
                    >
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>

                <div className="atelier-anthro-grid">
                  <AuthFieldInput
                    id="register-name-input"
                    type="text"
                    value={regDisplayName}
                    onValueChange={setRegDisplayName}
                    lang={lang}
                    placeholder={isEn ? 'Nickname' : '닉네임'}
                    aria-label={isEn ? 'Display name' : '이름 / 닉네임'}
                    autoComplete="nickname"
                    disabled={loading}
                  />

                  <AuthFieldInput
                    id="register-height-input"
                    type="number"
                    min={145}
                    max={200}
                    clearable={false}
                    tabular
                    unitSuffix="cm"
                    value={regHeightCm}
                    onValueChange={setRegHeightCm}
                    lang={lang}
                    placeholder="176"
                    aria-label={isEn ? 'Height (cm)' : '신장 cm'}
                    disabled={loading}
                  />

                  <AuthFieldInput
                    id="register-weight-input"
                    type="number"
                    min={38}
                    max={130}
                    clearable={false}
                    tabular
                    unitSuffix="kg"
                    value={regWeightKg}
                    onValueChange={setRegWeightKg}
                    lang={lang}
                    placeholder="70"
                    aria-label={isEn ? 'Weight (kg)' : '체중 kg'}
                    disabled={loading}
                  />
                </div>

                <AuthFieldInput
                  ref={regPasswordRef}
                  id="register-password-input"
                  type="password"
                  value={regPassword}
                  onValueChange={(next) => {
                    setRegPassword(next);
                    clearFieldError('regPassword');
                  }}
                  lang={lang}
                  errorText={fieldErrors.regPassword}
                  placeholder={isEn ? 'Password (4+ chars)' : '비밀번호 (4자 이상)'}
                  aria-label={isEn ? 'Password' : '비밀번호'}
                  autoComplete="new-password"
                  disabled={loading}
                />

                <button
                  id="complete-register-btn"
                  type="submit"
                  className="atelier-primary-btn"
                  disabled={loading}
                  aria-busy={loadingAction === 'register'}
                >
                  {loadingAction === 'register' ? (
                    <>
                      <Loader2 size={18} className="atelier-spin" />
                      <span>{isEn ? 'Creating account...' : '계정 생성 중...'}</span>
                    </>
                  ) : (
                    <span>{isEn ? 'Create Account' : '회원가입 완료'}</span>
                  )}
                </button>
              </form>
            )}

            {/* Quick Experience & Social Entry Actions */}
            <div className="atelier-divider">
              <span>{isEn ? 'Instant Showcase' : '가입 없이 둘러보기'}</span>
            </div>

            <div className="atelier-quick-stack">
              <button
                id={CARBON_DOM_CONTRACT.sampleDemoButtonId}
                type="button"
                aria-label={
                  isEn
                    ? 'Enter Sample Closet Demo Mode'
                    : CARBON_DOM_CONTRACT.sampleDemoAriaLabel
                }
                className="atelier-secondary-btn"
                disabled={loading}
                onClick={handleEnterSampleDemo}
              >
                {loadingAction === 'sample' ? (
                  <Loader2 size={16} className="atelier-spin" />
                ) : (
                  <Play size={15} />
                )}
                <span>
                  {isEn ? 'Sample Closet Demo Mode' : '샘플 옷장 체험 모드'}
                </span>
              </button>

              {(isDev || hasAppleClientId) && (
                <button
                  id={CARBON_DOM_CONTRACT.appleSignInBtnId}
                  type="button"
                  aria-label="Sign in with Apple"
                  className="atelier-secondary-btn"
                  disabled={loading}
                  aria-busy={loadingAction === 'apple'}
                  onClick={handleAppleSignIn}
                >
                  {loadingAction === 'apple' && (
                    <Loader2 size={16} className="atelier-spin" />
                  )}
                  <span>
                    {loadingAction === 'apple'
                      ? isEn
                        ? 'Connecting with Apple...'
                        : 'Apple 계정 연결 중...'
                      : isEn
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
          </section>

          {/* Store Compliance Legal Footer (>= 48px Touch Targets) */}
          <footer className="atelier-legal-footer">
            <button
              id="login-privacy-policy-btn"
              type="button"
              className="atelier-legal-btn"
              onClick={() => setLegalModalDoc('privacy')}
            >
              {isEn ? 'Privacy Policy' : '개인정보처리방침'}
            </button>
            <span className="atelier-legal-dot" aria-hidden="true">
              ·
            </span>
            <button
              id="login-terms-btn"
              type="button"
              className="atelier-legal-btn"
              onClick={() => setLegalModalDoc('terms')}
            >
              {isEn ? 'Terms of Service' : '이용약관'}
            </button>
          </footer>
        </div>
      </main>

      <LegalDisclosureModal
        open={Boolean(legalModalDoc)}
        initialDoc={legalModalDoc || 'privacy'}
        onClose={() => setLegalModalDoc(null)}
        lang={lang}
      />
    </div>
  );
}
