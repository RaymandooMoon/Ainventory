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
  lang = 'ko',
  onChangeLang,
  onOpenProfile,
  onOpenSampleImport,
  onLogout,
  onAccountDeleted,
  onOpenLegalDoc,
}) {
  const [themePref, setThemePref] = useState(() => getStoredThemePreference());
  const [queueCount, setQueueCount] = useState(0);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const handleThemeSelect = (nextPref) => {
    triggerHaptic('selection');
    setThemePref(nextPref);
    applyThemePreference(nextPref);
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
      {/* User Summary */}
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
              onClick={() => handleThemeSelect(opt.key)}
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
