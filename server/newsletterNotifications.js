/**
 * server/newsletterNotifications.js
 * ---------------------------------------------------------------------------
 * Pure Web-Fetch newsletter notification dispatcher (Resend API + SSRF-safe Webhook).
 *
 * - Sends a localized (KO / EN) welcome email to new/resubscribed readers and
 *   an instant alert to the founder when `RESEND_API_KEY` is configured.
 * - Posts a Slack/Discord/Sheets-compatible JSON payload when `NEWSLETTER_WEBHOOK_URL`
 *   is configured (strictly HTTPS, non-private hostnames only).
 * - Never throws or blocks subscription persistence when keys are unset or external
 *   mail providers experience transient errors.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = 'iNVTRY <newsletter@ainvtry.com>';
const DEFAULT_NOTIFY_EMAIL = 'raymond@ainvtry.com';
const NOTIFY_TIMEOUT_MS = 8000;

export function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  return false;
}

export function resolveSafeWebhookUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildWelcomeEmailPayload({ email, lang, fromEmail, replyToEmail }) {
  const isEn = lang === 'en';
  const safeEmail = escapeHtml(email);
  const subject = isEn
    ? '[iNVTRY] Welcome to the iNVTRY Newsletter'
    : '[iNVTRY] 뉴스레터 구독이 완료되었습니다';

  const text = isEn
    ? [
        'Welcome to iNVTRY.',
        '',
        `Your email (${email}) has been registered for the iNVTRY newsletter.`,
        'We will share private beta invitations, product releases, and wardrobe intelligence updates.',
        '',
        'No spam. Unsubscribe anytime at https://ainvtry.com/#about',
        '',
        '— Ainvtry (iNVTRY) · Seoul',
      ].join('\n')
    : [
        '안녕하세요, iNVTRY입니다.',
        '',
        `${email} 주소로 뉴스레터 구독이 정상 등록되었습니다.`,
        '프라이빗 베타 초대, 주요 기능 업데이트 및 제품 소식을 가장 먼저 전해 드리겠습니다.',
        '',
        '광고성 스팸을 발송하지 않으며, 언제든 https://ainvtry.com/#about 에서 즉시 수신 거부할 수 있습니다.',
        '',
        '— Ainvtry (iNVTRY) · 서울',
      ].join('\n');

  const html = `<!doctype html>
<html lang="${isEn ? 'en' : 'ko'}">
<body style="margin:0;padding:32px 16px;background:#09090b;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#111114;border:1px solid rgba(245,245,247,0.12);border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:28px 28px 20px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#d6b889;">iNVTRY · NEWSLETTER</p>
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#f5f5f7;">${
          isEn ? 'You are on the list.' : '뉴스레터 구독이 완료되었습니다.'
        }</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#d1d1d6;">${
          isEn
            ? `<strong>${safeEmail}</strong> is now subscribed to iNVTRY private beta invitations and major release notes.`
            : `<strong>${safeEmail}</strong> 주소로 iNVTRY 프라이빗 베타 초대 및 주요 업데이트 알림이 등록되었습니다.`
        }</p>
        <a href="https://ainvtry.com" style="display:inline-block;margin-top:8px;padding:11px 20px;border-radius:999px;background:#f5f5f7;color:#101013;font-size:13px;font-weight:600;text-decoration:none;">${
          isEn ? 'Open iNVTRY' : 'iNVTRY 바로가기'
        }</a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid rgba(245,245,247,0.08);font-size:12px;line-height:1.5;color:#8e8e93;">
        ${
          isEn
            ? 'No spam. Unsubscribe anytime from the Connect tab on <a href="https://ainvtry.com" style="color:#d6b889;">ainvtry.com</a>.'
            : '광고성 스팸 없음 · 언제든 <a href="https://ainvtry.com" style="color:#d6b889;">ainvtry.com</a> 소통 탭에서 즉시 수신 거부할 수 있습니다.'
        }
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    from: fromEmail || DEFAULT_FROM_EMAIL,
    to: [email],
    reply_to: replyToEmail || DEFAULT_NOTIFY_EMAIL,
    subject,
    text,
    html,
  };
}

export function buildFounderAlertEmailPayload({
  email,
  lang,
  source,
  resubscribed,
  storage,
  fromEmail,
  notifyEmail,
}) {
  const safeEmail = escapeHtml(email);
  const safeSource = escapeHtml(source || 'site_modal');
  const safeLang = escapeHtml(lang || 'ko');
  const safeStorage = escapeHtml(storage || 'express');
  const actionLabel = resubscribed ? '재구독' : '신규 구독';
  const nowIso = new Date().toISOString();

  return {
    from: fromEmail || DEFAULT_FROM_EMAIL,
    to: [notifyEmail || DEFAULT_NOTIFY_EMAIL],
    reply_to: email,
    subject: `[iNVTRY Newsletter] ${actionLabel}: ${email}`,
    text: [
      `iNVTRY 뉴스레터 ${actionLabel} 알림`,
      `- 이메일: ${email}`,
      `- 언어: ${lang || 'ko'}`,
      `- 유입 경로: ${source || 'site_modal'}`,
      `- 저장소: ${storage || 'express'}`,
      `- 시각(UTC): ${nowIso}`,
    ].join('\n'),
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;background:#111114;color:#f5f5f7;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;color:#d6b889;font-weight:700;">iNVTRY NEWSLETTER ALERT</p>
      <h2 style="margin:0 0 12px;font-size:17px;">${actionLabel}: ${safeEmail}</h2>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#d1d1d6;">
        <li>언어: ${safeLang}</li>
        <li>유입 경로: ${safeSource}</li>
        <li>저장소: ${safeStorage}</li>
        <li>시각(UTC): ${escapeHtml(nowIso)}</li>
      </ul>
    </div>`,
  };
}

export function buildVerificationEmailPayload({
  email,
  lang,
  code,
  verifyUrl,
  expiresInMinutes = 10,
  fromEmail,
  replyToEmail,
}) {
  const isEn = lang === 'en';
  const safeEmail = escapeHtml(email);
  const safeCode = escapeHtml(code);
  const safeVerifyUrl = escapeHtml(verifyUrl);
  const spacedCode = safeCode.length === 6 ? `${safeCode.slice(0, 3)} ${safeCode.slice(3)}` : safeCode;

  const subject = isEn
    ? `[iNVTRY] Your verification code: ${code}`
    : `[iNVTRY] 이메일 인증코드: ${code}`;

  const text = isEn
    ? [
        'Verify your email for the iNVTRY Newsletter.',
        '',
        `6-digit verification code: ${code}`,
        `Valid for ${expiresInMinutes} minutes.`,
        '',
        `Or verify in one click: ${verifyUrl}`,
        '',
        'If you did not request this, you can safely ignore this email.',
        '— Ainvtry (iNVTRY) · Seoul',
      ].join('\n')
    : [
        'iNVTRY 뉴스레터 이메일 인증을 완료해 주세요.',
        '',
        `6자리 인증코드: ${code}`,
        `유효시간: ${expiresInMinutes}분`,
        '',
        `또는 아래 링크를 눌러 바로 인증할 수 있습니다:`,
        verifyUrl,
        '',
        '본인이 요청하지 않으셨다면 이 메일을 무시해 주세요.',
        '— Ainvtry (iNVTRY) · 서울',
      ].join('\n');

  const html = `<!doctype html>
<html lang="${isEn ? 'en' : 'ko'}">
<body style="margin:0;padding:32px 16px;background:#09090b;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#111114;border:1px solid rgba(245,245,247,0.12);border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:28px 28px 22px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#d6b889;">iNVTRY · EMAIL VERIFICATION</p>
        <h1 style="margin:0 0 10px;font-size:20px;line-height:1.35;color:#f5f5f7;">${
          isEn ? 'Confirm your email address' : '이메일 주소를 인증해 주세요'
        }</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#d1d1d6;">${
          isEn
            ? `Enter the 6-digit code below on ainvtry.com or tap the verification button to confirm <strong>${safeEmail}</strong>.`
            : `<strong>${safeEmail}</strong> 주소가 본인의 이메일이 맞는지 확인하기 위해 아래 6자리 인증코드를 입력하거나 인증 버튼을 눌러 주세요.`
        }</p>
        <div style="margin:0 0 18px;padding:18px 20px;background:#18181d;border:1px solid rgba(214,184,137,0.34);border-radius:12px;text-align:center;">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#a1a1aa;margin-bottom:6px;">${
            isEn ? `VERIFICATION CODE · ${expiresInMinutes} MIN` : `인증코드 · ${expiresInMinutes}분 유효`
          }</div>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:0.18em;color:#f5f5f7;">${spacedCode}</div>
        </div>
        <div style="text-align:center;">
          <a href="${safeVerifyUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#f5f5f7;color:#101013;font-size:13px;font-weight:650;text-decoration:none;">${
            isEn ? 'Verify Email in One Click' : '원클릭으로 이메일 인증 완료'
          }</a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid rgba(245,245,247,0.08);font-size:12px;line-height:1.5;color:#8e8e93;">
        ${
          isEn
            ? 'If you did not request the iNVTRY newsletter, no action is needed and this email will not be subscribed.'
            : '본인이 iNVTRY 뉴스레터를 신청하지 않으셨다면 이 메일을 무시해 주세요. 인증 전까지 구독되지 않습니다.'
        }
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    from: fromEmail || DEFAULT_FROM_EMAIL,
    to: [email],
    reply_to: replyToEmail || DEFAULT_NOTIFY_EMAIL,
    subject,
    text,
    html,
  };
}

export async function sendNewsletterVerificationEmail(
  { email, lang, code, verifyUrl, expiresInMinutes = 10 },
  env = process.env,
  fetchImpl = fetch
) {
  const resendKey = String(env?.RESEND_API_KEY || '').trim();
  if (!resendKey) {
    return { sent: false, configured: false };
  }
  const fromEmail = String(env?.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim() || DEFAULT_FROM_EMAIL;
  const replyToEmail =
    String(env?.NEWSLETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL).trim() || DEFAULT_NOTIFY_EMAIL;

  const payload = buildVerificationEmailPayload({
    email,
    lang,
    code,
    verifyUrl,
    expiresInMinutes,
    fromEmail,
    replyToEmail,
  });

  try {
    const res = await fetchWithTimeout(fetchImpl, RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { sent: false, configured: true, status: res.status };
    }
    return { sent: true, configured: true, status: res.status };
  } catch {
    return { sent: false, configured: true, status: 0 };
  }
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = NOTIFY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatches optional Resend emails (subscriber welcome + founder notification)
 * and optional HTTPS webhook notification. Always resolves cleanly with a summary object.
 */
export async function dispatchNewsletterNotifications(event, env = process.env, fetchImpl = fetch) {
  const summary = {
    welcomeSent: false,
    founderAlertSent: false,
    webhookSent: false,
  };

  const resendKey = String(env?.RESEND_API_KEY || '').trim();
  const fromEmail = String(env?.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim() || DEFAULT_FROM_EMAIL;
  const notifyEmail =
    String(env?.NEWSLETTER_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL).trim() || DEFAULT_NOTIFY_EMAIL;
  const webhookUrl = resolveSafeWebhookUrl(env?.NEWSLETTER_WEBHOOK_URL);
  const webhookSecret = String(env?.NEWSLETTER_WEBHOOK_SECRET || '').trim();

  const tasks = [];

  // Only send welcome/founder emails on fresh subscribe or resubscribe (never duplicate spam)
  if (resendKey && event.type === 'subscribed') {
    const sendResend = async (payload, flagKey) => {
      try {
        const res = await fetchWithTimeout(fetchImpl, RESEND_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          summary[flagKey] = true;
        }
      } catch {
        // Non-blocking notification failure must never disrupt subscription UX
      }
    };

    tasks.push(
      sendResend(
        buildWelcomeEmailPayload({
          email: event.email,
          lang: event.lang,
          fromEmail,
          replyToEmail: notifyEmail,
        }),
        'welcomeSent'
      )
    );

    if (notifyEmail.toLowerCase() !== event.email.toLowerCase()) {
      tasks.push(
        sendResend(
          buildFounderAlertEmailPayload({
            email: event.email,
            lang: event.lang,
            source: event.source,
            resubscribed: Boolean(event.resubscribed),
            storage: event.storage,
            fromEmail,
            notifyEmail,
          }),
          'founderAlertSent'
        )
      );
    }
  }

  if (webhookUrl && (event.type === 'subscribed' || event.type === 'unsubscribed')) {
    const actionText =
      event.type === 'unsubscribed'
        ? `[iNVTRY Newsletter] 수신 거부: ${event.email}`
        : `[iNVTRY Newsletter] ${event.resubscribed ? '재구독' : '신규 구독'}: ${event.email} (${event.lang || 'ko'} · ${event.source || 'site_modal'})`;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Ainvtry-Newsletter-Notifier/1.0',
    };
    if (webhookSecret) {
      headers['X-Ainvtry-Webhook-Secret'] = webhookSecret;
    }

    tasks.push(
      (async () => {
        try {
          const res = await fetchWithTimeout(fetchImpl, webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              event: `newsletter.${event.type}`,
              email: event.email,
              lang: event.lang || 'ko',
              source: event.source || 'site_modal',
              resubscribed: Boolean(event.resubscribed),
              storage: event.storage || 'express',
              timestamp: new Date().toISOString(),
              text: actionText,
              content: actionText,
            }),
          });
          if (res.ok) {
            summary.webhookSent = true;
          }
        } catch {
          // Non-blocking webhook failure
        }
      })()
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
  return summary;
}
