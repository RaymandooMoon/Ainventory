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

  const root = document.documentElement;
  const slots = Array.from(document.querySelectorAll('.ir-slide-slot'));
  const totalSlides = slots.length;
  const printStyleEl = document.getElementById('ir-dynamic-page-style');
  const counterEl = document.getElementById('ir-slide-counter');
  const jumpSelect = document.getElementById('ir-slide-jump');
  const prevBtn = document.getElementById('ir-btn-prev');
  const nextBtn = document.getElementById('ir-btn-next');
  const printBtn = document.getElementById('ir-btn-print');
  const progressBar = document.getElementById('ir-progress-bar');
  const siteBackLink = document.getElementById('ir-site-back');

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
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
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
  const parsedSlide = Number.parseInt(params.get('slide') || '1', 10);

  let currentIndex = Number.isFinite(parsedSlide)
    ? Math.max(0, Math.min(totalSlides - 1, parsedSlide - 1))
    : 0;
  let currentRatio = initialRatio;
  let currentTheme = initialTheme;
  let currentMood = initialMood;
  let currentLang = initialLang;
  let currentView = initialView;

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
    if (currentView === 'deck') {
      nextParams.set('slide', String(currentIndex + 1));
    }
    const nextUrl = `${window.location.pathname}?${nextParams.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }

  function updateScale() {
    const dims = RATIO_DIMENSIONS[currentRatio] || RATIO_DIMENSIONS['16-9'];
    const padX = currentView === 'deck' ? 32 : 48;
    const padY = currentView === 'deck' ? 80 : 0;
    const maxW = Math.max(320, window.innerWidth - padX);
    const scaleX = maxW / dims.width;

    let scale = Math.min(1, scaleX);
    if (currentView === 'deck') {
      const maxH = Math.max(240, window.innerHeight - padY);
      scale = Math.min(scaleX, maxH / dims.height);
    }
    root.style.setProperty('--deck-scale', Math.max(0.25, scale).toFixed(4));
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
    if (counterEl) {
      counterEl.textContent = `${String(clamped + 1).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`;
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
    if (currentView === 'scroll' && scrollIfNeeded && slots[clamped]) {
      slots[clamped].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    syncUrl();
  }

  // Bind toolbar actions
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

  if (prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
  if (jumpSelect) {
    jumpSelect.addEventListener('change', (e) => {
      const idx = Number.parseInt(e.target.value, 10);
      if (Number.isFinite(idx)) goToSlide(idx);
    });
  }
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  // Clickable Table of Contents jump links
  document.querySelectorAll('[data-jump-slide]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = Number.parseInt(el.getAttribute('data-jump-slide') || '', 10);
      if (Number.isFinite(target)) {
        goToSlide(target);
      }
    });
  });

  // Keyboard shortcuts (navigation + L lang, T theme, R ratio)
  window.addEventListener('keydown', (e) => {
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

  if (siteBackLink && window.location.protocol === 'file:') {
    siteBackLink.hidden = true;
  }

  // Touch horizontal swipe navigation in deck mode
  const viewportEl = document.querySelector('.ir-deck-viewport');
  if (viewportEl) {
    let touchStartX = 0;
    let touchStartY = 0;
    viewportEl.addEventListener(
      'touchstart',
      (e) => {
        if (currentView !== 'deck' || e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    viewportEl.addEventListener(
      'touchend',
      (e) => {
        if (currentView !== 'deck' || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          goToSlide(dx < 0 ? currentIndex + 1 : currentIndex - 1);
        }
      },
      { passive: true }
    );
  }

  window.addEventListener('resize', updateScale, { passive: true });

  // Initialize state cleanly
  applyRatio(currentRatio);
  applyMood(currentMood);
  commitTheme(currentTheme);
  applyLang(currentLang);
  applyView(currentView);
  goToSlide(currentIndex, false);
})();
