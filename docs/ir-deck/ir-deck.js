(() => {
  const RATIO_DIMENSIONS = {
    '16-9': { width: 1280, height: 720, pageSize: '1280px 720px' },
    '4-3': { width: 1024, height: 768, pageSize: '1024px 768px' },
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

  const params = new URLSearchParams(window.location.search);
  const initialRatio = params.get('ratio') === '4-3' ? '4-3' : '16-9';
  const initialTheme = params.get('theme') === 'dark' ? 'dark' : 'light';
  const initialMood = params.get('mood') === 'aurora' ? 'aurora' : 'luxury';
  const initialView = params.get('view') === 'scroll' ? 'scroll' : 'deck';
  const parsedSlide = Number.parseInt(params.get('slide') || '1', 10);
  let currentIndex = Number.isFinite(parsedSlide)
    ? Math.max(0, Math.min(totalSlides - 1, parsedSlide - 1))
    : 0;

  let currentRatio = initialRatio;
  let currentTheme = initialTheme;
  let currentMood = initialMood;
  let currentView = initialView;

  function syncUrl() {
    if (window.location.protocol === 'file:') return;
    const nextParams = new URLSearchParams();
    nextParams.set('ratio', currentRatio);
    nextParams.set('mood', currentMood);
    nextParams.set('theme', currentTheme);
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
    const padY = currentView === 'deck' ? 78 : 0;
    const maxW = Math.max(320, window.innerWidth - padX);
    const scaleX = maxW / dims.width;

    let scale = Math.min(1, scaleX);
    if (currentView === 'deck') {
      const maxH = Math.max(240, window.innerHeight - padY);
      scale = Math.min(scaleX, maxH / dims.height);
    }
    root.style.setProperty('--deck-scale', Math.max(0.25, scale).toFixed(4));
  }

  function applyRatio(ratio) {
    currentRatio = ratio === '4-3' ? '4-3' : '16-9';
    root.setAttribute('data-ratio', currentRatio);
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
    document.querySelectorAll('[data-set-mood]').forEach((btn) => {
      const active = btn.getAttribute('data-set-mood') === currentMood;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncUrl();
  }

  function applyTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', currentTheme);
    document.querySelectorAll('[data-set-theme]').forEach((btn) => {
      const active = btn.getAttribute('data-set-theme') === currentTheme;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('img[data-light-src][data-dark-src]').forEach((img) => {
      const nextSrc =
        currentTheme === 'dark'
          ? img.getAttribute('data-dark-src')
          : img.getAttribute('data-light-src');
      if (nextSrc && img.getAttribute('src') !== nextSrc) {
        img.setAttribute('src', nextSrc);
      }
    });
    syncUrl();
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
    if (prevBtn) prevBtn.disabled = clamped === 0;
    if (nextBtn) nextBtn.disabled = clamped === totalSlides - 1;
    if (currentView === 'scroll' && scrollIfNeeded && slots[clamped]) {
      slots[clamped].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    syncUrl();
  }

  // Bind toolbar actions
  document.querySelectorAll('[data-set-ratio]').forEach((btn) => {
    btn.addEventListener('click', () => applyRatio(btn.getAttribute('data-set-ratio') || '16-9'));
  });
  document.querySelectorAll('[data-set-mood]').forEach((btn) => {
    btn.addEventListener('click', () => applyMood(btn.getAttribute('data-set-mood') || 'luxury'));
  });
  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.getAttribute('data-set-theme') || 'light'));
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

  // Keyboard navigation in deck mode
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
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
    }
  });

  window.addEventListener('resize', updateScale, { passive: true });

  // Initialize state cleanly
  applyRatio(currentRatio);
  applyMood(currentMood);
  applyTheme(currentTheme);
  applyView(currentView);
  goToSlide(currentIndex, false);
})();
