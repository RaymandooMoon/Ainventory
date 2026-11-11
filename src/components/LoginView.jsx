import { useEffect, useState } from 'react';
import { CheckCircle2, Globe, KeyRound, Mail, Moon, Play, Sun } from 'lucide-react';
import { apiFetch, setStoredToken } from '../utils/api.js';
import { triggerHaptic } from '../utils/nativeBridge.js';

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
  onToggleTheme,
}) {
  const [authMode, setAuthMode] = useState('otp'); // 'otp' | 'login' | 'register'
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
      setError('유효한 이메일 주소를 입력해 주세요.');
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
      if (res.devPreviewCode) {
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
      setError('6자리 인증코드를 입력해 주세요.');
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
      setError('6자리 인증코드를 입력해 주세요.');
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
      setError('먼저 이메일 인증코드 확인을 완료해 주세요.');
      return;
    }
    if (regPassword.length < 4) {
      setError('비밀번호는 최소 4자 이상 입력해 주세요.');
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
          <span className="hig-caption">DIGITAL WARDROBE &amp; 3D STUDIO</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id="login-theme-toggle-btn"
              type="button"
              className="icon-btn"
              aria-label="라이트 다크 모드 전환"
              onClick={onToggleTheme}
            >
              {document.documentElement.getAttribute('data-theme') === 'dark' ? (
                <Sun size={15} />
              ) : (
                <Moon size={15} />
              )}
            </button>
            <button
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
          <h1 className="hig-large-title">A inventory</h1>
          <p className="hig-caption" style={{ marginTop: 8 }}>
            실사 의류 누끼와 날씨 기반 3D 마네킹이 연동되는 미니멀 디지털 옷장
          </p>
        </div>

        {/* Unauthenticated Immediate Sample Closet Demo Entry (Req 8.a & 12.a — Robo Crawler & First-Time Users) */}
        <button
          id="enter-sample-demo-btn"
          type="button"
          aria-label="샘플 옷장 체험 모드 시작"
          className="btn btn-primary btn-full"
          style={{ minHeight: 48, borderRadius: 16 }}
          onClick={() => onEnterSampleDemo?.()}
        >
          <Play size={16} />
          <span>샘플 옷장 체험 모드</span>
        </button>

        {/* Sign in with Apple (Req 10.b — Mandatory iOS App Store Parity) */}
        <button
          id="apple-signin-btn"
          type="button"
          aria-label="Sign in with Apple"
          className="btn btn-secondary btn-full"
          style={{ minHeight: 48, borderRadius: 16 }}
          disabled={loading}
          onClick={handleAppleSignIn}
        >
          <span>Apple로 계속하기</span>
        </button>

        {/* Progressive Monochrome Auth Surface */}
        <div className="hig-auth-panel">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button
              id="auth-tab-otp"
              type="button"
              className={`btn btn-sm ${authMode === 'otp' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('otp');
                setError('');
              }}
            >
              이메일 시작
            </button>
            <button
              id="auth-tab-login"
              type="button"
              className={`btn btn-sm ${authMode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
            >
              로그인
            </button>
            <button
              id="auth-tab-register"
              type="button"
              className={`btn btn-sm ${authMode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('register');
                setError('');
              }}
            >
              회원가입
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
                  id="email-auth-input"
                  type="email"
                  className="text-input"
                  style={{ flex: 1, background: 'var(--bg-canvas)' }}
                  placeholder="name@example.com"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    setOtpVerified(false);
                  }}
                  required
                />
                <button
                  id="request-email-code-btn"
                  type="button"
                  className="btn btn-secondary btn-sm tabular-nums"
                  disabled={loading || cooldownSec > 0}
                  onClick={handleSendOtp}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Mail size={14} />
                  <span>
                    {cooldownSec > 0
                      ? `재발송 ${cooldownSec}s`
                      : otpSent
                        ? '재발송'
                        : '코드 받기'}
                  </span>
                </button>
              </div>

              {otpSent && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      id="email-otp-code-input"
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
                      placeholder="6자리 인증코드"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                    <button
                      id="verify-email-code-btn"
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={loading}
                    >
                      <KeyRound size={14} />
                      <span>인증 시작</span>
                    </button>
                  </div>
                  {devPreviewCode && !otpVerified && (
                    <span className="hig-caption tabular-nums">
                      로컬 테스트 코드: {devPreviewCode}
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
                placeholder="아이디 또는 이메일"
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
                placeholder="비밀번호"
                autoComplete="current-password"
                required
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span className="hig-caption">데모 계정</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setUsername('husband');
                      setPassword('husband1234');
                      setError('');
                    }}
                  >
                    남편 옷장
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
                    아내 옷장
                  </button>
                </div>
              </div>
              <button
                id="login-submit-btn"
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? '로그인 중...' : '로그인'}
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
                      ? `재발송 ${cooldownSec}s`
                      : otpSent
                        ? '재발송'
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
                      placeholder="6자리 코드"
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
                          <CheckCircle2 size={14} /> 인증됨
                        </>
                      ) : (
                        <>
                          <KeyRound size={14} /> 확인
                        </>
                      )}
                    </button>
                  </div>
                  {devPreviewCode && !otpVerified && (
                    <span className="hig-caption tabular-nums">
                      로컬 테스트 코드: {devPreviewCode}
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
                  placeholder="이름 / 닉네임"
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                />
                <select
                  className="select-input"
                  style={{ background: 'var(--bg-canvas)' }}
                  value={regGender}
                  onChange={(e) => setRegGender(e.target.value)}
                  aria-label="성별 선택"
                >
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                </select>
              </div>

              <input
                id="register-closet-input"
                type="text"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder="내 옷장 이름 (선택)"
                value={regClosetName}
                onChange={(e) => setRegClosetName(e.target.value)}
              />

              <input
                id="register-password-input"
                type="password"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder="비밀번호 (4자 이상)"
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
                {loading ? '가입 처리 중...' : '빈 옷장으로 시작하기'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
