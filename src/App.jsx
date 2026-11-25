import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { loadMemorizedFaceIdentity } from './services/faceMemoryStore.ts';
import {
  apiFetch,
  getPrefetchedSampleGarments,
  getStoredToken,
  hasUserPermission,
  isLiveAppEmbedSession,
  isSiteDemoUser,
  loadInstantSampleGarmentsFallback,
  prefetchSampleGarments,
  setSampleDemoMode,
  setStoredToken,
} from './utils/api.ts';
import { scheduleIdleTask } from './utils/resourcePriority.ts';
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
import {
  clearPendingLogoFlight,
  resolveInitialTabFromPath,
} from './utils/logoTransition.ts';
import { applyNavOpacityCss, getStoredNavOpacity } from './utils/stageBackgroundCatalog.ts';
import {
  computeCircleRevealRadius,
  runCircularThemeTransition,
} from './utils/themeTransition.ts';
import LoginPortalParticleWave from './components/auth/LoginPortalParticleWave.tsx';
import {
  attachAntiGravityField,
  createAntiGravityState,
  syncAntiGravityExternalPause,
} from './services/antiGravityMotion.ts';

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
  const isEmbedMode = isLiveAppEmbedSession();
  const [initialLoc] = useState(() => parseAppLocation());
  const [hasInitialToken] = useState(() => {
    if (isEmbedMode && initialLoc.showAuth) {
      setSampleDemoMode(false);
      return false;
    }
    const token = Boolean(getStoredToken());
    if (!token) {
      setSampleDemoMode(true);
    }
    return token;
  });

  const [user, setUser] = useState(() =>
    hasInitialToken || (isEmbedMode && initialLoc.showAuth) ? null : DEFAULT_LOCAL_USER
  );
  const [authReady, setAuthReady] = useState(() => !hasInitialToken);
  const [showAuthScreen, setShowAuthScreen] = useState(initialLoc.showAuth);
  const [loginPortal, setLoginPortal] = useState(null);

  const [activeTab, setActiveTab] = useState(initialLoc.tab);
  const [selectedItemId, setSelectedItemId] = useState(initialLoc.itemId);
  const [preEquippedGarment, setPreEquippedGarment] = useState(null);
  const [studioSessionKey, setStudioSessionKey] = useState(0);

  const [garments, setGarments] = useState(() => getPrefetchedSampleGarments() || []);
  const [garmentsLoading, setGarmentsLoading] = useState(
    () => !(getPrefetchedSampleGarments()?.length > 0)
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const garmentsMutationSeqRef = useRef(0);

  const [skinProfile, setSkinProfile] = useState(() => getStoredSkinProfile());
  const [bodySpec, setBodySpec] = useState(() => getStoredBodySpec());
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState('skin');

  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [sampleImportOpen, setSampleImportOpen] = useState(false);

  const [lang, setLang] = useState(() => getStoredLang());
  const langRef = useRef(lang);
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    applyThemePreference(getStoredThemePreference())
  );
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    langRef.current = lang;
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

    // Hydrate memorized face identity from IndexedDB so refreshing the page restores my face seamlessly
    let memoryCancelled = false;
    loadMemorizedFaceIdentity()
      .then((memory) => {
        if (memoryCancelled || !memory?.singleFacePortraitDataUrl) return;
        const currentSkin = getStoredSkinProfile();
        if (currentSkin.portraitDataUrl === memory.singleFacePortraitDataUrl) return;
        const snap = memory.analysisSnapshot;
        const hydratedSkin = saveStoredSkinProfile({
          ...currentSkin,
          ...(snap
            ? {
                skinToneHex: snap.skinToneHex || currentSkin.skinToneHex,
                personalColor: snap.personalColor || currentSkin.personalColor,
                personalColorLabelKo:
                  snap.personalColorLabelKo || currentSkin.personalColorLabelKo,
                subTypeLabelKo: snap.subTypeLabelKo || currentSkin.subTypeLabelKo,
                mstLevel: snap.mstLevel ?? currentSkin.mstLevel,
                mstUndertone: snap.mstUndertone ?? currentSkin.mstUndertone,
                mstCode: snap.mstCode ?? currentSkin.mstCode,
              }
            : {}),
          portraitDataUrl: memory.singleFacePortraitDataUrl,
        });
        setSkinProfile(hydratedSkin);
        patchAvatarSpec({
          appearance: {
            ...(snap
              ? {
                  skinToneHex: hydratedSkin.skinToneHex,
                  personalColor: hydratedSkin.personalColor,
                  mstLevel: hydratedSkin.mstLevel,
                  mstUndertone: hydratedSkin.mstUndertone,
                }
              : {}),
            facePhotoUrl: memory.singleFacePortraitDataUrl,
          },
        });
      })
      .catch(() => {});

    return () => {
      memoryCancelled = true;
      unsubTheme();
      unsubSync();
    };
  }, []);

  // Browser URL <-> Tab / Item Detail Route Synchronization
  useEffect(() => {
    if (isEmbedMode) return undefined;
    const handlePopState = () => {
      const loc = parseAppLocation();
      setShowAuthScreen(loc.showAuth);
      setActiveTab(loc.tab);
      setSelectedItemId(loc.itemId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isEmbedMode]);

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

  // Quietly pre-warm sample garments & active landing chunk during browser idle while user is on Login screen
  useEffect(() => {
    if (!showAuthScreen || typeof window === 'undefined') return undefined;
    let cancelled = false;
    const cancelIdle = scheduleIdleTask(() => {
      if (cancelled) return;
      void prefetchSampleGarments();
      void import('./components/OutfitStudioView.jsx').catch(() => {});
      if (!isEmbedMode) {
        void import('./components/WardrobeView.jsx').catch(() => {});
      }
    }, 550);
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [showAuthScreen, isEmbedMode]);

  // Load inventory garments for Closet, Detail, Outfits, Calendar & Stats (also hydrates instantly from prefetch!)
  useEffect(() => {
    if (!authReady || (showAuthScreen && !loginPortal)) return undefined;
    let cancelled = false;
    let settled = false;
    const seqAtStart = garmentsMutationSeqRef.current;
    const q = encodeURIComponent(activeCloset);

    if (activeCloset === 'sample') {
      const prefetched = getPrefetchedSampleGarments();
      if (prefetched && prefetched.length > 0) {
        setGarments((prev) => (prev.length > 0 ? prev : prefetched));
        setGarmentsLoading(false);
      }
    }

    // Safety net: if sample closet network fetch takes > 2.2s on slow mobile/proxy links,
    // immediately hydrate the bundled sample catalog so Closet & Outfits never stall on empty skeletons.
    const provisionalFallbackTimer =
      activeCloset === 'sample' && typeof window !== 'undefined'
        ? window.setTimeout(() => {
            if (cancelled || settled || garmentsMutationSeqRef.current !== seqAtStart) return;
            void loadInstantSampleGarmentsFallback().then((fallbackList) => {
              if (cancelled || settled || garmentsMutationSeqRef.current !== seqAtStart) return;
              if (fallbackList.length > 0) {
                setGarments((prev) => (prev.length > 0 ? prev : fallbackList));
                setGarmentsLoading(false);
              }
            });
          }, 2200)
        : null;

    apiFetch(`/garments?closet=${q}`, { timeoutMs: 8000 })
      .then((res) => {
        if (cancelled || garmentsMutationSeqRef.current !== seqAtStart) return;
        settled = true;
        const nextList = Array.isArray(res?.garments) ? res.garments : [];
        if (nextList.length > 0 || activeCloset !== 'sample') {
          setGarments(nextList);
        } else {
          void loadInstantSampleGarmentsFallback().then((fallbackList) => {
            if (!cancelled && garmentsMutationSeqRef.current === seqAtStart) {
              setGarments(fallbackList);
            }
          });
        }
      })
      .catch((err) => {
        if (!cancelled && garmentsMutationSeqRef.current === seqAtStart) {
          settled = true;
          const activeLang = langRef.current;
          showToast(
            localizeApiMessage(err?.message, activeLang) ||
              tx(activeLang, '인벤토리를 불러오지 못했습니다.', 'Failed to load wardrobe.')
          );
        }
      })
      .finally(() => {
        settled = true;
        if (provisionalFallbackTimer !== null) {
          window.clearTimeout(provisionalFallbackTimer);
        }
        if (!cancelled && garmentsMutationSeqRef.current === seqAtStart) {
          setGarmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (provisionalFallbackTimer !== null) {
        window.clearTimeout(provisionalFallbackTimer);
      }
    };
  }, [activeCloset, authReady, showAuthScreen, loginPortal, refreshKey, showToast]);

  const selectedGarment = useMemo(() => {
    if (selectedItemId === null || selectedItemId === undefined) return null;
    return garments.find((g) => Number(g.id) === Number(selectedItemId)) || null;
  }, [garments, selectedItemId]);

  const handleApplySkinProfile = useCallback(
    async (nextProfile, options = {}) => {
      const explicitGender =
        nextProfile?.gender === 'female' || nextProfile?.gender === 'male'
          ? nextProfile.gender
          : null;
      const resolvedGender =
        explicitGender ??
        (user && !user.isSampleDemo
          ? user.gender === 'female'
            ? 'female'
            : 'male'
          : (bodySpec?.gender || skinProfile?.gender) === 'female'
            ? 'female'
            : 'male');

      const saved = saveStoredSkinProfile({
        ...nextProfile,
        gender: resolvedGender,
      });
      setSkinProfile(saved);

      setBodySpec((prev) => {
        if (prev.gender === resolvedGender) return prev;
        const def = getDefaultBodySpec(resolvedGender);
        return saveStoredBodySpec({
          ...prev,
          gender: resolvedGender,
          heightCm: prev.heightCm || def.heightCm,
          weightKg: prev.weightKg || def.weightKg,
        });
      });

      setUser((prev) =>
        prev
          ? {
              ...prev,
              skinToneHex: saved.skinToneHex,
              personalColor: saved.personalColor,
              personalColorLabelKo: saved.personalColorLabelKo,
              gender: resolvedGender,
            }
          : prev
      );

      if (user && !user.isSampleDemo && hasUserPermission(user, 'profile:write')) {
        try {
          await apiFetch('/auth/profile', {
            method: 'POST',
            body: JSON.stringify({
              personal_color: saved.personalColor,
              skin_tone_hex: saved.skinToneHex,
              gender: resolvedGender,
              handedness: getAvatarSpecSnapshot().spec.dominantHand,
            }),
          });
        } catch (err) {
          if (options?.throwOnError) throw err;
        }
      }

      showToast(
        isSiteDemoUser(user)
          ? tx(lang, '피부톤 미리보기 적용됨 (데모 전용)', 'Skin tone preview applied (Demo)')
          : tx(lang, '피부톤 적용됨', 'Skin tone applied')
      );
    },
    [user, bodySpec, skinProfile, lang, showToast]
  );

  const handleUpdateBodySpec = useCallback(
    async (nextSpec, options = {}) => {
      const explicitGender =
        nextSpec?.gender === 'female' || nextSpec?.gender === 'male'
          ? nextSpec.gender
          : null;
      const resolvedGender =
        explicitGender ??
        (user && !user.isSampleDemo
          ? user.gender === 'female'
            ? 'female'
            : 'male'
          : (bodySpec?.gender || skinProfile?.gender) === 'female'
            ? 'female'
            : 'male');

      const savedBody = saveStoredBodySpec(
        {
          ...nextSpec,
          gender: resolvedGender,
        },
        { throwOnError: Boolean(options?.throwOnError) }
      );
      setBodySpec(savedBody);

      setSkinProfile((prev) => {
        if (prev?.gender === resolvedGender) return prev;
        return saveStoredSkinProfile({ ...prev, gender: resolvedGender });
      });

      setUser((prev) =>
        prev
          ? {
              ...prev,
              gender: resolvedGender,
              heightCm: savedBody.heightCm,
              weightKg: savedBody.weightKg,
              bodyShape: savedBody.bodyShape,
            }
          : prev
      );

      if (user && !user.isSampleDemo && hasUserPermission(user, 'profile:write')) {
        try {
          await apiFetch('/auth/profile', {
            method: 'POST',
            body: JSON.stringify({
              gender: resolvedGender,
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

      showToast(
        isSiteDemoUser(user)
          ? tx(lang, '체형 미리보기 적용됨 (데모 전용)', 'Body profile preview applied (Demo)')
          : tx(lang, '체형 반영됨', 'Body profile applied')
      );
    },
    [user, bodySpec, skinProfile, lang, showToast]
  );

  const navigateTab = useCallback(
    (tabKey) => {
      const target = FLOATING_TABS.find((t) => t.key === tabKey) || FLOATING_TABS[0];
      triggerHaptic('selection');
      setSelectedItemId(null);
      setActiveTab(target.key);
      if (
        !isEmbedMode &&
        typeof window !== 'undefined' &&
        window.location.pathname !== target.path
      ) {
        window.history.pushState({}, '', target.path);
      }
      if (isEmbedMode && typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'ainvtry-live-app-screen',
            screen: target.key === 'calendar' ? 'outfits' : target.key,
          },
          window.location.origin
        );
      }
    },
    [isEmbedMode]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleBrandNavigate = (event) => {
      const targetKey = typeof event?.detail === 'string' ? event.detail : 'outfits';
      navigateTab(targetKey);
    };
    window.addEventListener('ainventory:navigate-tab', handleBrandNavigate);
    return () => window.removeEventListener('ainventory:navigate-tab', handleBrandNavigate);
  }, [navigateTab]);

  // Sync language, theme, and tab spotlight from parent showcase site when embedded
  useEffect(() => {
    if (!isEmbedMode || typeof window === 'undefined') return undefined;
    const handleEmbedSync = (event) => {
      const detail = event?.detail || {};
      if (detail.lang === 'ko' || detail.lang === 'en') {
        const normalized = setStoredLang(detail.lang);
        setLang(normalized);
      }
      if (detail.theme === 'dark' || detail.theme === 'light') {
        const applied = applyThemePreference(detail.theme);
        setResolvedTheme(applied);
      }
      if (!showAuthScreen && detail.screen) {
        if (detail.screen === 'profile') {
          setProfileModalTab('skin');
          setProfileModalOpen(true);
        } else if (
          detail.screen === 'outfits' ||
          detail.screen === 'closet' ||
          detail.screen === 'stats'
        ) {
          setProfileModalOpen(false);
          setSelectedItemId(null);
          setActiveTab(detail.screen);
        }
      }
    };
    window.addEventListener('ainvtry:embed-sync', handleEmbedSync);
    return () => window.removeEventListener('ainvtry:embed-sync', handleEmbedSync);
  }, [isEmbedMode, showAuthScreen]);

  const handleOpenGarmentDetail = useCallback(
    (garment) => {
      if (!garment) return;
      setSelectedItemId(Number(garment.id));
      if (!isEmbedMode && typeof window !== 'undefined') {
        const nextPath = `/item/${garment.id}`;
        if (window.location.pathname !== nextPath) {
          window.history.pushState({}, '', nextPath);
        }
      }
    },
    [isEmbedMode]
  );

  const handleCloseGarmentDetail = useCallback(() => {
    setSelectedItemId(null);
    if (
      !isEmbedMode &&
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/item/')
    ) {
      const fallbackTab = FLOATING_TABS.find((t) => t.key === activeTab) || FLOATING_TABS[0];
      window.history.pushState({}, '', fallbackTab.path);
    }
  }, [activeTab, isEmbedMode]);

  const handleTryInOutfits = useCallback(
    (garment) => {
      if (!garment) return;
      setPreEquippedGarment(garment);
      setStudioSessionKey((k) => k + 1);
      setSelectedItemId(null);
      setActiveTab('outfits');
      if (!isEmbedMode && typeof window !== 'undefined') {
        window.history.pushState({}, '', '/outfits');
      }
    },
    [isEmbedMode]
  );

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

  // Choreographed 2-second Login -> App Portal Transition Refs
  // phase: 'flying' (0..880ms: app preloads underneath while logo glides to header)
  //      -> 'revealing' (GPU clip-path circle reveal frame-locked with fluid particle wave)
  const appShellRef = useRef(null);
  const portalOverlayRef = useRef(null);
  const particleWaveRef = useRef(null);
  const portalOriginRef = useRef(null);
  const portalTimersRef = useRef([]);

  const clearPortalTimers = useCallback(() => {
    for (const id of portalTimersRef.current) {
      window.clearTimeout(id);
    }
    portalTimersRef.current = [];
  }, []);

  useEffect(() => clearPortalTimers, [clearPortalTimers]);

  const handlePortalTargetResolved = useCallback((origin) => {
    if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
      portalOriginRef.current = origin;
    }
  }, []);

  const startLoginPortalTransition = useCallback(
    (commitAppState) => {
      clearPortalTimers();
      const reducedMotion = Boolean(
        typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );

      if (reducedMotion || isEmbedMode || typeof window === 'undefined') {
        commitAppState();
        setLoginPortal(null);
        setShowAuthScreen(false);
        return;
      }

      // Prevent duplicate AppHeaderBrand FLIP when our 2-second portal handles the logo flight directly
      clearPendingLogoFlight();

      if (typeof window.scrollTo === 'function') {
        window.scrollTo(0, 0);
      }

      const vw = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const fallbackOrigin = { x: Math.round(vw * 0.5), y: vw <= 560 ? 42 : 44 };
      const activeLoginVariant =
        document.querySelector('[data-motion-variant]')?.getAttribute('data-motion-variant') ||
        'luxury';
      portalOriginRef.current = fallbackOrigin;

      // Reset viewport scroll before preloading so landing studio settles cleanly at scrollY = 0
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      // Mount & preload the default Outfits landing screen immediately underneath the Login portal
      commitAppState();
      setLoginPortal({
        phase: 'flying',
        origin: fallbackOrigin,
        maxRadius: computeCircleRevealRadius(fallbackOrigin.x, fallbackOrigin.y, vw, vh),
        variant: activeLoginVariant,
      });

      const revealTimer = window.setTimeout(() => {
        // Wait 2 clean animation frames after logo dock so OutfitStudioView & Three.js first draw finish before reveal starts
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const curVw = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
            const curVh = Math.max(1, window.innerHeight);
            const headerBrandEl =
              document.querySelector('.hig-native-shell [data-header-brand-btn="true"] .hig-shell-brand-logo') ||
              document.querySelector('.hig-native-shell [data-header-brand-btn="true"]');
            let resolvedOrigin = portalOriginRef.current || {
              x: Math.round(curVw * 0.5),
              y: curVw <= 560 ? 42 : 44,
            };
            if (headerBrandEl) {
              const r = headerBrandEl.getBoundingClientRect();
              if (r.width > 10 && r.height > 10) {
                resolvedOrigin = {
                  x: Math.round(r.left + r.width * 0.5),
                  y: Math.round(r.top + r.height * 0.5),
                };
              }
            }
            const maxRadius = computeCircleRevealRadius(resolvedOrigin.x, resolvedOrigin.y, curVw, curVh);
            triggerHaptic('medium');
            setLoginPortal({
              phase: 'revealing',
              origin: resolvedOrigin,
              maxRadius,
              variant: activeLoginVariant,
            });
            // Chain post-reveal fallback after revealing begins so slow preloads never skip the silk wave
            const revealFinishFallback = window.setTimeout(() => {
              setLoginPortal(null);
              setShowAuthScreen(false);
            }, 3400);
            portalTimersRef.current.push(revealFinishFallback);
          });
        });
      }, 860);

      // Hard safety ceiling in case browser tab was backgrounded before reveal RAF fired
      const safetyCeilingTimer = window.setTimeout(() => {
        setLoginPortal(null);
        setShowAuthScreen(false);
      }, 7500);

      portalTimersRef.current = [revealTimer, safetyCeilingTimer];
    },
    [clearPortalTimers, isEmbedMode]
  );

  // Hardware-accelerated GPU clip-path circular reveal on .hig-native-shell (zero WebGL mask-image readback stall!)
  // Frame-locked 1:1 with LoginPortalParticleWave (radius + instantaneous velocity) in a single RAF loop.
  useLayoutEffect(() => {
    if (loginPortal?.phase !== 'revealing') return undefined;
    const shellEl = appShellRef.current;
    if (!shellEl) return undefined;

    const { origin, maxRadius } = loginPortal;
    const totalTarget = maxRadius + 96;
    // Unhurried, serene concentric silk-wave expansion into the main studio
    const durationMs = 1850;
    let startMs = 0;
    let prevNow = 0;
    let prevRadius = 0;
    let rafId = 0;
    let cancelled = false;

    const easePortalReveal = (t) => {
      const sCurve = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2.35) / 2;
      return 0.14 * t + 0.86 * sCurve;
    };

    const applyClipAt = (radiusPx) => {
      const clip = `circle(${radiusPx.toFixed(1)}px at ${origin.x}px ${origin.y}px)`;
      shellEl.style.webkitClipPath = clip;
      shellEl.style.clipPath = clip;
    };

    // Synchronously apply initial 0px clip before first paint so there is zero flash
    applyClipAt(0);
    particleWaveRef.current?.renderStep(0, 0, 0);

    const step = (now) => {
      if (cancelled) return;
      if (startMs === 0) {
        startMs = now;
        prevNow = now;
      }
      const t = Math.min(1, Math.max(0, (now - startMs) / durationMs));
      const dtSec = Math.max(0.004, (now - prevNow) / 1000);
      prevNow = now;

      const eased = easePortalReveal(t);
      const radiusPx = eased * totalTarget;
      const velocityPx = Math.max(0, (radiusPx - prevRadius) / dtSec);
      prevRadius = radiusPx;

      applyClipAt(radiusPx);
      particleWaveRef.current?.renderStep(t, radiusPx, velocityPx);

      if (t < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        particleWaveRef.current?.renderStep(1, totalTarget, 0);
        clearPortalTimers();
        setLoginPortal(null);
        setShowAuthScreen(false);
      }
    };

    rafId = window.requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      shellEl.style.webkitClipPath = '';
      shellEl.style.clipPath = '';
    };
  }, [loginPortal, clearPortalTimers]);

  // Shared mutable state ref for Zero-G Anti-Gravity calculation cycles (zero React re-renders)
  const antiGravityStateRef = useRef(null);
  const antiGravityEnabled =
    authReady && (!showAuthScreen || loginPortal?.phase === 'revealing');
  const antiGravityModalPaused = Boolean(
    selectedItemId !== null || profileModalOpen || accountSheetOpen || sampleImportOpen
  );
  const antiGravityModalPausedRef = useRef(antiGravityModalPaused);

  useEffect(() => {
    if (!antiGravityEnabled) return undefined;
    const shellEl = appShellRef.current;
    if (!shellEl) return undefined;
    if (!antiGravityStateRef.current) {
      antiGravityStateRef.current = createAntiGravityState();
    }
    return attachAntiGravityField(shellEl, {
      stateRef: antiGravityStateRef,
      initialPaused: antiGravityModalPausedRef.current,
    });
  }, [antiGravityEnabled]);

  useEffect(() => {
    antiGravityModalPausedRef.current = antiGravityModalPaused;
    if (!antiGravityEnabled) return;
    syncAntiGravityExternalPause(antiGravityStateRef, antiGravityModalPaused);
  }, [antiGravityEnabled, antiGravityModalPaused]);

  const handleEnterSampleCloset = useCallback(() => {
    startLoginPortalTransition(() => {
      setStoredToken(null);
      setSampleDemoMode(true);
      setUser(DEFAULT_LOCAL_USER);
      setSelectedItemId(null);
      setActiveTab('outfits');
      if (!isEmbedMode && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
    });
  }, [isEmbedMode, startLoginPortalTransition]);

  const handleLoginSuccess = useCallback(
    (loggedInUser) => {
      startLoginPortalTransition(() => {
        setSampleDemoMode(Boolean(loggedInUser?.isOfflineFallback));
        setUser(loggedInUser);
        try {
          syncAccountToAvatar(loggedInUser);
        } catch {
          // Ignore storage restrictions inside sandboxed embed iframes
        }
        setSelectedItemId(null);
        setActiveTab('outfits');
        setRefreshKey((k) => k + 1);
        if (!isEmbedMode && typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/');
        }
      });
    },
    [isEmbedMode, startLoginPortalTransition, syncAccountToAvatar]
  );

  const handleLogout = useCallback(async () => {
    clearPortalTimers();
    setLoginPortal(null);
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
    if (!isEmbedMode && typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/?auth=1');
    }
  }, [clearPortalTimers, isEmbedMode, user]);

  const handleAccountDeleted = useCallback(() => {
    garmentsMutationSeqRef.current += 1;
    setAccountSheetOpen(false);
    setStoredToken(null);
    setSampleDemoMode(false);
    setUser(null);
    setGarments([]);
    setShowAuthScreen(true);
    if (!isEmbedMode && typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/?auth=1');
    }
  }, [isEmbedMode]);

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

  const handleGarmentDeleted = useCallback(
    (deletedId) => {
      garmentsMutationSeqRef.current += 1;
      setGarments((prev) => prev.filter((g) => Number(g.id) !== Number(deletedId)));
      setSelectedItemId(null);
      if (
        !isEmbedMode &&
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/item/')
      ) {
        window.history.pushState({}, '', '/closet');
      }
    },
    [isEmbedMode]
  );

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

  const shouldRenderLogin = showAuthScreen || Boolean(loginPortal);
  const shouldRenderAppShell = !showAuthScreen || Boolean(loginPortal);

  const portalShellClass =
    loginPortal?.phase === 'flying'
      ? 'is-login-portal-preloading'
      : loginPortal?.phase === 'revealing'
        ? 'is-login-portal-preloading is-login-portal-revealing'
        : '';

  return (
    <>
      {shouldRenderLogin && (
        <div
          ref={portalOverlayRef}
          className={
            loginPortal
              ? `atelier-login-portal-overlay is-phase-${loginPortal.phase}`
              : 'atelier-login-host'
          }
          aria-hidden={Boolean(loginPortal) || undefined}
        >
          {!loginPortal && <StatusCapsule />}
          <Suspense fallback={<div className="hig-boot-screen" aria-busy="true" />}>
            <LoginView
              onLoginSuccess={handleLoginSuccess}
              onEnterSampleDemo={handleEnterSampleCloset}
              lang={lang}
              onChangeLang={handleChangeLang}
              effectiveTheme={resolvedTheme}
              onToggleTheme={handleToggleTheme}
              portalPhase={loginPortal?.phase || 'idle'}
              onPortalTargetResolved={handlePortalTargetResolved}
            />
          </Suspense>
        </div>
      )}

      {loginPortal?.phase === 'revealing' && (
        <LoginPortalParticleWave
          ref={particleWaveRef}
          origin={loginPortal.origin}
          maxRadius={loginPortal.maxRadius}
          theme={resolvedTheme}
          variant={loginPortal.variant}
        />
      )}

      {shouldRenderAppShell && (
        <div ref={appShellRef} className={`hig-native-shell ${portalShellClass}`.trim()}>
          {gmpQuotaExceeded && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}
          <StatusCapsule />

      <main className="hig-native-viewport">
        <Suspense
          fallback={
            <div
              className="hig-screen-container"
              aria-busy="true"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                minHeight: '60vh',
                color: 'var(--hig-text-secondary, #8e8e93)',
                fontSize: '0.84rem',
                fontWeight: 500,
              }}
            >
              <div className="hig-spinner" aria-hidden="true" />
              <span>{lang === 'en' ? 'Opening Studio...' : '스튜디오 준비 중...'}</span>
            </div>
          }
        >
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
      )}
    </>
  );
}
