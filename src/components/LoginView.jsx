import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Globe, MailCheck, ShieldCheck } from 'lucide-react';
import { apiFetch, setStoredToken } from '../utils/api.js';
import { tr } from '../utils/i18n.js';

export default function LoginView({ onLoginSuccess, lang = 'ko', onChangeLang }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'verify'
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email verification state
  const [verifyToken, setVerifyToken] = useState('');
  const [verifyLink, setVerifyLink] = useState('');
  const [verifyInfo, setVerifyInfo] = useState(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('verify_token');
    if (urlToken) {
      setVerifyToken(urlToken);
      setMode('verify');
      apiFetch(`/auth/verify-info?token=${encodeURIComponent(urlToken)}`)
        .then((res) => setVerifyInfo(res.account))
        .catch((err) => setError(err.message));
    }
  }, []);

  const fillAccount = (u, p) => {
    setMode('login');
    setUsername(u);
    setPassword(p);
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
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
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          displayName: displayName || username,
        }),
      });
      setVerifyToken(data.verification.token);
      setVerifyLink(data.verification.verifyUrl);
      setVerifyInfo({
        username: data.user.username,
        email: data.user.email,
        display_name: data.user.displayName,
      });
    } catch (err) {
      setError(err.message || '회원가입 요청에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmVerify = async () => {
    if (!verifyToken) return;
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
      });
      setVerifiedReceipt(res);
      if (window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      {/* Left Original Editorial Showcase */}
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
              ? 'Instantly check in-store items against your closet for duplicates, and get optimal 11-slot outfits tailored to tomorrow’s weather, your 7 body shapes, and personal color.'
              : '오프라인 매장에서 찍은 사진 한 장으로 내 옷장의 중복 여부를 즉시 판독하고, 내일의 기온과 강수 예보에 맞춰 이미 가진 옷으로 최적의 코디를 제안합니다.'}
          </p>

          <div className="auth-preview-strip">
            <div className="auth-preview-card">
              <img src="/seed/beige-trench.jpg" alt="베이지 맥 트렌치코트" />
              <span>{lang === 'en' ? 'Outer · Water-Repellent' : '아우터 · 발수'}</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/navy-knit.jpg" alt="메리노 울 니트" />
              <span>{lang === 'en' ? 'Top · Essential' : '상의 · 에센셜'}</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/charcoal-slacks.jpg" alt="차콜 와이드 슬랙스" />
              <span>{lang === 'en' ? 'Bottom · Formal' : '하의 · 포멀'}</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/white-sneakers.jpg" alt="화이트 레더 스니커즈" />
              <span>{lang === 'en' ? 'Shoes · Daily' : '신발 · 데일리'}</span>
            </div>
          </div>
        </div>

        <div className="auth-pillars">
          <span>{tr(lang, 'pillar1')}</span>
          <span>{tr(lang, 'pillar2')}</span>
          <span>{tr(lang, 'pillar3')}</span>
        </div>
      </section>

      {/* Right Original Form Pane */}
      <section className="auth-form-pane">
        <div className="auth-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2>
              {mode === 'login'
                ? tr(lang, 'loginTitle')
                : mode === 'register'
                  ? tr(lang, 'registerTitle')
                  : tr(lang, 'verifyBannerTitle')}
            </h2>

            <div style={{ display: 'inline-flex', background: 'var(--bg-subtle)', borderRadius: 8, padding: 3, gap: 2 }}>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                style={{
                  padding: '4px 10px',
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
                type="button"
                onClick={() => {
                  setMode('register');
                  setUsername('');
                  setPassword('');
                  setError('');
                }}
                style={{
                  padding: '4px 10px',
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
                  Sign in with <strong>admin / admin</strong> or your verified account.
                </>
              ) : (
                <>
                  어드민 계정(<strong>admin / admin</strong>) 또는 테스터 계정으로 접속하세요.
                </>
              )
            ) : (
              tr(lang, 'registerDesc')
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

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field-group">
                <label className="field-label" htmlFor="login-username">
                  {tr(lang, 'username')}
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
            <>
              <form onSubmit={handleRegister}>
                <div className="field-group">
                  <label className="field-label">{tr(lang, 'username')}</label>
                  <input
                    className="text-input"
                    type="text"
                    placeholder="예: raymandoo"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">{tr(lang, 'email')}</label>
                  <input
                    className="text-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">{tr(lang, 'displayName')}</label>
                  <input
                    className="text-input"
                    type="text"
                    placeholder="표시 이름"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">{tr(lang, 'password')}</label>
                  <input
                    className="text-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                  {loading ? tr(lang, 'registering') : tr(lang, 'registerBtn')}
                  <ArrowRight size={17} />
                </button>
              </form>

              {verifyLink && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 14,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--verdict-buy-bg)',
                    color: 'var(--verdict-buy-ink)',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MailCheck size={16} /> {tr(lang, 'verifyBannerTitle')}
                  </div>
                  <p style={{ marginBottom: 8 }}>{tr(lang, 'verifyBannerDesc')}</p>
                  <code
                    style={{
                      display: 'block',
                      padding: '6px 8px',
                      background: 'rgba(255,255,255,0.75)',
                      borderRadius: 6,
                      wordBreak: 'break-all',
                      marginBottom: 10,
                    }}
                  >
                    {verifyLink}
                  </code>
                  <button
                    type="button"
                    className="btn btn-sage btn-full btn-sm"
                    onClick={() => setMode('verify')}
                  >
                    <ShieldCheck size={15} /> {tr(lang, 'verifyOpenBtn')}
                  </button>
                </div>
              )}
            </>
          )}

          {mode === 'verify' && (
            <div style={{ padding: '8px 0' }}>
              {verifyInfo && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-subtle)',
                    marginBottom: 16,
                    fontSize: '0.85rem',
                  }}
                >
                  <div>
                    <strong>계정:</strong> {verifyInfo.display_name} (@{verifyInfo.username})
                  </div>
                  <div>
                    <strong>이메일:</strong> {verifyInfo.email}
                  </div>
                </div>
              )}

              {!verifiedReceipt ? (
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={handleConfirmVerify}
                  disabled={loading}
                >
                  <ShieldCheck size={16} />
                  {loading ? '...' : tr(lang, 'verifyConfirmBtn')}
                </button>
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
                    <strong>verified_at:</strong> {verifiedReceipt.verifiedAt}
                  </div>
                  <div style={{ wordBreak: 'break-all', marginTop: 4 }}>
                    <strong>SHA-256:</strong> {verifiedReceipt.verificationHash}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-full btn-sm"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setUsername(verifiedReceipt.username || username);
                      setMode('login');
                    }}
                  >
                    {tr(lang, 'tabLogin')}
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
