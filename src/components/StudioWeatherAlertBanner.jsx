import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';

function getDirectiveAdjustmentLabel(directive, lang = 'ko') {
  const map = {
    cold_wind: { ko: '방한·방풍 보정 적용', en: 'Cold/Wind styling applied' },
    rain_storm: { ko: '방수·우산 보정 적용', en: 'Rain protection applied' },
    snow_ice: { ko: '방한·방수 부츠 보정 적용', en: 'Snow/Ice protection applied' },
    extreme_heat: { ko: '통기성·경량 보정 적용', en: 'Heat-relief styling applied' },
    advisory: { ko: '기상 주의 반영', en: 'Weather advisory active' },
  };
  const entry = map[directive] || map.advisory;
  return lang === 'en' ? entry.en : entry.ko;
}

/**
 * Collapsible top Studio Weather Alert Banner.
 * - Renders ONLY when weather.alerts has active alerts (zero visual height otherwise).
 * - Displays authoritative publisher attribution + verified external link per Google Maps Weather API ToS.
 */
export default function StudioWeatherAlertBanner({ weather, lang = 'ko' }) {
  const [expanded, setExpanded] = useState(false);

  const alerts = Array.isArray(weather?.alerts) ? weather.alerts : [];
  if (alerts.length === 0) return null;

  const primary = alerts[0];
  const isSevere = /SEVERE|EXTREME/i.test(String(primary?.severity || ''));
  const adjustmentLabel = getDirectiveAdjustmentLabel(primary?.stylingDirective, lang);

  return (
    <div
      className="w-full max-w-[540px] mx-auto px-3 pt-1.5"
      data-weather-alert-banner="true"
      data-alert-directive={primary?.stylingDirective || 'advisory'}
    >
      <div
        className={`rounded-2xl border backdrop-blur-md overflow-hidden transition-colors ${
          isSevere
            ? 'border-rose-500/35 bg-rose-50/92 dark:bg-rose-950/55 text-rose-950 dark:text-rose-100'
            : 'border-amber-500/35 bg-amber-50/92 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100'
        }`}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            triggerHaptic('selection');
            setExpanded((prev) => !prev);
          }}
          className="w-full min-h-[44px] px-3.5 py-2 flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle
              size={15}
              className={
                isSevere
                  ? 'text-rose-600 dark:text-rose-300 shrink-0'
                  : 'text-amber-600 dark:text-amber-300 shrink-0'
              }
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold truncate leading-snug">
                {primary.title}
                {primary.areaName ? ` · ${primary.areaName}` : ''}
                {alerts.length > 1 ? ` (+${alerts.length - 1})` : ''}
              </div>
              <div className="text-[11px] opacity-80 truncate">
                {adjustmentLabel}
              </div>
            </div>
          </div>
          <span className="shrink-0 opacity-75" aria-hidden="true">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>

        {expanded && (
          <div className="px-3.5 pb-3 pt-2 border-t border-black/10 dark:border-white/10 space-y-2.5 text-[11px]">
            {alerts.map((alert) => (
              <div key={alert.alertId} className="space-y-1">
                <div className="font-semibold text-[12px]">
                  {alert.title}
                  {alert.areaName ? ` (${alert.areaName})` : ''}
                </div>
                {alert.description && (
                  <p className="opacity-85 leading-relaxed">{alert.description}</p>
                )}
                {Array.isArray(alert.instructions) && alert.instructions.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 opacity-85">
                    {alert.instructions.slice(0, 2).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
                {alert.dataSource?.name && (
                  <div className="pt-1 flex items-center gap-1.5 opacity-80">
                    <span>{tx(lang, '발표 기관:', 'Source:')}</span>
                    {alert.dataSource.authorityUri ? (
                      <a
                        href={alert.dataSource.authorityUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline font-medium hover:opacity-100"
                      >
                        <span>{alert.dataSource.name}</span>
                        <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="font-medium">{alert.dataSource.name}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
