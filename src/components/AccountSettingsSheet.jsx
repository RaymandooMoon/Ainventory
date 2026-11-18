import { useEffect, useState } from 'react';
import {
  CloudOff,
  FileText,
  Globe,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { translateSubTypeLabel } from '../services/skinToneAnalyzer.ts';
import { apiFetch, flushPendingOfflineSync } from '../utils/api.ts';
import { localizeApiMessage, localizeUserName, tx } from '../utils/i18n.ts';
import {
  applyThemePreference,
  emitStatusCapsule,
  getStoredThemePreference,
  triggerHaptic,
} from '../utils/nativeBridge.ts';
import { getOfflineQueueCount, purgeAllLocalUserData } from '../utils/offlineSync.ts';
import {
  DEFAULT_NAV_OPACITY,
  ECONOMY_STATE_EVENT,
  MAX_NAV_OPACITY,
  MIN_NAV_OPACITY,
  adjustAdminCurrencyBalance,
  getStoredNavOpacity,
  loadStoredEconomyState,
  resetAdminFreeDraw,
  saveStoredNavOpacity,
  setAdminAttendanceStreak,
  setAdminCurrencyBalance,
} from '../utils/stageBackgroundCatalog.ts';
import { runCircularThemeTransition } from '../utils/themeTransition.ts';
import BrandLogo from './auth/BrandLogo.tsx';
import { LegalDisclosureModal, ResponsiveSheetModal } from './common/AppUI.jsx';

/**
 * Account Settings, Language Switcher, 1-Tap Profile Shortcut, Theme Appearance,
 * Offline Sync Status & Immediate Permanent Account Deletion
 */
function AccountSettingsContent({
  onClose,
  user,
  skinProfile,
  bodySpec,
  theme = 'light',
  lang = 'ko',
  onChangeLang,
  onOpenProfile,
  onOpenSampleImport,
  onLogout,
  onAccountDeleted,
  onOpenLegalDoc,
}) {
  const [themePref, setThemePref] = useState(() => getStoredThemePreference());
  const [navOpacity, setNavOpacity] = useState(() => getStoredNavOpacity());
  const [queueCount, setQueueCount] = useState(0);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const isAdminUser = user?.role === 'admin' || user?.username === 'admin';
  const [economyState, setEconomyState] = useState(() => loadStoredEconomyState());
  const [adminCurrencyInput, setAdminCurrencyInput] = useState(() =>
    String(loadStoredEconomyState().iBalance ?? 0)
  );

  useEffect(() => {
    let active = true;
    getOfflineQueueCount()
      .then((c) => {
        if (active) setQueueCount(c);
      })
      .catch(() => {
        if (active) setQueueCount(0);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAdminUser || typeof window === 'undefined') return undefined;
    const syncEconomy = (ev) => {
      const next = ev?.detail || loadStoredEconomyState();
      setEconomyState(next);
      setAdminCurrencyInput(String(next.iBalance ?? 0));
    };
    window.addEventListener(ECONOMY_STATE_EVENT, syncEconomy);
    return () => window.removeEventListener(ECONOMY_STATE_EVENT, syncEconomy);
  }, [isAdminUser]);

  const handleThemeSelect = (nextPref, event) => {
    triggerHaptic('selection');
    runCircularThemeTransition({
      event,
      applyTheme: () => {
        setThemePref(nextPref);
        applyThemePreference(nextPref);
      },
    });
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await flushPendingOfflineSync();
      const left = await getOfflineQueueCount();
      setQueueCount(left);
      emitStatusCapsule(tx(lang, '동기화 완료', 'Sync complete'));
    } catch (err) {
      emitStatusCapsule(
        localizeApiMessage(err?.message, lang) || tx(lang, '동기화 오류', 'Sync failed')
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleImmediatePermanentDelete = async () => {
    setDeleting(true);
    try {
      if (!user?.isSampleDemo) {
        await apiFetch('/auth/account', {
          method: 'DELETE',
          body: JSON.stringify({ confirmPermanentDelete: true }),
        });
      }
      await purgeAllLocalUserData();
      triggerHaptic('heavy');
      emitStatusCapsule(tx(lang, '계정이 삭제되었습니다', 'Account deleted'));
      onAccountDeleted?.();
    } catch (err) {
      emitStatusCapsule(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '계정 삭제 오류', 'Failed to delete account')
      );
    } finally {
      setDeleting(false);
    }
  };

  const subTypeText =
    lang === 'en'
      ? translateSubTypeLabel(skinProfile?.subTypeLabelKo, skinProfile?.personalColor)
      : skinProfile?.subTypeLabelKo || '가을 웜 뮤트';

  return (
    <div className="hig-item-detail-body">
      {/* User Summary + Official iNVTRY Brand Signature */}
      <div className="hig-sheet-card">
        <div className="hig-sheet-row-between">
          <div>
            <div className="hig-headline">
              {localizeUserName(user?.displayName, lang) || tx(lang, '사용자', 'Member')}
            </div>
            <div className="hig-caption tabular-nums">
              @{user?.username || 'wardrobe'}
              {bodySpec ? ` · ${bodySpec.heightCm}cm · ${bodySpec.weightKg}kg` : ''}
            </div>
          </div>
          <BrandLogo effectiveTheme={theme} className="is-compact" alt="iNVTRY" />
        </div>
      </div>

      {/* 1-Tap Shortcut to Photo · Skin Tone · Body Profile */}
      <div className="hig-sheet-card">
        <div className="hig-sheet-row-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="hig-profile-quick-swatch"
              style={{
                width: 28,
                height: 28,
                backgroundColor: skinProfile?.skinToneHex || '#DFBA9B',
              }}
            />
            <div>
              <div className="hig-body" style={{ fontWeight: 680 }}>
                {tx(lang, '사진 · 피부톤 · 체형 설정', 'Photo, Skin Tone & Body Profile')}
              </div>
              <div className="hig-caption tabular-nums">
                {subTypeText} · {skinProfile?.skinToneHex || '#DFBA9B'}
                {bodySpec ? ` · ${bodySpec.heightCm}cm / ${bodySpec.weightKg}kg` : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="account-profile-shortcut-actions">
          <button
            id="settings-open-profile-btn"
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              onClose?.();
              onOpenProfile?.('skin');
            }}
          >
            <Palette size={14} />
            <span>{tx(lang, '사진 · 피부톤', 'Photo & Skin')}</span>
          </button>
          <button
            id="settings-open-body-btn"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              onClose?.();
              onOpenProfile?.('body');
            }}
          >
            <SlidersHorizontal size={14} />
            <span>{tx(lang, '체형 설정', 'Body Profile')}</span>
          </button>
        </div>
      </div>

      {/* Explicit 2-Pill Language Switcher (한국어 / English) */}
      <div className="hig-sheet-card">
        <div className="hig-caption">
          <Globe size={13} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} />
          {tx(lang, '언어 (Language)', 'Language')}
        </div>
        <div className="hig-grid-2">
          {[
            { key: 'ko', label: lang === 'en' ? 'Korean' : '한국어' },
            { key: 'en', label: 'English' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              data-lang-btn={opt.key}
              aria-pressed={lang === opt.key}
              className={`btn ${lang === opt.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => {
                triggerHaptic('selection');
                onChangeLang?.(opt.key);
              }}
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Navigation Bar Transparency Control (Default 50%) */}
      <div className="hig-sheet-card" data-nav-opacity-card="true">
        <div className="hig-sheet-row-between" style={{ marginBottom: 8 }}>
          <label htmlFor="settings-nav-opacity-slider" className="hig-caption" style={{ fontWeight: 620 }}>
            {tx(lang, '하단 네비게이션 바 불투명도', 'Bottom Navigation Bar Opacity')}
          </label>
          <span
            className="hig-caption tabular-nums"
            data-nav-opacity-value="true"
            style={{ fontWeight: 720, color: 'var(--ink-primary)' }}
          >
            {Math.round(navOpacity * 100)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            id="settings-nav-opacity-slider"
            data-nav-opacity-slider="true"
            type="range"
            min={MIN_NAV_OPACITY}
            max={MAX_NAV_OPACITY}
            step={0.05}
            value={navOpacity}
            aria-label={tx(
              lang,
              '하단 네비게이션 바 불투명도 조절',
              'Adjust bottom navigation bar opacity'
            )}
            onChange={(e) => {
              const nextVal = saveStoredNavOpacity(Number(e.target.value));
              setNavOpacity(nextVal);
            }}
            style={{ flex: 1, accentColor: 'var(--ink-primary)', minHeight: 28 }}
          />
          <button
            type="button"
            data-nav-opacity-reset="true"
            className="btn btn-secondary btn-sm tabular-nums"
            disabled={Math.abs(navOpacity - DEFAULT_NAV_OPACITY) < 0.01}
            onClick={() => {
              triggerHaptic('selection');
              const resetVal = saveStoredNavOpacity(DEFAULT_NAV_OPACITY);
              setNavOpacity(resetVal);
            }}
          >
            <span>{tx(lang, '기본 50%', 'Default 50%')}</span>
          </button>
        </div>
      </div>

      {/* Light / Dark / System Appearance */}
      <div className="hig-sheet-card">
        <div className="hig-caption">{tx(lang, '화면 테마', 'Appearance')}</div>
        <div className="hig-grid-3">
          {[
            { key: 'light', label: tx(lang, '라이트', 'Light'), icon: <Sun size={14} /> },
            { key: 'dark', label: tx(lang, '다크', 'Dark'), icon: <Moon size={14} /> },
            { key: 'system', label: tx(lang, '시스템', 'System'), icon: <Sparkles size={14} /> },
          ].map((opt) => (
            <button
              key={opt.key}
              id={`theme-mode-${opt.key}-btn`}
              type="button"
              className={`btn ${themePref === opt.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={(e) => handleThemeSelect(opt.key, e)}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Offline-First Sync & Sample Closet Import */}
      <div className="hig-sheet-card">
        <div className="hig-sheet-row-between">
          <div>
            <div className="hig-body" style={{ fontWeight: 600 }}>
              {tx(lang, '오프라인 캐시 동기화', 'Offline Cache Sync')}
            </div>
            <div className="hig-caption tabular-nums">
              {tx(
                lang,
                `대기 중인 로컬 작업 ${queueCount}건 · IndexedDB 활성화됨`,
                `${queueCount} queued local actions · IndexedDB active`
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={syncing}
            onClick={handleSyncNow}
          >
            {syncing ? <CloudOff size={14} /> : <RefreshCw size={14} />}
            <span>{tx(lang, '동기화', 'Sync')}</span>
          </button>
        </div>

        {!user?.isSampleDemo && onOpenSampleImport && (
          <div>
            <button
              id="settings-open-sample-import-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onClose?.();
                onOpenSampleImport?.();
              }}
            >
              {tx(lang, '샘플 아이템 선택 가져오기', 'Import Sample Closet Items')}
            </button>
          </div>
        )}
      </div>

      {/* Admin Only: i Currency & Draw / Streak Testing Panel */}
      {isAdminUser && (
        <div className="hig-sheet-card" data-admin-economy-panel="true">
          <div className="hig-sheet-row-between" style={{ marginBottom: 8 }}>
            <div>
              <div className="hig-body" style={{ fontWeight: 700 }}>
                {tx(lang, '관리자 테스트 · 재화(i) 및 출석 조정', 'Admin QA · Currency (i) & Streak')}
              </div>
              <div className="hig-caption tabular-nums" data-admin-current-i="true">
                {tx(
                  lang,
                  `현재 보유: ${economyState.iBalance} i · 연속 출석: ${economyState.attendanceStreak}일`,
                  `Current: ${economyState.iBalance} i · Streak: ${economyState.attendanceStreak}d`
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[-50, -10, 10, 50, 100].map((delta) => (
              <button
                key={delta}
                type="button"
                data-admin-i-delta={String(delta)}
                className="btn btn-secondary btn-sm tabular-nums"
                onClick={() => {
                  triggerHaptic('selection');
                  const next = adjustAdminCurrencyBalance(delta);
                  setEconomyState(next);
                  setAdminCurrencyInput(String(next.iBalance));
                  emitStatusCapsule(
                    tx(lang, `재화 ${next.iBalance} i로 변경됨`, `Balance set to ${next.iBalance} i`)
                  );
                }}
              >
                {delta > 0 ? `+${delta} i` : `${delta} i`}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="number"
              min={0}
              max={99999}
              step={1}
              data-admin-i-input="true"
              className="hig-native-input tabular-nums"
              value={adminCurrencyInput}
              aria-label={tx(lang, '보유 재화 i 직접 입력', 'Set exact i balance')}
              onChange={(e) => setAdminCurrencyInput(e.target.value)}
              style={{ flex: 1, minHeight: 40 }}
            />
            <button
              type="button"
              data-admin-i-apply="true"
              className="btn btn-primary btn-sm"
              onClick={() => {
                triggerHaptic('medium');
                const next = setAdminCurrencyBalance(Number(adminCurrencyInput));
                setEconomyState(next);
                setAdminCurrencyInput(String(next.iBalance));
                emitStatusCapsule(
                  tx(lang, `보유 재화 ${next.iBalance} i 적용`, `Applied ${next.iBalance} i`)
                );
              }}
            >
              <span>{tx(lang, '직접 적용', 'Apply')}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              data-admin-reset-free-draw="true"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                triggerHaptic('selection');
                const next = resetAdminFreeDraw();
                setEconomyState(next);
                emitStatusCapsule(
                  tx(lang, '오늘의 무료 뽑기 초기화됨', 'Daily free draw reset')
                );
              }}
            >
              <span>{tx(lang, '무료 뽑기 초기화', 'Reset Free Draw')}</span>
            </button>
            {[0, 6, 29].map((streakVal) => (
              <button
                key={streakVal}
                type="button"
                data-admin-streak-set={String(streakVal)}
                className="btn btn-secondary btn-sm tabular-nums"
                onClick={() => {
                  triggerHaptic('selection');
                  const next = setAdminAttendanceStreak(streakVal);
                  setEconomyState(next);
                  emitStatusCapsule(
                    tx(lang, `연속 출석 ${next.attendanceStreak}일 설정`, `Streak set to ${next.attendanceStreak}d`)
                  );
                }}
              >
                <span>{tx(lang, `연속 ${streakVal}일`, `Streak ${streakVal}d`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legal Disclosures: Privacy Policy & Terms of Service */}
      <div className="hig-grid-2">
        <button
          id="settings-privacy-policy-btn"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenLegalDoc?.('privacy')}
        >
          <ShieldCheck size={14} />
          <span>{tx(lang, '개인정보처리방침', 'Privacy Policy')}</span>
        </button>
        <button
          id="settings-terms-btn"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenLegalDoc?.('terms')}
        >
          <FileText size={14} />
          <span>{tx(lang, '이용약관', 'Terms of Service')}</span>
        </button>
      </div>

      {/* Logout */}
      <button
        id="account-logout-btn"
        type="button"
        className="btn btn-secondary btn-full"
        onClick={() => {
          onClose?.();
          onLogout?.();
        }}
      >
        <LogOut size={16} />
        <span>
          {user?.isSampleDemo
            ? tx(lang, '체험 종료 및 로그인 화면으로 이동', 'Exit Demo & Go to Sign In')
            : tx(lang, '로그아웃', 'Sign Out')}
        </span>
      </button>

      {/* Mandatory Store Compliance: Immediate Permanent Account & Data Deletion */}
      {!user?.isSampleDemo && (
        <div className="hig-sheet-card">
          <div className="hig-caption" style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
            {tx(lang, '개인 데이터 및 계정 영구 파기', 'Permanent Account & Data Deletion')}
          </div>
          <p className="hig-caption">
            {tx(
              lang,
              '탈퇴 즉시 서버에 저장된 원본 의류 사진, 프로필, 코디 기록 및 기기 내 IndexedDB 캐시가 복구 불가능하게 영구 삭제됩니다.',
              'Deleting your account immediately and permanently erases all garments, profile data, outfits, calendar logs, and local IndexedDB cache.'
            )}
          </p>

          {!confirmDeleteStep ? (
            <button
              id={CARBON_DOM_CONTRACT.initiateDeleteAccountBtnId}
              type="button"
              className="hig-danger-outline-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setConfirmDeleteStep(true)}
            >
              <Trash2 size={14} />
              <span>
                {tx(
                  lang,
                  '회원 탈퇴 및 모든 개인 데이터 즉시 영구 삭제',
                  'Delete Account & Erase All Data Immediately'
                )}
              </span>
            </button>
          ) : (
            <div className="hig-sheet-row-between">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setConfirmDeleteStep(false)}
              >
                {tx(lang, '취소', 'Cancel')}
              </button>
              <button
                id={CARBON_DOM_CONTRACT.confirmPermanentDeleteBtnId}
                type="button"
                className="btn btn-primary btn-sm"
                disabled={deleting}
                onClick={handleImmediatePermanentDelete}
              >
                <Trash2 size={14} />
                <span>
                  {deleting
                    ? tx(lang, '즉시 영구 삭제 중...', 'Deleting permanently...')
                    : tx(lang, '영구 삭제 최종 확인', 'Confirm Permanent Deletion')}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountSettingsSheet({
  open,
  onClose,
  user,
  skinProfile,
  bodySpec,
  theme = 'light',
  lang = 'ko',
  onChangeLang,
  onOpenProfile,
  onOpenSampleImport,
  onLogout,
  onAccountDeleted,
}) {
  const [legalDoc, setLegalDoc] = useState(null);

  return (
    <>
      <ResponsiveSheetModal
        open={open}
        onClose={onClose}
        lang={lang}
        eyebrow="ACCOUNT"
        title={tx(lang, '계정 설정', 'Account Settings')}
        maxWidth={500}
      >
        {open && (
          <AccountSettingsContent
            onClose={onClose}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            theme={theme}
            lang={lang}
            onChangeLang={onChangeLang}
            onOpenProfile={onOpenProfile}
            onOpenSampleImport={onOpenSampleImport}
            onLogout={onLogout}
            onAccountDeleted={onAccountDeleted}
            onOpenLegalDoc={setLegalDoc}
          />
        )}
      </ResponsiveSheetModal>

      <LegalDisclosureModal
        open={Boolean(legalDoc)}
        initialDoc={legalDoc || 'privacy'}
        onClose={() => setLegalDoc(null)}
        lang={lang}
      />
    </>
  );
}
