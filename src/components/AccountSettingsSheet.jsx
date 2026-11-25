import { useEffect, useState } from 'react';
import {
  Box,
  CloudOff,
  FileText,
  Globe,
  KeyRound,
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
import { canAccessAdminMegascansLab } from '../three/megascans/megascansCatalog.ts';
import {
  apiFetch,
  flushPendingOfflineSync,
  hasUserPermission,
  isSiteDemoUser,
  setStoredToken,
} from '../utils/api.ts';
import { guardUserPermission } from '../utils/accessControl.ts';
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
  onOpenAdminPage,
  onOpenMegascansLab,
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
  const isAdminUser =
    user?.role === 'admin' ||
    user?.username === 'admin' ||
    hasUserPermission(user, 'admin:manage_roles');
  const canOpenMegascansLab = isAdminUser && canAccessAdminMegascansLab(user);
  const isSiteDemo = isSiteDemoUser(user);
  const canDeleteAccount = !user?.isSampleDemo;
  const [economyState, setEconomyState] = useState(() => loadStoredEconomyState());
  const [adminCurrencyInput, setAdminCurrencyInput] = useState(() =>
    String(loadStoredEconomyState().iBalance ?? 0)
  );
  const [rbacOverview, setRbacOverview] = useState(null);
  const [rbacSelectedRole, setRbacSelectedRole] = useState('site_demo');
  const [rbacSaving, setRbacSaving] = useState(false);
  const [passwordSectionOpen, setPasswordSectionOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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

  useEffect(() => {
    if (!isAdminUser) return undefined;
    let active = true;
    apiFetch('/admin/roles')
      .then((data) => {
        if (active && data?.roles) {
          setRbacOverview(data);
        }
      })
      .catch(() => {
        // Admin RBAC overview unavailable in offline mode
      });
    return () => {
      active = false;
    };
  }, [isAdminUser]);

  const handleToggleRolePermission = async (roleCode, permCode) => {
    if (!rbacOverview || rbacSaving) return;
    const targetRole = rbacOverview.roles.find((r) => r.code === roleCode);
    if (!targetRole) return;
    const hasPerm = targetRole.permissions.includes(permCode);
    const nextPerms = hasPerm
      ? targetRole.permissions.filter((p) => p !== permCode)
      : [...targetRole.permissions, permCode];
    setRbacSaving(true);
    try {
      const res = await apiFetch(`/admin/roles/${encodeURIComponent(roleCode)}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: nextPerms }),
      });
      setRbacOverview((prev) =>
        prev
          ? {
              ...prev,
              roles: prev.roles.map((r) =>
                r.code === roleCode
                  ? { ...r, permissions: Array.isArray(res?.permissions) ? res.permissions : nextPerms }
                  : r
              ),
            }
          : prev
      );
      emitStatusCapsule(tx(lang, '역할 권한이 저장되었습니다', 'Role permissions updated'));
    } catch (err) {
      emitStatusCapsule(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '권한 변경 실패', 'Failed to update permissions')
      );
    } finally {
      setRbacSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (changingPassword) return;
    setPasswordError('');

    if (!currentPassword) {
      setPasswordError(tx(lang, '현재 비밀번호를 입력해 주세요.', 'Enter your current password.'));
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      setPasswordError(
        tx(
          lang,
          '새 비밀번호는 6자 이상 128자 이하로 입력해 주세요.',
          'New password must be 6–128 characters.'
        )
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(
        tx(lang, '새 비밀번호 확인이 일치하지 않습니다.', 'New passwords do not match.')
      );
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError(
        tx(
          lang,
          '새 비밀번호는 현재 비밀번호와 다르게 설정해 주세요.',
          'New password must differ from current password.'
        )
      );
      return;
    }

    setChangingPassword(true);
    try {
      const res = await apiFetch('/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (res?.token) {
        setStoredToken(res.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      setPasswordSectionOpen(false);
      triggerHaptic('success');
      emitStatusCapsule(
        tx(
          lang,
          '비밀번호가 변경되었습니다 · 기존 세션은 모두 만료되었습니다',
          'Password updated · previous sessions signed out'
        )
      );
    } catch (err) {
      triggerHaptic('warning');
      setPasswordError(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '비밀번호 변경에 실패했습니다.', 'Failed to change password.')
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleChangeUserRole = async (targetUserId, nextRoleCode) => {
    if (!rbacOverview || rbacSaving) return;
    setRbacSaving(true);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(String(targetUserId))}/role`, {
        method: 'PUT',
        body: JSON.stringify({ roleCode: nextRoleCode }),
      });
      setRbacOverview((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                Number(u.id) === Number(targetUserId) ? { ...u, role: nextRoleCode } : u
              ),
            }
          : prev
      );
      emitStatusCapsule(tx(lang, '사용자 권한이 변경되었습니다', 'User role updated'));
    } catch (err) {
      emitStatusCapsule(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '사용자 역할 변경 실패', 'Failed to update user role')
      );
    } finally {
      setRbacSaving(false);
    }
  };

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
      {/* User Summary + Role Badge + Official iNVTRY Brand Signature */}
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
            <div className="hig-caption" style={{ marginTop: 4, fontWeight: 620 }}>
              <ShieldCheck size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
              {lang === 'en'
                ? user?.roleMeta?.nameEn || (isSiteDemo ? 'Site Demo Role' : user?.role || 'Member')
                : user?.roleMeta?.nameKo || (isSiteDemo ? '사이트 데모 권한' : user?.role || '일반 회원')}
            </div>
          </div>
          <BrandLogo effectiveTheme={theme} className="is-compact" alt="iNVTRY" />
        </div>
        {isSiteDemo && (
          <div className="hig-caption" style={{ marginTop: 8, opacity: 0.85 }}>
            {tx(
              lang,
              '사이트 데모 전용 계정입니다. 샘플 옷장 둘러보기, 가상 피팅, 통계 체험이 가능하며 저장·삭제·AI 합성은 제한됩니다.',
              'Mapped to the Site Demo role. Browse the sample wardrobe, try on outfits, and view stats while write/delete/AI synthesis remain protected.'
            )}
          </div>
        )}
      </div>

      {/* Admin Dedicated Management Page Entry */}
      {isAdminUser && onOpenAdminPage && (
        <div className="hig-sheet-card" data-admin-page-shortcut="true">
          <div className="hig-sheet-row-between" style={{ gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} />
              <div>
                <div className="hig-body" style={{ fontWeight: 700 }}>
                  {tx(lang, '관리자 권한 관리 페이지', 'Admin Access Management Page')}
                </div>
                <div className="hig-caption">
                  {tx(
                    lang,
                    '사용자별 메뉴 접근 권한 및 메뉴 내 개별 버튼 권한을 설정합니다.',
                    'Configure per-user menu access and per-menu button permissions.'
                  )}
                </div>
              </div>
            </div>
            <button
              id="settings-open-admin-page-btn"
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                triggerHaptic('selection');
                onClose?.();
                onOpenAdminPage?.();
              }}
            >
              <span>{tx(lang, '관리 페이지 열기', 'Open Admin')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Only: Quixel Megascans Three.js PBR & GLB Lab */}
      {canOpenMegascansLab && onOpenMegascansLab && (
        <div className="hig-sheet-card" data-admin-megascans-shortcut="true">
          <div className="hig-sheet-row-between" style={{ gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Box size={16} />
              <div>
                <div className="hig-body" style={{ fontWeight: 700 }}>
                  {tx(lang, 'Quixel Megascans 3D 랩', 'Quixel Megascans 3D Lab')}
                </div>
                <div className="hig-caption">
                  {tx(
                    lang,
                    'Fab.com PBR 텍스처·GLB 드래그&드롭 검증 및 slot.config.json 생성',
                    'Drag & drop Fab.com PBR textures or GLB models to calibrate slots & export config.'
                  )}
                </div>
              </div>
            </div>
            <button
              id="settings-open-megascans-lab-btn"
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                triggerHaptic('selection');
                onClose?.();
                onOpenMegascansLab?.();
              }}
            >
              <span>{tx(lang, '3D 랩 열기', 'Open 3D Lab')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Password Change (guarded by btn:account:password) */}
      {!user?.isSampleDemo && (
        <div className="hig-sheet-card" data-password-change-card="true">
          <div className="hig-sheet-row-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={15} />
              <div>
                <div className="hig-body" style={{ fontWeight: 680 }}>
                  {tx(lang, '비밀번호 변경', 'Change Password')}
                </div>
                <div className="hig-caption">
                  {tx(
                    lang,
                    '변경 즉시 기존 기기의 로그인 세션이 모두 만료됩니다.',
                    'Updating revokes all existing sessions across devices.'
                  )}
                </div>
              </div>
            </div>
            <button
              id="settings-toggle-password-btn"
              type="button"
              className={`btn ${passwordSectionOpen ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={() => {
                if (!passwordSectionOpen && !guardUserPermission(user, 'btn:account:password')) {
                  return;
                }
                setPasswordSectionOpen((v) => !v);
                setPasswordError('');
              }}
            >
              <span>
                {passwordSectionOpen ? tx(lang, '닫기', 'Close') : tx(lang, '변경', 'Change')}
              </span>
            </button>
          </div>

          {passwordSectionOpen && (
            <form
              onSubmit={handleChangePassword}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}
              noValidate
            >
              <input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={tx(lang, '현재 비밀번호', 'Current password')}
                className="hig-native-input"
                required
              />
              <input
                id="settings-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={tx(lang, '새 비밀번호 (6자 이상)', 'New password (6+ chars)')}
                className="hig-native-input"
                required
              />
              <input
                id="settings-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={tx(lang, '새 비밀번호 확인', 'Confirm new password')}
                className="hig-native-input"
                required
              />

              {passwordError && (
                <div
                  role="alert"
                  className="hig-caption"
                  style={{ color: 'var(--accent-danger, #c62828)', fontWeight: 600 }}
                >
                  {passwordError}
                </div>
              )}

              <button
                id="settings-change-password-btn"
                type="submit"
                disabled={changingPassword}
                className="btn btn-primary btn-sm btn-full"
              >
                <span>
                  {changingPassword
                    ? tx(lang, '변경 중…', 'Updating…')
                    : tx(lang, '새 비밀번호 저장', 'Save New Password')}
                </span>
              </button>
            </form>
          )}
        </div>
      )}

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
            {tx(lang, '하단 내비게이션 바 불투명도', 'Bottom Navigation Bar Opacity')}
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
              '하단 내비게이션 바 불투명도 조절',
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
                if (!guardUserPermission(user, 'btn:closet:sample_import')) return;
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

      {/* Admin Only: RBAC Role & User-Permission Management */}
      {isAdminUser && rbacOverview && (
        <div className="hig-sheet-card" data-admin-rbac-panel="true">
          <div className="hig-body" style={{ fontWeight: 700, marginBottom: 4 }}>
            <ShieldCheck size={14} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} />
            {tx(lang, '권한 관리 (RBAC)', 'Role & Permission Management (RBAC)')}
          </div>
          <div className="hig-caption" style={{ marginBottom: 8 }}>
            {tx(
              lang,
              '역할별 허용 권한과 사용자 매핑을 실시간으로 관리합니다.',
              'Manage permissions per role and assign user role mappings.'
            )}
          </div>

          <div className="hig-grid-3" style={{ marginBottom: 10 }}>
            {rbacOverview.roles.map((roleItem) => (
              <button
                key={roleItem.code}
                type="button"
                className={`btn ${rbacSelectedRole === roleItem.code ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setRbacSelectedRole(roleItem.code)}
              >
                <span>{lang === 'en' ? roleItem.nameEn : roleItem.nameKo}</span>
              </button>
            ))}
          </div>

          {(() => {
            const activeRole = rbacOverview.roles.find((r) => r.code === rbacSelectedRole);
            if (!activeRole) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {rbacOverview.permissions.map((perm) => {
                  const granted = activeRole.permissions.includes(perm.code);
                  const lockedAdminPerm =
                    activeRole.code === 'admin' &&
                    (perm.code === 'admin:manage_roles' || perm.code === 'admin:manage_users');
                  return (
                    <button
                      key={perm.code}
                      type="button"
                      disabled={rbacSaving || lockedAdminPerm}
                      className={`btn ${granted ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => handleToggleRolePermission(activeRole.code, perm.code)}
                    >
                      <span>{lang === 'en' ? perm.nameEn : perm.nameKo}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div className="hig-caption" style={{ fontWeight: 620, marginBottom: 6 }}>
            {tx(lang, '사용자 권한 매핑', 'User Role Mapping')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rbacOverview.users.map((u) => (
              <div key={u.id} className="hig-sheet-row-between" style={{ gap: 8 }}>
                <span className="hig-caption tabular-nums" style={{ fontWeight: 600 }}>
                  @{u.username}
                </span>
                <select
                  aria-label={`${u.username} role`}
                  value={u.role}
                  disabled={rbacSaving || u.username === 'admin'}
                  onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                  className="hig-native-input"
                  style={{ maxWidth: 160, minHeight: 32, padding: '4px 8px', fontSize: 12 }}
                >
                  {rbacOverview.roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {lang === 'en' ? r.nameEn : r.nameKo}
                    </option>
                  ))}
                </select>
              </div>
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
          {user?.isSampleDemo || isSiteDemo
            ? tx(lang, '데모 종료 및 로그인 화면으로 이동', 'Exit Demo & Go to Sign In')
            : tx(lang, '로그아웃', 'Sign Out')}
        </span>
      </button>

      {/* Mandatory Store Compliance: Immediate Permanent Account & Data Deletion */}
      {canDeleteAccount && (
        <div className="hig-sheet-card">
          <div className="hig-caption" style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
            {tx(lang, '계정 및 개인 데이터 영구 삭제', 'Permanent Account & Data Deletion')}
          </div>
          <p className="hig-caption">
            {tx(
              lang,
              '탈퇴 즉시 서버에 저장된 의류 사진, 프로필, 코디 기록, 캘린더 기록 및 기기 내 IndexedDB 캐시가 영구 삭제되며 복구할 수 없습니다.',
              'Deleting your account immediately and permanently erases all garments, profile data, outfits, calendar logs, and local IndexedDB cache.'
            )}
          </p>

          {!confirmDeleteStep ? (
            <button
              id={CARBON_DOM_CONTRACT.initiateDeleteAccountBtnId}
              type="button"
              className="hig-danger-outline-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (!guardUserPermission(user, 'btn:account:delete')) return;
                setConfirmDeleteStep(true);
              }}
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
  onOpenAdminPage,
  onOpenMegascansLab,
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
            onOpenAdminPage={onOpenAdminPage}
            onOpenMegascansLab={onOpenMegascansLab}
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
