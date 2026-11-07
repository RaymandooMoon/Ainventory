import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { apiFetch, setStoredToken } from '../utils/api.js';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
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

  const fillAccount = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <main className="auth-screen">
      <section className="auth-editorial">
        <div>
          <div className="brand-mark">
            A inventory <span className="brand-mark-sub">Wardrobe Atelier</span>
          </div>
        </div>

        <div className="auth-showcase">
          <h1>
            옷장 속 데이터를 근거로
            <br />
            현명하게 사고, 내일 날씨에 맞춰 입다
          </h1>
          <p>
            오프라인 매장에서 찍은 사진 한 장으로 내 옷장의 중복 여부를 즉시 판독하고,
            내일의 기온과 강수 예보에 맞춰 이미 가진 옷으로 최적의 코디를 제안합니다.
          </p>

          <div className="auth-preview-strip">
            <div className="auth-preview-card">
              <img src="/seed/beige-trench.jpg" alt="베이지 맥 트렌치코트" />
              <span>아우터 · 발수</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/navy-knit.jpg" alt="메리노 울 니트" />
              <span>상의 · 에센셜</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/charcoal-slacks.jpg" alt="차콜 와이드 슬랙스" />
              <span>하의 · 포멀</span>
            </div>
            <div className="auth-preview-card">
              <img src="/seed/white-sneakers.jpg" alt="화이트 레더 스니커즈" />
              <span>신발 · 데일리</span>
            </div>
          </div>
        </div>

        <div className="auth-pillars">
          <span>01 · 오프라인 쇼핑 중복 판독</span>
          <span>02 · 내일 날씨 기반 코디 추천</span>
          <span>03 · 부부 멀티 옷장 & CPW 분석</span>
        </div>
      </section>

      <section className="auth-form-pane">
        <div className="auth-card">
          <h2>아틀리에 로그인</h2>
          <p className="auth-desc">
            어드민 계정(<strong>admin / admin</strong>) 또는 테스터 계정으로 접속하세요.
          </p>

          <div className="quick-account-row">
            <button
              id="quick-fill-admin"
              type="button"
              className="quick-account-btn"
              onClick={() => fillAccount('admin', 'admin')}
            >
              <strong>어드민 (남편)</strong>
              admin / admin
            </button>
            <button
              id="quick-fill-wife"
              type="button"
              className="quick-account-btn"
              onClick={() => fillAccount('wife', 'wife1234')}
            >
              <strong>테스터 (와이프)</strong>
              wife / wife1234
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="login-username">
                아이디
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
                비밀번호
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
              {loading ? '로그인 중...' : 'A inventory 시작하기'}
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
