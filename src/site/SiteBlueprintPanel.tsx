import { useId, useMemo, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon } from './SiteIcon.tsx';
import { IngestionShowcasePanel } from './SiteShowcases.tsx';
import type {
  BlueprintScaleMode,
  SiteBlueprintNode,
  SiteBlueprintTier,
  SiteCopy,
  SitePrivacyShield,
} from './siteContent.ts';

/**
 * Approved Hybrid Variant A + B — 6-Tier Enterprise System & Hardware Blueprint.
 * Mirrors the 6-tier flow + right vertical governance pillars, highlights iNVTRY at the service
 * tier, contrasts Current Dev (MVP) vs. Production Scale + GPU Hardware, and surfaces the
 * compact Privacy-by-Design 4-Shield bar right on the first Architecture screen.
 */
export function EnterpriseBlueprintPanel({
  copy,
  tapHint,
  onSelectPrivacyShield,
}: {
  readonly copy: SiteCopy['architecture'];
  readonly tapHint: string;
  readonly onSelectPrivacyShield: (shieldId: SitePrivacyShield['id']) => void;
}) {
  const [scaleMode, setScaleMode] = useState<BlueprintScaleMode>('prod');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('core-vton');
  const [mobileTierId, setMobileTierId] = useState<SiteBlueprintTier['id'] | 'gov'>('core');
  const uid = useId();

  const allNodes = useMemo<readonly SiteBlueprintNode[]>(
    () => [...copy.tiers.flatMap((tier) => tier.nodes), ...copy.governance],
    [copy.tiers, copy.governance]
  );

  const activeNode = useMemo(
    () => allNodes.find((n) => n.id === selectedNodeId) ?? allNodes[0],
    [allNodes, selectedNodeId]
  );

  const activeMobileNodes = useMemo(() => {
    if (mobileTierId === 'gov') return copy.governance;
    return copy.tiers.find((t) => t.id === mobileTierId)?.nodes ?? copy.tiers[0].nodes;
  }, [copy.tiers, copy.governance, mobileTierId]);

  const handleSelectNode = (nodeId: string) => {
    triggerHaptic('selection');
    setSelectedNodeId(nodeId);
  };

  const handleMobileTierChange = (tierId: SiteBlueprintTier['id'] | 'gov') => {
    triggerHaptic('selection');
    setMobileTierId(tierId);
    const nextNodes =
      tierId === 'gov'
        ? copy.governance
        : (copy.tiers.find((t) => t.id === tierId)?.nodes ?? copy.tiers[0].nodes);
    if (nextNodes[0]) {
      setSelectedNodeId(nextNodes[0].id);
    }
  };

  const activeSpecText = scaleMode === 'dev' ? activeNode.devSpec : activeNode.prodSpec;
  const secondarySpecText = scaleMode === 'dev' ? activeNode.prodSpec : activeNode.devSpec;

  return (
    <div className="site-bp-wrap" data-scale-mode={scaleMode}>
      {/* Top Control Row: Dev vs Prod Toggle + Compact Privacy 4-Shield Summary Strip */}
      <div className="site-bp-toolbar">
        <div className="site-bp-toolbar-left">
          <div className="site-bp-mode-toggle" role="group" aria-label="Deployment scale mode">
            <button
              type="button"
              className={`site-bp-mode-btn ${scaleMode === 'dev' ? 'is-active' : ''}`}
              aria-pressed={scaleMode === 'dev'}
              onClick={() => {
                triggerHaptic('selection');
                setScaleMode('dev');
              }}
            >
              {copy.modeDevLabel}
            </button>
            <button
              type="button"
              className={`site-bp-mode-btn ${scaleMode === 'prod' ? 'is-active' : ''}`}
              aria-pressed={scaleMode === 'prod'}
              onClick={() => {
                triggerHaptic('selection');
                setScaleMode('prod');
              }}
            >
              {copy.modeProdLabel}
            </button>
          </div>
        </div>

        {/* Hybrid Variant B Feature: Always-visible Privacy-by-Design 4-Shield Quick Bar */}
        <div className="site-bp-privacy-strip" aria-label={copy.privacyStripLabel}>
          <span className="site-bp-privacy-kicker">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>{copy.privacyStripLabel}</span>
          </span>
          <div className="site-bp-privacy-chips">
            {copy.privacyShields.map((shield) => (
              <button
                key={shield.id}
                type="button"
                className="site-bp-privacy-chip"
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectPrivacyShield(shield.id);
                }}
                title={`${shield.title} — ${shield.statusTag}`}
              >
                <SiteIcon name={shield.icon} size={12} />
                <span>{shield.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop 6-Tier Enterprise Blueprint + Right Vertical Governance Strip */}
      <div className="site-bp-desktop-canvas">
        <div className="site-bp-tiers-col">
          {copy.tiers.map((tier) => (
            <div
              key={tier.id}
              className={`site-bp-tier-row ${tier.highlight ? 'is-invtry-tier' : ''}`}
              data-tier-id={tier.id}
            >
              <div className="site-bp-tier-label">
                <span className="site-bp-tier-num">{tier.num}</span>
                <strong>{tier.label}</strong>
              </div>
              <div className="site-bp-tier-nodes">
                {tier.nodes.map((node) => {
                  const isSelected = node.id === activeNode.id;
                  return (
                    <button
                      key={node.id}
                      id={`${uid}-node-${node.id}`}
                      type="button"
                      aria-pressed={isSelected}
                      className={`site-bp-node-btn ${node.highlight ? 'is-invtry-node' : ''} ${
                        isSelected ? 'is-active' : ''
                      }`}
                      onClick={() => handleSelectNode(node.id)}
                    >
                      <span className="site-bp-node-icon">
                        <SiteIcon name={node.icon} size={14} />
                      </span>
                      <span className="site-bp-node-text">
                        <strong>{node.label}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Vertical Governance Column (Audit Log | Access Control | Git CI/CD) */}
        <aside className="site-bp-gov-col" aria-label={copy.govLabel}>
          <span className="site-bp-gov-title">{copy.govLabel}</span>
          <div className="site-bp-gov-stack">
            {copy.governance.map((gov) => {
              const isSelected = gov.id === activeNode.id;
              return (
                <button
                  key={gov.id}
                  id={`${uid}-gov-${gov.id}`}
                  type="button"
                  aria-pressed={isSelected}
                  className={`site-bp-gov-btn ${isSelected ? 'is-active' : ''}`}
                  onClick={() => handleSelectNode(gov.id)}
                >
                  <span className="site-bp-node-icon">
                    <SiteIcon name={gov.icon} size={14} />
                  </span>
                  <strong>{gov.label}</strong>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Mobile & Foldable Compact Tier Switcher (Zero Vertical Clipping) */}
      <div className="site-bp-mobile-canvas">
        <div className="site-bp-mobile-tabs" role="group" aria-label="Architecture tiers">
          {copy.tiers.map((tier) => (
            <button
              key={tier.id}
              type="button"
              aria-pressed={mobileTierId === tier.id}
              className={`site-bp-mobile-tab ${tier.highlight ? 'is-invtry-tier' : ''} ${
                mobileTierId === tier.id ? 'is-active' : ''
              }`}
              onClick={() => handleMobileTierChange(tier.id)}
            >
              <span>{tier.num}</span>
              <strong>{tier.label}</strong>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={mobileTierId === 'gov'}
            className={`site-bp-mobile-tab ${mobileTierId === 'gov' ? 'is-active' : ''}`}
            onClick={() => handleMobileTierChange('gov')}
          >
            <span>OPS</span>
            <strong>{copy.govLabel}</strong>
          </button>
          <button
            type="button"
            className="site-bp-mobile-tab is-privacy-jump"
            onClick={() => {
              triggerHaptic('selection');
              onSelectPrivacyShield('biometric');
            }}
          >
            <span>4-SHIELD</span>
            <strong>{copy.privacyStripLabel}</strong>
          </button>
        </div>

        <div className="site-bp-mobile-nodes">
          {activeMobileNodes.map((node) => {
            const isSelected = node.id === activeNode.id;
            return (
              <button
                key={node.id}
                type="button"
                aria-pressed={isSelected}
                className={`site-bp-node-btn ${node.highlight ? 'is-invtry-node' : ''} ${
                  isSelected ? 'is-active' : ''
                }`}
                onClick={() => handleSelectNode(node.id)}
              >
                <span className="site-bp-node-icon">
                  <SiteIcon name={node.icon} size={15} />
                </span>
                <span className="site-bp-node-text">
                  <strong>{node.label}</strong>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Uniform 1-Line Interactive Dev vs Prod Spec Inspector */}
      <div className="site-icon-inspector site-bp-inspector" aria-live="polite">
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeNode.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeNode.label}</strong>
          <span className="site-bp-spec-tag is-primary">
            {scaleMode === 'dev' ? copy.devTag : copy.prodTag}
          </span>
          <p className="site-icon-inspector-text">{activeSpecText}</p>
        </div>
        <div className="site-bp-inspector-delta" title={secondarySpecText}>
          <ArrowRight size={12} aria-hidden="true" />
          <span className="site-bp-spec-tag">
            {scaleMode === 'dev' ? copy.prodTag : copy.devTag}
          </span>
          <span className="site-bp-delta-text">{secondarySpecText}</span>
        </div>
        <span className="site-inspector-hint-sr">{tapHint}</span>
      </div>
    </div>
  );
}

/**
 * Elevated Privacy-by-Design 4-Line Defense Tab.
 * Surfaces personal data risk mitigation updates with 4 sculptural Shield icons,
 * live Before/After EXIF & background strip proof, and MVP vs Production spec breakdown.
 */
export function PrivacyDefensePanel({
  copy,
  interactiveCopy,
  selectedId,
  onSelect,
}: {
  readonly copy: SiteCopy['architecture'];
  readonly interactiveCopy: SiteCopy['interactive'];
  readonly selectedId: SitePrivacyShield['id'];
  readonly onSelect: (id: SitePrivacyShield['id']) => void;
}) {
  const uid = useId();

  const activeShield =
    copy.privacyShields.find((s) => s.id === selectedId) ?? copy.privacyShields[0];

  const handleShieldKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = copy.privacyShields.findIndex((s) => s.id === activeShield.id);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (idx + 1) % copy.privacyShields.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (idx - 1 + copy.privacyShields.length) % copy.privacyShields.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = copy.privacyShields.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const target = copy.privacyShields[nextIdx];
      triggerHaptic('selection');
      onSelect(target.id);
      document.getElementById(`${uid}-shield-${target.id}`)?.focus();
    }
  };

  return (
    <div className="site-privacy-panel">
      {/* Top: 4 Sculptural Privacy-by-Design Shield Icon Tabs (Subtitle-Free) */}
      <div
        className="site-privacy-shield-dock"
        role="tablist"
        aria-label={copy.privacyHeading}
        onKeyDown={handleShieldKeyDown}
      >
        {copy.privacyShields.map((shield) => {
          const isSelected = shield.id === activeShield.id;
          return (
            <button
              key={shield.id}
              id={`${uid}-shield-${shield.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${uid}-shield-panel`}
              tabIndex={isSelected ? 0 : -1}
              className={`site-shield-tile ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                onSelect(shield.id);
              }}
            >
              <span className="site-shield-tile-top">
                <span className="site-shield-tile-icon">
                  <SiteIcon name={shield.icon} size={17} />
                </span>
                <span className="site-shield-tile-code">{shield.code}</span>
              </span>
              <strong className="site-shield-tile-label">{shield.shortLabel}</strong>
            </button>
          );
        })}
      </div>

      {/* Bottom Split: Real EXIF/Background Strip Visual + Active Shield Spec Sheet */}
      <div className="site-privacy-split">
        <div className="site-privacy-visual-col">
          <IngestionShowcasePanel copy={interactiveCopy} />
        </div>

        <div
          id={`${uid}-shield-panel`}
          className="site-privacy-detail-card"
          role="tabpanel"
          aria-labelledby={`${uid}-shield-${activeShield.id}`}
          aria-live="polite"
        >
          <div className="site-privacy-detail-head">
            <span className="site-privacy-detail-icon">
              <SiteIcon name={activeShield.icon} size={18} />
            </span>
            <h3 className="site-privacy-detail-title">{activeShield.title}</h3>
            <span className="site-bp-spec-tag is-primary">{activeShield.statusTag}</span>
          </div>

          <div className="site-privacy-rows">
            <div className="site-privacy-row">
              <span className="site-arch-meta-label">{copy.privacyCurrentLabel}</span>
              <p>{activeShield.devStatus}</p>
            </div>
            <div className="site-privacy-row">
              <span className="site-arch-meta-label">{copy.privacyProdLabel}</span>
              <p>{activeShield.prodTarget}</p>
            </div>
            <div className="site-privacy-row is-retention">
              <span className="site-arch-meta-label">{copy.privacyRetentionLabel}</span>
              <p>{activeShield.retention}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
