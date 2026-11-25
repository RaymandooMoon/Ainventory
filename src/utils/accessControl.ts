import { hasUserPermission } from './api.ts';

export const ADMIN_CONTACT_EMAIL_FALLBACK = 'raymond@ainvtry.com';
export const PERMISSION_DENIED_EVENT = 'ainventory:permission-denied';

export interface AccessButtonItem {
  code: string;
  labelKo: string;
  labelEn: string;
  descriptionKo: string;
  descriptionEn: string;
  /** Optional underlying API permission that is also kept in sync when toggling */
  linkedApiPermissions?: readonly string[];
}

export interface AccessMenuSection {
  key: 'outfits' | 'closet' | 'calendar' | 'stats' | 'profile';
  menuPermissionCode: string;
  labelKo: string;
  labelEn: string;
  descriptionKo: string;
  descriptionEn: string;
  buttons: readonly AccessButtonItem[];
}

export const ACCESS_MENU_CATALOG: readonly AccessMenuSection[] = Object.freeze([
  {
    key: 'outfits',
    menuPermissionCode: 'menu:outfits',
    labelKo: '코디 스튜디오 (Outfits)',
    labelEn: 'Outfits Studio',
    descriptionKo: '가상 피팅 캔버스, 착장 조합 및 AI 피팅 화면 접근',
    descriptionEn: 'Access the virtual fitting canvas, outfit slots, and AI try-on studio',
    buttons: [
      {
        code: 'btn:outfits:save',
        labelKo: '코디 저장',
        labelEn: 'Save Outfit',
        descriptionKo: '현재 조합한 코디를 계정에 저장',
        descriptionEn: 'Save the currently equipped outfit',
        linkedApiPermissions: ['outfit:write'],
      },
      {
        code: 'btn:outfits:ai_vton',
        labelKo: 'AI 가상 피팅 실행',
        labelEn: 'AI Virtual Try-On',
        descriptionKo: '서버 AI 가상 피팅(VTON) 이미지 합성 호출',
        descriptionEn: 'Trigger server-side AI virtual try-on synthesis',
        linkedApiPermissions: ['vton:synthesize'],
      },
      {
        code: 'btn:outfits:stage_bg',
        labelKo: '배경 · 스테이지 설정',
        labelEn: 'Stage Background',
        descriptionKo: '스테이지 배경 선택 및 조명 프리셋 변경',
        descriptionEn: 'Switch stage backgrounds and lighting settings',
      },
      {
        code: 'btn:outfits:store',
        labelKo: '배경 스토어 · 뽑기',
        labelEn: 'Stage Store & Draw',
        descriptionKo: '배경 스토어 열기 및 일일 무료/코인 뽑기',
        descriptionEn: 'Open stage store and perform background draws',
      },
      {
        code: 'btn:outfits:packing',
        labelKo: '여행 패킹 리스트',
        labelEn: 'Packing List',
        descriptionKo: '여행 패킹 리스트 생성 및 편집',
        descriptionEn: 'Open and edit travel packing lists',
        linkedApiPermissions: ['packing:write'],
      },
      {
        code: 'btn:outfits:weather_scenario',
        labelKo: '날씨 · 장소 시나리오',
        labelEn: 'Weather & Place',
        descriptionKo: '날씨 시나리오 전환 및 목적지 장소 검색',
        descriptionEn: 'Switch weather scenarios and search places',
      },
    ],
  },
  {
    key: 'closet',
    menuPermissionCode: 'menu:closet',
    labelKo: '옷장 (Closet)',
    labelEn: 'Wardrobe Closet',
    descriptionKo: '보유 의류 목록 탐색, 검색 및 카테고리 필터',
    descriptionEn: 'Browse, search, and filter wardrobe garments',
    buttons: [
      {
        code: 'btn:closet:add',
        labelKo: '의류 등록 (+)',
        labelEn: 'Add Garment (+)',
        descriptionKo: '사진 촬영·업로드로 새 의류 아이템 등록',
        descriptionEn: 'Register new garments via photo or manual entry',
        linkedApiPermissions: ['closet:write'],
      },
      {
        code: 'btn:closet:laundry',
        labelKo: '스마트 세탁 바구니',
        labelEn: 'Smart Laundry Basket',
        descriptionKo: '세탁 대기 목록 및 의류 케어 관리 열기',
        descriptionEn: 'Open smart laundry and garment care panel',
      },
      {
        code: 'btn:closet:edit_delete',
        labelKo: '의류 수정 · 삭제',
        labelEn: 'Edit & Delete Item',
        descriptionKo: '의류 상세 정보 수정, 착용 기록 및 삭제',
        descriptionEn: 'Edit garment details or remove items from closet',
        linkedApiPermissions: ['closet:write'],
      },
      {
        code: 'btn:closet:sample_import',
        labelKo: '샘플 의류 가져오기',
        labelEn: 'Import Sample Items',
        descriptionKo: '샘플 캡슐 의류를 개인 옷장으로 가져오기',
        descriptionEn: 'Copy curated sample garments into personal closet',
        linkedApiPermissions: ['closet:write'],
      },
    ],
  },
  {
    key: 'calendar',
    menuPermissionCode: 'menu:calendar',
    labelKo: '캘린더 (Calendar)',
    labelEn: 'Wear Calendar',
    descriptionKo: '일자별 착용 기록(OOTD) 캘린더 조회',
    descriptionEn: 'View daily outfit wear logs on calendar',
    buttons: [
      {
        code: 'btn:calendar:log_wear',
        labelKo: '착용 일정 추가 (+)',
        labelEn: 'Add Wear Entry (+)',
        descriptionKo: '특정 날짜에 착용한 의류·코디 기록 및 삭제',
        descriptionEn: 'Create, edit, or delete wear calendar logs',
        linkedApiPermissions: ['calendar:write'],
      },
      {
        code: 'btn:calendar:export_ics',
        labelKo: '캘린더 내보내기 (.ics)',
        labelEn: 'Export Calendar (.ics)',
        descriptionKo: '착용 일정을 외부 캘린더 파일로 다운로드',
        descriptionEn: 'Download wear history as .ics calendar file',
      },
      {
        code: 'btn:calendar:attendance',
        labelKo: '일일 출석 체크',
        labelEn: 'Daily Attendance',
        descriptionKo: '일일 출석 리워드 코인 수령 버튼',
        descriptionEn: 'Claim daily attendance rewards',
      },
    ],
  },
  {
    key: 'stats',
    menuPermissionCode: 'menu:stats',
    labelKo: '통계 (Stats)',
    labelEn: 'Wardrobe Stats',
    descriptionKo: '착용률, CPW, 컬러·소재 분석 대시보드 조회',
    descriptionEn: 'Inspect wardrobe utilization, CPW, and color analytics',
    buttons: [
      {
        code: 'btn:stats:detail',
        labelKo: '아이템 상세 이동',
        labelEn: 'Open Item Detail',
        descriptionKo: '통계 카드 클릭 시 개별 의류 상세 시트 열기',
        descriptionEn: 'Open individual garment sheet from stats cards',
      },
    ],
  },
  {
    key: 'profile',
    menuPermissionCode: 'menu:profile',
    labelKo: '프로필 · 계정 (Profile & Account)',
    labelEn: 'Profile & Account',
    descriptionKo: '피부톤·체형 분석 및 계정 설정 화면 접근',
    descriptionEn: 'Access skin tone, body profile, and account settings',
    buttons: [
      {
        code: 'btn:profile:edit',
        labelKo: '피부톤 · 체형 저장',
        labelEn: 'Save Skin & Body Profile',
        descriptionKo: '피부톤·신체 치수 변경 사항을 계정에 저장',
        descriptionEn: 'Persist skin tone and body profile changes',
        linkedApiPermissions: ['profile:write'],
      },
      {
        code: 'btn:account:password',
        labelKo: '비밀번호 변경',
        labelEn: 'Change Password',
        descriptionKo: '현재 계정 비밀번호 변경 실행',
        descriptionEn: 'Update current account password',
      },
      {
        code: 'btn:account:delete',
        labelKo: '계정 영구 삭제',
        labelEn: 'Delete Account',
        descriptionKo: '계정 및 모든 개인 데이터 영구 삭제',
        descriptionEn: 'Permanently delete account and wardrobe data',
        linkedApiPermissions: ['account:delete'],
      },
    ],
  },
]);

export interface PermissionDeniedDetail {
  permissionCode?: string;
  featureLabelKo?: string;
  featureLabelEn?: string;
  message?: string;
  adminContactEmail?: string;
  username?: string | null;
}

const MENU_TAB_TO_PERMISSION: Readonly<Record<string, string>> = Object.freeze({
  outfits: 'menu:outfits',
  closet: 'menu:closet',
  calendar: 'menu:calendar',
  stats: 'menu:stats',
  admin: 'admin:manage_roles',
});

export function resolveMenuPermissionCode(tabKey: string): string | null {
  return MENU_TAB_TO_PERMISSION[String(tabKey || '').trim()] || null;
}

export function getPermissionDisplayMeta(permissionCode?: string | null): {
  labelKo: string;
  labelEn: string;
} {
  const code = String(permissionCode || '').trim();
  if (!code) {
    return { labelKo: '요청한 기능', labelEn: 'Requested Feature' };
  }
  if (code === 'admin:manage_roles' || code === 'admin:manage_users') {
    return { labelKo: '관리자 페이지', labelEn: 'Admin Management' };
  }
  for (const menu of ACCESS_MENU_CATALOG) {
    if (menu.menuPermissionCode === code) {
      return { labelKo: menu.labelKo, labelEn: menu.labelEn };
    }
    for (const btn of menu.buttons) {
      if (btn.code === code || btn.linkedApiPermissions?.includes(code)) {
        return {
          labelKo: `${menu.labelKo.split(' (')[0]} · ${btn.labelKo}`,
          labelEn: `${menu.labelEn} · ${btn.labelEn}`,
        };
      }
    }
  }
  return { labelKo: code, labelEn: code };
}

export function resolveSafeAdminEmail(rawEmail?: string | null): string {
  const candidate = String(rawEmail || '').trim();
  if (candidate && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate)) {
    return candidate;
  }
  return ADMIN_CONTACT_EMAIL_FALLBACK;
}

export function buildAdminInquiryMailto(options: {
  adminEmail?: string | null;
  username?: string | null;
  featureLabel?: string | null;
  permissionCode?: string | null;
  lang?: string;
}): string {
  const to = resolveSafeAdminEmail(options.adminEmail);
  const isEn = options.lang === 'en';
  const feature = String(options.featureLabel || '').trim() || (isEn ? 'Feature Access' : '기능 접근');
  const userTag = String(options.username || '').trim() || 'guest';
  const codeTag = String(options.permissionCode || '').trim();

  const subject = isEn
    ? `[iNVTRY Access Request] Permission needed for ${feature}`
    : `[iNVTRY 권한 문의] ${feature} 접근 권한 요청`;

  const body = isEn
    ? `Hello Admin,\n\nI would like to request access permission for the following item:\n- Account: @${userTag}\n- Feature: ${feature}${codeTag ? ` (${codeTag})` : ''}\n\nThank you.`
    : `안녕하세요 관리자님,\n\n아래 항목에 대한 접근 권한을 요청드립니다.\n- 계정: @${userTag}\n- 요청 항목: ${feature}${codeTag ? ` (${codeTag})` : ''}\n\n확인 부탁드립니다.`;

  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function notifyPermissionDenied(detail: PermissionDeniedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PermissionDeniedDetail>(PERMISSION_DENIED_EVENT, { detail }));
}

export function subscribePermissionDenied(
  listener: (detail: PermissionDeniedDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (ev: Event) => {
    const customEv = ev as CustomEvent<PermissionDeniedDetail>;
    listener(customEv?.detail || {});
  };
  window.addEventListener(PERMISSION_DENIED_EVENT, handler);
  return () => window.removeEventListener(PERMISSION_DENIED_EVENT, handler);
}

/**
 * Checks whether `user` has `permissionCode`.
 * If denied, immediately opens the global "권한이 없습니다" + Admin Email Inquiry popup and returns `false`.
 */
export function guardUserPermission(
  user:
    | {
        role?: string | null;
        username?: string | null;
        permissions?: string[] | null;
        adminContactEmail?: string | null;
        isSampleDemo?: boolean;
      }
    | null
    | undefined,
  permissionCode: string,
  meta?: {
    featureLabelKo?: string;
    featureLabelEn?: string;
    message?: string;
  }
): boolean {
  if (hasUserPermission(user, permissionCode)) {
    return true;
  }
  const fallbackMeta = getPermissionDisplayMeta(permissionCode);
  notifyPermissionDenied({
    permissionCode,
    featureLabelKo: meta?.featureLabelKo || fallbackMeta.labelKo,
    featureLabelEn: meta?.featureLabelEn || fallbackMeta.labelEn,
    message: meta?.message,
    adminContactEmail: resolveSafeAdminEmail(user?.adminContactEmail),
    username: user?.username || null,
  });
  return false;
}
