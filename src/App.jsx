import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Calendar, Layers, LayoutGrid } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from './contracts/carbonDesignContract.ts';
import ItemDetailSheet from './components/ItemDetailSheet.jsx';
import WardrobeView from './components/WardrobeView.jsx';
import { SampleImportSheet, StatusCapsule } from './components/common/AppUI.jsx';
import {
  deriveBodySpecFromUser,
  getDefaultBodySpec,
  getStoredBodySpec,
  saveStoredBodySpec,
} from './services/parametricAvatar3D.ts';
import {
  getStoredSkinProfile,
  saveStoredSkinProfile,
} from './services/skinToneAnalyzer.ts';
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

const LoginView = lazy(() => import('./components/LoginView.jsx'));
const OutfitStudioView = lazy(() => import('./components/OutfitStudioView.jsx'));
const CalendarView = lazy(() => import('./components/CalendarView.jsx'));
const StatsView = lazy(() => import('./components/StatsView.jsx'));
const SkinToneAnalysisModal = lazy(() => import('./components/SkinToneAnalysisModal.jsx'));
const AccountSettingsSheet = lazy(() => import('./components/AccountSettingsSheet.jsx'));

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
  if (
    pathname === '/login' ||
    pathname === '/login/' ||
    params.get('auth') === '1' ||
    params.get('verify_token')
  ) {
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
  const [initialLoc] = useState(() => parseAppLocation());
  const [hasInitialToken] = useState(() => {
    const token = Boolean(getStoredToken());
    if (!token) {
      setSampleDemoMode(true);
    }
    return token;
  });

  const [user, setUser] = useState(() => (hasInitialToken ? null : DEFAULT_LOCAL_USER));
  const [authReady, setAuthReady] = useState(() => !hasInitialToken);
  const [showAuthScreen, setShowAuthScreen] = useState(initialLoc.showAuth);

  const [activeTab, setActiveTab] = useState(initialLoc.tab);
  const [selectedItemId, setSelectedItemId] = useState(initialLoc.itemId);
  const [preEquippedGarment, setPreEquippedGarment] = useState(null);
  const [studioSessionKey, setStudioSessionKey] = useState(0);

  const [garments, setGarments] = useState([]);
  const [garmentsLoading, setGarmentsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const garmentsMutationSeqRef = useRef(0);

  const [skinProfile, setSkinProfile] = useState(() => getStoredSkinProfile());
  const [bodySpec, setBodySpec] = useState(() => getStoredBodySpec());
  const [skinToneModalOpen, setSkinToneModalOpen] = useState(false);

  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [sampleImportOpen, setSampleImportOpen] = useState(false);

  const [lang, setLang] = useState(() => getStoredLang());
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    applyThemePreference(getStoredThemePreference())
  );

  const showToast = useCallback((msg) => {
    if (msg) emitStatusCapsule(msg);
  }, []);

  const syncAccountToAvatar = useCallback((accountUser) => {
    if (!accountUser || accountUser.isSampleDemo) return;
    const accountGender = accountUser.gender === 'female' ? 'female' : 'male';
    const currentSkin = getStoredSkinProfile();
    const syncedSkin = saveStoredSkinProfile({
      ...currentSkin,
      skinToneHex: accountUser.skinToneHex || currentSkin.skinToneHex,
      personalColor: accountUser.personalColor || currentSkin.personalColor,
      gender: accountGender,
    });
    setSkinProfile(syncedSkin);

    const syncedBody = saveStoredBodySpec(
      deriveBodySpecFromUser(accountUser, getStoredBodySpec())
    );
    setBodySpec(syncedBody);
  }, []);

  // Native shell + theme + offline sync listener
  useEffect(() => {
    void initNativeBackBridge();

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

  // Boot session -> Only verify `/auth/me` asynchronously when a stored token exists
  useEffect(() => {
    if (!hasInitialToken) return undefined;

    let cancelled = false;
    apiFetch('/auth/me')
      .then((data) => {
        if (cancelled) return;
        if (data?.user) {
          setSampleDemoMode(false);
          setUser(data.user);
          syncAccountToAvatar(data.user);
        } else {
          setStoredToken(null);
          setSampleDemoMode(true);
          setUser(DEFAULT_LOCAL_USER);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStoredToken(null);
        setSampleDemoMode(true);
        setUser(DEFAULT_LOCAL_USER);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasInitialToken, syncAccountToAvatar]);

  const activeCloset = user?.defaultCloset || 'sample';

  // Load inventory garments for Closet, Detail, Outfits, Calendar & Stats
  useEffect(() => {
    if (!authReady || showAuthScreen) return undefined;
    let cancelled = false;
    const seqAtStart = garmentsMutationSeqRef.current;
    const q = encodeURIComponent(activeCloset);

    apiFetch(`/garments?closet=${q}`)
      .then((res) => {
        if (cancelled || garmentsMutationSeqRef.current !== seqAtStart) return;
        setGarments(Array.isArray(res?.garments) ? res.garments : []);
      })
      .catch((err) => {
        if (!cancelled && garmentsMutationSeqRef.current === seqAtStart) {
          showToast(err?.message || '인벤토리를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled && garmentsMutationSeqRef.current === seqAtStart) {
          setGarmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCloset, authReady, showAuthScreen, refreshKey, showToast]);

  const selectedGarment = useMemo(() => {
    if (selectedItemId === null || selectedItemId === undefined) return null;
    return garments.find((g) => Number(g.id) === Number(selectedItemId)) || null;
  }, [garments, selectedItemId]);

  const handleApplySkinProfile = useCallback(
    (nextProfile) => {
      const lockedGender =
        user && !user.isSampleDemo
          ? user.gender === 'female'
            ? 'female'
            : 'male'
          : nextProfile?.gender === 'female'
            ? 'female'
            : 'male';

      const saved = saveStoredSkinProfile({
        ...nextProfile,
        gender: lockedGender,
      });
      setSkinProfile(saved);

      setBodySpec((prev) => {
        if (prev.gender === lockedGender) return prev;
        const def = getDefaultBodySpec(lockedGender);
        return saveStoredBodySpec({
          ...prev,
          gender: lockedGender,
          heightCm: def.heightCm,
          weightKg: def.weightKg,
        });
      });

      setUser((prev) =>
        prev
          ? {
              ...prev,
              skinToneHex: saved.skinToneHex,
              personalColor: saved.personalColor,
              personalColorLabelKo: saved.personalColorLabelKo,
              gender: lockedGender,
            }
          : prev
      );

      if (user && !user.isSampleDemo) {
        apiFetch('/auth/profile', {
          method: 'POST',
          body: JSON.stringify({
            personal_color: saved.personalColor,
            skin_tone_hex: saved.skinToneHex,
            gender: lockedGender,
          }),
        }).catch(() => {});
      }

      showToast('피부톤 적용됨');
    },
    [user, showToast]
  );

  const handleUpdateBodySpec = useCallback(
    (nextSpec) => {
      const lockedGender =
        user && !user.isSampleDemo
          ? user.gender === 'female'
            ? 'female'
            : 'male'
          : nextSpec?.gender === 'female'
            ? 'female'
            : 'male';

      const savedBody = saveStoredBodySpec({
        ...nextSpec,
        gender: lockedGender,
      });
      setBodySpec(savedBody);

      setSkinProfile((prev) => {
        if (prev?.gender === lockedGender) return prev;
        return saveStoredSkinProfile({ ...prev, gender: lockedGender });
      });

      setUser((prev) =>
        prev
          ? {
              ...prev,
              gender: lockedGender,
              heightCm: savedBody.heightCm,
              weightKg: savedBody.weightKg,
              bodyShape: savedBody.bodyShape,
            }
          : prev
      );

      if (user && !user.isSampleDemo) {
        apiFetch('/auth/profile', {
          method: 'POST',
          body: JSON.stringify({
            gender: lockedGender,
            height_cm: savedBody.heightCm,
            weight_kg: savedBody.weightKg,
            body_shape: savedBody.bodyShape,
          }),
        }).catch(() => {});
      }

      showToast('체형 반영됨');
    },
    [user, showToast]
  );

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
    setStudioSessionKey((k) => k + 1);
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

  const handleLoginSuccess = useCallback(
    (loggedInUser) => {
      setSampleDemoMode(false);
      setUser(loggedInUser);
      syncAccountToAvatar(loggedInUser);
      setShowAuthScreen(false);
      setSelectedItemId(null);
      setActiveTab('closet');
      setRefreshKey((k) => k + 1);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
    },
    [syncAccountToAvatar]
  );

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
    garmentsMutationSeqRef.current += 1;
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
        <Suspense fallback={<div className="hig-boot-screen" aria-busy="true" />}>
          <LoginView
            onLoginSuccess={handleLoginSuccess}
            onEnterSampleDemo={handleEnterSampleCloset}
            lang={lang}
            onChangeLang={handleChangeLang}
            effectiveTheme={resolvedTheme}
            onToggleTheme={handleToggleTheme}
          />
        </Suspense>
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
                garmentsMutationSeqRef.current += 1;
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

        <Suspense fallback={<div className="hig-screen-container" aria-busy="true" />}>
          {activeTab === 'outfits' && (
            <OutfitStudioView
              key={studioSessionKey}
              user={user}
              activeCloset={activeCloset}
              garments={garments}
              theme={resolvedTheme}
              skinProfile={skinProfile}
              bodySpec={bodySpec}
              onUpdateSkinProfile={handleApplySkinProfile}
              onUpdateBodySpec={handleUpdateBodySpec}
              onOpenSkinToneModal={() => setSkinToneModalOpen(true)}
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
              skinProfile={skinProfile}
              onOpenSkinToneModal={() => setSkinToneModalOpen(true)}
              onToggleTheme={handleToggleTheme}
              onOpenAccount={() => setAccountSheetOpen(true)}
              onSelectGarment={handleOpenGarmentDetail}
            />
          )}
        </Suspense>
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
          garmentsMutationSeqRef.current += 1;
          setGarments((prev) =>
            prev.map((g) => (Number(g.id) === Number(updated.id) ? { ...g, ...updated } : g))
          );
        }}
        onDeleted={(deletedId) => {
          garmentsMutationSeqRef.current += 1;
          setGarments((prev) => prev.filter((g) => Number(g.id) !== Number(deletedId)));
          setSelectedItemId(null);
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/item/')) {
            window.history.pushState({}, '', '/');
          }
        }}
        onTryInOutfits={handleTryInOutfits}
        showToast={showToast}
      />

      {/* Portrait Skin-Tone Analyzer & Mannequin Tone Selector */}
      {skinToneModalOpen && (
        <Suspense fallback={null}>
          <SkinToneAnalysisModal
            open={skinToneModalOpen}
            onClose={() => setSkinToneModalOpen(false)}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            theme={resolvedTheme}
            onApplySkinProfile={handleApplySkinProfile}
          />
        </Suspense>
      )}

      {accountSheetOpen && (
        <Suspense fallback={null}>
          <AccountSettingsSheet
            open={accountSheetOpen}
            onClose={() => setAccountSheetOpen(false)}
            user={user}
            bodySpec={bodySpec}
            lang={lang}
            onChangeLang={handleChangeLang}
            onOpenSampleImport={() => setSampleImportOpen(true)}
            onLogout={handleLogout}
            onAccountDeleted={handleAccountDeleted}
          />
        </Suspense>
      )}

      <SampleImportSheet
        open={sampleImportOpen}
        onClose={() => setSampleImportOpen(false)}
        targetOwner={activeCloset}
        onImported={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
