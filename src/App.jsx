import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Calendar, Layers, LayoutGrid } from 'lucide-react';
import { CARBON_DOM_CONTRACT } from './contracts/carbonDesignContract.ts';
import { SampleImportSheet, StatusCapsule } from './components/common/AppUI.jsx';
import { BottomTabBar } from './components/ui/BottomTabBar.tsx';
import {
  getAvatarSpecSnapshot,
  normalizeDominantHand,
  patchAvatarSpec,
} from './services/avatarSpecStore.ts';
import {
  deriveBodySpecFromUser,
  getDefaultBodySpec,
  getStoredBodySpec,
  saveStoredBodySpec,
} from './services/parametricAvatar3D.ts';
import { fetchServerProfileConfig } from './services/profileConfigService.ts';
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
import {
  getStoredLang,
  localizeApiMessage,
  setStoredLang,
  syncDocumentLang,
  tx,
} from './utils/i18n.ts';
import {
  applyThemePreference,
  emitStatusCapsule,
  getStoredThemePreference,
  initNativeBackBridge,
  subscribeThemeChange,
  triggerHaptic,
} from './utils/nativeBridge.ts';
import { subscribeOfflineSync } from './utils/offlineSync.ts';
import { resolveInitialTabFromPath, triggerPostLoginReveal } from './utils/logoTransition.ts';
import { applyNavOpacityCss, getStoredNavOpacity } from './utils/stageBackgroundCatalog.ts';
import { runCircularThemeTransition } from './utils/themeTransition.ts';

const LoginView = lazy(() => import('./components/LoginView.jsx'));
const WardrobeView = lazy(() => import('./components/WardrobeView.jsx'));
const ItemDetailSheet = lazy(() => import('./components/ItemDetailSheet.jsx'));
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
  handedness: 'right',
  dominantHand: 'right',
};

const FLOATING_TABS = [
  { key: 'outfits', label: 'Outfits', path: '/', Icon: Layers },
  { key: 'closet', label: 'Closet', path: '/closet', Icon: LayoutGrid },
  { key: 'calendar', label: 'Calendar', path: '/calendar', Icon: Calendar },
  { key: 'stats', label: 'Stats', path: '/stats', Icon: BarChart3 },
];

function parseAppLocation() {
  if (typeof window === 'undefined') {
    return { tab: 'outfits', itemId: null, showAuth: false };
  }
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  if (
    pathname === '/login' ||
    pathname === '/login/' ||
    params.get('auth') === '1' ||
    params.get('verify_token')
  ) {
    return { tab: 'outfits', itemId: null, showAuth: true };
  }

  const itemMatch = pathname.match(/^\/item\/(-?\d+)\/?$/);
  if (itemMatch) {
    return { tab: 'closet', itemId: Number(itemMatch[1]), showAuth: false };
  }
  return { tab: resolveInitialTabFromPath(pathname), itemId: null, showAuth: false };
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
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState('skin');

  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [sampleImportOpen, setSampleImportOpen] = useState(false);

  const [lang, setLang] = useState(() => getStoredLang());
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    applyThemePreference(getStoredThemePreference())
  );

  useEffect(() => {
    syncDocumentLang(lang);
  }, [lang]);

  const showToast = useCallback((msg) => {
    if (msg) emitStatusCapsule(msg);
  }, []);

  const handleOpenProfileModal = useCallback((tab = 'skin') => {
    setProfileModalTab(tab === 'body' ? 'body' : 'skin');
    setProfileModalOpen(true);
  }, []);

  const handleOpenAccountSheet = useCallback(() => {
    setAccountSheetOpen(true);
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

    if (accountUser.handedness || accountUser.dominantHand) {
      patchAvatarSpec({
        dominantHand: normalizeDominantHand(
          accountUser.handedness ?? accountUser.dominantHand,
          'right'
        ),
      });
    }
  }, []);

  // Native shell + theme + nav bar opacity + offline sync listener
  useEffect(() => {
    void initNativeBackBridge();
    applyNavOpacityCss(getStoredNavOpacity());

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

  // Hydrate server-side profile configuration (`handedness`, default: `'right'`)
  useEffect(() => {
    if (!authReady) return undefined;
    let cancelled = false;
    fetchServerProfileConfig(getAvatarSpecSnapshot().spec.dominantHand)
      .then((cfg) => {
        if (cancelled) return;
        if (cfg.hasStoredRecord && cfg.handedness !== getAvatarSpecSnapshot().spec.dominantHand) {
          patchAvatarSpec({ dominantHand: cfg.handedness });
        }
        setUser((prev) =>
          prev
            ? {
                ...prev,
                handedness: cfg.handedness,
                dominantHand: cfg.handedness,
              }
            : prev
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id]);

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
          showToast(
            localizeApiMessage(err?.message, lang) ||
              tx(lang, '인벤토리를 불러오지 못했습니다.', 'Failed to load wardrobe.')
          );
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
  }, [activeCloset, authReady, showAuthScreen, refreshKey, lang, showToast]);

  const selectedGarment = useMemo(() => {
    if (selectedItemId === null || selectedItemId === undefined) return null;
    return garments.find((g) => Number(g.id) === Number(selectedItemId)) || null;
  }, [garments, selectedItemId]);

  const handleApplySkinProfile = useCallback(
    async (nextProfile, options = {}) => {
      const lockedGender =
        user && !user.isSampleDemo
          ? user.gender === 'female'
            ? 'female'
            : 'male'
          : (bodySpec?.gender || skinProfile?.gender) === 'female'
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
        try {
          await apiFetch('/auth/profile', {
            method: 'POST',
            body: JSON.stringify({
              personal_color: saved.personalColor,
              skin_tone_hex: saved.skinToneHex,
              gender: lockedGender,
              handedness: getAvatarSpecSnapshot().spec.dominantHand,
            }),
          });
        } catch (err) {
          if (options?.throwOnError) throw err;
        }
      }

      showToast(tx(lang, '피부톤 적용됨', 'Skin tone applied'));
    },
    [user, bodySpec, skinProfile, lang, showToast]
  );

  const handleUpdateBodySpec = useCallback(
    async (nextSpec, options = {}) => {
      const lockedGender =
        user && !user.isSampleDemo
          ? user.gender === 'female'
            ? 'female'
            : 'male'
          : (bodySpec?.gender || skinProfile?.gender) === 'female'
            ? 'female'
            : 'male';

      const savedBody = saveStoredBodySpec(
        {
          ...nextSpec,
          gender: lockedGender,
        },
        { throwOnError: Boolean(options?.throwOnError) }
      );
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
        try {
          await apiFetch('/auth/profile', {
            method: 'POST',
            body: JSON.stringify({
              gender: lockedGender,
              height_cm: savedBody.heightCm,
              weight_kg: savedBody.weightKg,
              body_shape: savedBody.bodyShape,
              handedness: getAvatarSpecSnapshot().spec.dominantHand,
            }),
          });
        } catch (err) {
          if (options?.throwOnError) throw err;
        }
      }

      showToast(tx(lang, '체형 반영됨', 'Body profile applied'));
    },
    [user, bodySpec, skinProfile, lang, showToast]
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleBrandNavigate = (event) => {
      const targetKey = typeof event?.detail === 'string' ? event.detail : 'outfits';
      navigateTab(targetKey);
    };
    window.addEventListener('ainventory:navigate-tab', handleBrandNavigate);
    return () => window.removeEventListener('ainventory:navigate-tab', handleBrandNavigate);
  }, [navigateTab]);

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

  const handleToggleTheme = useCallback(
    (event) => {
      const next = resolvedTheme === 'dark' ? 'light' : 'dark';
      triggerHaptic('selection');
      runCircularThemeTransition({
        event,
        applyTheme: () => {
          const applied = applyThemePreference(next);
          setResolvedTheme(applied);
        },
      });
    },
    [resolvedTheme]
  );

  const handleChangeLang = useCallback((nextLang) => {
    const normalized = setStoredLang(nextLang);
    setLang(normalized);
  }, []);

  const handleEnterSampleCloset = useCallback(() => {
    triggerPostLoginReveal();
    setStoredToken(null);
    setSampleDemoMode(true);
    setUser(DEFAULT_LOCAL_USER);
    setShowAuthScreen(false);
    setSelectedItemId(null);
    setActiveTab('outfits');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLoginSuccess = useCallback(
    (loggedInUser) => {
      triggerPostLoginReveal();
      setSampleDemoMode(false);
      setUser(loggedInUser);
      syncAccountToAvatar(loggedInUser);
      setShowAuthScreen(false);
      setSelectedItemId(null);
      setActiveTab('outfits');
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

  const handleGarmentRegistered = useCallback((created) => {
    if (created) {
      garmentsMutationSeqRef.current += 1;
      setGarments((prev) => [
        created,
        ...prev.filter((g) => Number(g.id) !== Number(created.id)),
      ]);
    } else {
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handleGarmentUpdated = useCallback((updated) => {
    if (!updated) return;
    garmentsMutationSeqRef.current += 1;
    setGarments((prev) =>
      prev.map((g) => (Number(g.id) === Number(updated.id) ? { ...g, ...updated } : g))
    );
  }, []);

  const handleGarmentDeleted = useCallback((deletedId) => {
    garmentsMutationSeqRef.current += 1;
    setGarments((prev) => prev.filter((g) => Number(g.id) !== Number(deletedId)));
    setSelectedItemId(null);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/item/')) {
      window.history.pushState({}, '', '/closet');
    }
  }, []);

  const handleClosetUpdated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleConsumePreEquipped = useCallback(() => {
    setPreEquippedGarment(null);
  }, []);

  const handleOpenSkinToneModal = useCallback(() => {
    handleOpenProfileModal('skin');
  }, [handleOpenProfileModal]);

  const handleOpenBodyProfileModal = useCallback(() => {
    handleOpenProfileModal('body');
  }, [handleOpenProfileModal]);

  const handleCloseProfileModal = useCallback(() => {
    setProfileModalOpen(false);
  }, []);

  const handleCloseAccountSheet = useCallback(() => {
    setAccountSheetOpen(false);
  }, []);

  const handleOpenSampleImport = useCallback(() => {
    setSampleImportOpen(true);
  }, []);

  const handleCloseSampleImport = useCallback(() => {
    setSampleImportOpen(false);
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
        <Suspense fallback={<div className="hig-screen-container" aria-busy="true" />}>
          {activeTab === 'closet' && (
            <WardrobeView
              activeCloset={activeCloset}
              garments={garments}
              loading={garmentsLoading}
              theme={resolvedTheme}
              lang={lang}
              skinProfile={skinProfile}
              onOpenProfile={handleOpenProfileModal}
              onOpenAccount={handleOpenAccountSheet}
              onSelectGarment={handleOpenGarmentDetail}
              onGarmentRegistered={handleGarmentRegistered}
              showToast={showToast}
            />
          )}

          {activeTab === 'outfits' && (
            <OutfitStudioView
              key={studioSessionKey}
              user={user}
              activeCloset={activeCloset}
              garments={garments}
              theme={resolvedTheme}
              lang={lang}
              skinProfile={skinProfile}
              bodySpec={bodySpec}
              onUpdateSkinProfile={handleApplySkinProfile}
              onToggleTheme={handleToggleTheme}
              onOpenProfile={handleOpenProfileModal}
              onOpenAccount={handleOpenAccountSheet}
              onOpenSkinToneModal={handleOpenSkinToneModal}
              onOpenBodyProfile={handleOpenBodyProfileModal}
              preEquippedGarment={preEquippedGarment}
              onConsumePreEquipped={handleConsumePreEquipped}
              onClosetUpdated={handleClosetUpdated}
              onNavigateTab={navigateTab}
              showToast={showToast}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              activeCloset={activeCloset}
              garments={garments}
              theme={resolvedTheme}
              lang={lang}
              skinProfile={skinProfile}
              onOpenProfile={handleOpenProfileModal}
              onOpenAccount={handleOpenAccountSheet}
              refreshKey={refreshKey}
              onClosetUpdated={handleClosetUpdated}
              showToast={showToast}
            />
          )}

          {activeTab === 'stats' && (
            <StatsView
              garments={garments}
              theme={resolvedTheme}
              lang={lang}
              skinProfile={skinProfile}
              bodySpec={bodySpec}
              onOpenProfile={handleOpenProfileModal}
              onOpenSkinToneModal={handleOpenSkinToneModal}
              onToggleTheme={handleToggleTheme}
              onOpenAccount={handleOpenAccountSheet}
              onSelectGarment={handleOpenGarmentDetail}
            />
          )}
        </Suspense>
      </main>

      {/* Unified Bottom-Center Floating Glassmorphism Tab Bar */}
      <BottomTabBar
        id={CARBON_DOM_CONTRACT.floatingTabBarId}
        tabs={FLOATING_TABS}
        activeTab={activeTab}
        lang={lang}
        onSelectTab={navigateTab}
      />

      {/* Item Detail Route Sheet (`/item/:id`) */}
      {selectedGarment && (
        <Suspense fallback={null}>
          <ItemDetailSheet
            garment={selectedGarment}
            open={Boolean(selectedGarment)}
            lang={lang}
            onClose={handleCloseGarmentDetail}
            onUpdated={handleGarmentUpdated}
            onDeleted={handleGarmentDeleted}
            onTryInOutfits={handleTryInOutfits}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* Unified Portrait Skin-Tone Analyzer & Body Profile Modal */}
      {profileModalOpen && (
        <Suspense fallback={null}>
          <SkinToneAnalysisModal
            open={profileModalOpen}
            initialTab={profileModalTab}
            lang={lang}
            onClose={handleCloseProfileModal}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            theme={resolvedTheme}
            onApplySkinProfile={handleApplySkinProfile}
            onApplyBodySpec={handleUpdateBodySpec}
          />
        </Suspense>
      )}

      {accountSheetOpen && (
        <Suspense fallback={null}>
          <AccountSettingsSheet
            open={accountSheetOpen}
            onClose={handleCloseAccountSheet}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            theme={resolvedTheme}
            lang={lang}
            onChangeLang={handleChangeLang}
            onOpenProfile={handleOpenProfileModal}
            onOpenSampleImport={handleOpenSampleImport}
            onLogout={handleLogout}
            onAccountDeleted={handleAccountDeleted}
          />
        </Suspense>
      )}

      <SampleImportSheet
        open={sampleImportOpen}
        lang={lang}
        onClose={handleCloseSampleImport}
        targetOwner={activeCloset}
        onImported={handleClosetUpdated}
      />
    </div>
  );
}
