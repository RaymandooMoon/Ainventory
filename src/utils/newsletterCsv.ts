/**
 * RFC 4180 CSV serializer for Admin Newsletter Subscriber exports
 * with spreadsheet formula-injection sanitization (=, +, -, @, tab, CR)
 * and UTF-8 BOM so Excel / Numbers display Korean headers cleanly.
 */

export interface NewsletterSubscriberRow {
  readonly id?: number;
  readonly email: string;
  readonly lang?: string;
  readonly source?: string;
  readonly status: string;
  readonly consent_at?: string | null;
  readonly verified_at?: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
  readonly unsubscribed_at?: string | null;
}

const FORMULA_TRIGGER_RE = /^[\s]*[=+\-@\t\r]/;

export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_TRIGGER_RE.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildNewsletterSubscribersCsv(rows: readonly NewsletterSubscriberRow[]): string {
  const header = [
    'id',
    'email',
    'status',
    'lang',
    'source',
    'verified_at',
    'created_at',
    'updated_at',
    'unsubscribed_at',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.id ?? '',
        row.email,
        row.status,
        row.lang ?? 'ko',
        row.source ?? '',
        row.verified_at ?? '',
        row.created_at ?? '',
        row.updated_at ?? '',
        row.unsubscribed_at ?? '',
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
