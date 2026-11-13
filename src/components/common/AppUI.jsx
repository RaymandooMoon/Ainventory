import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, FileText, ShieldCheck, Sparkles, X } from 'lucide-react';
import StudioGarmentImage from '../StudioGarmentImage.jsx';
import { apiFetch, formatKRW } from '../../utils/api.ts';
import {
  acknowledgeCameraNotice,
  emitStatusCapsule,
  pushBackHandler,
  setBiometricConsent,
  subscribeStatusCapsule,
  triggerHaptic,
} from '../../utils/nativeBridge.ts';

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="ui-page-header" style={{ marginBottom: 16 }}>
      <div className="ui-page-header-text">
        {eyebrow && <div className="hig-caption" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h1 className="hig-large-title">{title}</h1>
        {subtitle && <p className="hig-caption" style={{ marginTop: 4 }}>{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </header>
  );
}

export function HorizontalChipRail({ items = [], activeKey, onSelect, ariaLabel = '필터 선택' }) {
  return (
    <div className="ui-chip-rail" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`chip ${active ? 'active' : ''}`}
            onClick={() => {
              triggerHaptic('selection');
              onSelect?.(item.key);
            }}
          >
            {item.icon ? <span className="ui-chip-icon">{item.icon}</span> : null}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="ui-chip-count tabular-nums">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function KpiMetricStrip({ items = [] }) {
  return (
    <div className="ui-kpi-strip">
      {items.map((m) => (
        <div key={m.label} className="ui-kpi-card">
          <span className="ui-kpi-label">{m.label}</span>
          <strong className="ui-kpi-value tabular-nums">{m.value}</strong>
          {m.sub && <small className="ui-kpi-sub tabular-nums">{m.sub}</small>}
        </div>
      ))}
    </div>
  );
}

/**
 * Spring Physics Bottom Sheet / Modal with Drag-to-Dismiss, Escape & Hardware Back Stack (Reqs 9.a, 13.a)
 */
export function ResponsiveSheetModal({
  id,
  open,
  onClose,
  title,
  eyebrow,
  actions,
  maxWidth = 720,
  children,
  footer,
}) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const headingId = useId();

  const suppressBackdropClickRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const popBack = pushBackHandler(() => {
      onCloseRef.current?.();
      return true;
    });
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    const handleWindowMove = (e) => {
      if (!isDraggingRef.current) return;
      const clientY = e.touches?.[0]?.clientY ?? e.clientY ?? 0;
      const delta = Math.max(0, clientY - startYRef.current);
      dragYRef.current = delta;
      setDragY(delta);
    };
    const handleWindowEnd = () => {
      if (!isDraggingRef.current) return;
      const finalDelta = dragYRef.current;
      isDraggingRef.current = false;
      dragYRef.current = 0;
      setIsDragging(false);
      setDragY(0);
      if (finalDelta > 80) {
        triggerHaptic('selection');
        onCloseRef.current?.();
      } else {
        suppressBackdropClickRef.current = true;
        setTimeout(() => {
          suppressBackdropClickRef.current = false;
        }, 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowEnd);
    window.addEventListener('pointercancel', handleWindowEnd);
    window.addEventListener('touchmove', handleWindowMove, { passive: true });
    window.addEventListener('touchend', handleWindowEnd);
    window.addEventListener('touchcancel', handleWindowEnd);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowEnd);
      window.removeEventListener('pointercancel', handleWindowEnd);
      window.removeEventListener('touchmove', handleWindowMove);
      window.removeEventListener('touchend', handleWindowEnd);
      window.removeEventListener('touchcancel', handleWindowEnd);
      popBack();
      dragYRef.current = 0;
      isDraggingRef.current = false;
      suppressBackdropClickRef.current = false;
      setDragY(0);
      setIsDragging(false);
    };
  }, [open]);

  if (!open) return null;

  const handleDragStart = (e) => {
    e.stopPropagation();
    const clientY = e.touches?.[0]?.clientY ?? e.clientY ?? 0;
    startYRef.current = clientY;
    dragYRef.current = 0;
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  return (
    <div
      className="modal-backdrop ui-sheet-backdrop"
      onClick={() => {
        if (suppressBackdropClickRef.current) return;
        onCloseRef.current?.();
      }}
    >
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        aria-label={!title ? eyebrow || '시트 대화상자' : undefined}
        data-sheet-panel="true"
        className="modal-box ui-sheet-box"
        style={{
          maxWidth,
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging
            ? 'none'
            : 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-sheet-handle="true"
          className="ui-sheet-drag-zone"
          onPointerDown={handleDragStart}
          onTouchStart={handleDragStart}
          aria-label="드래그하여 닫기"
        >
          <div className="ui-sheet-drag-handle" aria-hidden="true" />
        </div>

        {(title || eyebrow || actions) && (
          <div className="modal-header">
            <div style={{ minWidth: 0 }}>
              {eyebrow && (
                <span className="hig-eyebrow" style={{ display: 'block', marginBottom: 4 }}>
                  {eyebrow}
                </span>
              )}
              {title && (
                <h2 id={headingId} className="hig-headline">
                  {title}
                </h2>
              )}
            </div>
            <div className="modal-header-actions">
              {actions}
              <button
                type="button"
                className="icon-btn"
                onClick={() => onCloseRef.current?.()}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
        <div className="ui-sheet-content">{children}</div>
        {footer && <div className="ui-sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

export const BottomSheet = ResponsiveSheetModal;

export function EmptyStateBox({ icon, title, description, action }) {
  return (
    <div className="ui-empty-box hig-fade-in">
      {icon && <div className="ui-empty-icon" style={{ marginBottom: 8 }}>{icon}</div>}
      <h3 className="hig-headline" style={{ marginBottom: 4 }}>{title}</h3>
      {description && (
        <p className="hig-caption" style={{ maxWidth: 380, margin: '0 auto 12px' }}>
          {description}
        </p>
      )}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

/**
 * Dynamic Island Minimal Top Status Capsule (Req 13.b, 14.a)
 */
export function StatusCapsule() {
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let timer = null;
    const unsub = subscribeStatusCapsule((next) => {
      setPayload(next);
      if (timer) clearTimeout(timer);
      if (next?.message) {
        timer = setTimeout(() => setPayload(null), next.durationMs || 2400);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);

  if (!payload?.message) return null;

  return (
    <div className="hig-status-capsule-wrap" role="status" aria-live="polite">
      <div className="hig-status-capsule hig-top-capsule hig-vibrancy-capsule">
        <Check size={13} strokeWidth={2.5} />
        <span>{payload.message}</span>
      </div>
    </div>
  );
}

/**
 * Skeleton Shimmer Placeholders (Req 13.c — Replaces Spinning Loaders)
 */
export function SkeletonShimmer({ height = 140, width = '100%', radius = 16, style = {} }) {
  return (
    <div
      className="hig-skeleton"
      aria-hidden="true"
      style={{ height, width, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonWardrobeGrid({ count = 6 }) {
  return (
    <div className="hig-cutout-grid" aria-label="옷장 로딩 중">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="hig-skeleton"
          style={{ aspectRatio: '3 / 4', borderRadius: 16 }}
        />
      ))}
    </div>
  );
}

export function SkeletonBentoGrid({ count = 3 }) {
  return (
    <div className="hig-bento-grid" aria-label="인사이트 로딩 중">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="hig-skeleton" style={{ height: 156, borderRadius: 24 }} />
      ))}
    </div>
  );
}

/**
 * Button with Silent Icon Morphing + Micro-Haptics (Req 13.b)
 */
export function MorphActionButton({
  icon,
  label,
  morphedLabel = '완료',
  className = 'btn btn-secondary btn-sm',
  onClick,
  disabled = false,
  id,
}) {
  const [morphed, setMorphed] = useState(false);

  const handlePress = async (e) => {
    if (disabled) return;
    triggerHaptic('light');
    await onClick?.(e);
    setMorphed(true);
    setTimeout(() => setMorphed(false), 1100);
  };

  return (
    <button
      id={id}
      type="button"
      className={className}
      disabled={disabled}
      onClick={handlePress}
    >
      {morphed ? <Check size={14} strokeWidth={2.5} /> : icon}
      <span>{morphed ? morphedLabel : label}</span>
    </button>
  );
}

/**
 * Pre-Permission Rationale Modal for Camera / Photo Library (Req 10.c)
 */
export function PermissionNoticeModal({ open, mode = 'camera', onConfirm, onClose }) {
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      eyebrow="PRIVACY & PERMISSION"
      title={mode === 'camera' ? '카메라 및 사진 접근 안내' : '사진 보관함 접근 안내'}
      maxWidth={440}
    >
      <div className="hig-item-detail-body">
        <div className="hig-sheet-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Camera size={22} style={{ flexShrink: 0 }} />
          <p className="hig-body" style={{ fontSize: '0.88rem' }}>
            선택하거나 촬영한 사진은 의류 배경 제거(WebP 누끼) 및 옷장 등록 용도로만 사용되며,
            동의 없이 외부 제3자에게 공유되지 않습니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            id="confirm-camera-permission-btn"
            type="button"
            className="btn btn-primary"
            onClick={() => {
              acknowledgeCameraNotice();
              triggerHaptic('light');
              onConfirm?.();
            }}
          >
            확인 및 계속하기
          </button>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}

/**
 * Explicit Local Biometric Processing Notice & Consent Modal (Req 10.c)
 */
export function BiometricConsentModal({ open, onConfirm, onClose }) {
  const [checked, setChecked] = useState(true);

  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      eyebrow="ON-DEVICE FACE PRIVACY"
      title="온디바이스 얼굴 피부톤 분석 동의"
      maxWidth={460}
    >
      <div className="hig-item-detail-body">
        <div className="hig-sheet-card" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <ShieldCheck size={22} style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="hig-body" style={{ fontSize: '0.86rem' }}>
            <strong>100% 기기 내부 메모리 처리 (서버 미전송)</strong>
            <p className="hig-caption" style={{ marginTop: 6 }}>
              얼굴 랜드마크(이마·양볼·턱) 및 피부 명도·언더톤 추출은 브라우저 내부 온디바이스
              WASM 엔진에서만 수행된 뒤 즉시 메모리에서 파기됩니다. 원본 얼굴 사진은 외부 서버로
              업로드되지 않습니다.
            </p>
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.86rem',
            cursor: 'pointer',
          }}
        >
          <input
            id="biometric-consent-checkbox"
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>기기 내 로컬 얼굴 색상 분석 처리 안내를 확인했으며 동의합니다.</span>
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            id="confirm-biometric-consent-btn"
            type="button"
            className="btn btn-primary"
            disabled={!checked}
            onClick={() => {
              setBiometricConsent(true);
              triggerHaptic('light');
              onConfirm?.();
            }}
          >
            동의 후 분석 시작
          </button>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}

/**
 * App Store / Play Store Privacy Policy & Terms of Service Disclosure Modal (Req 10)
 */
function LegalDisclosureModalInner({ initialDoc = 'privacy', onClose, lang = 'ko' }) {
  const [doc, setDoc] = useState(initialDoc);
  const isEn = lang === 'en';

  return (
    <ResponsiveSheetModal
      open
      onClose={onClose}
      eyebrow="LEGAL & PRIVACY"
      title={
        doc === 'terms'
          ? isEn
            ? 'Terms of Service'
            : '서비스 이용약관'
          : isEn
            ? 'Privacy Policy'
            : '개인정보처리방침'
      }
      maxWidth={540}
    >
      <div className="hig-item-detail-body">
        <div className="hig-grid-2">
          <button
            type="button"
            className={`chip ${doc === 'privacy' ? 'active' : ''}`}
            onClick={() => setDoc('privacy')}
          >
            {isEn ? 'Privacy Policy' : '개인정보처리방침'}
          </button>
          <button
            type="button"
            className={`chip ${doc === 'terms' ? 'active' : ''}`}
            onClick={() => setDoc('terms')}
          >
            {isEn ? 'Terms of Service' : '서비스 이용약관'}
          </button>
        </div>

        {doc === 'privacy' ? (
          <div className="hig-sheet-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} />
              <strong className="hig-body">
                {isEn
                  ? '1. Collected Items & Purpose'
                  : '1. 수집하는 개인정보 항목 및 이용 목적'}
              </strong>
            </div>
            <p className="hig-caption">
              {isEn
                ? 'We process account identifiers (email/username), body sizing profile, and cropped WebP garment cutouts solely to provide digital wardrobe management, 3D fitting, and outfit recommendations.'
                : '계정 식별 정보(이메일·아이디), 체형 치수 설정값 및 사용자가 등록한 의류 크롭(WebP) 이미지는 디지털 옷장 관리, 3D 마네킹 착장 및 날씨 맞춤 코디 추천 제공 목적으로만 처리됩니다.'}
            </p>
            <strong className="hig-body">
              {isEn
                ? '2. On-Device Face Analysis (Zero Server Upload)'
                : '2. 온디바이스 얼굴 피부톤 진단 (외부 서버 미전송)'}
            </strong>
            <p className="hig-caption">
              {isEn
                ? 'Personal color face landmark & Lab undertone analysis runs 100% locally inside on-device WASM memory after explicit consent and is discarded immediately without server upload.'
                : '퍼스널컬러 진단을 위한 얼굴 랜드마크 및 Lab 언더톤 분석은 명시적 동의 후 100% 기기 내 브라우저 WASM 메모리에서만 수행되며, 원본 얼굴 사진은 서버로 전송·저장되지 않고 즉시 파기됩니다.'}
            </p>
            <strong className="hig-body">
              {isEn
                ? '3. Offline Cache & Immediate Account Deletion'
                : '3. 오프라인 캐시 및 계정·데이터 즉시 영구 파기'}
            </strong>
            <p className="hig-caption">
              {isEn
                ? 'Offline cache in IndexedDB is cleared on logout, and requesting account deletion in Settings permanently erases all account, garment, outfit, calendar, and local cache records immediately.'
                : '오프라인 조회용 IndexedDB 캐시는 로그아웃 시 즉시 정리되며, 계정 설정에서 회원 탈퇴 실행 시 계정·의류·룩북·캘린더·로컬 캐시 데이터가 유예 기간 없이 즉시 영구 파기됩니다.'}
            </p>
          </div>
        ) : (
          <div className="hig-sheet-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} />
              <strong className="hig-body">
                {isEn ? '1. Service Scope & Guest Trial' : '1. 서비스 제공 범위 및 샘플 옷장 체험'}
              </strong>
            </div>
            <p className="hig-caption">
              {isEn
                ? 'A inventory provides 3D digital wardrobe management, weather styling, shopping duplicate checks, and a login-free sample closet demo.'
                : 'A inventory는 3D 디지털 옷장 관리, 기상 연동 코디 추천, 오프라인 쇼핑 중복 판독 및 비로그인 샘플 옷장 체험 기능을 제공합니다.'}
            </p>
            <strong className="hig-body">
              {isEn ? '2. User Content Ownership' : '2. 사용자 콘텐츠 권리 및 책임'}
            </strong>
            <p className="hig-caption">
              {isEn
                ? 'Users retain full rights to garment photos uploaded to their closet and may export schedules (.ics) or delete items and accounts at any time.'
                : '사용자가 등록한 의류 사진 및 코디 기록에 대한 권리는 사용자에게 귀속되며, 언제든 개별 삭제, 캘린더(.ics) 내보내기 또는 계정 영구 삭제를 수행할 수 있습니다.'}
            </p>
          </div>
        )}

        <button type="button" className="btn btn-primary btn-full" onClick={onClose}>
          {isEn ? 'Close' : '확인'}
        </button>
      </div>
    </ResponsiveSheetModal>
  );
}

/**
 * App Store / Play Store Privacy Policy & Terms of Service Disclosure Modal (Req 10)
 */
export function LegalDisclosureModal({ open, initialDoc = 'privacy', onClose, lang = 'ko' }) {
  if (!open) return null;
  return (
    <LegalDisclosureModalInner
      key={initialDoc}
      initialDoc={initialDoc}
      onClose={onClose}
      lang={lang}
    />
  );
}

function SampleImportSheetInner({ onClose, targetOwner, onImported }) {
  const [samples, setSamples] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/sample-catalog')
      .then((res) => {
        if (!active) return;
        const list = res.samples || [];
        setSamples(list);
        setSelectedKeys(list.slice(0, 5).map((item) => item.key || item.sampleKey));
      })
      .catch((err) => {
        if (active) {
          emitStatusCapsule(err?.message || '샘플 카탈로그를 불러오지 못했습니다');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleKey = (key) => {
    triggerHaptic('selection');
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleImport = async () => {
    if (selectedKeys.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch('/garments/import-samples', {
        method: 'POST',
        body: JSON.stringify({
          sample_keys: selectedKeys,
          closet_owner: targetOwner,
        }),
      });
      triggerHaptic('medium');
      onImported?.(res.count ?? res.importedCount ?? selectedKeys.length);
      onClose?.();
    } catch (err) {
      emitStatusCapsule(err?.message || '샘플 아이템 가져오기에 실패했습니다');
    } finally {
      setImporting(false);
    }
  };

  return (
    <ResponsiveSheetModal
      open
      onClose={onClose}
      eyebrow="SAMPLE CAPSULE IMPORT"
      title="샘플 아이템 선택 가져오기"
      maxWidth={680}
    >
      {loading ? (
        <SkeletonWardrobeGrid count={6} />
      ) : (
        <div className="hig-item-detail-body">
          <div className="hig-sheet-row-between">
            <span className="hig-caption tabular-nums">
              원하는 아이템만 내 옷장으로 선택 복제할 수 있습니다 ({selectedKeys.length}개 선택됨)
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setSelectedKeys(
                  selectedKeys.length === samples.length
                    ? []
                    : samples.map((s) => s.key || s.sampleKey)
                )
              }
            >
              {selectedKeys.length === samples.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div className="sample-import-grid">
            {samples.map((item) => {
              const itemKey = item.key || item.sampleKey;
              const checked = selectedKeys.includes(itemKey);
              return (
                <button
                  key={itemKey}
                  type="button"
                  className={`sample-import-card ${checked ? 'is-selected' : ''}`}
                  onClick={() => toggleKey(itemKey)}
                >
                  <div className="sample-import-thumb">
                    <StudioGarmentImage
                      item={item}
                      alt={item.name}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                  <div className="hig-garment-name">{item.name}</div>
                  <div className="hig-caption tabular-nums">{formatKRW(item.price)}</div>
                  {checked && (
                    <span className="sample-import-check">
                      <Check size={13} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button
              id="confirm-import-samples-btn"
              type="button"
              className="btn btn-primary"
              disabled={importing || selectedKeys.length === 0}
              onClick={handleImport}
            >
              <Sparkles size={15} />
              <span>
                {importing ? '가져오는 중...' : `${selectedKeys.length}개 아이템 내 옷장에 담기`}
              </span>
            </button>
          </div>
        </div>
      )}
    </ResponsiveSheetModal>
  );
}

/**
 * Selective Sample Closet Import Sheet for Logged-in Users (Req 8.a)
 */
export function SampleImportSheet({ open, onClose, targetOwner, onImported }) {
  if (!open) return null;
  return (
    <SampleImportSheetInner
      onClose={onClose}
      targetOwner={targetOwner}
      onImported={onImported}
    />
  );
}
