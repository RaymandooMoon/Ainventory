import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  KeyRound,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, setStoredToken } from '../utils/api.js';
import { tr } from '../utils/i18n.js';

export default function LoginView({ onLoginSuccess, lang = 'ko', onChangeLang }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'verify'
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Email verification state (Link Token + 6-digit OTP Code)
  const [verifyToken, setVerifyToken] = useState('');
  const [verifyCodeInput, setVerifyCodeInput] = useState('');
  const [dispatchedCode, setDispatchedCode] = useState('');
  const [verifyLink, setVerifyLink] = useState('');
  const [verifyInfo, setVerifyInfo] = useState(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState(null);
  const [unverifiedAccount, setUnverifiedAccount] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('verify_token');
    if (urlToken) {
      setVerifyToken(urlToken);
      setMode('verify');
      apiFetch(`/auth/verify-info?token=${encodeURIComponent(urlToken)}`)
        .then((res) => {
          const acc = res.account || {
            username: res.username,
            email: res.email,
            display_name: res.displayName,
            alreadyVerified: res.alreadyVerified,
          };
          setVerifyInfo(acc);
          if (res.alreadyVerified) {
            setVerifiedReceipt({
              username: res.username,
              email: res.email,
              verifiedAt: res.verifiedAt,
              verificationHash: res.verificationHash,
            });
          }
        })
        .catch((err) => setError(err.message));
    }
  }, []);

  const fillAccount = (u, p) => {
    setMode('login');
    setUsername(u);
    setPassword(p);
    setError('');
    setNotice('');
    setUnverifiedAccount(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setUnverifiedAccount(null);
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다.');
      if (err.data?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedAccount(err.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          display_name: displayName || username,
          displayName: displayName || username,
        }),
      });
      const vObj = data.verification || {};
      const uObj = data.user || {};
      setVerifyToken(vObj.token || data.verificationToken || '');
      setDispatchedCode(vObj.code || data.verificationCode || '');
      setVerifyCodeInput('');
      setVerifyLink(vObj.verifyUrl || data.verifyUrl || '');
      setVerifyInfo({
        username: uObj.username || data.username,
        email: uObj.email || data.email,
        display_name: uObj.displayName || displayName || data.username,
      });
      setVerifiedReceipt(null);
      setMode('verify');
      setNotice(
        lang === 'en'
          ? 'Verification email dispatched! Enter the 6-digit code or confirm via link.'
          : '인증 메일이 발송되었습니다! 6자리 인증코드를 입력하거나 원클릭 인증을 진행해 주세요.'
      );
    } catch (err) {
      setError(err.message || '회원가입 요청에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async (targetIdentifier) => {
    const idVal = targetIdentifier || verifyInfo?.email || verifyInfo?.username || email || username;
    if (!idVal) return;
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ identifier: idVal }),
      });
      const vObj = data.verification || {};
      const uObj = data.user || {};
      setVerifyToken(vObj.token || '');
      setDispatchedCode(vObj.code || '');
      setVerifyLink(vObj.verifyUrl || '');
      setVerifyInfo({
        username: uObj.username,
        email: uObj.email,
        display_name: uObj.displayName,
      });
      setVerifiedReceipt(null);
      setUnverifiedAccount(null);
      setMode('verify');
      setNotice('새 6자리 이메일 인증코드와 인증 링크가 재발송되었습니다.');
    } catch (err) {
      setError(err.message || '인증 메일 재발송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmVerify = async (e, useLinkToken = false) => {
    if (e?.preventDefault) e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const payload =
        useLinkToken || (!verifyCodeInput.trim() && verifyToken)
          ? { token: verifyToken, issueSession: true }
          : {
              identifier: verifyInfo?.username || verifyInfo?.email || email || username,
              code: verifyCodeInput.trim(),
              issueSession: true,
            };
      const res = await apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setVerifiedReceipt(res);
      if (window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      setError(err.message || '이메일 인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterClosetAfterVerify = () => {
    if (verifiedReceipt?.sessionToken && verifiedReceipt?.user) {
      setStoredToken(verifiedReceipt.sessionToken);
      onLoginSuccess(verifiedReceipt.user);
      return;
    }
    setUsername(verifiedReceipt?.username || verifyInfo?.username || username);
    setMode('login');
  };

  return (
    <main className="auth-screen">
      {/* Left Editorial Showcase */}
      <section className="auth-editorial">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="brand-mark">
            A inventory <span className="brand-mark-sub">Wardrobe Atelier</span>
          </div>

          {onChangeLang && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChangeLang(lang === 'ko' ? 'en' : 'ko')}
              style={{ gap: 6, padding: '6px 12px' }}
            >
              <Globe size={14} />
              <span>{lang === 'ko' ? 'EN' : 'KO'}</span>
            </button>
          )}
        </div>

        <div className="auth-showcase">
          <h1>
            {lang === 'en' ? (
              <>
                Buy Smarter with Wardrobe Data,
                <br />
                Dress for Tomorrow&apos;s Forecast
              </>
            ) : (
              <>
                옷장 속 데이터를 근거로
                <br />
                현명하게 사고, 내일 날씨에 맞춰 입다
              </>
            )}
          </h1>
          <p>
            {lang === 'en'
              ? 'Benchmarking Acloset, GetWardrobe & Whering: photorealistic studio packshots, 11-slot 3D skeletal mannequin with live motions & jiggle physics, and instant duplicate check.'
              : '에이클로젯 · 겟워드롭 · 웨어링의 핵심 장점을 결합한 스마트 옷장. 실사 스튜디오 팩샷, 모션·지글 피직스가 살아있는 11부위 3D 마네킹, 매장 중복 판독기를 경험하세요.'}
          </p>

          <div className="auth-preview-strip">
            <div className="auth-preview-card">
              <img src="/seed/studio-coat.jpg" alt="캐시미어 테일러드 코트" />
              <span>{lang === 'en' ? 'Outer · Tailored' : '아우터 · 테일러드'}</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/navy-knit.jpg" alt="메리노 울 니트" />
              <span>{lang === 'en' ? 'Top · Essential' : '상의 · 에센셜'}</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/charcoal-slacks.jpg" alt="울 와이드 슬랙스" />
              <span>{lang === 'en' ? 'Bottom · Tailored' : '하의 · 테일러드'}</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/studio-briefcase.jpg" alt="이탈리안 레더 서류가방" />
              <span>{lang === 'en' ? 'Bag · Jiggle Physics' : '가방 · 진자 피직스'}</span>
            </div>
          </div>
        </div>

        <div className="auth-pillars">
          <span>{tr(lang, 'pillar1')}</span>
          <span>{tr(lang, 'pillar2')}</span>
          <span>{tr(lang, 'pillar3')}</span>
        </div>
      </section>

      {/* Right Form Pane */}
      <section className="auth-form-pane">
        <div className="auth-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <h2>
              {mode === 'login'
                ? tr(lang, 'loginTitle')
                : mode === 'register'
                  ? tr(lang, 'registerTitle')
                  : tr(lang, 'verifyBannerTitle')}
            </h2>

            <div style={{ display: 'inline-flex', background: 'var(--bg-subtle)', borderRadius: 8, padding: 3, gap: 2 }}>
              <button
                id="auth-tab-login"
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setNotice('');
                }}
                style={{
                  padding: '5px 11px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  borderRadius: 6,
                  background: mode === 'login' ? 'var(--bg-surface)' : 'transparent',
                  color: mode === 'login' ? 'var(--ink-primary)' : 'var(--ink-muted)',
                  boxShadow: mode === 'login' ? 'var(--shadow-soft)' : 'none',
                }}
              >
                {tr(lang, 'tabLogin')}
              </button>
              <button
                id="auth-tab-register"
                type="button"
                onClick={() => {
                  setMode('register');
                  setUsername('');
                  setPassword('');
                  setError('');
                  setNotice('');
                }}
                style={{
                  padding: '5px 11px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  borderRadius: 6,
                  background: mode === 'register' ? 'var(--bg-surface)' : 'transparent',
                  color: mode === 'register' ? 'var(--ink-primary)' : 'var(--ink-muted)',
                  boxShadow: mode === 'register' ? 'var(--shadow-soft)' : 'none',
                }}
              >
                {tr(lang, 'tabRegister')}
              </button>
            </div>
          </div>

          <p className="auth-desc">
            {mode === 'login' ? (
              lang === 'en' ? (
                <>
                  Sign in with <strong>admin / admin</strong> or your email-verified account.
                </>
              ) : (
                <>
                  데모 계정(<strong>admin / admin</strong>) 또는 이메일 인증을 마친 계정으로 접속하세요.
                </>
              )
            ) : mode === 'register' ? (
              tr(lang, 'registerDesc')
            ) : (
              '발송된 6자리 인증코드를 입력하거나 인증 링크를 확인하면 전용 디지털 옷장이 즉시 개설됩니다.'
            )}
          </p>

          {mode === 'login' && (
            <div className="quick-account-row">
              <button
                id="quick-fill-admin"
                type="button"
                className="quick-account-btn"
                onClick={() => fillAccount('admin', 'admin')}
              >
                <strong>{tr(lang, 'quickAdmin')}</strong>
                admin / admin
              </button>
              <button
                id="quick-fill-wife"
                type="button"
                className="quick-account-btn"
                onClick={() => fillAccount('wife', 'wife1234')}
              >
                <strong>{tr(lang, 'quickWife')}</strong>
                wife / wife1234
              </button>
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          {unverifiedAccount && mode === 'login' && (
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-strong)',
                fontSize: '0.82rem',
              }}
            >
              <p style={{ marginBottom: 8 }}>
                <strong>@{unverifiedAccount.username}</strong> 계정의 이메일 인증을 지금 완료하시겠어요?
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-full btn-sm"
                onClick={() => handleResendVerification(unverifiedAccount.username)}
              >
                <MailCheck size={14} /> 인증코드 재발송 및 인증 화면 열기
              </button>
            </div>
          )}

          {notice && (
            <div
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--verdict-buy-bg)',
                color: 'var(--verdict-buy-ink)',
                fontSize: '0.81rem',
                fontWeight: 600,
              }}
            >
              {notice}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field-group">
                <label className="field-label" htmlFor="login-username">
                  {lang === 'en' ? 'Username or Email' : '아이디 또는 이메일'}
                </label>
                <input
                  id="login-username"
                  className="text-input"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="login-password">
                  {tr(lang, 'password')}
                </label>
                <input
                  id="login-password"
                  className="text-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? tr(lang, 'loggingIn') : tr(lang, 'loginBtn')}
                <ArrowRight size={17} />
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister}>
              <div className="field-group">
                <label className="field-label" htmlFor="register-username">
                  {tr(lang, 'username')}
                </label>
                <input
                  id="register-username"
                  className="text-input"
                  type="text"
                  placeholder="예: raymandoo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="register-email">
                  {tr(lang, 'email')}
                </label>
                <input
                  id="register-email"
                  className="text-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="register-display-name">
                  {tr(lang, 'displayName')}
                </label>
                <input
                  id="register-display-name"
                  className="text-input"
                  type="text"
                  placeholder="표시 이름 (예: 민수)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="register-password">
                  {tr(lang, 'password')}
                </label>
                <input
                  id="register-password"
                  className="text-input"
                  type="password"
                  placeholder="4자 이상 비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                id="register-submit-btn"
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? tr(lang, 'registering') : tr(lang, 'registerBtn')}
                <ArrowRight size={17} />
              </button>
            </form>
          )}

          {mode === 'verify' && (
            <div style={{ padding: '4px 0' }}>
              {verifyInfo && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-hairline)',
                    marginBottom: 14,
                    fontSize: '0.83rem',
                  }}
                >
                  <div>
                    <strong>가입 계정:</strong> {verifyInfo.display_name} (@{verifyInfo.username})
                  </div>
                  <div>
                    <strong>수신 이메일:</strong> {verifyInfo.email}
                  </div>
                </div>
              )}

              {!verifiedReceipt ? (
                <>
                  <form onSubmit={(e) => handleConfirmVerify(e, false)}>
                    <div className="field-group">
                      <label className="field-label" htmlFor="verify-otp-input">
                        이메일 6자리 인증코드 입력
                      </label>
                      <input
                        id="verify-otp-input"
                        className="text-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6자리 숫자 코드 (예: 482910)"
                        style={{
                          letterSpacing: '0.24em',
                          fontWeight: 700,
                          fontSize: '1.05rem',
                          textAlign: 'center',
                        }}
                        value={verifyCodeInput}
                        onChange={(e) => setVerifyCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </div>

                    <button
                      id="verify-code-submit-btn"
                      type="submit"
                      className="btn btn-primary btn-full"
                      disabled={loading || (verifyCodeInput.length < 6 && !verifyToken)}
                    >
                      <ShieldCheck size={16} />
                      {loading ? '인증 확인 중...' : '인증코드 확인 및 이메일 인증 완료'}
                    </button>
                  </form>

                  {/* Outbox Email Preview Card (for instant local/demo verification alongside data/outbox/*.html) */}
                  {(dispatchedCode || verifyLink) && (
                    <div
                      style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-canvas)',
                        border: '1px dashed var(--border-strong)',
                        fontSize: '0.79rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <MailCheck size={14} /> 발송된 인증 메일 미리보기 (Outbox)
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 6px', fontSize: '0.73rem' }}
                          onClick={() => handleResendVerification()}
                        >
                          <RefreshCw size={12} /> 재발송
                        </button>
                      </div>

                      {dispatchedCode && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '7px 10px',
                            background: 'var(--bg-surface)',
                            borderRadius: 6,
                            border: '1px solid var(--border-hairline)',
                            marginBottom: 8,
                          }}
                        >
                          <span>
                            발급 코드: <strong style={{ letterSpacing: '0.14em' }}>{dispatchedCode}</strong>
                          </span>
                          <button
                            id="autofill-otp-btn"
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.73rem' }}
                            onClick={() => setVerifyCodeInput(dispatchedCode)}
                          >
                            <KeyRound size={12} /> 코드 자동입력
                          </button>
                        </div>
                      )}

                      {verifyToken && (
                        <button
                          id="verify-by-link-btn"
                          type="button"
                          className="btn btn-sage btn-full btn-sm"
                          disabled={loading}
                          onClick={(e) => handleConfirmVerify(e, true)}
                        >
                          <MailCheck size={14} /> 메일 인증 링크 클릭으로 즉시 완료
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--verdict-buy-bg)',
                    color: 'var(--verdict-buy-ink)',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <CheckCircle2 size={16} /> {tr(lang, 'verifyCompleteMsg')}
                  </div>
                  <div>
                    <strong>인증 시각 (verified_at):</strong> {verifiedReceipt.verifiedAt}
                  </div>
                  <div style={{ wordBreak: 'break-all', marginTop: 4 }}>
                    <strong>무결성 해시 (SHA-256):</strong> {verifiedReceipt.verificationHash}
                  </div>
                  <button
                    id="enter-verified-closet-btn"
                    type="button"
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 12 }}
                    onClick={handleEnterClosetAfterVerify}
                  >
                    내 전용 디지털 옷장 바로 시작하기 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
