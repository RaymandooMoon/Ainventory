#!/usr/bin/env python3
"""
send-github-push-email.py

Zero-dependency (Python 3 stdlib only) Gmail SMTP notification dispatcher for
Ainventory GitHub Actions workflows.

Supported modes (via EMAIL_MODE env var or --mode CLI flag):
  1. push_immediate : Sent immediately whenever `git push` occurs on any branch.
  2. ci_summary     : Sent after CI (`web-verify` + `firebase-test-lab`) finishes,
                      regardless of whether the workflow succeeded, failed, or cancelled.

Required GitHub Repository Secrets (Settings -> Secrets and variables -> Actions):
  - GMAIL_USER          : Sender Gmail address (e.g. yourname@gmail.com)
  - GMAIL_APP_PASSWORD  : 16-character Google App Password (spaces are stripped safely)

Optional Secret or Variable:
  - NOTIFY_TO_EMAIL     : Comma-separated recipient email(s). Defaults to GMAIL_USER.

Security & Reliability Guarantees:
  - Reads untrusted commit messages, author names, and file paths exclusively from
    GITHUB_EVENT_PATH JSON and environment variables (zero shell interpolation).
  - Masks email addresses in GitHub Actions logs.
  - Exits 0 with a clear `::notice::` and Step Summary setup guide if neither
    GMAIL_USER nor GMAIL_APP_PASSWORD is configured yet, keeping CI green.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
import html
import json
import os
from pathlib import Path
import smtplib
import socket
import ssl
import subprocess
import sys
from typing import Any

try:
    from zoneinfo import ZoneInfo

    KST = ZoneInfo("Asia/Seoul")
except Exception:
    KST = timezone(timedelta(hours=9), name="KST")


SMTP_HOST = "smtp.gmail.com"
SMTP_SSL_PORT = 465
SMTP_STARTTLS_PORT = 587
SMTP_TIMEOUT_SECONDS = 20


def mask_email(addr: str) -> str:
    addr = addr.strip()
    if "@" not in addr:
        return "***"
    local, domain = addr.split("@", 1)
    if len(local) <= 2:
        masked_local = local[:1] + "***"
    else:
        masked_local = local[:2] + "***"
    return f"{masked_local}@{domain}"


def parse_recipients(raw_to: str, fallback_sender: str) -> list[str]:
    source = raw_to.strip() if raw_to.strip() else fallback_sender.strip()
    recipients: list[str] = []
    for part in source.replace(";", ",").split(","):
        cleaned = part.strip()
        if cleaned and "@" in cleaned and cleaned not in recipients:
            recipients.append(cleaned)
    return recipients


def load_event_payload() -> dict[str, Any]:
    event_path = os.environ.get("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        return {}
    path = Path(event_path)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"::warning::Failed to parse GITHUB_EVENT_PATH JSON: {exc}")
        return {}


def git_fallback_commit_summary() -> tuple[str, str, list[str]]:
    """Fallback commit subject, author, and changed files via local git history."""
    subject = ""
    author = ""
    changed: list[str] = []
    try:
        proc = subprocess.run(
            ["git", "log", "-1", "--pretty=format:%s%n%an"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            lines = proc.stdout.splitlines()
            subject = lines[0].strip() if lines else ""
            author = lines[1].strip() if len(lines) > 1 else ""
    except Exception:
        pass

    try:
        proc_files = subprocess.run(
            ["git", "diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if proc_files.returncode == 0 and proc_files.stdout.strip():
            for line in proc_files.stdout.splitlines():
                line = line.strip()
                if line:
                    changed.append(line.replace("\t", "  "))
    except Exception:
        pass

    return subject, author, changed


def collect_push_metadata(event: dict[str, Any]) -> dict[str, Any]:
    server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com").rstrip("/")
    repo = os.environ.get("GITHUB_REPOSITORY", "RaymandooMoon/Ainventory").strip()
    ref_name = os.environ.get("GITHUB_REF_NAME", "").strip()
    ref_full = os.environ.get("GITHUB_REF", "").strip()
    if not ref_name and ref_full:
        ref_name = ref_full.split("/", 2)[-1]
    if not ref_name:
        ref_name = "main"

    sha = os.environ.get("GITHUB_SHA", "").strip()
    short_sha = sha[:7] if sha else "unknown"
    actor = os.environ.get("GITHUB_ACTOR", "unknown").strip()
    event_name = os.environ.get("GITHUB_EVENT_NAME", "push").strip()
    run_id = os.environ.get("GITHUB_RUN_ID", "").strip()
    run_attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1").strip()
    workflow_name = os.environ.get("GITHUB_WORKFLOW", "GitHub Actions").strip()
    dispatch_note = os.environ.get("DISPATCH_TEST_NOTE", "").strip()

    pusher = (
        (event.get("pusher") or {}).get("name")
        or (event.get("sender") or {}).get("login")
        or actor
    )
    forced = bool(event.get("forced", False))
    deleted = bool(event.get("deleted", False))
    created = bool(event.get("created", False))

    raw_commits: list[dict[str, Any]] = list(event.get("commits") or [])
    head_commit: dict[str, Any] = dict(event.get("head_commit") or {})
    if not raw_commits and head_commit:
        raw_commits = [head_commit]

    commits_summary: list[dict[str, str]] = []
    changed_files: list[str] = []
    seen_files: set[str] = set()

    for c in raw_commits:
        cid = str(c.get("id") or sha or "")[:7]
        msg_full = str(c.get("message") or "").strip()
        msg_first = msg_full.splitlines()[0].strip() if msg_full else "(커밋 메시지 없음)"
        c_author = (
            (c.get("author") or {}).get("name")
            or (c.get("author") or {}).get("username")
            or pusher
        )
        c_url = str(c.get("url") or (f"{server_url}/{repo}/commit/{cid}" if cid else ""))
        commits_summary.append(
            {
                "id": cid,
                "subject": msg_first,
                "author": str(c_author),
                "url": c_url,
            }
        )
        for prefix, key in (("A", "added"), ("M", "modified"), ("D", "removed")):
            for fpath in c.get(key) or []:
                entry = f"{prefix}  {fpath}"
                if entry not in seen_files:
                    seen_files.add(entry)
                    changed_files.append(entry)

    fb_subject, fb_author, fb_files = git_fallback_commit_summary()
    if not commits_summary and (fb_subject or sha):
        commits_summary.append(
            {
                "id": short_sha,
                "subject": fb_subject or "(수동 실행 또는 병합 커밋)",
                "author": fb_author or pusher,
                "url": f"{server_url}/{repo}/commit/{sha}" if sha else f"{server_url}/{repo}",
            }
        )
    if not changed_files and fb_files:
        changed_files = fb_files

    headline = (
        commits_summary[-1]["subject"]
        if commits_summary
        else ("브랜치 삭제 이벤트" if deleted else "(커밋 정보 없음)")
    )
    if len(headline) > 58:
        headline_short = headline[:55] + "..."
    else:
        headline_short = headline

    compare_url = str(event.get("compare") or "").strip()
    if not compare_url:
        compare_url = (
            f"{server_url}/{repo}/commit/{sha}" if sha else f"{server_url}/{repo}"
        )

    run_url = (
        f"{server_url}/{repo}/actions/runs/{run_id}"
        if run_id
        else f"{server_url}/{repo}/actions"
    )
    commit_url = (
        f"{server_url}/{repo}/commit/{sha}" if sha else f"{server_url}/{repo}"
    )

    now_utc = datetime.now(timezone.utc)
    now_kst = now_utc.astimezone(KST)
    timestamp_str = (
        f"{now_kst.strftime('%Y-%m-%d %H:%M:%S')} KST "
        f"({now_utc.strftime('%H:%M:%S')} UTC)"
    )

    return {
        "server_url": server_url,
        "repo": repo,
        "ref_name": ref_name,
        "sha": sha,
        "short_sha": short_sha,
        "actor": actor,
        "pusher": pusher,
        "event_name": event_name,
        "forced": forced,
        "created": created,
        "deleted": deleted,
        "commits": commits_summary,
        "changed_files": changed_files,
        "headline": headline,
        "headline_short": headline_short,
        "compare_url": compare_url,
        "commit_url": commit_url,
        "run_url": run_url,
        "run_id": run_id,
        "run_attempt": run_attempt,
        "workflow_name": workflow_name,
        "timestamp_str": timestamp_str,
        "dispatch_note": dispatch_note,
    }


def normalize_job_result(raw: str) -> tuple[str, str, str, str]:
    """Return (normalized_key, korean_label, badge_bg, badge_fg)."""
    val = (raw or "unknown").strip().lower()
    if val == "success":
        return ("success", "성공 (Passed)", "#dcfce7", "#166534")
    if val == "failure":
        return ("failure", "실패 (Failed)", "#fee2e2", "#991b1b")
    if val == "cancelled":
        return ("cancelled", "취소됨 (Cancelled)", "#fef3c7", "#92400e")
    if val == "skipped":
        return ("skipped", "건너뜀 (Skipped)", "#f3f4f6", "#4b5563")
    return (val, f"상태 미상 ({val})", "#f3f4f6", "#374151")


def compute_overall_ci_verdict(
    web_res: str, android_res: str
) -> tuple[str, str, str, str]:
    """Compute overall CI outcome from job results."""
    w = (web_res or "").strip().lower()
    a = (android_res or "").strip().lower()
    results = [w, a]
    if "failure" in results:
        return ("failure", "실패 ✗", "#dc2626", "#fef2f2")
    if "cancelled" in results:
        return ("cancelled", "취소됨 ⊘", "#d97706", "#fffbeb")
    if w == "success" and a in ("success", "skipped"):
        return ("success", "성공 ✓", "#16a34a", "#f0fdf4")
    return ("unknown", f"확인 필요 ({w}/{a})", "#4b5563", "#f9fafb")


def load_optional_failure_log(log_dir_env: str) -> str:
    """Read tail of downloaded failure diagnostics if present."""
    raw_dir = os.environ.get(log_dir_env, "").strip()
    if not raw_dir:
        return ""
    base = Path(raw_dir)
    if not base.exists():
        return ""
    candidates: list[Path] = []
    if base.is_file():
        candidates.append(base)
    else:
        for p in sorted(base.rglob("*")):
            if p.is_file() and p.suffix in (".log", ".txt"):
                candidates.append(p)
    if not candidates:
        return ""
    snippets: list[str] = []
    for fpath in candidates[:2]:
        try:
            lines = fpath.read_text(encoding="utf-8", errors="replace").splitlines()
            tail = "\n".join(lines[-35:]).strip()
            if tail:
                snippets.append(f"[{fpath.name}]\n{tail}")
        except Exception:
            continue
    combined = "\n\n".join(snippets)
    return combined[:3500]


def build_push_immediate_email(meta: dict[str, Any]) -> tuple[str, str, str]:
    repo_short = meta["repo"].split("/")[-1]
    push_flag = " [강제 푸시]" if meta["forced"] else ""
    subject = (
        f"[{repo_short} Push]{push_flag} {meta['ref_name']} 반영 ({meta['short_sha']}) "
        f"— {meta['headline_short']}"
    )

    commits = meta["commits"]
    files = meta["changed_files"]

    # Plain-text version
    text_lines = [
        f"[{meta['repo']}] Git Push 즉시 알림",
        "=" * 60,
        f"- 저장소    : {meta['repo']}",
        f"- 브랜치    : {meta['ref_name']}" + (" (Force Push)" if meta["forced"] else ""),
        f"- 푸시 사용자: {meta['pusher']} (이벤트: {meta['event_name']})",
        f"- 최신 커밋 : {meta['short_sha']} ({meta['commit_url']})",
        f"- 시각      : {meta['timestamp_str']}",
    ]
    if meta["dispatch_note"]:
        text_lines.append(f"- 메모      : {meta['dispatch_note']}")
    text_lines.extend(
        [
            f"- 변경 비교 : {meta['compare_url']}",
            f"- Actions   : {meta['run_url']}",
            "",
            f"커밋 목록 ({len(commits)}건):",
        ]
    )
    for c in commits[:15]:
        text_lines.append(f"  * [{c['id']}] {c['subject']} — {c['author']}")
    if len(commits) > 15:
        text_lines.append(f"  ... 외 {len(commits) - 15}건")

    text_lines.append("")
    text_lines.append(f"변경된 파일 ({len(files)}개):")
    if files:
        for f in files[:30]:
            text_lines.append(f"  {f}")
        if len(files) > 30:
            text_lines.append(f"  ... 외 {len(files) - 30}개 파일")
    else:
        text_lines.append("  (표시할 파일 변경 내역 없음)")

    text_lines.extend(
        [
            "",
            "※ CI 검증(Web Lint/Typecheck/Build/E2E 및 Android APK 검증)이 대상 브랜치에서 완료되면 결과 요약 메일이 추가로 발송됩니다.",
        ]
    )
    plain_body = "\n".join(text_lines)

    # HTML version
    commit_rows_html = []
    for c in commits[:15]:
        cid_esc = html.escape(c["id"])
        subj_esc = html.escape(c["subject"])
        auth_esc = html.escape(c["author"])
        url_esc = html.escape(c["url"])
        commit_rows_html.append(
            f'<li style="margin:6px 0;line-height:1.5;">'
            f'<a href="{url_esc}" style="font-family:monospace;background:#eff6ff;color:#1d4ed8;'
            f'padding:2px 6px;border-radius:4px;text-decoration:none;font-weight:600;">{cid_esc}</a> '
            f'<span style="color:#111827;font-weight:500;">{subj_esc}</span> '
            f'<span style="color:#6b7280;font-size:12px;">— {auth_esc}</span>'
            f"</li>"
        )
    if len(commits) > 15:
        commit_rows_html.append(
            f'<li style="color:#6b7280;font-size:12px;">... 외 {len(commits) - 15}건</li>'
        )

    files_html = (
        "\n".join(html.escape(f) for f in files[:30])
        if files
        else "(표시할 파일 변경 내역 없음)"
    )
    if len(files) > 30:
        files_html += f"\n... 외 {len(files) - 30}개 파일"

    force_badge = (
        '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;'
        'background:#fee2e2;color:#991b1b;font-size:12px;font-weight:700;">FORCE PUSH</span>'
        if meta["forced"]
        else ""
    )
    note_row = (
        f'<tr><td style="padding:6px 0;color:#6b7280;width:110px;">테스트 메모</td>'
        f'<td style="padding:6px 0;color:#111827;font-weight:500;">{html.escape(meta["dispatch_note"])}</td></tr>'
        if meta["dispatch_note"]
        else ""
    )

    html_body = f"""<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;color:#111827;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="background:#1d4ed8;color:#ffffff;padding:18px 22px;">
      <div style="font-size:12px;opacity:0.9;letter-spacing:0.04em;text-transform:uppercase;">Git Push Notification</div>
      <h2 style="margin:6px 0 0;font-size:18px;line-height:1.4;">
        {html.escape(meta['repo'])} — <code style="background:rgba(255,255,255,0.18);padding:2px 7px;border-radius:4px;">{html.escape(meta['ref_name'])}</code> 브랜치에 새 푸시가 반영되었습니다{force_badge}
      </h2>
    </div>

    <div style="padding:20px 22px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#6b7280;width:110px;">푸시 사용자</td>
          <td style="padding:6px 0;color:#111827;font-weight:600;">{html.escape(meta['pusher'])} <span style="color:#6b7280;font-weight:400;">({html.escape(meta['event_name'])})</span></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">최신 커밋</td>
          <td style="padding:6px 0;"><a href="{html.escape(meta['commit_url'])}" style="font-family:monospace;color:#1d4ed8;font-weight:600;text-decoration:none;">{html.escape(meta['short_sha'])}</a> — {html.escape(meta['headline'])}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">푸시 시각</td>
          <td style="padding:6px 0;color:#111827;">{html.escape(meta['timestamp_str'])}</td>
        </tr>
        {note_row}
      </table>

      <div style="margin:18px 0 10px;font-size:14px;font-weight:700;color:#111827;">커밋 내역 ({len(commits)}건)</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;">
        {''.join(commit_rows_html)}
      </ul>

      <div style="margin:18px 0 8px;font-size:14px;font-weight:700;color:#111827;">변경된 파일 ({len(files)}개)</div>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;line-height:1.5;overflow-x:auto;color:#1f2937;">{files_html}</pre>

      <div style="margin-top:20px;">
        <a href="{html.escape(meta['compare_url'])}" style="display:inline-block;margin-right:8px;margin-bottom:8px;padding:10px 16px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">변경사항(Diff) 보기</a>
        <a href="{html.escape(meta['run_url'])}" style="display:inline-block;margin-bottom:8px;padding:10px 16px;background:#f3f4f6;color:#111827;border:1px solid #d1d5db;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">GitHub Actions 실행 보기</a>
      </div>

      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">
        CI 검증 대상 푸시인 경우, Web E2E 및 Android 검증 완료 직후 결과 요약 이메일이 한 통 더 발송됩니다.
      </p>
    </div>
  </div>
</body>
</html>"""

    return subject, plain_body, html_body


def build_ci_summary_email(meta: dict[str, Any]) -> tuple[str, str, str]:
    repo_short = meta["repo"].split("/")[-1]
    web_raw = os.environ.get("WEB_VERIFY_RESULT", "unknown")
    android_raw = os.environ.get("ANDROID_VERIFY_RESULT", "unknown")

    _, verdict_label, header_bg, card_tint = compute_overall_ci_verdict(
        web_raw, android_raw
    )
    _, web_label, web_bg, web_fg = normalize_job_result(web_raw)
    _, and_label, and_bg, and_fg = normalize_job_result(android_raw)

    subject = (
        f"[{repo_short} CI {verdict_label}] {meta['ref_name']} 검증 요약 ({meta['short_sha']}) "
        f"— {meta['headline_short']}"
    )

    failure_excerpt = load_optional_failure_log("FAILURE_LOGS_DIR")

    # Plain-text version
    text_lines = [
        f"[{meta['repo']}] Push CI 검증 완료 요약 ({verdict_label})",
        "=" * 60,
        f"- 전체 결과 : {verdict_label}",
        f"- Web 검증  : {web_label} (Lint, Typecheck, Build & Playwright E2E)",
        f"- Android   : {and_label} (JVM Unit Tests, Debug APK & Firebase Test Lab)",
        f"- 브랜치    : {meta['ref_name']}",
        f"- 커밋      : {meta['short_sha']} — {meta['headline']}",
        f"- 푸시 사용자: {meta['pusher']}",
        f"- 완료 시각 : {meta['timestamp_str']}",
        f"- Actions   : {meta['run_url']}",
        f"- 커밋 링크 : {meta['commit_url']}",
    ]
    if failure_excerpt:
        text_lines.extend(
            [
                "",
                "실패 로그 요약 (마지막 로그 발췌):",
                "-" * 40,
                failure_excerpt,
            ]
        )
    plain_body = "\n".join(text_lines)

    failure_html_block = ""
    if failure_excerpt:
        failure_html_block = f"""
      <div style="margin:18px 0 8px;font-size:14px;font-weight:700;color:#991b1b;">실패 로그 발췌</div>
      <pre style="margin:0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;line-height:1.45;overflow-x:auto;color:#7f1d1d;white-space:pre-wrap;">{html.escape(failure_excerpt)}</pre>
"""

    html_body = f"""<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;color:#111827;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="background:{header_bg};color:#ffffff;padding:18px 22px;">
      <div style="font-size:12px;opacity:0.92;letter-spacing:0.04em;text-transform:uppercase;">Post-Push CI Result Summary</div>
      <h2 style="margin:6px 0 0;font-size:18px;line-height:1.4;">
        {html.escape(meta['repo'])} CI 결과: {html.escape(verdict_label)} (<code style="background:rgba(255,255,255,0.2);padding:2px 7px;border-radius:4px;">{html.escape(meta['short_sha'])}</code>)
      </h2>
    </div>

    <div style="padding:20px 22px;">
      <div style="padding:14px 16px;background:{card_tint};border:1px solid #e5e7eb;border-radius:10px;margin-bottom:18px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#111827;">Job별 실행 결과</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#1f2937;font-weight:500;">1. Web Lint, Typecheck, Build &amp; E2E</td>
            <td style="padding:6px 0;text-align:right;">
              <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:{web_bg};color:{web_fg};font-weight:700;font-size:12px;">{html.escape(web_label)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#1f2937;font-weight:500;">2. Android Unit Tests, Debug APK &amp; FTL Robo</td>
            <td style="padding:6px 0;text-align:right;">
              <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:{and_bg};color:{and_fg};font-weight:700;font-size:12px;">{html.escape(and_label)}</span>
            </td>
          </tr>
        </table>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#6b7280;width:110px;">브랜치</td>
          <td style="padding:6px 0;color:#111827;font-weight:600;">{html.escape(meta['ref_name'])}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">커밋</td>
          <td style="padding:6px 0;"><a href="{html.escape(meta['commit_url'])}" style="font-family:monospace;color:#1d4ed8;font-weight:600;text-decoration:none;">{html.escape(meta['short_sha'])}</a> — {html.escape(meta['headline'])}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">푸시 사용자</td>
          <td style="padding:6px 0;color:#111827;">{html.escape(meta['pusher'])}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">완료 시각</td>
          <td style="padding:6px 0;color:#111827;">{html.escape(meta['timestamp_str'])}</td>
        </tr>
      </table>

      {failure_html_block}

      <div style="margin-top:20px;">
        <a href="{html.escape(meta['run_url'])}" style="display:inline-block;margin-right:8px;margin-bottom:8px;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Actions 상세 로그 보기</a>
        <a href="{html.escape(meta['compare_url'])}" style="display:inline-block;margin-bottom:8px;padding:10px 16px;background:#f3f4f6;color:#111827;border:1px solid #d1d5db;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">커밋 변경사항 보기</a>
      </div>
    </div>
  </div>
</body>
</html>"""

    return subject, plain_body, html_body


def append_step_summary(markdown_text: str) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY", "").strip()
    if not summary_path:
        return
    try:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(markdown_text + "\n")
    except Exception as exc:
        print(f"::warning::Could not write GITHUB_STEP_SUMMARY: {exc}")


def send_via_gmail_smtp(
    gmail_user: str,
    gmail_app_password: str,
    recipients: list[str],
    subject: str,
    plain_body: str,
    html_body: str,
) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("Ainventory Git Bot", gmail_user))
    msg["To"] = ", ".join(recipients)
    msg.set_content(plain_body)
    msg.add_alternative(html_body, subtype="html")

    # Google displays 16-char App Passwords grouped by spaces ("abcd efgh ijkl mnop").
    # Strip whitespace safely so copied values work out-of-the-box.
    normalized_password = "".join(gmail_app_password.split())
    ssl_ctx = ssl.create_default_context()

    try:
        with smtplib.SMTP_SSL(
            SMTP_HOST, SMTP_SSL_PORT, timeout=SMTP_TIMEOUT_SECONDS, context=ssl_ctx
        ) as smtp:
            smtp.login(gmail_user, normalized_password)
            smtp.send_message(msg)
            return
    except smtplib.SMTPAuthenticationError:
        raise
    except (socket.timeout, OSError) as ssl_err:
        print(
            f"::warning::Port {SMTP_SSL_PORT} SSL connection failed ({ssl_err}); retrying via STARTTLS port {SMTP_STARTTLS_PORT}..."
        )

    with smtplib.SMTP(
        SMTP_HOST, SMTP_STARTTLS_PORT, timeout=SMTP_TIMEOUT_SECONDS
    ) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl_ctx)
        smtp.ehlo()
        smtp.login(gmail_user, normalized_password)
        smtp.send_message(msg)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Send Gmail SMTP push / CI summary notifications for GitHub Actions."
    )
    parser.add_argument(
        "--mode",
        choices=("push_immediate", "ci_summary"),
        default=os.environ.get("EMAIL_MODE", "push_immediate").strip()
        or "push_immediate",
        help="Notification mode (default: env EMAIL_MODE or push_immediate)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Render subject + email bodies without connecting to Gmail SMTP.",
    )
    args = parser.parse_args()

    event = load_event_payload()
    meta = collect_push_metadata(event)

    if args.mode == "ci_summary":
        subject, plain_body, html_body = build_ci_summary_email(meta)
    else:
        subject, plain_body, html_body = build_push_immediate_email(meta)

    if args.dry_run:
        print(f"[DRY-RUN] Mode    : {args.mode}")
        print(f"[DRY-RUN] Subject : {subject}")
        print("-" * 60)
        print(plain_body)
        print("-" * 60)
        print(f"[DRY-RUN] HTML length: {len(html_body)} chars")
        return 0

    gmail_user = os.environ.get("GMAIL_USER", "").strip()
    gmail_app_password = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    raw_to = os.environ.get("NOTIFY_TO_EMAIL", "").strip()

    if not gmail_user and not gmail_app_password:
        print(
            "::notice::Gmail push notification skipped cleanly because repository secrets "
            "GMAIL_USER and GMAIL_APP_PASSWORD are not configured yet. "
            "Register them in Settings -> Secrets and variables -> Actions (or run ./scripts/setup-gmail-push-notify.sh)."
        )
        append_step_summary(
            "## Push Email Notification (Pending Gmail Secret Setup)\n\n"
            f"- **Mode:** `{args.mode}`\n"
            f"- **Prepared Subject:** `{subject}`\n"
            "- **Delivery Status:** Skipped cleanly (`GMAIL_USER` / `GMAIL_APP_PASSWORD` 미등록)\n\n"
            "### 활성화 방법 (1회 설정)\n"
            "1. Google 계정 → **보안** → **2단계 인증** 활성화 후 **앱 비밀번호(App Passwords)** 에서 16자리 비밀번호 생성\n"
            "2. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret** 에 아래 2개 등록:\n"
            "   - `GMAIL_USER`: 본인 Gmail 주소 (예: `example@gmail.com`)\n"
            "   - `GMAIL_APP_PASSWORD`: 발급받은 16자리 앱 비밀번호\n"
            "   - *(선택)* `NOTIFY_TO_EMAIL`: 다른 이메일로 받고 싶을 때만 등록 (미등록 시 `GMAIL_USER` 본인에게 발송)\n"
            "3. 또는 로컬 터미널에서 `./scripts/setup-gmail-push-notify.sh` 실행"
        )
        return 0

    if not gmail_user or not gmail_app_password:
        missing_name = "GMAIL_USER" if not gmail_user else "GMAIL_APP_PASSWORD"
        print(
            f"::error::Incomplete Gmail SMTP configuration: secret '{missing_name}' is missing. "
            "Both GMAIL_USER and GMAIL_APP_PASSWORD must be registered in GitHub Actions Secrets."
        )
        return 1

    recipients = parse_recipients(raw_to, gmail_user)
    if not recipients:
        print(
            "::error::Invalid GMAIL_USER / NOTIFY_TO_EMAIL format (expected a valid email address)."
        )
        return 1

    masked_sender = mask_email(gmail_user)
    masked_recipients = ", ".join(mask_email(r) for r in recipients)

    try:
        send_via_gmail_smtp(
            gmail_user=gmail_user,
            gmail_app_password=gmail_app_password,
            recipients=recipients,
            subject=subject,
            plain_body=plain_body,
            html_body=html_body,
        )
    except smtplib.SMTPAuthenticationError as auth_err:
        print(
            "::error::Gmail SMTP authentication failed (535). "
            "일반 Google 로그인 비밀번호가 아닌 Google 2단계 인증 '앱 비밀번호(16자리)'를 "
            f"GMAIL_APP_PASSWORD 시크릿에 등록했는지 확인해 주세요. (코드: {auth_err.smtp_code})"
        )
        return 1
    except Exception as exc:
        print(f"::error::Failed to send Gmail notification: {exc}")
        return 1

    print(
        f"[OK] Sent {args.mode} email from {masked_sender} to {masked_recipients}: {subject}"
    )
    append_step_summary(
        "## Push Email Notification Sent\n\n"
        f"- **Mode:** `{args.mode}`\n"
        f"- **Subject:** `{subject}`\n"
        f"- **Sender:** `{masked_sender}`\n"
        f"- **Recipients:** `{masked_recipients}`\n"
        f"- **Timestamp:** `{meta['timestamp_str']}`"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
