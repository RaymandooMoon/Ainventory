/**
 * Role-Based Access Control (RBAC) for Ainventory.
 * Defines canonical roles (`admin`, `member`, `site_demo`), granular permissions,
 * normalized SQLite tables (`roles`, `permissions`, `role_permissions`, `user_roles`),
 * and parameterized query helpers for runtime enforcement and admin management.
 */

export const SITE_DEMO_ROLE_CODE = 'site_demo';
export const SITE_DEMO_USERNAME = 'site_demo';
export const DEFAULT_ADMIN_CONTACT_EMAIL = 'raymond@ainvtry.com';

export function getAdminContactEmail() {
  const envEmail =
    typeof process.env.ADMIN_CONTACT_EMAIL === 'string'
      ? process.env.ADMIN_CONTACT_EMAIL.trim()
      : '';
  if (envEmail && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(envEmail)) {
    return envEmail;
  }
  return DEFAULT_ADMIN_CONTACT_EMAIL;
}

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
    nameKo: 'AI 의류 사진 인식·배경 제거',
    nameEn: 'AI Garment Vision & Cutout',
    descriptionKo: '유료 서버 사진 분석, 웹 조회 및 스튜디오 배경 제거 처리를 실행합니다.',
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
    descriptionKo: '역할별 권한 설정과 사용자 역할을 조회 및 변경합니다.',
  },
  {
    code: 'admin:manage_users',
    groupName: 'admin',
    nameKo: '관리자 계정·데모 관리',
    nameEn: 'Manage Users & Demo Data',
    descriptionKo: '관리자 대시보드 조회, 사용자 생성 및 데모 데이터 초기화를 수행합니다.',
  },
  // Menu-Level Access Permissions (사용자별 메뉴 접근 권한)
  {
    code: 'menu:outfits',
    groupName: 'menu',
    nameKo: '메뉴 · 코디 스튜디오 (Outfits)',
    nameEn: 'Menu · Outfits Studio',
    descriptionKo: '코디 스튜디오 탭 진입 및 가상 피팅 화면을 조회합니다.',
  },
  {
    code: 'menu:closet',
    groupName: 'menu',
    nameKo: '메뉴 · 옷장 (Closet)',
    nameEn: 'Menu · Wardrobe Closet',
    descriptionKo: '옷장 탭 진입 및 의류 목록을 조회합니다.',
  },
  {
    code: 'menu:calendar',
    groupName: 'menu',
    nameKo: '메뉴 · 캘린더 (Calendar)',
    nameEn: 'Menu · Wear Calendar',
    descriptionKo: '착용 캘린더 탭 진입 및 일정 기록을 조회합니다.',
  },
  {
    code: 'menu:stats',
    groupName: 'menu',
    nameKo: '메뉴 · 통계 (Stats)',
    nameEn: 'Menu · Wardrobe Analytics',
    descriptionKo: '옷장 통계·분석 탭에 진입합니다.',
  },
  {
    code: 'menu:profile',
    groupName: 'menu',
    nameKo: '메뉴 · 프로필·체형 설정',
    nameEn: 'Menu · Profile & Body',
    descriptionKo: '피부톤·체형 프로필 설정 창에 접근합니다.',
  },
  // Per-Menu Button Permissions (메뉴별 주요 버튼 실행 권한)
  {
    code: 'btn:outfits:save',
    groupName: 'button',
    nameKo: '코디 · 코디 저장 버튼',
    nameEn: 'Outfits · Save Outfit Button',
    descriptionKo: '코디 스튜디오에서 현재 코디를 저장하는 버튼입니다.',
  },
  {
    code: 'btn:outfits:ai_vton',
    groupName: 'button',
    nameKo: '코디 · AI 가상 피팅 실행 버튼',
    nameEn: 'Outfits · AI Fitting Button',
    descriptionKo: '코디 스튜디오에서 실시간 AI 가상 피팅 합성을 실행하는 버튼입니다.',
  },
  {
    code: 'btn:outfits:stage_bg',
    groupName: 'button',
    nameKo: '코디 · 배경·스테이지 설정 버튼',
    nameEn: 'Outfits · Stage Background Button',
    descriptionKo: '코디 스튜디오의 스테이지 배경 선택 및 조명 설정 버튼입니다.',
  },
  {
    code: 'btn:outfits:store',
    groupName: 'button',
    nameKo: '코디 · 배경 스토어·뽑기 버튼',
    nameEn: 'Outfits · Stage Store Button',
    descriptionKo: '배경 스토어 및 일일 뽑기 창을 여는 버튼입니다.',
  },
  {
    code: 'btn:outfits:packing',
    groupName: 'button',
    nameKo: '코디 · 여행 패킹 리스트 버튼',
    nameEn: 'Outfits · Packing List Button',
    descriptionKo: '여행 패킹 리스트 및 코디 내보내기 버튼입니다.',
  },
  {
    code: 'btn:outfits:weather_scenario',
    groupName: 'button',
    nameKo: '코디 · 날씨·장소 시나리오 버튼',
    nameEn: 'Outfits · Weather & Place Button',
    descriptionKo: '날씨 시나리오 및 장소 설정 팝업을 여는 버튼입니다.',
  },
  {
    code: 'btn:closet:add',
    groupName: 'button',
    nameKo: '옷장 · 의류 등록(+) 버튼',
    nameEn: 'Closet · Add Garment (+) Button',
    descriptionKo: '옷장 상단 + 버튼으로 새 의류를 등록합니다.',
  },
  {
    code: 'btn:closet:laundry',
    groupName: 'button',
    nameKo: '옷장 · 스마트 세탁 바구니 버튼',
    nameEn: 'Closet · Laundry Basket Button',
    descriptionKo: '옷장 상단 세탁 바구니 및 케어 관리 버튼입니다.',
  },
  {
    code: 'btn:closet:edit_delete',
    groupName: 'button',
    nameKo: '옷장 · 의류 수정·삭제 버튼',
    nameEn: 'Closet · Edit & Delete Button',
    descriptionKo: '의류 상세 시트에서 아이템을 수정하거나 삭제하는 버튼입니다.',
  },
  {
    code: 'btn:closet:sample_import',
    groupName: 'button',
    nameKo: '옷장 · 샘플 의류 가져오기 버튼',
    nameEn: 'Closet · Import Sample Button',
    descriptionKo: '샘플 캡슐 의류를 내 옷장으로 복사하는 버튼입니다.',
  },
  {
    code: 'btn:calendar:log_wear',
    groupName: 'button',
    nameKo: '캘린더 · 착용 일정 추가(+) 버튼',
    nameEn: 'Calendar · Add Wear Entry Button',
    descriptionKo: '캘린더에서 새 착용 일정을 기록·편집하는 버튼입니다.',
  },
  {
    code: 'btn:calendar:export_ics',
    groupName: 'button',
    nameKo: '캘린더 · ICS 내보내기 버튼',
    nameEn: 'Calendar · Export (.ics) Button',
    descriptionKo: '착용 캘린더를 외부 일정(.ics) 파일로 내보내는 버튼입니다.',
  },
  {
    code: 'btn:calendar:attendance',
    groupName: 'button',
    nameKo: '캘린더 · 일일 출석 체크 버튼',
    nameEn: 'Calendar · Attendance Check-In Button',
    descriptionKo: '캘린더 상단의 일일 출석 리워드 수령 버튼입니다.',
  },
  {
    code: 'btn:stats:detail',
    groupName: 'button',
    nameKo: '통계 · 아이템 상세 이동 버튼',
    nameEn: 'Stats · Open Item Detail Button',
    descriptionKo: '통계 카드에서 개별 의류 상세 시트로 이동합니다.',
  },
  {
    code: 'btn:profile:edit',
    groupName: 'button',
    nameKo: '프로필 · 피부톤·체형 저장 버튼',
    nameEn: 'Profile · Save Profile Button',
    descriptionKo: '피부톤 및 체형 프로필을 수정·저장하는 버튼입니다.',
  },
  {
    code: 'btn:account:password',
    groupName: 'button',
    nameKo: '계정 · 비밀번호 변경 버튼',
    nameEn: 'Account · Change Password Button',
    descriptionKo: '계정 설정에서 비밀번호를 변경하는 버튼입니다.',
  },
  {
    code: 'btn:account:delete',
    groupName: 'button',
    nameKo: '계정 · 회원 탈퇴·삭제 버튼',
    nameEn: 'Account · Delete Account Button',
    descriptionKo: '계정 및 모든 데이터를 영구 삭제하는 버튼입니다.',
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
  'menu:outfits',
  'menu:closet',
  'menu:calendar',
  'menu:stats',
  'menu:profile',
  'btn:outfits:stage_bg',
  'btn:outfits:weather_scenario',
  'btn:stats:detail',
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

    CREATE TABLE IF NOT EXISTS user_permission_overrides (
      user_id INTEGER NOT NULL,
      permission_code TEXT NOT NULL,
      effect TEXT NOT NULL CHECK(effect IN ('grant', 'deny')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, permission_code),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_code);
    CREATE INDEX IF NOT EXISTS idx_user_perm_overrides_user ON user_permission_overrides(user_id);
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

  // Seed default permissions for any role that has zero mapped permissions yet,
  // and backfill newly introduced menu:* / btn:* defaults on existing DBs once.
  const countRolePerms = db.prepare(
    'SELECT COUNT(*) as c FROM role_permissions WHERE role_code = ?'
  );
  const countRoleUiPerms = db.prepare(
    "SELECT COUNT(*) as c FROM role_permissions WHERE role_code = ? AND (permission_code LIKE 'menu:%' OR permission_code LIKE 'btn:%')"
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
    } else {
      const existingUiCount = Number(countRoleUiPerms.get(roleCode)?.c || 0);
      if (existingUiCount === 0) {
        for (const permCode of permCodes) {
          if (permCode.startsWith('menu:') || permCode.startsWith('btn:')) {
            insertRolePerm.run(roleCode, permCode);
          }
        }
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

export function getUserPermissionOverrides(db, userId) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return {};
  }
  try {
    const rows = db
      .prepare(
        'SELECT permission_code, effect FROM user_permission_overrides WHERE user_id = ? ORDER BY permission_code ASC'
      )
      .all(numericUserId);
    const map = {};
    for (const row of rows) {
      const code = String(row.permission_code || '');
      const effect = row.effect === 'grant' ? 'grant' : row.effect === 'deny' ? 'deny' : null;
      if (code && effect && VALID_PERMISSION_SET.has(code)) {
        map[code] = effect;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function computeEffectivePermissions(roleCode, rolePermissions, overrides) {
  const effectiveSet = new Set(Array.isArray(rolePermissions) ? rolePermissions : []);
  if (overrides && typeof overrides === 'object') {
    for (const [code, effect] of Object.entries(overrides)) {
      if (!VALID_PERMISSION_SET.has(code)) continue;
      if (effect === 'grant') {
        effectiveSet.add(code);
      } else if (effect === 'deny') {
        effectiveSet.delete(code);
      }
    }
  }
  // Safeguard: administrators always retain core admin access
  if (roleCode === 'admin') {
    effectiveSet.add('admin:manage_roles');
    effectiveSet.add('admin:manage_users');
  }
  return Array.from(effectiveSet).sort();
}

export function getUserRbacContext(db, userRow) {
  const roleCode = resolveUserRoleCode(db, userRow);
  const roleMeta = getRoleMetadata(db, roleCode);
  const rolePermissions = getPermissionsForRole(db, roleCode);
  const overrides = getUserPermissionOverrides(db, userRow?.id);
  const permissions = computeEffectivePermissions(roleCode, rolePermissions, overrides);
  return {
    roleCode,
    roleMeta,
    rolePermissions,
    overrides,
    permissions,
    adminContactEmail: getAdminContactEmail(),
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

export function setUserPermissionOverrides(db, userId, rawOverrides) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { ok: false, status: 400, error: '유효하지 않은 사용자 ID입니다.' };
  }
  if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
    return { ok: false, status: 400, error: 'overrides 객체가 필요합니다.' };
  }
  const userRow = db
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .get(numericUserId);
  if (!userRow) {
    return { ok: false, status: 404, error: '사용자를 찾을 수 없습니다.' };
  }

  const roleCode = resolveUserRoleCode(db, userRow);
  const rolePermissions = getPermissionsForRole(db, roleCode);
  const rolePermSet = new Set(rolePermissions);

  db.transaction(() => {
    const upsertOverride = db.prepare(`
      INSERT INTO user_permission_overrides (user_id, permission_code, effect, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, permission_code) DO UPDATE SET
        effect = excluded.effect,
        updated_at = datetime('now')
    `);
    const deleteOverride = db.prepare(
      'DELETE FROM user_permission_overrides WHERE user_id = ? AND permission_code = ?'
    );

    for (const [rawCode, rawEffect] of Object.entries(rawOverrides)) {
      const code = String(rawCode || '').trim();
      if (!VALID_PERMISSION_SET.has(code)) continue;
      if (
        roleCode === 'admin' &&
        (code === 'admin:manage_roles' || code === 'admin:manage_users')
      ) {
        deleteOverride.run(numericUserId, code);
        continue;
      }

      if (rawEffect === 'inherit' || rawEffect === null || rawEffect === '') {
        deleteOverride.run(numericUserId, code);
        continue;
      }

      const normalizedEffect =
        rawEffect === true || rawEffect === 'grant'
          ? 'grant'
          : rawEffect === false || rawEffect === 'deny'
            ? 'deny'
            : null;
      if (!normalizedEffect) continue;

      // If the requested state matches the role default, drop redundant override row
      const roleHasIt = rolePermSet.has(code);
      if ((normalizedEffect === 'grant' && roleHasIt) || (normalizedEffect === 'deny' && !roleHasIt)) {
        deleteOverride.run(numericUserId, code);
      } else {
        upsertOverride.run(numericUserId, code, normalizedEffect);
      }
    }
  });

  const nextOverrides = getUserPermissionOverrides(db, numericUserId);
  const effectivePermissions = computeEffectivePermissions(roleCode, rolePermissions, nextOverrides);
  return {
    ok: true,
    userId: numericUserId,
    username: userRow.username,
    role: roleCode,
    rolePermissions,
    overrides: nextOverrides,
    permissions: effectivePermissions,
  };
}

export function resetUserPermissionOverrides(db, userId) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { ok: false, status: 400, error: '유효하지 않은 사용자 ID입니다.' };
  }
  const userRow = db
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .get(numericUserId);
  if (!userRow) {
    return { ok: false, status: 404, error: '사용자를 찾을 수 없습니다.' };
  }
  db.prepare('DELETE FROM user_permission_overrides WHERE user_id = ?').run(numericUserId);
  const roleCode = resolveUserRoleCode(db, userRow);
  const rolePermissions = getPermissionsForRole(db, roleCode);
  return {
    ok: true,
    userId: numericUserId,
    username: userRow.username,
    role: roleCode,
    rolePermissions,
    overrides: {},
    permissions: computeEffectivePermissions(roleCode, rolePermissions, {}),
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

  const rolePermMap = new Map(roles.map((r) => [r.code, r.permissions]));

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
    .map((u) => {
      const roleCode = u.role_code || 'member';
      const rolePermissions = rolePermMap.get(roleCode) || getPermissionsForRole(db, roleCode);
      const overrides = getUserPermissionOverrides(db, u.id);
      const effectivePermissions = computeEffectivePermissions(
        roleCode,
        rolePermissions,
        overrides
      );
      return {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email || null,
        role: roleCode,
        defaultCloset: u.default_closet,
        createdAt: u.created_at || null,
        rolePermissions,
        overrides,
        overrideCount: Object.keys(overrides).length,
        effectivePermissions,
      };
    });

  return {
    roles,
    permissions,
    users,
    adminContactEmail: getAdminContactEmail(),
  };
}
