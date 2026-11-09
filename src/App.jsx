import { useEffect, useState } from 'react';
import {
  BarChart3,
  Camera,
  Globe,
  Layers,
  LogOut,
  Settings,
  Shirt,
  Sparkles,
  Sun,
} from 'lucide-react';
import AdminPanelView from './components/AdminPanelView.jsx';
import AnalyticsCalendarView from './components/AnalyticsCalendarView.jsx';
import LoginView from './components/LoginView.jsx';
import OutfitStudioView from './components/OutfitStudioView.jsx';
import ProfilePersonalColorModal from './components/ProfilePersonalColorModal.jsx';
import ShoppingCheckView from './components/ShoppingCheckView.jsx';
import WardrobeView from './components/WardrobeView.jsx';
import WeatherStylingView from './components/WeatherStylingView.jsx';
import { apiFetch, getStoredToken, setStoredToken } from './utils/api.js';
import { getStoredLang, setStoredLang, tr } from './utils/i18n.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('weather');
  const [activeCloset, setActiveCloset] = useState('husband');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState('');
  const [lang, setLang] = useState(getStoredLang());

  // Modals for first-login closet name & styling/personal-color profile
  const [closetSetupInput, setClosetSetupInput] = useState('');
  const [savingClosetName, setSavingClosetName] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
  };

  const handleChangeLang = (nextLang) => {
    const valid = setStoredLang(nextLang);
    setLang(valid);
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
        if (data.user.closetName && (!data.user.profileCompleted || !data.user.personalColor)) {
          setShowProfileModal(true);
        }
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
    if (loggedInUser.closetName && (!loggedInUser.profileCompleted || !loggedInUser.personalColor)) {
      setShowProfileModal(true);
    }
    showToast(
      lang === 'en'
        ? `Welcome, ${loggedInUser.displayName}.`
        : `${loggedInUser.displayName}님, 환영합니다.`,
    );
  };

  const handleSaveClosetName = async (e) => {
    e.preventDefault();
    if (!closetSetupInput.trim()) return;
    setSavingClosetName(true);
    try {
      const res = await apiFetch('/auth/closet-setup', {
        method: 'POST',
        body: JSON.stringify({ closetName: closetSetupInput.trim() }),
      });
      setUser(res.user);
      showToast(
        lang === 'en'
          ? `Closet "${res.user.closetName}" initialized!`
          : `"${res.user.closetName}" 옷장이 설정되었습니다.`,
      );
      if (!res.user.profileCompleted || !res.user.personalColor) {
        setShowProfileModal(true);
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setSavingClosetName(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken('');
    setUser(null);
    setShowProfileModal(false);
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
        {tr(lang, 'loadingAtelier')}
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        lang={lang}
        onChangeLang={handleChangeLang}
      />
    );
  }

  const userDefaultCloset = user.defaultCloset || 'husband';
  const isCustomUserCloset =
    userDefaultCloset !== 'husband' && userDefaultCloset !== 'wife';

  const navItems = [
    { id: 'weather', label: tr(lang, 'navWeather'), icon: Sun },
    {
      id: 'shopping',
      label: tr(lang, 'navShopping'),
      badge: tr(lang, 'badgeCore'),
      icon: Camera,
    },
    { id: 'wardrobe', label: tr(lang, 'navWardrobe'), icon: Shirt },
    { id: 'studio', label: tr(lang, 'navStudio'), icon: Layers },
    { id: 'analytics', label: tr(lang, 'navAnalytics'), icon: BarChart3 },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: tr(lang, 'navAdmin'), icon: Settings });
  }

  const needsClosetSetup = !user.closetName;

  return (
    <div className="app-shell">
      {/* Desktop Atelier Sidebar */}
      <aside className="sidebar">
        <div
          className="sidebar-brand"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <div className="brand-mark">A inventory</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--ink-muted)', marginTop: 2 }}>
              {tr(lang, 'brandSubtitle')}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            onClick={() => handleChangeLang(lang === 'ko' ? 'en' : 'ko')}
            title="KO / EN Language Toggle"
          >
            <Globe size={12} /> {lang === 'ko' ? 'EN' : 'KO'}
          </button>
        </div>

        <div className="closet-switcher" role="group" aria-label="옷장 프로필 전환">
          {isCustomUserCloset ? (
            <>
              <button
                id="switch-closet-personal"
                type="button"
                className={`closet-switch-btn ${activeCloset === userDefaultCloset ? 'active' : ''}`}
                onClick={() => setActiveCloset(userDefaultCloset)}
              >
                {user.closetName || tr(lang, 'closetPersonal')}
              </button>
              <button
                id="switch-closet-husband"
                type="button"
                className={`closet-switch-btn ${activeCloset === 'husband' ? 'active' : ''}`}
                onClick={() => setActiveCloset('husband')}
              >
                {tr(lang, 'closetHusband')}
              </button>
              <button
                id="switch-closet-all"
                type="button"
                className={`closet-switch-btn ${activeCloset === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCloset('all')}
              >
                {tr(lang, 'closetAll')}
              </button>
            </>
          ) : (
            <>
              <button
                id="switch-closet-husband"
                type="button"
                className={`closet-switch-btn ${activeCloset === 'husband' ? 'active' : ''}`}
                onClick={() => setActiveCloset('husband')}
              >
                {userDefaultCloset === 'husband' && user.closetName
                  ? user.closetName
                  : tr(lang, 'closetHusband')}
              </button>
              <button
                id="switch-closet-wife"
                type="button"
                className={`closet-switch-btn ${activeCloset === 'wife' ? 'active' : ''}`}
                onClick={() => setActiveCloset('wife')}
              >
                {userDefaultCloset === 'wife' && user.closetName
                  ? user.closetName
                  : tr(lang, 'closetWife')}
              </button>
              <button
                id="switch-closet-all"
                type="button"
                className={`closet-switch-btn ${activeCloset === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCloset('all')}
              >
                {tr(lang, 'closetAll')}
              </button>
            </>
          )}
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

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-secondary btn-full btn-sm"
            style={{ justifyContent: 'flex-start', gap: 8 }}
            onClick={() => setShowProfileModal(true)}
          >
            <Sparkles size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tr(lang, 'profileBtn')}
            </span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user.displayName}</strong>
            <span>
              @{user.username} · {user.personalColor || (user.role === 'admin' ? 'Admin' : 'Member')}
            </span>
          </div>
          <button
            id="logout-btn"
            type="button"
            className="icon-btn"
            title={tr(lang, 'logout')}
            onClick={handleLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="mobile-topbar">
        <div className="brand-mark" style={{ fontSize: '1.4rem' }}>
          A inventory
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => handleChangeLang(lang === 'ko' ? 'en' : 'ko')}
            title="KO / EN"
            style={{ width: 'auto', padding: '0 8px', fontSize: '0.74rem', fontWeight: 700 }}
          >
            {lang === 'ko' ? 'EN' : 'KO'}
          </button>

          <select
            aria-label="모바일 옷장 선택"
            className="select-input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: '0.78rem' }}
            value={activeCloset}
            onChange={(e) => setActiveCloset(e.target.value)}
          >
            {isCustomUserCloset && (
              <option value={userDefaultCloset}>
                {user.closetName || tr(lang, 'closetPersonal')}
              </option>
            )}
            <option value="husband">{tr(lang, 'closetHusband')}</option>
            <option value="wife">{tr(lang, 'closetWife')}</option>
            <option value="all">{tr(lang, 'closetAll')}</option>
          </select>

          <button
            type="button"
            className="icon-btn"
            aria-label="퍼스널컬러 및 체형 설정"
            onClick={() => setShowProfileModal(true)}
          >
            <Sparkles size={15} />
          </button>

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
            aria-label={tr(lang, 'logout')}
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
            user={user}
            lang={lang}
            onNavigateShopping={() => setActiveTab('shopping')}
            onOpenProfileModal={() => setShowProfileModal(true)}
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
            user={user}
            lang={lang}
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
          <span>{tr(lang, 'mobileWeather')}</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'wardrobe' ? 'active' : ''}`}
          onClick={() => setActiveTab('wardrobe')}
        >
          <Shirt size={19} />
          <span>{tr(lang, 'mobileWardrobe')}</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn center-cta ${activeTab === 'shopping' ? 'active' : ''}`}
          onClick={() => setActiveTab('shopping')}
        >
          <span className="cta-circle">
            <Camera size={18} />
          </span>
          <span>{tr(lang, 'mobileShopping')}</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => setActiveTab('studio')}
        >
          <Layers size={19} />
          <span>{tr(lang, 'mobileStudio')}</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={19} />
          <span>{tr(lang, 'mobileReport')}</span>
        </button>
      </nav>

      {/* First-Login Closet Name Setup Modal */}
      {needsClosetSetup && (
        <div className="modal-backdrop" style={{ zIndex: 130 }}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>
              {tr(lang, 'closetSetupTitle')}
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)', marginBottom: 16 }}>
              {tr(lang, 'closetSetupDesc')}
            </p>
            <form onSubmit={handleSaveClosetName}>
              <div className="field-group">
                <label className="field-label">{tr(lang, 'closetNameLabel')}</label>
                <input
                  className="text-input"
                  placeholder={tr(lang, 'closetNamePlaceholder')}
                  value={closetSetupInput}
                  onChange={(e) => setClosetSetupInput(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={savingClosetName}
              >
                {savingClosetName ? '...' : tr(lang, 'closetSaveBtn')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Styling Profile + 7 Body Shapes + Personal Color Modal */}
      {showProfileModal && !needsClosetSetup && (
        <ProfilePersonalColorModal
          user={user}
          lang={lang}
          onClose={() => setShowProfileModal(false)}
          onSaved={(updatedUser, seededStats) => {
            setUser(updatedUser);
            setShowProfileModal(false);
            bumpRefresh();
            if (seededStats?.inserted > 0) {
              showToast(
                `프로필 저장 및 통계 기반 ${seededStats.inserted}벌 의류가 자동 생성되었습니다.`,
              );
            } else {
              showToast('7체형 · 3사이즈 · 퍼스널컬러 프로필이 업데이트되었습니다.');
            }
          }}
        />
      )}

      {toast && <div className="toast-banner">{toast}</div>}
    </div>
  );
}
