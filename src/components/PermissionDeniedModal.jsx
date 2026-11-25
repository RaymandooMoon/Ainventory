import { useEffect, useState } from 'react';
import { Check, Copy, Mail, ShieldAlert, X } from 'lucide-react';
import {
  buildAdminInquiryMailto,
  getPermissionDisplayMeta,
  resolveSafeAdminEmail,
} from '../utils/accessControl.ts';
import { tx } from '../utils/i18n.ts';

/**
 * Global Permission Denied Popup:
 * - Triggered whenever a user clicks a restricted menu tab or restricted menu button,
 *   or receives an HTTP 403 PERMISSION_DENIED response from the server.
 * - Displays "권한이 없습니다." with a direct clickable email link to contact the Admin.
 */
export default function PermissionDeniedModal({ open, detail, user, lang = 'ko', onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return undefined;
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const isEn = lang === 'en';
  const adminEmail = resolveSafeAdminEmail(detail?.adminContactEmail || user?.adminContactEmail);
  const fallbackMeta = getPermissionDisplayMeta(detail?.permissionCode);
  const featureLabel = isEn
    ? detail?.featureLabelEn || fallbackMeta.labelEn
    : detail?.featureLabelKo || fallbackMeta.labelKo;

  const mailtoHref = buildAdminInquiryMailto({
    adminEmail,
    username: detail?.username || user?.username || null,
    featureLabel,
    permissionCode: detail?.permissionCode,
    lang,
  });

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard?.writeText(adminEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be restricted inside sandboxed iframe
    }
  };

  return (
    <div
      className="perm-denied-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-denied-title"
      data-permission-denied-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="perm-denied-card">
        <div className="perm-denied-header">
          <div className="perm-denied-title-group">
            <span className="perm-denied-icon-box">
              <ShieldAlert size={20} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <div>
              <h2 id="permission-denied-title" className="perm-denied-title">
                {tx(lang, '권한이 없습니다.', 'Access Denied')}
              </h2>
              <p className="perm-denied-feature">{featureLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx(lang, '닫기', 'Close')}
            className="perm-denied-close-x"
          >
            <X size={16} />
          </button>
        </div>

        <div className="perm-denied-body">
          <p className="perm-denied-message">
            {detail?.message ||
              tx(
                lang,
                `‘${featureLabel}’ 항목에 대한 접근 권한이 없습니다. 권한 부여가 필요하시면 관리자(Admin)에게 이메일로 문의해 주세요.`,
                `You do not have permission to access "${featureLabel}". Please contact the administrator by email to request access.`
              )}
          </p>

          <div className="perm-denied-contact-box">
            <div className="perm-denied-contact-label">
              {tx(lang, '관리자(Admin) 권한 문의', 'Contact Admin for Access')}
            </div>
            <a
              href={mailtoHref}
              data-admin-contact-email-link="true"
              className="perm-denied-mailto-link"
            >
              <span className="perm-denied-mailto-left">
                <Mail size={15} strokeWidth={2.2} aria-hidden="true" />
                <span className="perm-denied-mailto-addr">{adminEmail}</span>
              </span>
              <span className="perm-denied-mailto-cta">
                {tx(lang, '메일 보내기 →', 'Email Admin →')}
              </span>
            </a>

            <button type="button" onClick={handleCopyEmail} className="perm-denied-copy-btn">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>
                {copied
                  ? tx(lang, '관리자 이메일이 복사되었습니다', 'Admin email copied')
                  : tx(lang, '관리자 이메일 주소 복사', 'Copy admin email address')}
              </span>
            </button>
          </div>
        </div>

        <div className="perm-denied-footer">
          <button
            type="button"
            data-permission-denied-close="true"
            onClick={onClose}
            className="perm-denied-ok-btn"
          >
            {tx(lang, '확인', 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
