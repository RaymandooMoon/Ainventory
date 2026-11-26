import { useMemo, useState } from 'react';
import { Check, Download, Mail, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { tx } from '../../utils/i18n.ts';
import type { NewsletterSubscriberRow } from '../../utils/newsletterCsv.ts';

export interface AdminNewsletterOverview {
  readonly total: number;
  readonly activeCount: number;
  readonly unsubscribedCount: number;
  readonly emailConfigured: boolean;
  readonly webhookConfigured: boolean;
  readonly subscribers: readonly NewsletterSubscriberRow[];
}

interface AdminNewsletterPanelProps {
  readonly lang?: string;
  readonly data: AdminNewsletterOverview;
  readonly errorMsg?: string;
  readonly busyKey?: string;
  readonly onToggleStatus: (
    subscriber: NewsletterSubscriberRow,
    nextStatus: 'subscribed' | 'unsubscribed'
  ) => void | Promise<void>;
  readonly onDelete: (subscriber: NewsletterSubscriberRow) => void | Promise<void>;
  readonly onExportCsv: (rows: readonly NewsletterSubscriberRow[]) => void;
}

type FilterStatus = 'all' | 'subscribed' | 'unsubscribed';

function formatSourceLabel(source: string | undefined, lang: string): string {
  switch (source) {
    case 'site_footer':
      return tx(lang, '푸터', 'Footer');
    case 'site_about':
      return tx(lang, '소개 · 소통', 'About · Connect');
    case 'site_hero':
      return tx(lang, '히어로', 'Hero');
    case 'site_modal':
      return tx(lang, '모달', 'Modal');
    default:
      return source || tx(lang, '웹', 'Web');
  }
}

function formatDateCompact(raw: string | null | undefined): string {
  if (!raw) return '—';
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return String(raw).slice(0, 16);
  }
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export default function AdminNewsletterPanel({
  lang = 'ko',
  data,
  errorMsg = '',
  busyKey = '',
  onToggleStatus,
  onDelete,
  onExportCsv,
}: AdminNewsletterPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const filteredSubscribers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (data.subscribers || []).filter((sub) => {
      if (statusFilter !== 'all' && sub.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        String(sub.email || '').toLowerCase().includes(q) ||
        String(sub.source || '').toLowerCase().includes(q) ||
        String(sub.lang || '').toLowerCase().includes(q)
      );
    });
  }, [data.subscribers, searchQuery, statusFilter]);

  return (
    <div className="admin-console-panel admin-console-nl-panel" data-admin-newsletter-panel="true">
      {/* Header & Integration Status Strip */}
      <div className="admin-console-nl-head">
        <div>
          <h2 className="admin-console-panel-title">
            {tx(lang, '뉴스레터 구독자 관리', 'Newsletter Subscribers')}
          </h2>
          <p className="admin-console-subtitle">
            {tx(
              lang,
              '공식 홈페이지(ainvtry.com)에서 수집된 구독자 목록 조회, 수신 상태 전환, 영구 삭제 및 CSV 내보내기를 지원합니다.',
              'Review official site (ainvtry.com) subscribers, update opt-in status, erase records, and export CSV.'
            )}
          </p>
        </div>

        <button
          type="button"
          className="admin-console-outline-btn admin-console-nl-export-btn"
          data-admin-nl-export="true"
          disabled={filteredSubscribers.length === 0}
          onClick={() => onExportCsv(filteredSubscribers)}
        >
          <Download size={14} aria-hidden="true" />
          <span>
            {tx(
              lang,
              `CSV 내보내기 (${filteredSubscribers.length})`,
              `Export CSV (${filteredSubscribers.length})`
            )}
          </span>
        </button>
      </div>

      {/* Metrics & Delivery Channel Strip */}
      <div className="admin-console-nl-meta-strip">
        <div className="admin-console-nl-stat">
          <span className="admin-console-kpi-label">{tx(lang, '전체 구독자', 'Total')}</span>
          <span className="admin-console-nl-stat-value">{data.total}</span>
        </div>
        <div className="admin-console-nl-stat">
          <span className="admin-console-kpi-label">{tx(lang, '활성 구독', 'Active')}</span>
          <span className="admin-console-nl-stat-value">{data.activeCount}</span>
        </div>
        <div className="admin-console-nl-stat">
          <span className="admin-console-kpi-label">{tx(lang, '수신 거부', 'Unsubscribed')}</span>
          <span className="admin-console-nl-stat-value">{data.unsubscribedCount}</span>
        </div>
        <div className="admin-console-nl-channels">
          <span
            className={`admin-console-status-chip ${data.emailConfigured ? 'is-allowed' : 'is-neutral'}`}
          >
            <Mail size={11} aria-hidden="true" />
            <span>
              {data.emailConfigured
                ? tx(lang, 'Resend 이메일 · 연동됨', 'Resend Email · Connected')
                : tx(lang, 'Resend 이메일 · 미설정', 'Resend Email · Not Set')}
            </span>
          </span>
          <span
            className={`admin-console-status-chip ${data.webhookConfigured ? 'is-allowed' : 'is-neutral'}`}
          >
            <span>
              {data.webhookConfigured
                ? tx(lang, 'Webhook 알림 · 연동됨', 'Webhook · Connected')
                : tx(lang, 'Webhook 알림 · 선택 미설정', 'Webhook · Optional')}
            </span>
          </span>
        </div>
      </div>

      {errorMsg && <div className="admin-console-error">{errorMsg}</div>}

      {/* Search & Status Filters */}
      <div className="admin-console-nl-toolbar">
        <div className="admin-console-search-wrap admin-console-nl-search">
          <Search size={14} className="admin-console-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tx(
              lang,
              '이메일, 유입 경로, 언어(ko/en) 검색...',
              'Search email, source, language...'
            )}
            aria-label={tx(lang, '구독자 검색', 'Search subscribers')}
            className="hig-native-input admin-console-search-input"
          />
        </div>

        <div className="admin-console-nl-filters" role="group" aria-label={tx(lang, '구독 상태 필터', 'Status filter')}>
          {(
            [
              { id: 'all', label: tx(lang, `전체 (${data.total})`, `All (${data.total})`) },
              {
                id: 'subscribed',
                label: tx(lang, `구독 중 (${data.activeCount})`, `Active (${data.activeCount})`),
              },
              {
                id: 'unsubscribed',
                label: tx(
                  lang,
                  `수신 거부 (${data.unsubscribedCount})`,
                  `Unsubscribed (${data.unsubscribedCount})`
                ),
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={statusFilter === item.id}
              onClick={() => setStatusFilter(item.id)}
              className={`admin-console-nl-filter-pill ${statusFilter === item.id ? 'is-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriber List */}
      {filteredSubscribers.length === 0 ? (
        <div className="admin-console-empty">
          {data.total === 0
            ? tx(
                lang,
                '아직 등록된 뉴스레터 구독자가 없습니다. ainvtry.com에서 구독이 접수되면 이곳에 실시간으로 표시됩니다.',
                'No newsletter subscribers yet. Subscriptions from ainvtry.com will appear here in real time.'
              )
            : tx(
                lang,
                '검색 또는 필터 조건에 일치하는 구독자가 없습니다.',
                'No subscribers match the current search or filter.'
              )}
        </div>
      ) : (
        <div className="admin-console-nl-list" role="list">
          {filteredSubscribers.map((sub) => {
            const isSubscribed = sub.status === 'subscribed';
            const subId = Number(sub.id || 0);
            const rowBusy = busyKey === `nl:${subId}` || busyKey === `nl-del:${subId}`;
            const confirmingDelete = confirmDeleteId === subId;

            return (
              <div
                key={subId || sub.email}
                role="listitem"
                data-admin-subscriber-email={sub.email}
                className={`admin-console-nl-row ${isSubscribed ? '' : 'is-unsubscribed'}`}
              >
                <div className="admin-console-nl-identity">
                  <div className="admin-console-nl-email-line">
                    <span className="admin-console-nl-email">{sub.email}</span>
                    <span
                      className={`admin-console-status-chip ${isSubscribed ? 'is-allowed' : 'is-blocked'}`}
                    >
                      {isSubscribed
                        ? tx(lang, '구독 중', 'Subscribed')
                        : tx(lang, '수신 거부', 'Unsubscribed')}
                    </span>
                  </div>
                  <div className="admin-console-nl-meta">
                    <span className="admin-console-custom-chip">
                      {(sub.lang || 'ko').toUpperCase()}
                    </span>
                    <span>{formatSourceLabel(sub.source, lang)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="admin-console-nl-date">
                      {tx(lang, '등록', 'Joined')} {formatDateCompact(sub.created_at)}
                    </span>
                    {!isSubscribed && sub.unsubscribed_at && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="admin-console-nl-date">
                          {tx(lang, '해지', 'Opted out')} {formatDateCompact(sub.unsubscribed_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="admin-console-nl-actions">
                  <button
                    type="button"
                    disabled={rowBusy || !subId}
                    onClick={() => {
                      setConfirmDeleteId(null);
                      onToggleStatus(sub, isSubscribed ? 'unsubscribed' : 'subscribed');
                    }}
                    className={`admin-console-perm-pill admin-console-nl-action-btn ${
                      isSubscribed ? 'is-denied' : 'is-allowed'
                    }`}
                  >
                    {isSubscribed ? <X size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                    <span>
                      {isSubscribed
                        ? tx(lang, '수신 거부 처리', 'Unsubscribe')
                        : tx(lang, '구독 복원', 'Restore')}
                    </span>
                  </button>

                  {confirmingDelete ? (
                    <div className="admin-console-nl-confirm-group">
                      <button
                        type="button"
                        disabled={rowBusy || !subId}
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onDelete(sub);
                        }}
                        className="admin-console-nl-danger-btn"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                        <span>{tx(lang, '영구 삭제 확인', 'Confirm Erase')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => setConfirmDeleteId(null)}
                        className="admin-console-outline-btn admin-console-nl-action-btn"
                        aria-label={tx(lang, '삭제 취소', 'Cancel erase')}
                      >
                        <RotateCcw size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={rowBusy || !subId}
                      onClick={() => setConfirmDeleteId(subId)}
                      className="admin-console-outline-btn admin-console-nl-action-btn"
                      aria-label={tx(lang, `${sub.email} 영구 삭제`, `Delete ${sub.email}`)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span>{tx(lang, '삭제', 'Erase')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
