/**
 * Role-Based Access Control (RBAC) for Ainventory.
 * Defines canonical roles (`admin`, `member`, `site_demo`), granular permissions,
 * normalized SQLite tables (`roles`, `permissions`, `role_permissions`, `user_roles`),
 * and parameterized query helpers for runtime enforcement and admin management.
 */

export const SITE_DEMO_ROLE_CODE = 'site_demo';
export const SITE_DEMO_USERNAME = 'site_demo';

export const ROLE_DEFINITIONS = Object.freeze([
  {
    code: 'admin',
    nameKo: '관리자',
    nameEn: 'Administrator',
    descriptionKo: '전체 앱 기능, 사용자 및 권한 관리 접근',
    descriptionEn: 'Full application access plus user and RBAC management',
    isSystem: 1,
  },
  {
    code: 'member',
    nameKo: '일반 회원',
    nameEn: 'Member',
    descriptionKo: '개인 옷장 등록·편집, 코디 저장, AI 피팅 및 분석 기능 사용',
    descriptionEn: 'Full personal wardrobe, outfit saving, AI fitting, and analytics access',
    isSystem: 1,
  },
  {
    code: 'site_demo',
    nameKo: '사이트 데모 권한',
    nameEn: 'Site Demo Role',
    descriptionKo: '라이브 앱 UI를 안전하게 체험하는 읽기·피팅 미리보기 전용 권한',
    descriptionEn: 'Read-only live preview access to the curated sample wardrobe and fitting UI',
    isSystem: 1,
  },
]);

export const PERMISSION_DEFINITIONS = Object.freeze([
  {
    code: 'closet:read_sample',
    groupName: 'closet',
    nameKo: '샘플 옷장 조회',
    nameEn: 'Read Sample Closet',
    descriptionKo: '큐레이션된 샘플 옷장 아이템을 조회합니다.',
  },
  {
    code: 'closet:read_own',
    groupName: 'closet',
    nameKo: '개인 옷장 조회',
    nameEn: 'Read Personal Closet',
    descriptionKo: '본인 계정의 개인 옷장 아이템을 조회합니다.',
  },
  {
    code: 'closet:write',
    groupName: 'closet',
    nameKo: '옷장 추가·수정·삭제',
    nameEn: 'Modify Closet Items',
    descriptionKo: '의류 등록, 정보 수정, 착용 기록, 삭제 및 샘플 가져오기를 수행합니다.',
  },
  {
    code: 'outfit:read',
    groupName: 'outfit',
    nameKo: '코디·날씨 스타일링 조회',
    nameEn: 'Read Outfits & Weather Styling',
    descriptionKo: '저장된 코디와 날씨 기반 스타일링 추천을 조회합니다.',
  },
  {
    code: 'outfit:write',
    groupName: 'outfit',
    nameKo: '코디 저장·삭제',
    nameEn: 'Save & Delete Outfits',
    descriptionKo: '새 코디를 저장하거나 기존 코디를 삭제합니다.',
  },
  {
    code: 'calendar:read',
    groupName: 'calendar',
    nameKo: '착용 캘린더 조회',
    nameEn: 'Read Wear Calendar',
    descriptionKo: '착용 기록 캘린더와 일정을 조회합니다.',
  },
  {
    code: 'calendar:write',
    groupName: 'calendar',
    nameKo: '착용 캘린더 기록·수정',
    nameEn: 'Modify Wear Calendar',
    descriptionKo: '착용 기록을 추가, 수정 또는 삭제합니다.',
  },
  {
    code: 'packing:read',
    groupName: 'packing',
    nameKo: '여행 패킹 리스트 조회',
    nameEn: 'Read Packing Lists',
    descriptionKo: '여행 패킹 리스트를 조회합니다.',
  },
  {
    code: 'packing:write',
    groupName: 'packing',
    nameKo: '여행 패킹 리스트 편집',
    nameEn: 'Modify Packing Lists',
    descriptionKo: '여행 패킹 리스트를 생성, 수정 또는 삭제합니다.',
  },
  {
    code: 'stats:read',
    groupName: 'stats',
    nameKo: '옷장 통계·분석 조회',
    nameEn: 'Read Wardrobe Analytics',
    descriptionKo: '착용률, CPW, 컬러 분포 등 옷장 통계를 조회합니다.',
  },
  {
    code: 'shopping:analyze',
    groupName: 'shopping',
    nameKo: '중복 구매 비교 분석',
    nameEn: 'Analyze Duplicate Purchases',
    descriptionKo: '구매 예정 아이템과 옷장 중복도를 비교 분석합니다.',
  },
  {
    code: 'shopping:write',
    groupName: 'shopping',
    nameKo: '쇼핑 결정 저장',
    nameEn: 'Save Shopping Decisions',
    descriptionKo: '중복 비교 후 구매·패스 결정을 저장합니다.',
  },
  {
    code: 'profile:read',
    groupName: 'profile',
    nameKo: '프로필·체형 설정 조회',
    nameEn: 'Read Profile & Body Spec',
    descriptionKo: '피부톤, 체형 및 손잡이 설정을 조회합니다.',
  },
  {
    code: 'profile:write',
    groupName: 'profile',
    nameKo: '프로필·체형 서버 저장',
    nameEn: 'Persist Profile & Body Spec',
    descriptionKo: '프로필, 체형, 손잡이 설정을 서버 계정에 저장합니다.',
  },
  {
    code: 'account:delete',
    groupName: 'account',
    nameKo: '계정 영구 삭제',
    nameEn: 'Delete Account',
    descriptionKo: '계정 및 모든 개인 데이터를 영구 삭제합니다.',
  },
  {
    code: 'vton:preview',
    groupName: 'vton',
    nameKo: '피팅 상태·미리보기 조회',
    nameEn: 'Preview Fitting Status',
    descriptionKo: '피팅 엔진 상태 및 로컬 2.5D/3D 미리보기를 조회합니다.',
  },
  {
    code: 'vton:synthesize',
    groupName: 'vton',
    nameKo: 'AI 가상 피팅 합성',
    nameEn: 'AI Virtual Try-On Synthesis',
    descriptionKo: '서버 측 AI 가상 피팅(Gemini/Vertex) 합성을 실행합니다.',
  },
  {
    code: 'vision:analyze',
    groupName: 'vision',
    nameKo: 'AI 의류 사진 인식·누끼',
    nameEn: 'AI Garment Vision & Cutout',
    descriptionKo: '유료 서버 비전 분석, 웹 조회 및 스튜디오 누끼 처리를 실행합니다.',
  },
  {
    code: 'maps:proxy',
    groupName: 'maps',
    nameKo: '지도·장소 배경 API 프록시',
    nameEn: 'Maps & Street View Proxy',
    descriptionKo: 'Google Maps 장소 검색, 주변 케어, 거리뷰 프록시를 호출합니다.',
  },
  {
    code: 'admin:manage_roles',
    groupName: 'admin',
    nameKo: '역할·권한 관리',
    nameEn: 'Manage Roles & Permissions',
    descriptionKo: '역할별 권한 매핑과 사용자 역할을 조회 및 변경합니다.',
  },
  {
    code: 'admin:manage_users',
    groupName: 'admin',
    nameKo: '관리자 계정·데모 관리',
    nameEn: 'Manage Users & Demo Data',
    descriptionKo: '관리자 대시보드 조회, 사용자 생성 및 데모 데이터 초기화를 수행합니다.',
  },
]);

const ALL_PERMISSION_CODES = Object.freeze(PERMISSION_DEFINITIONS.map((p) => p.code));
const VALID_PERMISSION_SET = new Set(ALL_PERMISSION_CODES);
const VALID_ROLE_SET = new Set(ROLE_DEFINITIONS.map((r) => r.code));

export const SITE_DEMO_DEFAULT_PERMISSIONS = Object.freeze([
  'closet:read_sample',
  'outfit:read',
  'calendar:read',
  'packing:read',
  'stats:read',
  'profile:read',
  'vton:preview',
]);

export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  admin: ALL_PERMISSION_CODES,
  member: Object.freeze(
    ALL_PERMISSION_CODES.filter((code) => !code.startsWith('admin:'))
  ),
  site_demo: SITE_DEMO_DEFAULT_PERMISSIONS,
});

export function ensureRbacSchemaAndSeeds(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      code TEXT PRIMARY KEY,
      name_ko TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ko TEXT,
      description_en TEXT,
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS permissions (
      code TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      name_ko TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ko TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_code TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY (role_code, permission_code),
      FOREIGN KEY (role_code) REFERENCES roles(code) ON DELETE CASCADE,
      FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_code TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, role_code),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_code) REFERENCES roles(code) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_code);
  `);

  const upsertRole = db.prepare(`
    INSERT INTO roles (code, name_ko, name_en, description_ko, description_en, is_system)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      name_ko = excluded.name_ko,
      name_en = excluded.name_en,
      description_ko = excluded.description_ko,
      description_en = excluded.description_en
  `);
  for (const role of ROLE_DEFINITIONS) {
    upsertRole.run(
      role.code,
      role.nameKo,
      role.nameEn,
      role.descriptionKo,
      role.descriptionEn,
      role.isSystem
    );
  }

  const upsertPerm = db.prepare(`
    INSERT INTO permissions (code, group_name, name_ko, name_en, description_ko)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      group_name = excluded.group_name,
      name_ko = excluded.name_ko,
      name_en = excluded.name_en,
      description_ko = excluded.description_ko
  `);
  for (const perm of PERMISSION_DEFINITIONS) {
    upsertPerm.run(
      perm.code,
      perm.groupName,
      perm.nameKo,
      perm.nameEn,
      perm.descriptionKo
    );
  }

  // Seed default permissions for any role that has zero mapped permissions yet
  const countRolePerms = db.prepare(
    'SELECT COUNT(*) as c FROM role_permissions WHERE role_code = ?'
  );
  const insertRolePerm = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)'
  );
  for (const [roleCode, permCodes] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const existingCount = Number(countRolePerms.get(roleCode)?.c || 0);
    if (existingCount === 0) {
      for (const permCode of permCodes) {
        insertRolePerm.run(roleCode, permCode);
      }
    }
  }

  // Ensure admin always retains core admin permissions
  insertRolePerm.run('admin', 'admin:manage_roles');
  insertRolePerm.run('admin', 'admin:manage_users');

  // Backfill user_roles for existing users missing an explicit mapping
  const usersWithoutRole = db
    .prepare(
      `SELECT u.id, u.role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.user_id IS NULL`
    )
    .all();
  const insertUserRole = db.prepare(
    'INSERT OR IGNORE INTO user_roles (user_id, role_code) VALUES (?, ?)'
  );
  for (const row of usersWithoutRole) {
    const normalized = VALID_ROLE_SET.has(String(row.role || ''))
      ? String(row.role)
      : 'member';
    insertUserRole.run(row.id, normalized);
  }
}

export function resolveUserRoleCode(db, userRow) {
  if (!userRow) return 'guest';
  const rawRole = String(userRow.role || '').trim();
  const userId = Number(userRow.id);
  if (Number.isInteger(userId) && userId > 0) {
    try {
      const mapped = db
        .prepare('SELECT role_code FROM user_roles WHERE user_id = ? LIMIT 1')
        .get(userId);
      if (mapped?.role_code) {
        return String(mapped.role_code);
      }
    } catch {
      // Fall back to column value if table not yet initialized
    }
  }
  if (VALID_ROLE_SET.has(rawRole)) return rawRole;
  return rawRole || 'member';
}

export function getRoleMetadata(db, roleCode) {
  const code = String(roleCode || '').trim();
  if (!code) return null;
  try {
    const row = db
      .prepare(
        'SELECT code, name_ko, name_en, description_ko, description_en, is_system FROM roles WHERE code = ?'
      )
      .get(code);
    if (row) {
      return {
        code: row.code,
        nameKo: row.name_ko,
        nameEn: row.name_en,
        descriptionKo: row.description_ko || '',
        descriptionEn: row.description_en || '',
        isSystem: Boolean(row.is_system),
      };
    }
  } catch {
    // Fallback to static catalog
  }
  const fallback = ROLE_DEFINITIONS.find((r) => r.code === code);
  if (fallback) {
    return {
      code: fallback.code,
      nameKo: fallback.nameKo,
      nameEn: fallback.nameEn,
      descriptionKo: fallback.descriptionKo,
      descriptionEn: fallback.descriptionEn,
      isSystem: Boolean(fallback.isSystem),
    };
  }
  if (code === 'guest') {
    return {
      code: 'guest',
      nameKo: '샘플 게스트',
      nameEn: 'Sample Guest',
      descriptionKo: '비로그인 샘플 옷장 체험',
      descriptionEn: 'Unauthenticated sample closet preview',
      isSystem: true,
    };
  }
  return null;
}

export function getPermissionsForRole(db, roleCode) {
  const code = String(roleCode || '').trim();
  if (!code) return [];
  if (code === 'guest') {
    return [...SITE_DEMO_DEFAULT_PERMISSIONS];
  }
  try {
    const rows = db
      .prepare(
        'SELECT permission_code FROM role_permissions WHERE role_code = ? ORDER BY permission_code ASC'
      )
      .all(code);
    if (rows.length > 0) {
      return rows.map((r) => String(r.permission_code));
    }
  } catch {
    // Fallback to default matrix
  }
  return [...(DEFAULT_ROLE_PERMISSIONS[code] || [])];
}

export function getUserRbacContext(db, userRow) {
  const roleCode = resolveUserRoleCode(db, userRow);
  const roleMeta = getRoleMetadata(db, roleCode);
  const permissions = getPermissionsForRole(db, roleCode);
  return {
    roleCode,
    roleMeta,
    permissions,
  };
}

export function hasPermission(userOrPermissions, permissionCode) {
  if (!permissionCode) return false;
  if (Array.isArray(userOrPermissions)) {
    return userOrPermissions.includes(permissionCode);
  }
  if (!userOrPermissions || typeof userOrPermissions !== 'object') {
    return false;
  }
  if (Array.isArray(userOrPermissions.permissions)) {
    return userOrPermissions.permissions.includes(permissionCode);
  }
  if (userOrPermissions.role === 'admin') {
    return true;
  }
  return false;
}

export function assignUserRole(db, userId, roleCode) {
  const numericUserId = Number(userId);
  const cleanRole = String(roleCode || '').trim();
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { ok: false, status: 400, error: '유효하지 않은 사용자 ID입니다.' };
  }
  const roleRow = db.prepare('SELECT code FROM roles WHERE code = ?').get(cleanRole);
  if (!roleRow) {
    return { ok: false, status: 400, error: '존재하지 않는 권한 역할(role)입니다.' };
  }
  const userRow = db
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .get(numericUserId);
  if (!userRow) {
    return { ok: false, status: 404, error: '사용자를 찾을 수 없습니다.' };
  }

  db.transaction(() => {
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(numericUserId);
    db.prepare('INSERT INTO user_roles (user_id, role_code) VALUES (?, ?)').run(
      numericUserId,
      cleanRole
    );
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(cleanRole, numericUserId);
  });

  return {
    ok: true,
    userId: numericUserId,
    username: userRow.username,
    roleCode: cleanRole,
    permissions: getPermissionsForRole(db, cleanRole),
  };
}

export function updateRolePermissions(db, roleCode, rawPermissionCodes) {
  const cleanRole = String(roleCode || '').trim();
  const roleRow = db.prepare('SELECT code FROM roles WHERE code = ?').get(cleanRole);
  if (!roleRow) {
    return { ok: false, status: 404, error: '존재하지 않는 역할입니다.' };
  }
  if (!Array.isArray(rawPermissionCodes)) {
    return { ok: false, status: 400, error: 'permissions 배열이 필요합니다.' };
  }

  const normalized = [
    ...new Set(
      rawPermissionCodes
        .map((p) => String(p || '').trim())
        .filter((p) => VALID_PERMISSION_SET.has(p))
    ),
  ];

  // Prevent locking admins out of role/user management
  if (cleanRole === 'admin') {
    if (!normalized.includes('admin:manage_roles')) normalized.push('admin:manage_roles');
    if (!normalized.includes('admin:manage_users')) normalized.push('admin:manage_users');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_code = ?').run(cleanRole);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)'
    );
    for (const permCode of normalized) {
      ins.run(cleanRole, permCode);
    }
  });

  return {
    ok: true,
    roleCode: cleanRole,
    permissions: getPermissionsForRole(db, cleanRole),
  };
}

export function listRbacOverview(db) {
  const roles = db
    .prepare(
      'SELECT code, name_ko, name_en, description_ko, description_en, is_system FROM roles ORDER BY code ASC'
    )
    .all()
    .map((r) => ({
      code: r.code,
      nameKo: r.name_ko,
      nameEn: r.name_en,
      descriptionKo: r.description_ko || '',
      descriptionEn: r.description_en || '',
      isSystem: Boolean(r.is_system),
      permissions: getPermissionsForRole(db, r.code),
    }));

  const permissions = db
    .prepare(
      'SELECT code, group_name, name_ko, name_en, description_ko FROM permissions ORDER BY group_name ASC, code ASC'
    )
    .all()
    .map((p) => ({
      code: p.code,
      groupName: p.group_name,
      nameKo: p.name_ko,
      nameEn: p.name_en,
      descriptionKo: p.description_ko || '',
    }));

  const users = db
    .prepare(
      `SELECT
         u.id,
         u.username,
         u.display_name,
         u.email,
         COALESCE(ur.role_code, u.role) AS role_code,
         u.default_closet,
         u.created_at
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       ORDER BY u.id ASC`
    )
    .all()
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      email: u.email || null,
      role: u.role_code || 'member',
      defaultCloset: u.default_closet,
      createdAt: u.created_at || null,
    }));

  return { roles, permissions, users };
}
