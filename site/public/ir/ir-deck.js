(() => {
  'use strict';

  const RATIO_DIMENSIONS = {
    '16-9': { width: 1280, height: 720, pageSize: '1280px 720px' },
    '4-3': { width: 1024, height: 768, pageSize: '1024px 768px' },
  };

  const STORAGE_KEYS = {
    lang: 'ainvtry_ir_lang',
    theme: 'ainvtry_ir_theme',
    mood: 'ainvtry_ir_mood',
    ratio: 'ainvtry_ir_ratio',
  };

  const MOBILE_BREAKPOINT = 820;
  const root = document.documentElement;
  const slots = Array.from(document.querySelectorAll('.ir-slide-slot'));
  const totalSlides = slots.length;
  const printStyleEl = document.getElementById('ir-dynamic-page-style');
  const counterEl = document.getElementById('ir-slide-counter');
  const mobileCounterEl = document.getElementById('ir-mobile-counter');
  const jumpSelect = document.getElementById('ir-slide-jump');
  const prevBtn = document.getElementById('ir-btn-prev');
  const nextBtn = document.getElementById('ir-btn-next');
  const mobilePrevBtn = document.getElementById('ir-mobile-prev');
  const mobileNextBtn = document.getElementById('ir-mobile-next');
  const mobileMenuBtn = document.getElementById('ir-mobile-menu-btn');
  const mobileSheet = document.getElementById('ir-mobile-sheet');
  const mobileSheetClose = document.getElementById('ir-mobile-sheet-close');
  const mobileSheetBackdrop = document.getElementById('ir-mobile-sheet-backdrop');
  const progressBar = document.getElementById('ir-progress-bar');
  const siteBackLink = document.getElementById('ir-site-back');
  const liveHeroFrame = document.getElementById('ir-live-hero-frame');
  const liveHeroShell = document.getElementById('slide-01');
  const isHttpRuntime =
    window.location.protocol === 'http:' || window.location.protocol === 'https:';
  let liveHeroMounted = false;
  let suppressLiveHeroPost = false;

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch {
      // Ignore private-mode / sandboxed storage errors
    }
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function resolveInitialTheme(params) {
    const paramTheme = params.get('theme');
    if (paramTheme === 'dark' || paramTheme === 'light') return paramTheme;
    const saved = safeStorageGet(STORAGE_KEYS.theme);
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  }

  function resolveInitialLang(params) {
    const paramLang = params.get('lang');
    if (paramLang === 'en' || paramLang === 'ko') return paramLang;
    const saved = safeStorageGet(STORAGE_KEYS.lang);
    if (saved === 'en' || saved === 'ko') return saved;
    return 'ko';
  }

  const params = new URLSearchParams(window.location.search);
  const initialRatio =
    params.get('ratio') === '4-3' || safeStorageGet(STORAGE_KEYS.ratio) === '4-3'
      ? params.get('ratio') === '16-9'
        ? '16-9'
        : '4-3'
      : '16-9';
  const initialMood =
    params.get('mood') === 'aurora'
      ? 'aurora'
      : params.get('mood') === 'luxury'
        ? 'luxury'
        : safeStorageGet(STORAGE_KEYS.mood) === 'aurora'
          ? 'aurora'
          : 'luxury';
  const initialTheme = resolveInitialTheme(params);
  const initialLang = resolveInitialLang(params);
  const initialView = params.get('view') === 'scroll' ? 'scroll' : 'deck';
  const paramLayout = params.get('layout');
  let layoutUserPinned = paramLayout === 'mobile' || paramLayout === 'desktop';
  const initialLayout = layoutUserPinned
    ? paramLayout
    : window.innerWidth <= MOBILE_BREAKPOINT
      ? 'mobile'
      : 'desktop';
  const parsedSlide = Number.parseInt(params.get('slide') || '1', 10);

  let currentIndex = Number.isFinite(parsedSlide)
    ? Math.max(0, Math.min(totalSlides - 1, parsedSlide - 1))
    : 0;
  let currentRatio = initialRatio;
  let currentTheme = initialTheme;
  let currentMood = initialMood;
  let currentLang = initialLang;
  let currentView = initialView;
  let currentLayout = initialLayout;

  /* =========================================================================
   * Bilingual KO <-> EN Snapshot & Switcher (HTML + SVG <text> + Live Binds)
   * ========================================================================= */
  const i18n = window.IR_DECK_I18N || null;
  let i18nInitialized = false;
  const richSnapshots = [];
  const bindSnapshots = [];
  const leafSnapshots = [];
  const attrSnapshots = [];

  function normKey(str) {
    return String(str || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function captureKoreanSnapshots() {
    if (i18nInitialized || !i18n) return;
    i18nInitialized = true;

    const richElementsSet = new Set();

    // 1. Rich inline-HTML headlines & compound blocks
    Object.entries(i18n.RICH_HTML_EN || {}).forEach(([selector, enHtml]) => {
      const el = document.querySelector(selector);
      if (el) {
        richElementsSet.add(el);
        richSnapshots.push({ el, koHtml: el.innerHTML, enHtml });
      }
    });

    // 2. Live-bound data-ir-bind slots (dynamically formatted for EN)
    const bindElementsSet = new Set();
    document.querySelectorAll('[data-ir-bind]').forEach((el) => {
      const key = el.getAttribute('data-ir-bind');
      if (!key) return;
      bindElementsSet.add(el);
      bindSnapshots.push({ el, key, koText: el.textContent || '' });
    });

    // 3. All leaf text nodes (HTML + inline SVG <text> + <option>) outside rich/bind roots
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) continue;
      const tag = parent.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style') continue;

      let insideManaged = false;
      let cursor = parent;
      while (cursor && cursor !== document.body) {
        if (richElementsSet.has(cursor) || bindElementsSet.has(cursor)) {
          insideManaged = true;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (insideManaged) continue;

      const raw = node.nodeValue || '';
      const key = normKey(raw);
      if (!key) continue;
      if (i18n.TEXT_EN && Object.prototype.hasOwnProperty.call(i18n.TEXT_EN, key)) {
        const leadMatch = raw.match(/^\s*/);
        const trailMatch = raw.match(/\s*$/);
        const lead = leadMatch ? leadMatch[0] : '';
        const trail = trailMatch ? trailMatch[0] : '';
        leafSnapshots.push({
          node,
          koVal: raw,
          enVal: `${lead}${i18n.TEXT_EN[key]}${trail}`,
        });
      }
    }

    // 4. Translatable attributes (aria-label, alt)
    document.querySelectorAll('[aria-label], [alt]').forEach((el) => {
      ['aria-label', 'alt'].forEach((attr) => {
        const val = el.getAttribute(attr);
        if (!val) return;
        const key = normKey(val);
        if (i18n.ATTR_EN && Object.prototype.hasOwnProperty.call(i18n.ATTR_EN, key)) {
          attrSnapshots.push({ el, attr, koVal: val, enVal: i18n.ATTR_EN[key] });
        }
      });
    });
  }

  function syncMediaAssets() {
    document.querySelectorAll('img[data-light-src][data-dark-src]').forEach((img) => {
      const isDark = currentTheme === 'dark';
      const isEn = currentLang === 'en';
      let nextSrc = null;
      if (isEn) {
        nextSrc = isDark
          ? img.getAttribute('data-dark-src-en') || img.getAttribute('data-dark-src')
          : img.getAttribute('data-light-src-en') || img.getAttribute('data-light-src');
      } else {
        nextSrc = isDark ? img.getAttribute('data-dark-src') : img.getAttribute('data-light-src');
      }
      if (nextSrc && img.getAttribute('src') !== nextSrc) {
        img.setAttribute('src', nextSrc);
      }
    });
  }

  function syncUrl() {
    if (window.location.protocol === 'file:') return;
    const nextParams = new URLSearchParams();
    nextParams.set('lang', currentLang);
    nextParams.set('theme', currentTheme);
    nextParams.set('mood', currentMood);
    nextParams.set('ratio', currentRatio);
    nextParams.set('view', currentView);
    if (layoutUserPinned) {
      nextParams.set('layout', currentLayout);
    }
    if (currentView === 'deck') {
      nextParams.set('slide', String(currentIndex + 1));
    }
    const nextUrl = `${window.location.pathname}?${nextParams.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }

  function updateScale() {
    if (currentLayout === 'mobile') {
      root.style.setProperty('--deck-scale', '1');
      return;
    }
    const dims = RATIO_DIMENSIONS[currentRatio] || RATIO_DIMENSIONS['16-9'];
    const isCompactViewport = window.innerWidth <= 1120;
    const padX = currentView === 'deck' ? (isCompactViewport ? 16 : 32) : isCompactViewport ? 20 : 48;
    const padY = currentView === 'deck' ? (isCompactViewport ? 124 : 80) : 0;
    const maxW = Math.max(280, window.innerWidth - padX);
    const scaleX = maxW / dims.width;

    let scale = Math.min(1, scaleX);
    if (currentView === 'deck') {
      const maxH = Math.max(220, window.innerHeight - padY);
      scale = Math.min(scaleX, maxH / dims.height);
    }
    root.style.setProperty('--deck-scale', Math.max(0.22, scale).toFixed(4));
  }

  function applyLayout(layout, isManual = false) {
    currentLayout = layout === 'mobile' ? 'mobile' : 'desktop';
    if (isManual) layoutUserPinned = true;
    root.setAttribute('data-layout', currentLayout);
    document.querySelectorAll('[data-set-layout]').forEach((btn) => {
      const active = btn.getAttribute('data-set-layout') === currentLayout;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateScale();
    syncUrl();
  }

  function setMobileSheetOpen(open) {
    if (!mobileSheet) return;
    mobileSheet.hidden = !open;
    root.classList.toggle('ir-sheet-open', open);
    if (mobileMenuBtn) {
      mobileMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function applyLang(lang) {
    captureKoreanSnapshots();
    currentLang = lang === 'en' ? 'en' : 'ko';
    root.setAttribute('lang', currentLang);
    root.setAttribute('data-lang', currentLang);
    safeStorageSet(STORAGE_KEYS.lang, currentLang);

    document.querySelectorAll('[data-set-lang]').forEach((btn) => {
      const active = btn.getAttribute('data-set-lang') === currentLang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (i18n) {
      const isEn = currentLang === 'en';
      if (i18n.DOC_TITLE && i18n.DOC_TITLE[currentLang]) {
        document.title = i18n.DOC_TITLE[currentLang];
      }
      richSnapshots.forEach(({ el, koHtml, enHtml }) => {
        el.innerHTML = isEn ? enHtml : koHtml;
      });
      bindSnapshots.forEach(({ el, key, koText }) => {
        el.textContent = isEn ? i18n.formatBoundEn(key, koText) : koText;
      });
      leafSnapshots.forEach(({ node, koVal, enVal }) => {
        node.nodeValue = isEn ? enVal : koVal;
      });
      attrSnapshots.forEach(({ el, attr, koVal, enVal }) => {
        el.setAttribute(attr, isEn ? enVal : koVal);
      });
    }

    syncMediaAssets();
    syncLiveHeroFrame(false);
    syncUrl();
  }

  function applyRatio(ratio) {
    currentRatio = ratio === '4-3' ? '4-3' : '16-9';
    root.setAttribute('data-ratio', currentRatio);
    safeStorageSet(STORAGE_KEYS.ratio, currentRatio);
    const dims = RATIO_DIMENSIONS[currentRatio];
    if (printStyleEl) {
      printStyleEl.textContent = `@page { size: ${dims.pageSize}; margin: 0; }`;
    }
    document.querySelectorAll('[data-set-ratio]').forEach((btn) => {
      const active = btn.getAttribute('data-set-ratio') === currentRatio;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateScale();
    syncUrl();
  }

  function applyMood(mood) {
    currentMood = mood === 'aurora' ? 'aurora' : 'luxury';
    root.setAttribute('data-mood', currentMood);
    safeStorageSet(STORAGE_KEYS.mood, currentMood);
    document.querySelectorAll('[data-set-mood]').forEach((btn) => {
      const active = btn.getAttribute('data-set-mood') === currentMood;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncLiveHeroFrame(false);
    syncUrl();
  }

  function commitTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', currentTheme);
    safeStorageSet(STORAGE_KEYS.theme, currentTheme);
    document.querySelectorAll('[data-set-theme]').forEach((btn) => {
      const active = btn.getAttribute('data-set-theme') === currentTheme;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncMediaAssets();
    syncLiveHeroFrame(false);
    syncUrl();
  }

  function applyTheme(theme, triggerEvent) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    if (
      triggerEvent &&
      nextTheme !== currentTheme &&
      !prefersReducedMotion() &&
      typeof document.startViewTransition === 'function'
    ) {
      const rect = triggerEvent.currentTarget?.getBoundingClientRect?.();
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.top + rect.height / 2 : 24;
      const maxR = Math.hypot(
        Math.max(cx, window.innerWidth - cx),
        Math.max(cy, window.innerHeight - cy)
      );
      root.style.setProperty('--ripple-x', `${cx.toFixed(1)}px`);
      root.style.setProperty('--ripple-y', `${cy.toFixed(1)}px`);
      root.style.setProperty('--ripple-r', `${maxR.toFixed(1)}px`);
      root.classList.add('ir-theme-rippling');
      const vt = document.startViewTransition(() => commitTheme(nextTheme));
      vt.finished.finally(() => root.classList.remove('ir-theme-rippling'));
      return;
    }
    commitTheme(nextTheme);
  }

  function applyView(view) {
    currentView = view === 'scroll' ? 'scroll' : 'deck';
    root.setAttribute('data-view', currentView);
    document.querySelectorAll('[data-set-view]').forEach((btn) => {
      const active = btn.getAttribute('data-set-view') === currentView;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateScale();
    if (currentView === 'scroll' && slots[currentIndex]) {
      slots[currentIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
    }
    syncUrl();
  }

  function goToSlide(index, scrollIfNeeded = true) {
    const clamped = Math.max(0, Math.min(totalSlides - 1, index));
    currentIndex = clamped;
    slots.forEach((slot, idx) => {
      slot.classList.toggle('is-current', idx === clamped);
    });
    const counterLabel = `${String(clamped + 1).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`;
    if (counterEl) {
      counterEl.textContent = counterLabel;
    }
    if (mobileCounterEl) {
      mobileCounterEl.textContent = counterLabel;
    }
    if (jumpSelect) {
      jumpSelect.value = String(clamped);
    }
    if (progressBar && totalSlides > 0) {
      const ratio = (clamped + 1) / totalSlides;
      progressBar.style.transform = `scaleX(${ratio.toFixed(4)})`;
    }
    if (prevBtn) prevBtn.disabled = clamped === 0;
    if (nextBtn) nextBtn.disabled = clamped === totalSlides - 1;
    if (mobilePrevBtn) mobilePrevBtn.disabled = clamped === 0;
    if (mobileNextBtn) mobileNextBtn.disabled = clamped === totalSlides - 1;
    if (currentView === 'scroll' && scrollIfNeeded && slots[clamped]) {
      slots[clamped].scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (currentView === 'deck' && currentLayout === 'mobile' && scrollIfNeeded) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (clamped === 0) {
      syncLiveHeroFrame(true);
    }
    syncUrl();
  }

  function buildLiveHeroUrl() {
    const q = new URLSearchParams();
    q.set('embed', 'ir-cover');
    q.set('lang', currentLang);
    q.set('theme', currentTheme);
    q.set('mood', currentMood);
    return `/?${q.toString()}`;
  }

  function mountLiveHeroFrame() {
    if (!liveHeroFrame || !isHttpRuntime || liveHeroMounted) return;
    liveHeroMounted = true;
    liveHeroFrame.setAttribute('src', buildLiveHeroUrl());
  }

  function syncLiveHeroFrame(resetHero) {
    if (!liveHeroFrame || !liveHeroMounted || suppressLiveHeroPost || !isHttpRuntime) return;
    try {
      const win = liveHeroFrame.contentWindow;
      if (!win) return;
      win.postMessage(
        {
          type: 'invtry:ir-cover-sync',
          lang: currentLang,
          theme: currentTheme,
          mood: currentMood,
          resetHero: Boolean(resetHero),
        },
        window.location.origin
      );
    } catch {
      // Ignore cross-origin or uninitialized iframe errors
    }
  }

  if (isHttpRuntime) {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'invtry:ir-cover-ready') {
        if (liveHeroShell) liveHeroShell.classList.add('is-live-ready');
        syncLiveHeroFrame(false);
        return;
      }
      if (data.type === 'invtry:ir-cover-state') {
        suppressLiveHeroPost = true;
        if ((data.theme === 'dark' || data.theme === 'light') && data.theme !== currentTheme) {
          commitTheme(data.theme);
        }
        if ((data.mood === 'luxury' || data.mood === 'aurora') && data.mood !== currentMood) {
          applyMood(data.mood);
        }
        if ((data.lang === 'ko' || data.lang === 'en') && data.lang !== currentLang) {
          applyLang(data.lang);
        }
        suppressLiveHeroPost = false;
        return;
      }
      if (data.type === 'invtry:ir-cover-key') {
        if (data.key === 'ArrowRight' || data.key === 'PageDown') {
          goToSlide(currentIndex + 1);
        } else if (data.key === 'ArrowLeft' || data.key === 'PageUp') {
          goToSlide(currentIndex - 1);
        } else if (data.key === 'Home') {
          goToSlide(0);
        } else if (data.key === 'End') {
          goToSlide(totalSlides - 1);
        }
      }
    });
  }

  // Bind toolbar & mobile sheet actions (single synced state)
  document.querySelectorAll('[data-set-lang]').forEach((btn) => {
    btn.addEventListener('click', () => applyLang(btn.getAttribute('data-set-lang') || 'ko'));
  });
  document.querySelectorAll('[data-set-ratio]').forEach((btn) => {
    btn.addEventListener('click', () => applyRatio(btn.getAttribute('data-set-ratio') || '16-9'));
  });
  document.querySelectorAll('[data-set-mood]').forEach((btn) => {
    btn.addEventListener('click', () => applyMood(btn.getAttribute('data-set-mood') || 'luxury'));
  });
  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', (e) => applyTheme(btn.getAttribute('data-set-theme') || 'light', e));
  });
  document.querySelectorAll('[data-set-view]').forEach((btn) => {
    btn.addEventListener('click', () => applyView(btn.getAttribute('data-set-view') || 'deck'));
  });
  document.querySelectorAll('[data-set-layout]').forEach((btn) => {
    btn.addEventListener('click', () =>
      applyLayout(btn.getAttribute('data-set-layout') || 'desktop', true)
    );
  });
  document.querySelectorAll('[data-trigger-print]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setMobileSheetOpen(false);
      window.print();
    });
  });

  if (prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
  if (mobilePrevBtn) mobilePrevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
  if (mobileNextBtn) mobileNextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => setMobileSheetOpen(Boolean(mobileSheet && mobileSheet.hidden)));
  }
  if (mobileSheetClose) mobileSheetClose.addEventListener('click', () => setMobileSheetOpen(false));
  if (mobileSheetBackdrop) mobileSheetBackdrop.addEventListener('click', () => setMobileSheetOpen(false));
  if (jumpSelect) {
    jumpSelect.addEventListener('change', (e) => {
      const idx = Number.parseInt(e.target.value, 10);
      if (Number.isFinite(idx)) goToSlide(idx);
    });
  }

  // Clickable Table of Contents & Overview Card jump links
  document.querySelectorAll('[data-jump-slide]').forEach((el) => {
    const activateJump = () => {
      const target = Number.parseInt(el.getAttribute('data-jump-slide') || '', 10);
      if (Number.isFinite(target)) {
        goToSlide(target);
      }
    };
    el.addEventListener('click', activateJump);
    if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateJump();
        }
      });
    }
  });

  // Keyboard shortcuts (navigation + L lang, T theme, R ratio, Escape closes sheet)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileSheet && !mobileSheet.hidden) {
      setMobileSheetOpen(false);
      return;
    }
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && currentView === 'deck')) {
      e.preventDefault();
      goToSlide(currentIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      goToSlide(currentIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToSlide(totalSlides - 1);
    } else if (e.key === 'l' || e.key === 'L') {
      applyLang(currentLang === 'ko' ? 'en' : 'ko');
    } else if (e.key === 't' || e.key === 'T') {
      applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    } else if (e.key === 'r' || e.key === 'R') {
      applyRatio(currentRatio === '16-9' ? '4-3' : '16-9');
    }
  });

  if (siteBackLink) {
    if (window.location.protocol === 'file:') {
      siteBackLink.hidden = true;
    } else if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      siteBackLink.setAttribute('href', '/?site=1');
    }
  }

  // Touch horizontal swipe navigation in deck mode (skips horizontal carousels/tables)
  const viewportEl = document.querySelector('.ir-deck-viewport');
  if (viewportEl) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchInsideScrollable = false;
    viewportEl.addEventListener(
      'touchstart',
      (e) => {
        if (currentView !== 'deck' || e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        const targetEl = e.target instanceof Element ? e.target : null;
        touchInsideScrollable = Boolean(
          targetEl && targetEl.closest('.s07-grid--5, .s11-matrix-card, .pp-table-scroll')
        );
      },
      { passive: true }
    );
    viewportEl.addEventListener(
      'touchend',
      (e) => {
        if (currentView !== 'deck' || touchInsideScrollable || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          goToSlide(dx < 0 ? currentIndex + 1 : currentIndex - 1);
        }
      },
      { passive: true }
    );
  }

  window.addEventListener(
    'resize',
    () => {
      if (!layoutUserPinned) {
        const autoLayout = window.innerWidth <= MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
        if (autoLayout !== currentLayout) {
          applyLayout(autoLayout, false);
          return;
        }
      }
      updateScale();
    },
    { passive: true }
  );

  // Initialize state cleanly
  applyLayout(currentLayout, layoutUserPinned);
  applyRatio(currentRatio);
  applyMood(currentMood);
  commitTheme(currentTheme);
  applyLang(currentLang);
  applyView(currentView);
  goToSlide(currentIndex, false);
  mountLiveHeroFrame();
})();
