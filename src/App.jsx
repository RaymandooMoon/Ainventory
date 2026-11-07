import { useEffect, useState } from 'react';
import {
  BarChart3,
  Camera,
  Layers,
  LogOut,
  Settings,
  Shirt,
  Sun,
} from 'lucide-react';
import AdminPanelView from './components/AdminPanelView.jsx';
import AnalyticsCalendarView from './components/AnalyticsCalendarView.jsx';
import LoginView from './components/LoginView.jsx';
import OutfitStudioView from './components/OutfitStudioView.jsx';
import ShoppingCheckView from './components/ShoppingCheckView.jsx';
import WardrobeView from './components/WardrobeView.jsx';
import WeatherStylingView from './components/WeatherStylingView.jsx';
import { apiFetch, getStoredToken, setStoredToken } from './utils/api.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('weather');
  const [activeCloset, setActiveCloset] = useState('husband');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        if (!getStoredToken()) {
          setBooting(false);
          return;
        }
        const data = await apiFetch('/auth/me');
        setUser(data.user);
        setActiveCloset(data.user.defaultCloset || 'husband');
      } catch {
        setStoredToken('');
      } finally {
        setBooting(false);
      }
    };
    checkSession();
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setActiveCloset(loggedInUser.defaultCloset || 'husband');
    showToast(`${loggedInUser.displayName}님, 환영합니다.`);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken('');
    setUser(null);
  };

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  if (booting) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-muted)',
        }}
      >
        A inventory 아틀리에를 준비하고 있습니다...
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const navItems = [
    { id: 'weather', label: '내일 날씨 코디', icon: Sun },
    { id: 'shopping', label: '쇼핑 판독기', badge: '핵심', icon: Camera },
    { id: 'wardrobe', label: '디지털 옷장', icon: Shirt },
    { id: 'studio', label: '코디 북 · Dress Me', icon: Layers },
    { id: 'analytics', label: '캘린더 · CPW 리포트', icon: BarChart3 },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: '어드민 · 맥미니 서버', icon: Settings });
  }

  return (
    <div className="app-shell">
      {/* Desktop Atelier Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            A inventory
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)', marginTop: 2 }}>
            Smart Wardrobe &amp; Shopping Atelier
          </div>
        </div>

        <div className="closet-switcher" role="group" aria-label="옷장 프로필 전환">
          <button
            id="switch-closet-husband"
            type="button"
            className={`closet-switch-btn ${activeCloset === 'husband' ? 'active' : ''}`}
            onClick={() => setActiveCloset('husband')}
          >
            남편 옷장
          </button>
          <button
            id="switch-closet-wife"
            type="button"
            className={`closet-switch-btn ${activeCloset === 'wife' ? 'active' : ''}`}
            onClick={() => setActiveCloset('wife')}
          >
            와이프 옷장
          </button>
          <button
            id="switch-closet-all"
            type="button"
            className={`closet-switch-btn ${activeCloset === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCloset('all')}
          >
            부부 전체
          </button>
        </div>

        <nav className="nav-list" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                type="button"
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge && <span className="nav-item-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user.displayName}</strong>
            <span>@{user.username} · {user.role === 'admin' ? 'Admin' : 'Tester'}</span>
          </div>
          <button
            id="logout-btn"
            type="button"
            className="icon-btn"
            title="로그아웃"
            onClick={handleLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="mobile-topbar">
        <div className="brand-mark" style={{ fontSize: '1.45rem' }}>
          A inventory
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            aria-label="모바일 옷장 선택"
            className="select-input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8rem' }}
            value={activeCloset}
            onChange={(e) => setActiveCloset(e.target.value)}
          >
            <option value="husband">남편 옷장</option>
            <option value="wife">와이프 옷장</option>
            <option value="all">부부 전체</option>
          </select>

          {user.role === 'admin' && (
            <button
              type="button"
              className="icon-btn"
              aria-label="어드민 설정"
              onClick={() => setActiveTab('admin')}
            >
              <Settings size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="로그아웃"
            onClick={handleLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="main-workspace">
        {activeTab === 'weather' && (
          <WeatherStylingView
            activeCloset={activeCloset}
            onNavigateShopping={() => setActiveTab('shopping')}
            onClosetUpdated={bumpRefresh}
            showToast={showToast}
          />
        )}

        {activeTab === 'shopping' && (
          <ShoppingCheckView
            activeCloset={activeCloset}
            onClosetUpdated={bumpRefresh}
            showToast={showToast}
          />
        )}

        {activeTab === 'wardrobe' && (
          <WardrobeView
            activeCloset={activeCloset}
            refreshKey={refreshKey}
            onClosetUpdated={bumpRefresh}
            showToast={showToast}
          />
        )}

        {activeTab === 'studio' && (
          <OutfitStudioView
            activeCloset={activeCloset}
            refreshKey={refreshKey}
            showToast={showToast}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsCalendarView
            activeCloset={activeCloset}
            refreshKey={refreshKey}
            onClosetUpdated={bumpRefresh}
            showToast={showToast}
          />
        )}

        {activeTab === 'admin' && user.role === 'admin' && (
          <AdminPanelView onClosetUpdated={bumpRefresh} showToast={showToast} />
        )}
      </main>

      {/* Mobile PWA Bottom Navigation */}
      <nav className="mobile-bottom-nav" aria-label="모바일 하단 메뉴">
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'weather' ? 'active' : ''}`}
          onClick={() => setActiveTab('weather')}
        >
          <Sun size={19} />
          <span>내일코디</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'wardrobe' ? 'active' : ''}`}
          onClick={() => setActiveTab('wardrobe')}
        >
          <Shirt size={19} />
          <span>옷장</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn center-cta ${activeTab === 'shopping' ? 'active' : ''}`}
          onClick={() => setActiveTab('shopping')}
        >
          <span className="cta-circle">
            <Camera size={18} />
          </span>
          <span>쇼핑판독</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => setActiveTab('studio')}
        >
          <Layers size={19} />
          <span>코디북</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={19} />
          <span>리포트</span>
        </button>
      </nav>

      {toast && <div className="toast-banner">{toast}</div>}
    </div>
  );
}
