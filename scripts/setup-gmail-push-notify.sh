#!/usr/bin/env bash
# ==============================================================================
# setup-gmail-push-notify.sh
#
# Interactive helper to register Gmail SMTP secrets (`GMAIL_USER`,
# `GMAIL_APP_PASSWORD`, and optional `NOTIFY_TO_EMAIL`) in GitHub Actions Secrets
# via `gh secret set` (piped over stdin — never exposed in shell history or `ps`).
# ==============================================================================

set -euo pipefail

DRY_RUN=false
TRIGGER_TEST=false
CLI_REPO=""

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-gmail-push-notify.sh [OPTIONS]

Registers Gmail SMTP repository secrets for GitHub Actions push & CI summary
email notifications (`push-email-notify.yml` + `ci-verify-ftl.yml`).

Options:
  -r, --repo <OWNER/REPO>   Target GitHub repository (default: auto-detected from git remote)
  -t, --test                Trigger `push-email-notify.yml` right after registering secrets
  -n, --dry-run             Preview actions without modifying GitHub Secrets
  -h, --help                Show this help message
EOF
}

while (( $# > 0 )); do
  case "$1" in
    -r|--repo)
      CLI_REPO="${2:-}"
      shift 2
      ;;
    -t|--test)
      TRIGGER_TEST=true
      shift
      ;;
    -n|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[ERROR] Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

detect_repo() {
  if [[ -n "${CLI_REPO}" ]]; then
    printf '%s\n' "${CLI_REPO}"
    return 0
  fi
  local url
  url="$(git config --get remote.origin.url 2>/dev/null || true)"
  url="${url%/}"
  url="${url%.git}"
  if [[ "${url}" =~ github\.com[:/]([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

if ! command -v gh >/dev/null 2>&1; then
  printf '[ERROR] GitHub CLI (`gh`)가 설치되어 있지 않습니다. https://cli.github.com/ 또는 GitHub 웹 설정 화면(Settings -> Secrets and variables -> Actions)을 이용해 주세요.\n' >&2
  exit 1
fi

REPO="$(detect_repo || true)"
if [[ -z "${REPO}" ]]; then
  printf '[ERROR] GitHub 저장소(owner/repo)를 자동 감지하지 못했습니다. --repo OWNER/REPO 옵션을 지정해 주세요.\n' >&2
  exit 1
fi

printf '==============================================================\n'
printf ' Ainventory Git Push Gmail 알림 시크릿 설정 (%s)\n' "${REPO}"
printf '==============================================================\n'
printf '사전 준비: Google 계정 -> 보안 -> 2단계 인증 -> 앱 비밀번호(16자리) 발급\n'
printf '  바로가기: https://myaccount.google.com/apppasswords\n\n'

read -r -p "1) 발신 Gmail 주소 (GMAIL_USER, 예: example@gmail.com): " INPUT_GMAIL_USER
INPUT_GMAIL_USER="$(printf '%s' "${INPUT_GMAIL_USER}" | tr -d '[:space:]')"
if [[ -z "${INPUT_GMAIL_USER}" || "${INPUT_GMAIL_USER}" != *@* ]]; then
  printf '[ERROR] 올바른 이메일 주소를 입력해 주세요.\n' >&2
  exit 1
fi

read -r -s -p "2) Google 16자리 앱 비밀번호 (GMAIL_APP_PASSWORD, 화면에 표시되지 않음): " INPUT_APP_PASSWORD
printf '\n'
# Strip optional spaces from "abcd efgh ijkl mnop" format
CLEAN_APP_PASSWORD="$(printf '%s' "${INPUT_APP_PASSWORD}" | tr -d '[:space:]')"
if [[ -z "${CLEAN_APP_PASSWORD}" ]]; then
  printf '[ERROR] 앱 비밀번호가 비어 있습니다.\n' >&2
  exit 1
fi

read -r -p "3) 수신 이메일 주소 (NOTIFY_TO_EMAIL, 엔터 시 본인 [${INPUT_GMAIL_USER}] 에게 발송): " INPUT_NOTIFY_TO
INPUT_NOTIFY_TO="$(printf '%s' "${INPUT_NOTIFY_TO}" | tr -d '[:space:]')"

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '\n[DRY-RUN] gh secret set GMAIL_USER -R %q (value: %s)\n' "${REPO}" "${INPUT_GMAIL_USER}"
  printf '[DRY-RUN] gh secret set GMAIL_APP_PASSWORD -R %q (length: %d chars)\n' "${REPO}" "${#CLEAN_APP_PASSWORD}"
  if [[ -n "${INPUT_NOTIFY_TO}" ]]; then
    printf '[DRY-RUN] gh secret set NOTIFY_TO_EMAIL -R %q (value: %s)\n' "${REPO}" "${INPUT_NOTIFY_TO}"
  fi
  exit 0
fi

printf '\n==> GitHub Repository Secrets 등록 중 (%s)...\n' "${REPO}"
printf '%s' "${INPUT_GMAIL_USER}" | gh secret set GMAIL_USER -R "${REPO}"
printf '%s' "${CLEAN_APP_PASSWORD}" | gh secret set GMAIL_APP_PASSWORD -R "${REPO}"
if [[ -n "${INPUT_NOTIFY_TO}" ]]; then
  printf '%s' "${INPUT_NOTIFY_TO}" | gh secret set NOTIFY_TO_EMAIL -R "${REPO}"
fi

printf '[OK] 시크릿 등록이 완료되었습니다!\n'

if [[ "${TRIGGER_TEST}" == "true" ]]; then
  printf '\n==> 테스트 이메일 워크플로우(push-email-notify.yml) 실행 요청 중...\n'
  gh workflow run push-email-notify.yml -R "${REPO}" -f test_note="setup-gmail-push-notify.sh 초기 설정 테스트"
  printf '[OK] 실행이 시작되었습니다: https://github.com/%s/actions\n' "${REPO}"
else
  printf '\n테스트 발송을 원하시면 아래 명령어를 실행하거나 다음 git push 시 자동 발송됩니다:\n'
  printf '  gh workflow run push-email-notify.yml -R %s\n' "${REPO}"
fi
