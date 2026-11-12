import { useEffect, useState } from 'react';
import {
  CloudOff,
  FileText,
  Globe,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { apiFetch, flushPendingOfflineSync } from '../utils/api.ts';
import {
  applyThemePreference,
  emitStatusCapsule,
  getStoredThemePreference,
  triggerHaptic,
} from '../utils/nativeBridge.ts';
import { getOfflineQueueCount, purgeAllLocalUserData } from '../utils/offlineSync.ts';
import { LegalDisclosureModal, ResponsiveSheetModal } from './common/AppUI.jsx';

/**
 * Account Settings, Theme Appearance, Offline Sync Status & Immediate Permanent Account Deletion
 */
export default function AccountSettingsSheet({
  open,
  onClose,
  user,
  bodySpec,
  lang,
  onChangeLang,
  onOpenSampleImport,
  onLogout,
  onAccountDeleted,
}) {
  const [themePref, setThemePref] = useState(getStoredThemePreference());
  const [queueCount, setQueueCount] = useState(0);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null);

  useEffect(() => {
    if (!open) return;
    setConfirmDeleteStep(false);
    setThemePref(getStoredThemePreference());
    getOfflineQueueCount()
      .then((c) => setQueueCount(c))
      .catch(() => setQueueCount(0));
  }, [open]);

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
      emitStatusCapsule('동기화 완료');
    } catch (err) {
      emitStatusCapsule(err?.message || '동기화 오류');
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
      emitStatusCapsule('계정이 삭제되었습니다');
      onAccountDeleted?.();
    } catch (err) {
      emitStatusCapsule(err.message || '계정 삭제 오류');
    } finally {
      setDeleting(false);
    }
  };

  const resolvedGenderLabel =
    (user?.isSampleDemo ? bodySpec?.gender : user?.gender || bodySpec?.gender) === 'female'
      ? '여성'
      : '남성';

  return (
    <>
      <ResponsiveSheetModal
        open={open}
        onClose={onClose}
        eyebrow="ACCOUNT"
        title="계정 설정"
        maxWidth={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* User Summary */}
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div>
              <div className="hig-headline">{user?.displayName || '사용자'}</div>
              <div className="hig-caption tabular-nums">
                @{user?.username} · {resolvedGenderLabel}
                {bodySpec ? ` · ${bodySpec.heightCm}cm · ${bodySpec.weightKg}kg` : ''}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ minHeight: 44 }}
              onClick={() => onChangeLang?.(lang === 'ko' ? 'en' : 'ko')}
            >
              <Globe size={14} /> {lang === 'ko' ? 'English' : '한국어'}
            </button>
          </div>

          {/* Light / Dark / System Monochrome Appearance */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16 }}>
            <div className="hig-caption" style={{ marginBottom: 8 }}>
              화면 스타일 (Apple HIG 테마)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { key: 'light', label: '라이트', icon: <Sun size={14} /> },
                { key: 'dark', label: '다크', icon: <Moon size={14} /> },
                { key: 'system', label: '시스템', icon: <Sparkles size={14} /> },
              ].map((opt) => (
                <button
                  key={opt.key}
                  id={`theme-mode-${opt.key}-btn`}
                  type="button"
                  className={`btn ${themePref === opt.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ justifyContent: 'center', minHeight: 44 }}
                  onClick={() => handleThemeSelect(opt.key)}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Offline-First Sync & Sample Closet Import */}
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="hig-body" style={{ fontWeight: 600 }}>
                  오프라인 우선 캐시 동기화
                </div>
                <div className="hig-caption tabular-nums">
                  대기 중인 로컬 작업 {queueCount}건 · IndexedDB 활성화됨
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ minHeight: 44 }}
                disabled={syncing}
                onClick={handleSyncNow}
              >
                {syncing ? <CloudOff size={14} /> : <RefreshCw size={14} />}
                <span>동기화</span>
              </button>
            </div>

            {!user?.isSampleDemo && onOpenSampleImport && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  id="settings-open-sample-import-btn"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ minHeight: 44 }}
                  onClick={() => {
                    onClose?.();
                    onOpenSampleImport?.();
                  }}
                >
                  샘플 아이템 선택 가져오기
                </button>
              </div>
            )}
          </div>

          {/* Legal Disclosures: Privacy Policy & Terms of Service */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              id="settings-privacy-policy-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ minHeight: 44 }}
              onClick={() => setLegalDoc('privacy')}
            >
              <ShieldCheck size={14} />
              <span>개인정보처리방침</span>
            </button>
            <button
              id="settings-terms-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ minHeight: 44 }}
              onClick={() => setLegalDoc('terms')}
            >
              <FileText size={14} />
              <span>이용약관</span>
            </button>
          </div>

          {/* Logout */}
          <button
            id="account-logout-btn"
            type="button"
            className="btn btn-secondary btn-full"
            style={{ minHeight: 44 }}
            onClick={() => {
              onClose?.();
              onLogout?.();
            }}
          >
            <LogOut size={16} />
            <span>{user?.isSampleDemo ? '체험 종료 및 로그인 화면으로 이동' : '로그아웃'}</span>
          </button>

          {/* Mandatory Store Compliance: Immediate Permanent Account & Data Deletion (Req 10.a) */}
          {!user?.isSampleDemo && (
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 16,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div className="hig-caption" style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
                개인 데이터 및 계정 영구 파기
              </div>
              <p className="hig-caption">
                탈퇴 즉시 서버에 저장된 원본 의류 사진, 얼굴 분석 프로필, 코디 기록, 패킹 리스트 및
                기기 내 IndexedDB 캐시가 복구 불가능하게 영구 삭제됩니다.
              </p>

              {!confirmDeleteStep ? (
                <button
                  id={CARBON_DOM_CONTRACT.initiateDeleteAccountBtnId}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start', minHeight: 44 }}
                  onClick={() => setConfirmDeleteStep(true)}
                >
                  <Trash2 size={14} /> 회원 탈퇴 및 모든 개인 데이터 즉시 영구 삭제
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ minHeight: 44 }}
                    onClick={() => setConfirmDeleteStep(false)}
                  >
                    취소
                  </button>
                  <button
                    id={CARBON_DOM_CONTRACT.confirmPermanentDeleteBtnId}
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ minHeight: 44 }}
                    disabled={deleting}
                    onClick={handleImmediatePermanentDelete}
                  >
                    <Trash2 size={14} />
                    <span>{deleting ? '즉시 영구 삭제 중...' : '영구 삭제 최종 확인'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
