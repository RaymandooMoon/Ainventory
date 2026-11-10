import { X } from 'lucide-react';

/**
 * Shared App-Store / Play-Store Responsive UI Standard Library (`AppUI.jsx`)
 * Benchmark synthesis of Acloset (studio packshot & weather daily card),
 * GetWardrobe (CPW & asset value analytics), and Whering (1-tap Dress Me rail & bottom sheets).
 */

export function PageHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <header className={`ui-page-header page-header ${className}`.trim()}>
      <div className="ui-page-header-copy">
        {eyebrow && <span className="atl-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </header>
  );
}

export function HorizontalChipRail({ ariaLabel, children, className = '' }) {
  return (
    <div className={`ui-chip-rail ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function KpiMetricStrip({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <section className={`ui-kpi-strip ${className}`.trim()} aria-label="핵심 옷장 지표">
      {items.map((it) => (
        <article key={it.key || it.label} className="ui-kpi-card">
          <span className="ui-kpi-label">{it.label}</span>
          <strong className="ui-kpi-value">{it.value}</strong>
          {it.sub && <small className="ui-kpi-sub">{it.sub}</small>}
        </article>
      ))}
    </section>
  );
}

export function ResponsiveSheetModal({
  open,
  onClose,
  eyebrow,
  title,
  maxWidth = 760,
  children,
  footer,
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop ui-sheet-backdrop" onClick={onClose}>
      <div
        className="modal-box ui-sheet-box"
        style={{ maxWidth, width: '95vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header ui-sheet-header">
          <div>
            {eyebrow && (
              <span className="rec-tag" style={{ marginBottom: 4, display: 'inline-block' }}>
                {eyebrow}
              </span>
            )}
            <h2>{title}</h2>
          </div>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="ui-sheet-body">{children}</div>
        {footer && <div className="ui-sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyStateBox({ icon, title, description, action }) {
  return (
    <div className="ui-empty-state">
      {icon && <div className="ui-empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
