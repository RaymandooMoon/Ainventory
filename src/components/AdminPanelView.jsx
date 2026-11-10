import { useEffect, useState } from 'react';
import { RefreshCw, Server, ShieldCheck, UserPlus } from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import { KpiMetricStrip, PageHeader } from './common/AppUI.jsx';

export default function AdminPanelView({ onClosetUpdated, showToast }) {
  const [overview, setOverview] = useState(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newCloset, setNewCloset] = useState('wife');

  const loadOverview = async () => {
    try {
      const data = await apiFetch('/admin/overview');
      setOverview(data);
    } catch (err) {
      showToast(err.message || '어드민 정보를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          display_name: newDisplayName,
          default_closet: newCloset,
        }),
      });
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      loadOverview();
      showToast('새 테스터 계정이 생성되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleResetDemo = async () => {
    if (!window.confirm('데모 옷장 및 기록 데이터를 초기 상태로 리셋할까요? (계정 정보는 유지됩니다)')) {
      return;
    }
    try {
      await apiFetch('/admin/reset-demo', { method: 'POST' });
      loadOverview();
      onClosetUpdated?.();
      showToast('초기 샘플 옷장 데이터로 복원되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="ADMIN & HOME SERVER CONSOLE"
        title="어드민 & 맥미니 M2 서버 콘솔"
        subtitle="부부 테스터 계정 관리, SQLite 데이터베이스 현황, 그리고 향후 App Store / Play Store 및 Mac mini M2 운영 패널입니다."
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleResetDemo}>
            <RefreshCw size={15} /> 샘플 옷장 데이터 초기화
          </button>
        }
      />

      {overview && (
        <>
          <KpiMetricStrip
            items={[
              {
                key: 'closets',
                label: '남편 옷장 / 와이프 옷장',
                value: `${overview.counts.husbandGarments}벌 / ${overview.counts.wifeGarments}벌`,
                sub: '부부 멀티 프로필 분리 저장',
              },
              {
                key: 'outfits',
                label: '저장된 코디 & OOTD',
                value: `${overview.counts.outfits}개 / ${overview.counts.wearLogs}건`,
                sub: '코디 북 및 캘린더 기록',
              },
              {
                key: 'checks',
                label: '쇼핑 판독 누적',
                value: `${overview.counts.shoppingChecks}건`,
                sub: '오프라인 매장 비교 이력',
              },
              {
                key: 'db',
                label: 'SQLite DB 용량',
                value: `${overview.system.dbSizeKb} KB`,
                sub: `Node ${overview.system.nodeVersion} 내장 SQLite`,
              },
            ]}
          />

          <section className="two-col-panels">
            <div className="section-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} /> 등록된 테스터 계정 ({overview.users.length}명)
              </h3>
              <div style={{ marginBottom: 20 }}>
                {overview.users.map((u) => (
                  <div key={u.id} className="cpw-row">
                    <div style={{ flex: 1 }}>
                      <strong>{u.display_name}</strong>{' '}
                      <span style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                        (@{u.username})
                      </span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                        기본 연결 옷장: {u.default_closet === 'husband' ? '남편 옷장' : '와이프 옷장'}
                      </div>
                    </div>
                    <span className="rec-tag">
                      {u.role === 'admin' ? '어드민' : '테스터'}
                    </span>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleCreateUser}
                style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 16 }}
              >
                <h4 style={{ fontSize: '0.92rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserPlus size={15} /> 추가 테스터 계정 발급
                </h4>
                <div className="form-grid-2">
                  <div className="field-group">
                    <label className="field-label">아이디</label>
                    <input
                      className="text-input"
                      placeholder="예: wife2"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">비밀번호</label>
                    <input
                      className="text-input"
                      type="password"
                      placeholder="비밀번호"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="field-group">
                    <label className="field-label">표시 이름</label>
                    <input
                      className="text-input"
                      placeholder="예: 와이프"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">기본 옷장</label>
                    <select
                      className="select-input"
                      value={newCloset}
                      onChange={(e) => setNewCloset(e.target.value)}
                    >
                      <option value="wife">와이프 옷장</option>
                      <option value="husband">남편 옷장</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-full">
                  계정 추가하기
                </button>
              </form>
            </div>

            <div className="section-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={18} /> Mac mini M2 홈서버 & 모바일 로드맵 가이드
              </h3>
              <div style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)', lineHeight: 1.68 }}>
                <p style={{ marginBottom: 12 }}>
                  <strong style={{ color: 'var(--ink-primary)' }}>
                    1단계 (현재 ~ 베타): 모바일 퍼스트 웹앱 + PWA 홈 화면 설치 (강력 추천)
                  </strong>
                  <br />
                  두 분이 우선 테스트하시는 단계에서는 안드로이드/iOS 네이티브 앱을 별도로 개발(연 14만원 애플 개발자 계정 및 심사 필요)하기보다, 현재 구축된 <strong>PWA 웹앱</strong>을 아이폰 Safari · 안드로이드 Chrome에서 <em>&ldquo;홈 화면에 추가&rdquo;</em>로 설치해 쓰시는 것이 개발 속도와 유지보수 면에서 압도적으로 유리합니다. 매장 카메라 촬영도 바로 동작합니다.
                </p>
                <p style={{ marginBottom: 12 }}>
                  <strong style={{ color: 'var(--ink-primary)' }}>
                    2단계 (베타 완성 시): 집 Mac mini M2 배포 & 로컬 AI 연동
                  </strong>
                  <br />
                  본 프로젝트는 네이티브 C++ 빌드 의존성이 없는 Node 내장 <code>node:sqlite</code> 기반이라 여러 PC에서 Git으로 이어 개발한 뒤 맥미니 M2에서 <code>git pull &amp;&amp; npm install &amp;&amp; npm run build &amp;&amp; npm start</code>만으로 즉시 구동됩니다. 외부 접속은 <strong>Tailscale</strong>(부부 스마트폰 전용 무료 VPN) 또는 <strong>Cloudflare Tunnel</strong>을 연결하면 포트포워딩 없이 안전하게 HTTPS 접속이 가능합니다. 또한 M2 칩의 Neural Engine을 활용해 무료 로컬 누끼 제거(<code>rembg</code>)와 CLIP 이미지 임베딩 모델을 붙이기에 최적입니다.
                </p>
                <p>
                  <strong style={{ color: 'var(--ink-primary)' }}>
                    3단계 (대중 출시 확장 시): Capacitor 래핑 또는 Expo 전환
                  </strong>
                  <br />
                  추후 앱스토어 정식 출시를 원하실 때 현재 React UI와 Express API를 그대로 재사용해 <strong>Capacitor</strong>로 iOS/Android 앱 패키징을 얹으면 중복 개발 없이 스토어 배포까지 확장할 수 있습니다.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
