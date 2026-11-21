import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  RotateCcw,
  Sparkles,
  Sun,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { apiFetch, setStoredToken } from '../utils/api.ts';
import { localizeApiMessage, tr } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import AuthFieldInput from './auth/AuthFieldInput.tsx';
import BrandLogo from './auth/BrandLogo.tsx';
import GoogleSignInButton from './auth/GoogleSignInButton.tsx';
import GoogleSignInFallbackModal from './auth/GoogleSignInFallbackModal.tsx';
import LoginBackdropCanvas from './auth/LoginBackdropCanvas.tsx';
import { normalizeLoginThreeVariant } from './auth/loginThreeScenes.ts';
import { LegalDisclosureModal } from './common/AppUI.jsx';
import { isGoogleSignInConfigured, requestGoogleIdToken } from '../services/googleIdentity.ts';
import { resolveInitialAuthStage } from '../utils/authStage.ts';
import { capturePendingLogoFlight } from '../utils/logoTransition.ts';
import './auth/loginAtelier.css';

const GOOGLE_SIGN_IN_BTN_ID = 'google-sign-in-btn';

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
  portalPhase = 'idle',
  onPortalTargetResolved,
}) {
  const isEn = lang === 'en';
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isDev = Boolean(import.meta.env.DEV) || isLocalHost;
  const hasAppleClientId = Boolean(import.meta.env.VITE_APPLE_CLIENT_ID);

  const [authStage, setAuthStage] = useState(() =>
    resolveInitialAuthStage(typeof window !== 'undefined' ? window.location.search : '')
  ); // 'intro' | 'auth'
  const [loginMotionVariant, setLoginMotionVariant] = useState(() => {
    if (typeof window === 'undefined') return 'luxury';
    const params = new URLSearchParams(window.location.search);
    return normalizeLoginThreeVariant(params.get('login_motion'));
  });
  const [variantChangeOrigin, setVariantChangeOrigin] = useState(null);
  const [portalSurgeOrigin, setPortalSurgeOrigin] = useState(null);
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
  const [loadingAction, setLoadingAction] = useState(null); // 'login' | 'google' | 'apple' | 'otp-send' | 'otp-verify' | 'register' | 'sample' | null
  const [error, setError] = useState('');
  const [lastAttempt, setLastAttempt] = useState(null); // 'login' | 'google' | 'apple' | 'otp-send' | 'otp-verify' | 'register' | null
  const [fieldErrors, setFieldErrors] = useState({});
  const [isShaking, setIsShaking] = useState(false);
  const [legalModalDoc, setLegalModalDoc] = useState(null); // null | 'privacy' | 'terms'
  const [googleFallbackOpen, setGoogleFallbackOpen] = useState(false);

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const regEmailRef = useRef(null);
  const regOtpRef = useRef(null);
  const regPasswordRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const brandLogoRef = useRef(null);
  const authRootRef = useRef(null);
  const uiAlphaRef = useRef(0.5);

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

  const isPortalExiting = portalPhase !== 'idle';

  // Global scroll-anywhere opacity gesture:
  // Default 50% (0.50). Scroll/swipe UP -> more transparent (down to 10%), Scroll/swipe DOWN -> more opaque (up to 96%).
  useEffect(() => {
    if (typeof window === 'undefined' || isPortalExiting) return undefined;
    const rootEl = authRootRef.current;
    if (!rootEl) return undefined;

    const applyAlpha = (next) => {
      const clamped = Math.max(0.1, Math.min(0.96, next));
      uiAlphaRef.current = clamped;
      rootEl.style.setProperty('--atelier-ui-alpha', clamped.toFixed(3));
    };

    applyAlpha(uiAlphaRef.current);

    let touchStartY = null;
    let touchLastY = null;

    const onWheel = (e) => {
      if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;
      // deltaY < 0 (scroll up) -> more transparent; deltaY > 0 (scroll down) -> more opaque
      const step = (e.deltaY / 420) * 0.45;
      applyAlpha(uiAlphaRef.current + step);
    };

    const onTouchStart = (e) => {
      const targetTag = e.target?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
        touchStartY = null;
        touchLastY = null;
        return;
      }
      const t = e.touches?.[0];
      if (!t) return;
      touchStartY = t.clientY;
      touchLastY = t.clientY;
    };

    const onTouchMove = (e) => {
      if (touchLastY === null || touchStartY === null) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dy = t.clientY - touchLastY;
      touchLastY = t.clientY;
      if (Math.abs(dy) < 0.5) return;
      // Swipe finger UP (dy < 0) -> more transparent; Swipe finger DOWN (dy > 0) -> more opaque
      const step = (dy / 300) * 0.52;
      applyAlpha(uiAlphaRef.current + step);
    };

    const onTouchEnd = () => {
      touchStartY = null;
      touchLastY = null;
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isPortalExiting]);

  // Choreographed Login Portal Flight: dissolve UI except logo, then glide logo to exact App Header position
  useLayoutEffect(() => {
    if (!isPortalExiting || typeof window === 'undefined') return undefined;
    const logoEl = brandLogoRef.current;
    if (!logoEl) return undefined;

    const srcRect = logoEl.getBoundingClientRect();
    const vw = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    const vh = Math.max(1, window.innerHeight);

    const srcCx = srcRect.left + srcRect.width * 0.5;
    const srcCy = srcRect.top + srcRect.height * 0.5;
    setPortalSurgeOrigin({
      x: (srcCx / vw) * 2 - 1,
      y: -((srcCy / vh) * 2 - 1),
    });

    let cancelled = false;
    let pollFrames = 0;
    let rafId = 0;
    let activeAnim = null;

    const findHeaderLogoRect = () => {
      const targetEl =
        document.querySelector('.hig-native-shell [data-header-brand-btn="true"] .hig-shell-brand-logo') ||
        document.querySelector('.hig-native-shell [data-header-brand-btn="true"]');
      if (!targetEl) return null;
      const r = targetEl.getBoundingClientRect();
      if (r.width > 12 && r.height > 10 && r.top >= 0 && r.top < vh * 0.4) {
        return r;
      }
      return null;
    };

    const launchFlight = (targetRect) => {
      if (cancelled) return;
      const isCompactMobile = vw <= 560;
      const fallbackW = isCompactMobile ? 78 : 112;
      const fallbackH = fallbackW * (394 / 1120);
      const targetCx = targetRect ? targetRect.left + targetRect.width * 0.5 : vw * 0.5;
      const targetCy = targetRect ? targetRect.top + targetRect.height * 0.5 : isCompactMobile ? 42 : 44;
      const targetH = targetRect ? targetRect.height : fallbackH;
      const targetW = targetRect ? targetRect.width : fallbackW;

      onPortalTargetResolved?.({
        x: Math.round(targetCx),
        y: Math.round(targetCy),
      });

      const dx = targetCx - srcCx;
      const dy = targetCy - srcCy;
      const scaleW = srcRect.width > 0 ? targetW / srcRect.width : 0.42;
      const scaleH = srcRect.height > 0 ? targetH / srcRect.height : 0.42;
      const uniformScale = Math.max(0.22, Math.min(1.0, Math.min(scaleW, scaleH)));

      if (typeof logoEl.animate === 'function') {
        activeAnim = logoEl.animate(
          [
            {
              transform: 'translate3d(0px, 0px, 0) scale(1)',
            },
            {
              transform: `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${uniformScale.toFixed(4)})`,
            },
          ],
          {
            duration: 740,
            delay: 140,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          }
        );
      }
    };

    const pollForTarget = () => {
      if (cancelled) return;
      const found = findHeaderLogoRect();
      pollFrames += 1;
      if (found || pollFrames >= 32) {
        launchFlight(found);
        return;
      }
      rafId = window.requestAnimationFrame(pollForTarget);
    };

    rafId = window.requestAnimationFrame(pollForTarget);

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (activeAnim) activeAnim.cancel();
    };
  }, [isPortalExiting, onPortalTargetResolved]);

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
      capturePendingLogoFlight(brandLogoRef.current);
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
    void import('./OutfitStudioView.jsx');
    capturePendingLogoFlight(brandLogoRef.current);
    try {
      onEnterSampleDemo?.();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setError('');
    setFieldErrors({});

    // If Google Client ID is not configured (e.g. GitHub Pages static demo), surface fallback modal
    if (!isGoogleSignInConfigured()) {
      setGoogleFallbackOpen(true);
      return;
    }

    setLastAttempt('google');
    setLoadingAction('google');
    try {
      const credential = await requestGoogleIdToken();
      const data = await apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      });
      setStoredToken(data.token);
      triggerHaptic('light');
      capturePendingLogoFlight(brandLogoRef.current);
      onLoginSuccess(data.user);
    } catch (err) {
      if (err?.reason === 'not_configured') {
        setGoogleFallbackOpen(true);
      } else if (err?.reason !== 'dismissed') {
        setError(localizeApiMessage(err.message, lang));
        triggerValidationShake();
      }
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
      capturePendingLogoFlight(brandLogoRef.current);
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
      capturePendingLogoFlight(brandLogoRef.current);
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
    if (lastAttempt === 'google') {
      handleGoogleSignIn();
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

  const isIntro = authStage === 'intro';

  const handleGetStarted = () => {
    if (!isIntro) return;
    triggerHaptic('selection');
    void import('./OutfitStudioView.jsx');
    setAuthStage('auth');
  };

  return (
    <div
      ref={authRootRef}
      className={`atelier-auth-root ${isPortalExiting ? 'is-portal-exiting' : ''}`}
      data-auth-theme={effectiveTheme}
      data-auth-stage={authStage}
      data-portal-phase={portalPhase}
    >
      {/* Seamless Fullscreen Three.js 3D Draped Silk Cloth Stage */}
      <LoginBackdropCanvas
        effectiveTheme={effectiveTheme}
        lang={lang}
        stage={isPortalExiting ? 'portal' : authStage}
        paused={portalPhase === 'revealing'}
        motionVariant={loginMotionVariant}
        variantChangeOrigin={variantChangeOrigin}
        portalSurgeOrigin={portalSurgeOrigin}
      />

      {/* Top Utility Controls: Single Silk Palette Toggle (Left) + Theme & Lang (Right) */}
      <header className="atelier-topbar">
        <div className="atelier-utility-group">
          <button
            type="button"
            className="atelier-utility-btn atelier-silk-toggle-btn"
            data-motion-option={loginMotionVariant}
            aria-label={
              isEn
                ? `Switch silk backdrop (${loginMotionVariant === 'luxury' ? 'Luxury' : 'Aurora'})`
                : `실크 배경 전환 (현재 ${loginMotionVariant === 'luxury' ? '럭셔리' : '오로라'})`
            }
            onClick={(e) => {
              triggerHaptic('selection');
              if (typeof window !== 'undefined') {
                const vw = Math.max(1, window.innerWidth);
                const vh = Math.max(1, window.innerHeight);
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = rect.left + rect.width * 0.5;
                const cy = rect.top + rect.height * 0.5;
                setVariantChangeOrigin({
                  x: (cx / vw) * 2 - 1,
                  y: -((cy / vh) * 2 - 1),
                  seq: Date.now(),
                });
              }
              setLoginMotionVariant((prev) => (prev === 'luxury' ? 'aurora' : 'luxury'));
            }}
          >
            <Sparkles size={14} />
            <span>
              {loginMotionVariant === 'luxury'
                ? isEn
                  ? 'Luxury'
                  : '럭셔리'
                : isEn
                  ? 'Aurora'
                  : '오로라'}
            </span>
          </button>
        </div>

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

      <main className="atelier-auth-stage" data-auth-stage={authStage}>
        <div className="atelier-auth-column" data-auth-stage={authStage}>
          {/* Dual-Theme iNVTRY Logo — Centered in Intro, Glides Upward on Get Started */}
          <div className="atelier-hero">
            <h1 className="sr-only">{tr(lang, 'brandTitle')}</h1>
            <BrandLogo
              ref={brandLogoRef}
              effectiveTheme={effectiveTheme}
              alt={tr(lang, 'brandTitle')}
            />
          </div>

          {/* Rimowa-Style Upward Reveal Container: Transparent -> Opaque Auth Monolith */}
          <div
            className={`atelier-auth-reveal ${isIntro ? 'is-hidden' : 'is-revealed'}`}
            aria-hidden={isIntro}
            inert={isIntro}
          >
            {/* Centered Adaptive Frosted-Glass Auth Monolith */}
            <section
              className={`atelier-monolith ${isShaking ? 'is-shaking' : ''}`}
              aria-label={isEn ? 'Authentication panel' : '로그인 및 회원가입 패널'}
            >
            {/* Top Priority: Google Sign-in and Apple Sign-in Stack */}
            <div className="atelier-social-stack">
              <GoogleSignInButton
                id={GOOGLE_SIGN_IN_BTN_ID}
                onClick={handleGoogleSignIn}
                disabled={loading}
                loading={loadingAction === 'google'}
                lang={lang}
              />

              <button
                id={CARBON_DOM_CONTRACT.appleSignInBtnId}
                type="button"
                aria-label="Sign in with Apple"
                className="atelier-secondary-btn"
                disabled={loading}
                aria-busy={loadingAction === 'apple'}
                onClick={handleAppleSignIn}
              >
                {loadingAction === 'apple' ? (
                  <Loader2 size={16} className="atelier-spin" />
                ) : (
                  <svg
                    width="15"
                    height="18"
                    viewBox="0 0 170 202"
                    fill="currentColor"
                    aria-hidden="true"
                    style={{ flexShrink: 0, marginTop: -2 }}
                  >
                    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.92.22-9.84-1.95-14.75-6.52-3.13-2.73-7.04-7.41-11.73-14.04-5.03-7.08-9.17-15.29-12.41-24.65-3.47-10.11-5.2-19.9-5.2-29.38 0-10.86 2.71-20.22 8.13-28.07 4.25-6.27 9.91-11.22 16.99-14.84 7.08-3.62 14.72-5.49 22.92-5.61 4.48 0 10.35 1.39 17.61 4.14 7.26 2.75 11.94 4.17 14.04 4.26 1.56 0 6.84-1.64 15.83-4.91 8.49-3.04 15.65-4.3 21.48-3.8 15.87 1.28 27.79 7.55 35.75 18.8-14.2 8.6-21.22 20.62-21.05 36.06.17 12.02 4.49 22.02 12.96 29.99 3.86 3.67 8.47 6.5 13.84 8.5-1.11 3.24-2.29 6.32-3.54 9.24zM119.22 31.01c0 9.42-3.44 18.21-10.31 26.36-8.28 9.69-18.31 15.27-29.21 14.37-.14-1.13-.22-2.32-.22-3.58 0-9.04 3.93-18.71 10.92-26.64 3.49-4.01 7.93-7.34 13.32-10 5.38-2.62 10.48-4.07 15.29-4.35.14 1.3.21 2.58.21 3.84z" />
                  </svg>
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
            </div>

            {/* '또는' Divider */}
            <div className="atelier-divider">
              <span>{isEn ? 'or with account' : '또는'}</span>
            </div>

            {/* 2-Way Segmented Control: Sign In | Sign Up */}
            <div
              className="atelier-segmented"
              role="tablist"
              aria-label={isEn ? 'Authentication mode' : '인증 방식 선택'}
            >
              <button
                id={CARBON_DOM_CONTRACT.authTabLoginId}
                type="button"
                role="tab"
                aria-selected={authMode === 'login'}
                aria-controls="auth-panel-login"
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
                aria-controls="auth-panel-register"
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

            {/* Mode 1: Minimal Sign-In Form */}
            {authMode === 'login' && (
              <form
                id="auth-panel-login"
                role="tabpanel"
                aria-labelledby={CARBON_DOM_CONTRACT.authTabLoginId}
                onSubmit={handleLoginSubmit}
                noValidate
                className="atelier-form"
              >
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

                {/* Slim Inline System Note at bottom of form (role="status", aria-live="polite") */}
                {error && (
                  <div role="status" aria-live="polite" className="atelier-inline-note">
                    <div className="atelier-inline-note-main">
                      <AlertCircle size={14} className="atelier-inline-note-icon" />
                      <p className="atelier-inline-note-text">{error}</p>
                    </div>
                    <button
                      type="button"
                      className="atelier-inline-note-retry-btn"
                      disabled={loading}
                      onClick={handleRetryAfterError}
                    >
                      <RotateCcw size={12} />
                      <span>{isEn ? 'Retry' : '다시 시도'}</span>
                    </button>
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
              <form
                id="auth-panel-register"
                role="tabpanel"
                aria-labelledby={CARBON_DOM_CONTRACT.authTabRegisterId}
                onSubmit={handleCompleteRegister}
                noValidate
                className="atelier-form"
              >
                <ol
                  className="atelier-signup-stepper"
                  aria-label={isEn ? 'Sign-up progress' : '회원가입 단계'}
                >
                  <li
                    className={`atelier-signup-step ${
                      otpVerified ? 'is-done' : 'is-current'
                    }`}
                  >
                    <span className="atelier-signup-step-num">01</span>
                    <span>{isEn ? 'Verify Email' : '이메일 인증'}</span>
                  </li>
                  <li
                    className={`atelier-signup-step ${
                      otpVerified && Boolean(regDisplayName.trim() || regHeightCm)
                        ? 'is-done'
                        : otpVerified
                          ? 'is-current'
                          : ''
                    }`}
                  >
                    <span className="atelier-signup-step-num">02</span>
                    <span>{isEn ? 'Fit Profile' : '피팅 프로필'}</span>
                  </li>
                  <li
                    className={`atelier-signup-step ${
                      regPassword.length >= 4
                        ? 'is-done'
                        : otpVerified
                          ? 'is-current'
                          : ''
                    }`}
                  >
                    <span className="atelier-signup-step-num">03</span>
                    <span>{isEn ? 'Password' : '비밀번호'}</span>
                  </li>
                </ol>

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

                {/* Slim Inline System Note at bottom of register form */}
                {error && (
                  <div role="status" aria-live="polite" className="atelier-inline-note">
                    <div className="atelier-inline-note-main">
                      <AlertCircle size={14} className="atelier-inline-note-icon" />
                      <p className="atelier-inline-note-text">{error}</p>
                    </div>
                    <button
                      type="button"
                      className="atelier-inline-note-retry-btn"
                      disabled={loading}
                      onClick={handleRetryAfterError}
                    >
                      <RotateCcw size={12} />
                      <span>{isEn ? 'Retry' : '다시 시도'}</span>
                    </button>
                  </div>
                )}

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

            {/* Secondary Text Button: Experience with Sample Closet (DESIGN.md v3) */}
            <div className="atelier-sample-demo-row">
              <button
                id={CARBON_DOM_CONTRACT.sampleDemoButtonId}
                type="button"
                aria-label={
                  isEn
                    ? 'Experience with Sample Closet'
                    : CARBON_DOM_CONTRACT.sampleDemoAriaLabel
                }
                className="atelier-text-btn"
                disabled={loading}
                onClick={handleEnterSampleDemo}
              >
                <span>{isEn ? 'Explore with Sample Closet' : '샘플 옷장으로 체험하기'}</span>
              </button>
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
        </div>
      </main>

      {/* Boro-Style Bottom "Get started" Intro Pill Dock */}
      <div
        className={`atelier-intro-dock ${isIntro ? 'is-visible' : 'is-dismissed'}`}
        aria-hidden={!isIntro}
        inert={!isIntro}
      >
        <button
          id={CARBON_DOM_CONTRACT.introGetStartedBtnId}
          type="button"
          className="atelier-get-started-btn"
          aria-label={isEn ? 'Get started' : '시작하기 (Get started)'}
          onClick={handleGetStarted}
        >
          <span>Get started</span>
        </button>
      </div>

      <GoogleSignInFallbackModal
        open={googleFallbackOpen}
        onClose={() => setGoogleFallbackOpen(false)}
        onSampleDemo={handleEnterSampleDemo}
        onContinueWithEmail={() => {
          setAuthMode('login');
          usernameRef.current?.focus();
        }}
        lang={lang}
      />

      <LegalDisclosureModal
        open={Boolean(legalModalDoc)}
        initialDoc={legalModalDoc || 'privacy'}
        onClose={() => setLegalModalDoc(null)}
        lang={lang}
      />
    </div>
  );
}
