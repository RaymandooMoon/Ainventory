import { useEffect, useState } from 'react';
import {
  BarChart3,
  Camera,
  Globe,
  Layers,
  Moon,
  Settings,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import AccountSettingsSheet from './components/AccountSettingsSheet.jsx';
import AdminPanelView from './components/AdminPanelView.jsx';
import AnalyticsCalendarView from './components/AnalyticsCalendarView.jsx';
import LoginView from './components/LoginView.jsx';
import OutfitStudioView from './components/OutfitStudioView.jsx';
import ProfilePersonalColorModal from './components/ProfilePersonalColorModal.jsx';
import ShoppingCheckView from './components/ShoppingCheckView.jsx';
import WardrobeView from './components/WardrobeView.jsx';
import WeatherStylingView from './components/WeatherStylingView.jsx';
import {
  SampleImportSheet,
  SkeletonShimmer,
  StatusCapsule,
} from './components/common/AppUI.jsx';
import {
  apiFetch,
  getStoredToken,
  setSampleDemoMode,
  setStoredToken,
} from './utils/api.js';
import { getStoredLang, setStoredLang, tr } from './utils/i18n.js';
import {
  applyThemePreference,
  emitStatusCapsule,
  getStoredThemePreference,
  initNativeBackBridge,
  pushBackHandler,
  triggerHaptic,
} from './utils/nativeBridge.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('weather');
  const [activeCloset, setActiveCloset] = useState('husband');
  const [refreshKey, setRefreshKey] = useState(0);
  const [lang, setLang] = useState(getStoredLang());
  const [themePref, setThemePref] = useState(getStoredThemePreference());

  const [closetSetupInput, setClosetSetupInput] = useState('');
  const [savingClosetName, setSavingClosetName] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileInitialStep, setProfileInitialStep] = useState(1);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showSampleImport, setShowSampleImport] = useState(false);

  // Initialize Apple HIG theme & Capacitor Android hardware back-button bridge
  useEffect(() => {
    applyThemePreference(getStoredThemePreference());
    initNativeBackBridge();
  }, []);

  // Sync 3D WebGL active attribute so CSS Vibrancy never exceeds 1 concurrent blur layer (Req 14.b)
  useEffect(() => {
    const is3D = Boolean(user) && (activeTab === 'weather' || activeTab === 'studio');
    document.documentElement.setAttribute('data-3d-active', is3D ? 'true' : 'false');
  }, [user, activeTab]);

  // Push non-default tab onto Android back stack so back button returns to 3D Studio first
  useEffect(() => {
    if (!user || activeTab === 'weather') return undefined;
    return pushBackHandler(() => {
      setActiveTab('weather');
      return true;
    });
  }, [user, activeTab]);

  const showToast = (msg) => {
    if (msg) emitStatusCapsule(msg);
  };

  const openProfileModal = (stepNum = 1) => {
    setProfileInitialStep(typeof stepNum === 'number' ? stepNum : 1);
    setShowProfileModal(true);
  };

  const handleChangeLang = (nextLang) => {
    const valid = setStoredLang(nextLang);
    setLang(valid);
  };

  const handleQuickToggleTheme = () => {
    const currentResolved = document.documentElement.getAttribute('data-theme') || 'light';
    const next = currentResolved === 'dark' ? 'light' : 'dark';
    setThemePref(next);
    applyThemePreference(next);
    triggerHaptic('selection');
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        setSampleDemoMode(false);
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') === '1') {
          setStoredToken('');
          window.history.replaceState({}, '', window.location.pathname);
          setBooting(false);
          return;
        }
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

  const handleEnterSampleDemo = () => {
    setStoredToken('');
    setSampleDemoMode(true);
    const guestUser = {
      id: 0,
      username: 'sample_guest',
      displayName: lang === 'en' ? 'Sample Guest' : '샘플 체험 게스트',
      role: 'member',
      defaultCloset: 'sample',
      closetName: '샘플 캡슐 옷장',
      isSampleDemo: true,
      profileCompleted: true,
      personalColor: 'autumn_warm',
      gender: 'male',
      heightCm: 176,
      weightKg: 70,
      bodyShape: 'standard_balanced',
    };
    setUser(guestUser);
    setActiveCloset('sample');
    setActiveTab('weather');
    triggerHaptic('light');
    showToast('샘플 옷장 체험 모드로 진입했습니다');
  };

  const handleLoginSuccess = (loggedInUser) => {
    setSampleDemoMode(false);
    setUser(loggedInUser);
    setActiveCloset(loggedInUser.defaultCloset || 'husband');
    setActiveTab('weather');
    showToast(
      lang === 'en'
        ? `Welcome, ${loggedInUser.displayName}`
        : `${loggedInUser.displayName}님 환영합니다`
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
      showToast(`"${res.user.closetName}" 옷장이 준비되었습니다`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setSavingClosetName(false);
    }
  };

  const handleLogout = async () => {
    if (!user?.isSampleDemo) {
      try {
        await apiFetch('/auth/logout', { method: 'POST' });
      } catch {
        // ignore network error on logout
      }
    }
    setSampleDemoMode(false);
    setStoredToken('');
    setUser(null);
    setShowProfileModal(false);
    setShowAccountSettings(false);
  };

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  if (booting) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: 'var(--bg-canvas)',
        }}
      >
        <SkeletonShimmer height={36} width={180} radius={999} />
        <SkeletonShimmer height={360} width="min(420px, 90vw)" radius={24} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <StatusCapsule />
        <LoginView
          onLoginSuccess={handleLoginSuccess}
          onEnterSampleDemo={handleEnterSampleDemo}
          lang={lang}
          onChangeLang={handleChangeLang}
          themePref={themePref}
          onToggleTheme={handleQuickToggleTheme}
        />
      </>
    );
  }

  const userDefaultCloset = user.defaultCloset || 'husband';
  const isCustomUserCloset =
    !user.isSampleDemo &&
    userDefaultCloset !== 'husband' &&
    userDefaultCloset !== 'wife';

  const navItems = [
    { id: 'weather', label: tr(lang, 'navWeather'), icon: Sun },
    { id: 'wardrobe', label: tr(lang, 'navWardrobe'), icon: Shirt },
    { id: 'shopping', label: tr(lang, 'navShopping'), icon: Camera },
    { id: 'studio', label: tr(lang, 'navStudio'), icon: Layers },
    { id: 'analytics', label: tr(lang, 'navAnalytics'), icon: BarChart3 },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: tr(lang, 'navAdmin'), icon: Settings });
  }

  const needsClosetSetup = !user.isSampleDemo && !user.closetName;

  const selectTab = (tabId) => {
    triggerHaptic('selection');
    setActiveTab(tabId);
  };

  return (
    <div className={`app-shell ${activeTab === 'weather' ? 'is-studio-tab' : ''}`}>
      <StatusCapsule />

      {/* Desktop Monochrome Sidebar */}
      <aside className="sidebar">
        <div
          className="sidebar-brand"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <div className="hig-headline" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              A inventory
            </div>
            <div className="hig-caption" style={{ marginTop: 2 }}>
              {user.isSampleDemo ? '샘플 옷장 체험 모드' : tr(lang, 'brandSubtitle')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="icon-btn"
              onClick={handleQuickToggleTheme}
              aria-label="테마 전환"
              title="라이트 / 다크 전환"
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
              style={{ width: 'auto', padding: '0 8px', fontSize: '0.72rem', fontWeight: 600 }}
              onClick={() => handleChangeLang(lang === 'ko' ? 'en' : 'ko')}
            >
              <Globe size={13} />
            </button>
          </div>
        </div>

        {!user.isSampleDemo ? (
          <div className="closet-switcher" role="group" aria-label="옷장 프로필 전환">
            {isCustomUserCloset ? (
              <button
                id="switch-closet-personal"
                type="button"
                className={`closet-switch-btn ${activeCloset === userDefaultCloset ? 'active' : ''}`}
                onClick={() => setActiveCloset(userDefaultCloset)}
              >
                {user.closetName || tr(lang, 'closetPersonal')}
              </button>
            ) : (
              <>
                <button
                  id="switch-closet-husband"
                  type="button"
                  className={`closet-switch-btn ${activeCloset === 'husband' ? 'active' : ''}`}
                  onClick={() => setActiveCloset('husband')}
                >
                  {tr(lang, 'closetHusband')}
                </button>
                <button
                  id="switch-closet-wife"
                  type="button"
                  className={`closet-switch-btn ${activeCloset === 'wife' ? 'active' : ''}`}
                  onClick={() => setActiveCloset('wife')}
                >
                  {tr(lang, 'closetWife')}
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
        ) : (
          <button
            id="demo-exit-to-login-btn"
            type="button"
            className="btn btn-primary btn-sm btn-full"
            onClick={handleLogout}
          >
            내 계정으로 시작 · 로그인
          </button>
        )}

        <nav className="nav-list" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                type="button"
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => selectTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            id="sidebar-open-profile-btn"
            type="button"
            className="btn btn-secondary btn-full btn-sm"
            style={{ justifyContent: 'flex-start', gap: 8 }}
            onClick={() => openProfileModal(1)}
          >
            <Sparkles size={14} />
            <span>{tr(lang, 'profileBtn')}</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </div>
          <button
            id="open-account-settings-btn"
            type="button"
            className="icon-btn"
            aria-label="계정 및 개인정보 설정"
            onClick={() => setShowAccountSettings(true)}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </aside>

      {/* Mobile Top Header (Hidden automatically on 3D Studio tab for 85%+ clear viewport) */}
      <header className="mobile-topbar">
        <div className="hig-headline" style={{ fontWeight: 700 }}>
          A inventory
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {user.isSampleDemo && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ padding: '6px 10px', fontSize: '0.74rem' }}
              onClick={handleLogout}
            >
              로그인
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            aria-label="테마 전환"
            onClick={handleQuickToggleTheme}
          >
            {document.documentElement.getAttribute('data-theme') === 'dark' ? (
              <Sun size={15} />
            ) : (
              <Moon size={15} />
            )}
          </button>

          <button
            id="mobile-open-account-settings-btn"
            type="button"
            className="icon-btn"
            aria-label="계정 및 개인정보 설정"
            onClick={() => setShowAccountSettings(true)}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className={`main-workspace ${activeTab === 'weather' ? 'is-studio-mode' : ''}`}>
        {activeTab === 'weather' && (
          <WeatherStylingView
            activeCloset={activeCloset}
            user={user}
            lang={lang}
            refreshKey={refreshKey}
            onNavigateShopping={() => selectTab('shopping')}
            onNavigateWardrobe={() => selectTab('wardrobe')}
            onOpenProfileModal={openProfileModal}
            onOpenAccountSettings={() => setShowAccountSettings(true)}
            onOpenSampleImport={() => setShowSampleImport(true)}
            onExitSampleDemo={handleLogout}
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
            user={user}
            refreshKey={refreshKey}
            onOpenSampleImport={() => setShowSampleImport(true)}
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
            onOpenProfileModal={openProfileModal}
            showToast={showToast}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsCalendarView
            activeCloset={activeCloset}
            user={user}
            refreshKey={refreshKey}
            onClosetUpdated={bumpRefresh}
            showToast={showToast}
          />
        )}

        {activeTab === 'admin' && user.role === 'admin' && (
          <AdminPanelView onClosetUpdated={bumpRefresh} showToast={showToast} />
        )}
      </main>

      {/* Mobile Floating Vibrancy Bottom Navigation (Req 14.a) */}
      <nav className="mobile-bottom-nav hig-vibrancy-bar" aria-label="모바일 하단 메뉴">
        <button
          id="mobile-tab-weather"
          type="button"
          className={`mobile-tab-btn ${activeTab === 'weather' ? 'active' : ''}`}
          onClick={() => selectTab('weather')}
        >
          <Sun size={19} />
          <span>{tr(lang, 'mobileWeather')}</span>
        </button>
        <button
          id="mobile-tab-wardrobe"
          type="button"
          className={`mobile-tab-btn ${activeTab === 'wardrobe' ? 'active' : ''}`}
          onClick={() => selectTab('wardrobe')}
        >
          <Shirt size={19} />
          <span>{tr(lang, 'mobileWardrobe')}</span>
        </button>
        <button
          id="mobile-tab-shopping"
          type="button"
          className={`mobile-tab-btn center-cta ${activeTab === 'shopping' ? 'active' : ''}`}
          onClick={() => selectTab('shopping')}
        >
          <span className="cta-circle">
            <Camera size={18} />
          </span>
          <span>{tr(lang, 'mobileShopping')}</span>
        </button>
        <button
          id="mobile-tab-studio"
          type="button"
          className={`mobile-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => selectTab('studio')}
        >
          <Layers size={19} />
          <span>{tr(lang, 'mobileStudio')}</span>
        </button>
        <button
          id="mobile-tab-analytics"
          type="button"
          className={`mobile-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => selectTab('analytics')}
        >
          <BarChart3 size={19} />
          <span>{tr(lang, 'mobileReport')}</span>
        </button>
      </nav>

      {/* First-Login Closet Name Setup Modal */}
      {needsClosetSetup && (
        <div className="modal-backdrop ui-sheet-backdrop" style={{ zIndex: 130 }}>
          <div className="modal-box ui-sheet-box" style={{ maxWidth: 420 }}>
            <h3 className="hig-headline" style={{ marginBottom: 8 }}>
              {tr(lang, 'closetSetupTitle')}
            </h3>
            <p className="hig-caption" style={{ marginBottom: 16 }}>
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
                {savingClosetName ? '저장 중...' : tr(lang, 'closetSaveBtn')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Account Settings & Immediate Permanent Account Deletion Sheet */}
      <AccountSettingsSheet
        open={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
        user={user}
        lang={lang}
        onChangeLang={handleChangeLang}
        onOpenSampleImport={() => setShowSampleImport(true)}
        onOpenProfileModal={openProfileModal}
        onLogout={handleLogout}
        onAccountDeleted={() => {
          setShowAccountSettings(false);
          setSampleDemoMode(false);
          setStoredToken('');
          setUser(null);
        }}
      />

      {/* Selective Sample Closet Import Sheet */}
      <SampleImportSheet
        open={showSampleImport}
        onClose={() => setShowSampleImport(false)}
        targetOwner={activeCloset === 'all' ? userDefaultCloset : activeCloset}
        onImported={(count) => {
          bumpRefresh();
          showToast(`샘플 아이템 ${count}점이 내 옷장에 추가되었습니다`);
        }}
      />

      {/* Styling Profile + 7 Body Shapes + Personal Color Modal */}
      {showProfileModal && !needsClosetSetup && (
        <ProfilePersonalColorModal
          open={showProfileModal}
          user={user}
          initialStep={profileInitialStep}
          lang={lang}
          onClose={() => setShowProfileModal(false)}
          onLiveUpdateUser={(partialUser) =>
            setUser((prev) => (prev ? { ...prev, ...partialUser } : prev))
          }
          onCompleted={(updatedUser, generatedWardrobe) => {
            setUser(updatedUser);
            setShowProfileModal(false);
            bumpRefresh();
            if (generatedWardrobe?.createdCount > 0) {
              showToast(`프로필 저장 · ${generatedWardrobe.createdCount}벌 의류 생성 완료`);
            } else {
              showToast('체형 · 퍼스널컬러 · 3D 모델링 업데이트 완료');
            }
          }}
        />
      )}
    </div>
  );
}
