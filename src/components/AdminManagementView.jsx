import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Lock,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiFetch, hasUserPermission } from '../utils/api.ts';
import { ACCESS_MENU_CATALOG, resolveSafeAdminEmail } from '../utils/accessControl.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { buildNewsletterSubscribersCsv } from '../utils/newsletterCsv.ts';
import AppHeaderBrand from './common/AppHeaderBrand.tsx';
import { TopRightUtilityActions } from './common/AppUI.jsx';
import AdminNewsletterPanel from './admin/AdminNewsletterPanel.tsx';

const EMPTY_NEWSLETTER_OVERVIEW = {
  total: 0,
  activeCount: 0,
  pendingCount: 0,
  unsubscribedCount: 0,
  emailConfigured: false,
  webhookConfigured: false,
  subscribers: [],
};

/**
 * Dedicated Admin Management Page (visible & accessible only to administrators).
 * - Per-user Menu Access & Per-Menu Button Permission toggles persisted to SQLite
 * - Role-level default permission management & user role reassignment
 * - Official site newsletter subscriber management & CSV export
 * - Quick new user creation
 */
export default function AdminManagementView({
  user,
  theme = 'dark',
  lang = 'ko',
  skinProfile,
  onOpenProfile,
  onOpenAccount,
  onUserPermissionsChanged,
  showToast,
}) {
  const isAdmin = hasUserPermission(user, 'admin:manage_roles');
  const [overview, setOverview] = useState(null);
  const [newsletterData, setNewsletterData] = useState(EMPTY_NEWSLETTER_OVERVIEW);
  const [newsletterError, setNewsletterError] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [subTab, setSubTab] = useState('users'); // 'users' | 'roles' | 'newsletter'
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedRoleCode, setSelectedRoleCode] = useState('site_demo');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingKey, setSavingKey] = useState('');

  // Quick Create User form state
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [creatingUser, setCreatingUser] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg('');
    setNewsletterError('');
    try {
      const [rolesResult, newsletterResult] = await Promise.allSettled([
        apiFetch('/admin/roles'),
        apiFetch('/admin/newsletter/subscribers'),
      ]);

      if (rolesResult.status === 'fulfilled') {
        const data = rolesResult.value;
        setOverview(data);
        setSelectedUserId((prev) => {
          if (prev && data?.users?.some((u) => u.id === prev)) return prev;
          const preferred =
            data?.users?.find((u) => u.username === 'site_demo') ||
            data?.users?.find((u) => u.role !== 'admin') ||
            data?.users?.[0];
          return preferred ? preferred.id : null;
        });
      } else {
        setErrorMsg(
          rolesResult.reason?.message ||
            tx(lang, '관리자 권한 데이터를 불러오지 못했습니다.', 'Failed to load admin permissions.')
        );
      }

      if (newsletterResult.status === 'fulfilled' && newsletterResult.value) {
        const nl = newsletterResult.value;
        const subscribers = Array.isArray(nl.subscribers) ? nl.subscribers : [];
        const activeCount =
          typeof nl.activeCount === 'number'
            ? nl.activeCount
            : subscribers.filter((s) => s.status === 'subscribed').length;
        const pendingCount =
          typeof nl.pendingCount === 'number'
            ? nl.pendingCount
            : subscribers.filter((s) => s.status === 'pending').length;
        const total = typeof nl.total === 'number' ? nl.total : subscribers.length;
        const unsubscribedCount =
          typeof nl.unsubscribedCount === 'number'
            ? nl.unsubscribedCount
            : subscribers.filter((s) => s.status === 'unsubscribed').length;
        setNewsletterData({
          total,
          activeCount,
          pendingCount,
          unsubscribedCount,
          emailConfigured: Boolean(nl.emailConfigured),
          webhookConfigured: Boolean(nl.webhookConfigured),
          subscribers,
        });
      } else if (newsletterResult.status === 'rejected') {
        setNewsletterError(
          newsletterResult.reason?.message ||
            tx(
              lang,
              '뉴스레터 구독자 목록을 불러오지 못했습니다.',
              'Failed to load newsletter subscribers.'
            )
        );
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, lang]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const filteredUsers = useMemo(() => {
    const list = overview?.users || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        String(u.username || '')
          .toLowerCase()
          .includes(q) ||
        String(u.displayName || '')
          .toLowerCase()
          .includes(q) ||
        String(u.role || '')
          .toLowerCase()
          .includes(q) ||
        String(u.email || '')
          .toLowerCase()
          .includes(q)
    );
  }, [overview?.users, searchQuery]);

  const selectedUser = useMemo(
    () => (overview?.users || []).find((u) => u.id === selectedUserId) || null,
    [overview?.users, selectedUserId]
  );

  const adminContactEmail = resolveSafeAdminEmail(
    overview?.adminContactEmail || user?.adminContactEmail
  );

  const handleToggleUserPermission = async (targetUser, permissionCodes, nextAllowed) => {
    if (!targetUser || savingKey) return;
    const codes = Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes];
    const primaryCode = codes[0];
    setSavingKey(`${targetUser.id}:${primaryCode}`);
    triggerHaptic('selection');

    const overridesPayload = {};
    for (const code of codes) {
      overridesPayload[code] = nextAllowed ? 'grant' : 'deny';
    }

    try {
      const res = await apiFetch(`/admin/users/${targetUser.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ overrides: overridesPayload }),
      });
      setOverview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === targetUser.id
              ? {
                  ...u,
                  overrides: res.overrides || {},
                  overrideCount: Object.keys(res.overrides || {}).length,
                  effectivePermissions: res.permissions || [],
                }
              : u
          ),
        };
      });
      if (Number(targetUser.id) === Number(user?.id)) {
        onUserPermissionsChanged?.(res.permissions);
      }
      showToast?.(
        tx(
          lang,
          `@${targetUser.username} 권한이 저장되었습니다.`,
          `Saved permissions for @${targetUser.username}.`
        )
      );
    } catch (err) {
      showToast?.(err?.message || tx(lang, '권한 저장에 실패했습니다.', 'Failed to save permission.'));
    } finally {
      setSavingKey('');
    }
  };

  const handleChangeUserRole = async (targetUser, nextRoleCode) => {
    if (!targetUser || savingKey) return;
    setSavingKey(`role:${targetUser.id}`);
    triggerHaptic('selection');
    try {
      await apiFetch(`/admin/users/${targetUser.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ roleCode: nextRoleCode }),
      });
      await loadOverview();
      showToast?.(
        tx(
          lang,
          `@${targetUser.username} 역할이 ${nextRoleCode}(으)로 변경되었습니다.`,
          `Changed @${targetUser.username} role to ${nextRoleCode}.`
        )
      );
    } catch (err) {
      showToast?.(err?.message || tx(lang, '역할 변경에 실패했습니다.', 'Failed to update role.'));
    } finally {
      setSavingKey('');
    }
  };

  const handleResetUserOverrides = async (targetUser) => {
    if (!targetUser || savingKey) return;
    setSavingKey(`reset:${targetUser.id}`);
    triggerHaptic('selection');
    try {
      const res = await apiFetch(`/admin/users/${targetUser.id}/permissions`, {
        method: 'DELETE',
      });
      setOverview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === targetUser.id
              ? {
                  ...u,
                  overrides: {},
                  overrideCount: 0,
                  effectivePermissions: res.permissions || [],
                }
              : u
          ),
        };
      });
      if (Number(targetUser.id) === Number(user?.id)) {
        onUserPermissionsChanged?.(res.permissions);
      }
      showToast?.(
        tx(
          lang,
          `@${targetUser.username} 개별 설정을 역할 기본값으로 초기화했습니다.`,
          `Reset @${targetUser.username} to role defaults.`
        )
      );
    } catch (err) {
      showToast?.(err?.message || tx(lang, '초기화에 실패했습니다.', 'Failed to reset overrides.'));
    } finally {
      setSavingKey('');
    }
  };

  const handleToggleRoleDefaultPermission = async (roleCode, permCode) => {
    if (!overview || savingKey) return;
    const roleObj = overview.roles.find((r) => r.code === roleCode);
    if (!roleObj) return;
    setSavingKey(`roleperm:${roleCode}:${permCode}`);
    triggerHaptic('selection');

    const hasPerm = roleObj.permissions.includes(permCode);
    const nextPerms = hasPerm
      ? roleObj.permissions.filter((p) => p !== permCode)
      : [...roleObj.permissions, permCode];

    try {
      await apiFetch(`/admin/roles/${encodeURIComponent(roleCode)}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: nextPerms }),
      });
      await loadOverview();
      showToast?.(
        tx(lang, `'${roleCode}' 역할 기본 권한이 업데이트되었습니다.`, `Updated '${roleCode}' defaults.`)
      );
    } catch (err) {
      showToast?.(
        err?.message || tx(lang, '역할 권한 저장에 실패했습니다.', 'Failed to update role defaults.')
      );
    } finally {
      setSavingKey('');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (creatingUser) return;
    setCreatingUser(true);
    try {
      const created = await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim() || newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setNewRole('member');
      setCreateOpen(false);
      await loadOverview();
      if (created?.user?.id) {
        setSelectedUserId(created.user.id);
      }
      showToast?.(tx(lang, '신규 사용자가 생성되었습니다.', 'New user account created.'));
    } catch (err) {
      showToast?.(err?.message || tx(lang, '사용자 생성에 실패했습니다.', 'Failed to create user.'));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleSubscriberStatus = async (subscriber, nextStatus) => {
    if (!subscriber?.id || savingKey) return;
    setSavingKey(`nl:${subscriber.id}`);
    triggerHaptic('selection');
    try {
      const res = await apiFetch(`/admin/newsletter/subscribers/${subscriber.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      const updatedRow = res?.subscriber || { ...subscriber, status: nextStatus };
      setNewsletterData((prev) => {
        const nextList = prev.subscribers.map((row) =>
          row.id === subscriber.id ? updatedRow : row
        );
        const activeCount = nextList.filter((row) => row.status === 'subscribed').length;
        const pendingCount = nextList.filter((row) => row.status === 'pending').length;
        const unsubscribedCount = nextList.filter((row) => row.status === 'unsubscribed').length;
        return {
          ...prev,
          total: nextList.length,
          activeCount,
          pendingCount,
          unsubscribedCount,
          subscribers: nextList,
        };
      });
      showToast?.(
        nextStatus === 'unsubscribed'
          ? tx(
              lang,
              `${subscriber.email} 주소를 수신 거부 처리했습니다.`,
              `Unsubscribed ${subscriber.email}.`
            )
          : tx(
              lang,
              `${subscriber.email} 주소의 구독을 복원했습니다.`,
              `Restored subscription for ${subscriber.email}.`
            )
      );
    } catch (err) {
      showToast?.(
        err?.message ||
          tx(lang, '구독 상태 변경에 실패했습니다.', 'Failed to update subscriber status.')
      );
    } finally {
      setSavingKey('');
    }
  };

  const handleDeleteSubscriber = async (subscriber) => {
    if (!subscriber?.id || savingKey) return;
    setSavingKey(`nl-del:${subscriber.id}`);
    triggerHaptic('selection');
    try {
      await apiFetch(`/admin/newsletter/subscribers/${subscriber.id}`, {
        method: 'DELETE',
      });
      setNewsletterData((prev) => {
        const nextList = prev.subscribers.filter((row) => row.id !== subscriber.id);
        const activeCount = nextList.filter((row) => row.status === 'subscribed').length;
        const pendingCount = nextList.filter((row) => row.status === 'pending').length;
        const unsubscribedCount = nextList.filter((row) => row.status === 'unsubscribed').length;
        return {
          ...prev,
          total: nextList.length,
          activeCount,
          pendingCount,
          unsubscribedCount,
          subscribers: nextList,
        };
      });
      showToast?.(
        tx(
          lang,
          `${subscriber.email} 구독 기록을 영구 삭제했습니다.`,
          `Permanently erased ${subscriber.email}.`
        )
      );
    } catch (err) {
      showToast?.(
        err?.message ||
          tx(lang, '구독자 삭제에 실패했습니다.', 'Failed to delete subscriber.')
      );
    } finally {
      setSavingKey('');
    }
  };

  const handleExportSubscribersCsv = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    triggerHaptic('selection');
    const csv = buildNewsletterSubscribersCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ainvtry-newsletter-subscribers-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast?.(
      tx(
        lang,
        `${rows.length}건의 구독자 목록을 CSV로 내보냈습니다.`,
        `Exported ${rows.length} subscribers to CSV.`
      )
    );
  };

  if (!isAdmin) {
    return (
      <section className="hig-screen-container admin-console-screen" aria-label="Admin">
        <div className="admin-console-denied-card">
          <Lock size={28} />
          <h1 className="admin-console-selected-name">{tx(lang, '권한이 없습니다.', 'Access Denied')}</h1>
          <p className="admin-console-subtitle">
            {tx(
              lang,
              '관리자(Admin) 계정으로 로그인한 사용자만 접근할 수 있는 페이지입니다.',
              'Only administrator accounts can access this management page.'
            )}
          </p>
        </div>
      </section>
    );
  }

  const totalUsers = overview?.users?.length || 0;
  const customizedUsers = (overview?.users || []).filter((u) => u.overrideCount > 0).length;

  return (
    <section
      className="hig-screen-container admin-console-screen"
      aria-label="Admin Management"
      data-admin-management-page="true"
    >
      <header className="hig-top-bar">
        <div className="hig-top-bar-left ui-nav-utility-group">
          <button
            type="button"
            className="hig-circle-icon-btn"
            aria-label={tx(lang, '새로고침', 'Refresh')}
            onClick={() => {
              triggerHaptic('selection');
              loadOverview();
            }}
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="hig-top-bar-titles">
          <AppHeaderBrand effectiveTheme={theme} lang={lang} />
        </div>
        <div className="hig-top-bar-actions">
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
          />
        </div>
      </header>

      <div className="admin-console-body">
        {/* Header Summary & Mode Switcher */}
        <div className="admin-console-header">
          <div>
            <div className="admin-console-eyebrow">
              <ShieldCheck size={13} />
              <span>ADMIN CONSOLE · RBAC</span>
            </div>
            <h1 className="admin-console-title">
              {tx(lang, '관리자 권한 관리 페이지', 'Admin Access Management')}
            </h1>
            <p className="admin-console-subtitle">
              {tx(
                lang,
                '사용자별 메뉴 접근 권한 및 메뉴 내 개별 버튼 실행 권한을 실시간으로 제어합니다.',
                'Configure per-user menu access and individual action button permissions in real time.'
              )}
            </p>
          </div>

          <div className="admin-console-seg" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'users'}
              data-admin-subtab="users"
              onClick={() => setSubTab('users')}
              className={`admin-console-seg-btn ${subTab === 'users' ? 'is-active' : ''}`}
            >
              <Users size={14} />
              <span>{tx(lang, '사용자별 메뉴 · 버튼 권한', 'Per-User Menu & Buttons')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'roles'}
              data-admin-subtab="roles"
              onClick={() => setSubTab('roles')}
              className={`admin-console-seg-btn ${subTab === 'roles' ? 'is-active' : ''}`}
            >
              <SlidersHorizontal size={14} />
              <span>{tx(lang, '역할 기본 권한', 'Role Defaults')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'newsletter'}
              data-admin-subtab="newsletter"
              onClick={() => setSubTab('newsletter')}
              className={`admin-console-seg-btn ${subTab === 'newsletter' ? 'is-active' : ''}`}
            >
              <Mail size={14} />
              <span>{tx(lang, '뉴스레터 구독자', 'Newsletter')}</span>
              <span className="admin-console-seg-count">{newsletterData.activeCount}</span>
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="admin-console-kpi-grid">
          <div className="admin-console-kpi-card">
            <span className="admin-console-kpi-label">
              {tx(lang, '등록 사용자', 'Registered Users')}
            </span>
            <span className="admin-console-kpi-value">{totalUsers}</span>
          </div>
          <div className="admin-console-kpi-card">
            <span className="admin-console-kpi-label">
              {tx(lang, '개별 권한 설정 사용자', 'Users with Custom Overrides')}
            </span>
            <span className="admin-console-kpi-value">{customizedUsers}</span>
          </div>
          <div className="admin-console-kpi-card">
            <span className="admin-console-kpi-label">
              {tx(lang, '관리자 문의 이메일', 'Admin Inquiry Email')}
            </span>
            <span className="admin-console-kpi-email">
              <Mail size={14} aria-hidden="true" />
              <span>{adminContactEmail}</span>
            </span>
          </div>
        </div>

        {errorMsg && <div className="admin-console-error">{errorMsg}</div>}

        {loading && !overview && subTab !== 'newsletter' ? (
          <div className="admin-console-loading">
            <div className="hig-spinner" />
            <span>{tx(lang, '권한 매트릭스 로딩 중...', 'Loading access matrix...')}</span>
          </div>
        ) : subTab === 'users' ? (
          /* ======================== PER-USER MENU & BUTTON MATRIX ======================== */
          <div className="admin-console-layout">
            {/* Left Column: User Directory */}
            <aside className="admin-console-panel">
              <div className="admin-console-panel-head">
                <h2 className="admin-console-panel-title">
                  {tx(lang, '사용자 선택', 'Select User')}
                </h2>
                <button
                  type="button"
                  onClick={() => setCreateOpen((v) => !v)}
                  className="admin-console-outline-btn"
                >
                  <UserPlus size={13} />
                  <span>{tx(lang, '사용자 추가', 'Add User')}</span>
                </button>
              </div>

              {createOpen && (
                <form onSubmit={handleCreateUser} className="admin-console-create-form">
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={tx(lang, '아이디 (영문/숫자)', 'Username')}
                    className="hig-native-input"
                  />
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder={tx(lang, '표시 이름', 'Display Name')}
                    className="hig-native-input"
                  />
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={tx(lang, '초기 비밀번호 (4자+)', 'Initial Password (4+ chars)')}
                    className="hig-native-input"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="hig-native-input"
                  >
                    {(overview?.roles || []).map((r) => (
                      <option key={r.code} value={r.code}>
                        {lang === 'en' ? r.nameEn : r.nameKo} ({r.code})
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="admin-console-primary-btn"
                  >
                    {creatingUser
                      ? tx(lang, '생성 중...', 'Creating...')
                      : tx(lang, '계정 생성', 'Create Account')}
                  </button>
                </form>
              )}

              <div className="admin-console-search-wrap">
                <Search size={14} className="admin-console-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tx(lang, '아이디, 이름, 역할 검색...', 'Search username, role...')}
                  className="hig-native-input admin-console-search-input"
                />
              </div>

              <div className="admin-console-user-list">
                {filteredUsers.map((u) => {
                  const active = u.id === selectedUser?.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      data-admin-user-row={u.username}
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedUserId(u.id);
                      }}
                      className={`admin-console-user-row ${active ? 'is-active' : ''}`}
                    >
                      <div className="admin-console-user-meta">
                        <span className="admin-console-user-name">
                          {u.displayName || u.username}
                        </span>
                        <span className="admin-console-user-sub">
                          @{u.username} · {u.role}
                        </span>
                      </div>
                      {u.overrideCount > 0 && (
                        <span className="admin-console-override-badge">
                          {tx(lang, `개별 ${u.overrideCount}`, `${u.overrideCount} custom`)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right Column: Selected User's Menu & Button Permissions */}
            <div className="admin-console-main">
              {selectedUser ? (
                <>
                  {/* Selected User Header Bar */}
                  <div className="admin-console-selected-bar">
                    <div>
                      <div className="admin-console-selected-title-row">
                        <h2 className="admin-console-selected-name">
                          {selectedUser.displayName || selectedUser.username}
                        </h2>
                        <span className="admin-console-handle-tag">@{selectedUser.username}</span>
                      </div>
                      <p className="admin-console-selected-hint">
                        {tx(
                          lang,
                          '메뉴 또는 버튼 권한을 끄면 해당 사용자가 클릭할 때 ‘권한이 없습니다’ 팝업과 관리자 이메일 링크가 표시됩니다.',
                          'Turning off a menu or button triggers the Access Denied popup with the admin contact link when clicked.'
                        )}
                      </p>
                    </div>

                    <div className="admin-console-selected-actions">
                      <select
                        aria-label={tx(lang, '기본 역할', 'Base Role')}
                        value={selectedUser.role}
                        disabled={selectedUser.username === 'admin' || Boolean(savingKey)}
                        onChange={(e) => handleChangeUserRole(selectedUser, e.target.value)}
                        className="hig-native-input admin-console-role-select"
                      >
                        {(overview?.roles || []).map((r) => (
                          <option key={r.code} value={r.code}>
                            {lang === 'en' ? r.nameEn : r.nameKo} ({r.code})
                          </option>
                        ))}
                      </select>

                      {selectedUser.overrideCount > 0 && (
                        <button
                          type="button"
                          disabled={Boolean(savingKey)}
                          onClick={() => handleResetUserOverrides(selectedUser)}
                          className="admin-console-outline-btn"
                        >
                          <RotateCcw size={13} />
                          <span>{tx(lang, '기본값 복원', 'Reset Overrides')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Structured Menu Cards + Nested Button Permissions */}
                  <div className="admin-console-menu-stack">
                    {ACCESS_MENU_CATALOG.map((menu) => {
                      const effSet = new Set(selectedUser.effectivePermissions || []);
                      const menuAllowed = effSet.has(menu.menuPermissionCode);
                      const menuOverride = selectedUser.overrides?.[menu.menuPermissionCode];
                      const menuBusy = savingKey === `${selectedUser.id}:${menu.menuPermissionCode}`;

                      return (
                        <div
                          key={menu.key}
                          data-admin-menu-card={menu.key}
                          className="admin-console-menu-card"
                        >
                          {/* Menu Header Toggle Row */}
                          <div className="admin-console-menu-head">
                            <div className="admin-console-menu-info">
                              <div className="admin-console-menu-title-row">
                                <span className="admin-console-menu-title">
                                  {lang === 'en' ? menu.labelEn : menu.labelKo}
                                </span>
                                <span
                                  className={`admin-console-status-chip ${
                                    menuAllowed ? 'is-allowed' : 'is-blocked'
                                  }`}
                                >
                                  {menuAllowed
                                    ? tx(lang, '메뉴 허용', 'Menu Allowed')
                                    : tx(lang, '메뉴 차단', 'Menu Blocked')}
                                </span>
                                {menuOverride && (
                                  <span className="admin-console-custom-chip">
                                    {menuOverride === 'grant'
                                      ? tx(lang, '개별 허용', 'Custom Grant')
                                      : tx(lang, '개별 차단', 'Custom Deny')}
                                  </span>
                                )}
                              </div>
                              <p className="admin-console-menu-desc">
                                {lang === 'en' ? menu.descriptionEn : menu.descriptionKo}
                              </p>
                            </div>

                            <button
                              type="button"
                              role="switch"
                              aria-checked={menuAllowed}
                              aria-label={lang === 'en' ? menu.labelEn : menu.labelKo}
                              data-perm-toggle={menu.menuPermissionCode}
                              disabled={menuBusy}
                              onClick={() =>
                                handleToggleUserPermission(
                                  selectedUser,
                                  menu.menuPermissionCode,
                                  !menuAllowed
                                )
                              }
                              className={`admin-console-switch ${menuAllowed ? 'is-on' : ''}`}
                            >
                              <span className="admin-console-switch-thumb" />
                            </button>
                          </div>

                          {/* Nested Button Permissions Grid */}
                          <div className="admin-console-btn-grid">
                            {menu.buttons.map((btn) => {
                              const btnAllowed = effSet.has(btn.code);
                              const btnOverride = selectedUser.overrides?.[btn.code];
                              const btnBusy = savingKey === `${selectedUser.id}:${btn.code}`;
                              const syncCodes = [btn.code, ...(btn.linkedApiPermissions || [])];

                              return (
                                <div
                                  key={btn.code}
                                  className={`admin-console-btn-item ${
                                    menuAllowed ? '' : 'is-dimmed'
                                  }`}
                                >
                                  <div className="admin-console-btn-meta">
                                    <div className="admin-console-btn-name-row">
                                      <span className="admin-console-btn-name">
                                        {lang === 'en' ? btn.labelEn : btn.labelKo}
                                      </span>
                                      {btnOverride && (
                                        <span className="admin-console-custom-chip">
                                          {btnOverride === 'grant'
                                            ? tx(lang, '개별+', '+')
                                            : tx(lang, '개별-', '-')}
                                        </span>
                                      )}
                                    </div>
                                    <span className="admin-console-btn-desc">
                                      {lang === 'en' ? btn.descriptionEn : btn.descriptionKo}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={btnAllowed}
                                    aria-label={lang === 'en' ? btn.labelEn : btn.labelKo}
                                    data-perm-toggle={btn.code}
                                    disabled={btnBusy}
                                    onClick={() =>
                                      handleToggleUserPermission(
                                        selectedUser,
                                        syncCodes,
                                        !btnAllowed
                                      )
                                    }
                                    className={`admin-console-perm-pill ${
                                      btnAllowed ? 'is-allowed' : 'is-denied'
                                    }`}
                                  >
                                    {btnAllowed ? <Check size={12} /> : <Lock size={11} />}
                                    <span>
                                      {btnAllowed
                                        ? tx(lang, '허용', 'Allow')
                                        : tx(lang, '차단', 'Deny')}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="admin-console-empty">
                  {tx(
                    lang,
                    '좌측에서 관리할 사용자를 선택해 주세요.',
                    'Select a user on the left to manage permissions.'
                  )}
                </div>
              )}
            </div>
          </div>
        ) : subTab === 'newsletter' ? (
          /* ======================== NEWSLETTER SUBSCRIBERS ======================== */
          <AdminNewsletterPanel
            lang={lang}
            data={newsletterData}
            errorMsg={newsletterError}
            busyKey={savingKey}
            onToggleStatus={handleToggleSubscriberStatus}
            onDelete={handleDeleteSubscriber}
            onExportCsv={handleExportSubscribersCsv}
          />
        ) : (
          /* ======================== ROLE DEFAULTS MATRIX ======================== */
          <div className="admin-console-panel">
            <div className="admin-console-role-tabs">
              {(overview?.roles || []).map((roleItem) => (
                <button
                  key={roleItem.code}
                  type="button"
                  onClick={() => setSelectedRoleCode(roleItem.code)}
                  className={`admin-console-role-tab ${
                    selectedRoleCode === roleItem.code ? 'is-active' : ''
                  }`}
                >
                  {lang === 'en' ? roleItem.nameEn : roleItem.nameKo} ({roleItem.code})
                </button>
              ))}
            </div>

            {(() => {
              const activeRole = (overview?.roles || []).find((r) => r.code === selectedRoleCode);
              if (!activeRole) return null;
              return (
                <>
                  <p className="admin-console-subtitle">
                    {lang === 'en' ? activeRole.descriptionEn : activeRole.descriptionKo}
                  </p>
                  <div className="admin-console-role-perm-grid">
                    {(overview?.permissions || []).map((perm) => {
                      const granted = activeRole.permissions.includes(perm.code);
                      const locked =
                        activeRole.code === 'admin' &&
                        (perm.code === 'admin:manage_roles' || perm.code === 'admin:manage_users');
                      return (
                        <button
                          key={perm.code}
                          type="button"
                          disabled={locked || Boolean(savingKey)}
                          onClick={() => handleToggleRoleDefaultPermission(activeRole.code, perm.code)}
                          className={`admin-console-role-perm-btn ${granted ? 'is-granted' : ''}`}
                        >
                          <div className="admin-console-btn-meta">
                            <span className="admin-console-btn-name">
                              {lang === 'en' ? perm.nameEn : perm.nameKo}
                            </span>
                            <span className="admin-console-btn-desc">{perm.code}</span>
                          </div>
                          {granted ? <Check size={13} /> : <Lock size={12} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}
