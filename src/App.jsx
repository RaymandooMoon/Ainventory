import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Layers, LayoutGrid } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from './contracts/carbonDesignContract.ts';
import AccountSettingsSheet from './components/AccountSettingsSheet.jsx';
import CalendarView from './components/CalendarView.jsx';
import ItemDetailSheet from './components/ItemDetailSheet.jsx';
import LoginView from './components/LoginView.jsx';
import OutfitStudioView from './components/OutfitStudioView.jsx';
import StatsView from './components/StatsView.jsx';
import WardrobeView from './components/WardrobeView.jsx';
import { SampleImportSheet, StatusCapsule } from './components/common/AppUI.jsx';
import {
  apiFetch,
  getStoredToken,
  setSampleDemoMode,
  setStoredToken,
} from './utils/api.ts';
import { getStoredLang, setStoredLang } from './utils/i18n.ts';
import {
  applyThemePreference,
  emitStatusCapsule,
  getStoredThemePreference,
  initNativeBackBridge,
  subscribeThemeChange,
  triggerHaptic,
} from './utils/nativeBridge.ts';
import { subscribeOfflineSync } from './utils/offlineSync.ts';

const DEFAULT_LOCAL_USER = {
  id: 0,
  username: 'wardrobe',
  displayName: 'My Wardrobe',
  role: 'member',
  defaultCloset: 'sample',
  closetName: 'MY WARDROBE',
  isSampleDemo: true,
  profileCompleted: true,
};

const FLOATING_TABS = [
  { key: 'closet', label: 'Closet', path: '/', Icon: LayoutGrid },
  { key: 'outfits', label: 'Outfits', path: '/outfits', Icon: Layers },
  { key: 'calendar', label: 'Calendar', path: '/calendar', Icon: Calendar },
  { key: 'stats', label: 'Stats', path: '/stats', Icon: BarChart3 },
];

function parseAppLocation() {
  if (typeof window === 'undefined') {
    return { tab: 'closet', itemId: null, showAuth: false };
  }
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  if (params.get('auth') === '1' || params.get('verify_token')) {
    return { tab: 'closet', itemId: null, showAuth: true };
  }

  const itemMatch = pathname.match(/^\/item\/(-?\d+)\/?$/);
  if (itemMatch) {
    return { tab: 'closet', itemId: Number(itemMatch[1]), showAuth: false };
  }
  if (pathname.startsWith('/outfits')) {
    return { tab: 'outfits', itemId: null, showAuth: false };
  }
  if (pathname.startsWith('/calendar')) {
    return { tab: 'calendar', itemId: null, showAuth: false };
  }
  if (pathname.startsWith('/stats')) {
    return { tab: 'stats', itemId: null, showAuth: false };
  }
  return { tab: 'closet', itemId: null, showAuth: false };
}

export default function App() {
  const initialLoc = parseAppLocation();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAuthScreen, setShowAuthScreen] = useState(initialLoc.showAuth);

  const [activeTab, setActiveTab] = useState(initialLoc.tab);
  const [selectedItemId, setSelectedItemId] = useState(initialLoc.itemId);
  const [preEquippedGarment, setPreEquippedGarment] = useState(null);

  const [garments, setGarments] = useState([]);
  const [garmentsLoading, setGarmentsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [sampleImportOpen, setSampleImportOpen] = useState(false);

  const [lang, setLang] = useState(() => getStoredLang());
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'light';
    }
    return 'light';
  });

  const showToast = useCallback((msg) => {
    if (msg) emitStatusCapsule(msg);
  }, []);

  // Native shell + theme + offline sync listener
  useEffect(() => {
    void initNativeBackBridge();
    const currentTheme = applyThemePreference(getStoredThemePreference());
    setResolvedTheme(currentTheme);

    const unsubTheme = subscribeThemeChange((effective) => {
      setResolvedTheme(effective);
    });
    const unsubSync = subscribeOfflineSync((state) => {
      if (state.flushed && state.flushed > 0) {
        setRefreshKey((k) => k + 1);
      }
    });
    return () => {
      unsubTheme();
      unsubSync();
    };
  }, []);

  // Browser URL <-> Tab / Item Detail Route Synchronization
  useEffect(() => {
    const handlePopState = () => {
      const loc = parseAppLocation();
      setShowAuthScreen(loc.showAuth);
      setActiveTab(loc.tab);
      setSelectedItemId(loc.itemId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Boot session -> Default home is ALWAYS Closet (`MY WARDROBE`) unless `?auth=1`
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setSampleDemoMode(true);
      setUser(DEFAULT_LOCAL_USER);
      setAuthReady(true);
      return;
    }

    apiFetch('/auth/me')
      .then((data) => {
        if (data?.user) {
          setSampleDemoMode(false);
          setUser(data.user);
        } else {
          setStoredToken(null);
          setSampleDemoMode(true);
          setUser(DEFAULT_LOCAL_USER);
        }
      })
      .catch(() => {
        setStoredToken(null);
        setSampleDemoMode(true);
        setUser(DEFAULT_LOCAL_USER);
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  const activeCloset = user?.defaultCloset || 'sample';

  // Load inventory garments for Closet, Detail, Outfits, Calendar & Stats
  const loadGarments = useCallback(async () => {
    if (!authReady || showAuthScreen) return;
    setGarmentsLoading(true);
    try {
      const q = encodeURIComponent(activeCloset);
      const res = await apiFetch(`/garments?closet=${q}`);
      setGarments(Array.isArray(res?.garments) ? res.garments : []);
    } catch (err) {
      showToast(err?.message || '인벤토리를 불러오지 못했습니다.');
    } finally {
      setGarmentsLoading(false);
    }
  }, [activeCloset, authReady, showAuthScreen, showToast]);

  useEffect(() => {
    loadGarments();
  }, [loadGarments, refreshKey]);

  const selectedGarment = useMemo(() => {
    if (selectedItemId === null || selectedItemId === undefined) return null;
    return garments.find((g) => Number(g.id) === Number(selectedItemId)) || null;
  }, [garments, selectedItemId]);

  const navigateTab = useCallback((tabKey) => {
    const target = FLOATING_TABS.find((t) => t.key === tabKey) || FLOATING_TABS[0];
    triggerHaptic('selection');
    setSelectedItemId(null);
    setActiveTab(target.key);
    if (typeof window !== 'undefined' && window.location.pathname !== target.path) {
      window.history.pushState({}, '', target.path);
    }
  }, []);

  const handleOpenGarmentDetail = useCallback((garment) => {
    if (!garment) return;
    setSelectedItemId(Number(garment.id));
    if (typeof window !== 'undefined') {
      const nextPath = `/item/${garment.id}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    }
  }, []);

  const handleCloseGarmentDetail = useCallback(() => {
    setSelectedItemId(null);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/item/')) {
      const fallbackTab = FLOATING_TABS.find((t) => t.key === activeTab) || FLOATING_TABS[0];
      window.history.pushState({}, '', fallbackTab.path);
    }
  }, [activeTab]);

  const handleTryInOutfits = useCallback((garment) => {
    if (!garment) return;
    setPreEquippedGarment(garment);
    setSelectedItemId(null);
    setActiveTab('outfits');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/outfits');
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    const applied = applyThemePreference(next);
    setResolvedTheme(applied);
    triggerHaptic('selection');
  }, [resolvedTheme]);

  const handleChangeLang = useCallback((nextLang) => {
    const normalized = setStoredLang(nextLang);
    setLang(normalized);
  }, []);

  const handleEnterSampleCloset = useCallback(() => {
    setStoredToken(null);
    setSampleDemoMode(true);
    setUser(DEFAULT_LOCAL_USER);
    setShowAuthScreen(false);
    setSelectedItemId(null);
    setActiveTab('closet');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLoginSuccess = useCallback((loggedInUser) => {
    setSampleDemoMode(false);
    setUser(loggedInUser);
    setShowAuthScreen(false);
    setSelectedItemId(null);
    setActiveTab('closet');
    setRefreshKey((k) => k + 1);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      if (!user?.isSampleDemo) {
        await apiFetch('/auth/logout', { method: 'POST' });
      }
    } catch {
      // ignore logout error
    }
    setStoredToken(null);
    setSampleDemoMode(false);
    setUser(null);
    setShowAuthScreen(true);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/?auth=1');
    }
  }, [user]);

  const handleAccountDeleted = useCallback(() => {
    setAccountSheetOpen(false);
    setStoredToken(null);
    setSampleDemoMode(false);
    setUser(null);
    setGarments([]);
    setShowAuthScreen(true);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/?auth=1');
    }
  }, []);

  if (!authReady) {
    return <div className="hig-boot-screen" aria-busy="true" />;
  }

  if (showAuthScreen) {
    return (
      <>
        <StatusCapsule />
        <LoginView
          onLoginSuccess={handleLoginSuccess}
          onEnterSampleDemo={handleEnterSampleCloset}
          lang={lang}
          onChangeLang={handleChangeLang}
          effectiveTheme={resolvedTheme}
          onToggleTheme={handleToggleTheme}
        />
      </>
    );
  }

  return (
    <div className="hig-native-shell">
      <StatusCapsule />

      <main className="hig-native-viewport">
        {activeTab === 'closet' && (
          <WardrobeView
            activeCloset={activeCloset}
            garments={garments}
            loading={garmentsLoading}
            onSelectGarment={handleOpenGarmentDetail}
            onGarmentRegistered={(created) => {
              if (created) {
                setGarments((prev) => [
                  created,
                  ...prev.filter((g) => Number(g.id) !== Number(created.id)),
                ]);
              } else {
                setRefreshKey((k) => k + 1);
              }
            }}
            showToast={showToast}
          />
        )}

        {activeTab === 'outfits' && (
          <OutfitStudioView
            activeCloset={activeCloset}
            garments={garments}
            theme={resolvedTheme}
            preEquippedGarment={preEquippedGarment}
            onConsumePreEquipped={() => setPreEquippedGarment(null)}
            onClosetUpdated={() => setRefreshKey((k) => k + 1)}
            showToast={showToast}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            activeCloset={activeCloset}
            garments={garments}
            refreshKey={refreshKey}
            onClosetUpdated={() => setRefreshKey((k) => k + 1)}
            showToast={showToast}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView
            garments={garments}
            theme={resolvedTheme}
            onToggleTheme={handleToggleTheme}
            onOpenAccount={() => setAccountSheetOpen(true)}
            onSelectGarment={handleOpenGarmentDetail}
          />
        )}
      </main>

      {/* Unified Bottom-Center Floating Glassmorphism Tab Bar */}
      <nav
        id={CARBON_DOM_CONTRACT.floatingTabBarId}
        className="hig-floating-tabbar"
        aria-label="Primary Navigation"
      >
        {FLOATING_TABS.map(({ key, label, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              data-nav-tab={key}
              aria-current={isActive ? 'page' : undefined}
              className={`hig-floating-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => navigateTab(key)}
            >
              <Icon size={19} strokeWidth={isActive ? 2.3 : 1.85} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Item Detail Route Sheet (`/item/:id`) */}
      <ItemDetailSheet
        garment={selectedGarment}
        open={Boolean(selectedGarment)}
        onClose={handleCloseGarmentDetail}
        onUpdated={(updated) => {
          if (!updated) return;
          setGarments((prev) =>
            prev.map((g) => (Number(g.id) === Number(updated.id) ? { ...g, ...updated } : g))
          );
        }}
        onDeleted={(deletedId) => {
          setGarments((prev) => prev.filter((g) => Number(g.id) !== Number(deletedId)));
          setSelectedItemId(null);
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/item/')) {
            window.history.pushState({}, '', '/');
          }
        }}
        onTryInOutfits={handleTryInOutfits}
        showToast={showToast}
      />

      <AccountSettingsSheet
        open={accountSheetOpen}
        onClose={() => setAccountSheetOpen(false)}
        user={user}
        lang={lang}
        onChangeLang={handleChangeLang}
        onOpenSampleImport={() => setSampleImportOpen(true)}
        onLogout={handleLogout}
        onAccountDeleted={handleAccountDeleted}
      />

      <SampleImportSheet
        open={sampleImportOpen}
        onClose={() => setSampleImportOpen(false)}
        targetOwner={activeCloset}
        onImported={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
