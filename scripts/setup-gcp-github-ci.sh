#!/usr/bin/env bash
# ==============================================================================
# setup-gcp-github-ci.sh
#
# Keyless & idempotent provisioning script for Ainventory GitHub Actions CI +
# Firebase Test Lab (Android Robo) integration.
#
# Security guarantees:
#   - 100% keyless Workload Identity Federation (OIDC) — zero static JSON
#     credentials are ever generated or stored.
#   - Strict repository-bound OIDC attribute condition & principalSet binding
#     (`assertion.repository == '<owner>/<repo>'`).
#   - Least-privilege Service Account roles (`cloudtestservice.testAdmin`,
#     `serviceusage.serviceUsageConsumer`) + bucket-scoped `storage.objectAdmin`.
#   - Dedicated GCS results bucket with uniform bucket-level access and a
#     14-day automatic object deletion lifecycle policy.
# ==============================================================================

set -euo pipefail

DRY_RUN=false
CLI_GCP_PROJECT_ID=""
CLI_GITHUB_REPO=""
CLI_FTL_RESULTS_BUCKET=""
CLI_BUCKET_LOCATION=""
CLI_SA_NAME=""
CLI_WIF_POOL_NAME=""
CLI_WIF_PROVIDER_NAME=""
CLI_FTL_DEVICE_MODEL=""
CLI_FTL_OS_VERSION=""

TMP_FILES=()
cleanup() {
  local rc=$?
  local f
  if (( ${#TMP_FILES[@]} > 0 )); then
    for f in "${TMP_FILES[@]}"; do
      if [[ -n "${f}" && -e "${f}" ]]; then
        rm -f "${f}"
      fi
    done
  fi
  return "${rc}"
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-gcp-github-ci.sh [OPTIONS]

Idempotently provisions Google Cloud Workload Identity Federation (keyless OIDC),
a least-privilege Service Account, a 14-day auto-deleting GCS bucket for Firebase
Test Lab results, physical Android device discovery, and GitHub Actions repository
variables.

Options:
  -p, --project <PROJECT_ID>        GCP project ID (env: GCP_PROJECT_ID, or gcloud config)
  -r, --repo <OWNER/REPO>           GitHub repository in owner/repo format (env: GITHUB_REPO, or gh/git remote)
  -b, --bucket <BUCKET_NAME>        GCS bucket for FTL results (env: FTL_RESULTS_BUCKET;
                                    default: <GCP_PROJECT_ID>-ainventory-ftl-logs)
  -l, --location <REGION>           GCS bucket location (env: GCP_BUCKET_LOCATION; default: us-central1)
      --service-account <NAME>      Service account short name (env: GCP_SA_NAME; default: github-ftl-ci)
      --pool <POOL_NAME>            Workload Identity Pool ID (env: GCP_WIF_POOL_NAME; default: github-actions-pool)
      --provider <PROVIDER_NAME>    OIDC Provider ID (env: GCP_WIF_PROVIDER_NAME; default: github-oidc)
      --device-model <MODEL_ID>     Override FTL physical device model (env: FTL_DEVICE_MODEL)
      --os-version <API_LEVEL>      Override FTL Android OS version (env: FTL_OS_VERSION)
  -n, --dry-run                     Print all planned commands without mutating GCP or GitHub
  -h, --help                        Show this help message and exit

Environment Variables:
  GCP_PROJECT_ID                    Target Google Cloud Project ID
  GITHUB_REPO                       Target GitHub repository (owner/repo)
  FTL_RESULTS_BUCKET                Dedicated GCS bucket name (without gs:// prefix)
  FTL_DEVICE_MODEL                  Optional Android model ID override (default: auto-discovered physical Pixel/shiba)
  FTL_OS_VERSION                    Optional Android API level override (default: auto-discovered 34+)

Examples:
  # Preview all actions without modifying cloud or GitHub state:
  GCP_PROJECT_ID=demo-proj GITHUB_REPO=RaymandooMoon/Ainventory ./scripts/setup-gcp-github-ci.sh --dry-run

  # Run live idempotent provisioning using current gcloud & gh context:
  ./scripts/setup-gcp-github-ci.sh
EOF
}

log_info() {
  printf '[INFO] %s\n' "$*"
}

log_step() {
  printf '\n==> %s\n' "$*"
}

log_err() {
  printf '[ERROR] %s\n' "$*" >&2
}

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[DRY-RUN]'
    local arg
    for arg in "$@"; do
      printf ' %q' "${arg}"
    done
    printf '\n'
  else
    "$@"
  fi
}

parse_github_repo_from_url() {
  local url="$1"
  local re='github\.com[:/]([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$'
  url="${url%/}"
  url="${url%.git}"
  if [[ "${url}" =~ ${re} ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

# ------------------------------------------------------------------------------
# Parse CLI Arguments
# ------------------------------------------------------------------------------
while (( $# > 0 )); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -n|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -p|--project)
      CLI_GCP_PROJECT_ID="${2:?Missing value for $1}"
      shift 2
      ;;
    --project=*)
      CLI_GCP_PROJECT_ID="${1#*=}"
      shift
      ;;
    -r|--repo)
      CLI_GITHUB_REPO="${2:?Missing value for $1}"
      shift 2
      ;;
    --repo=*)
      CLI_GITHUB_REPO="${1#*=}"
      shift
      ;;
    -b|--bucket)
      CLI_FTL_RESULTS_BUCKET="${2:?Missing value for $1}"
      shift 2
      ;;
    --bucket=*)
      CLI_FTL_RESULTS_BUCKET="${1#*=}"
      shift
      ;;
    -l|--location)
      CLI_BUCKET_LOCATION="${2:?Missing value for $1}"
      shift 2
      ;;
    --location=*)
      CLI_BUCKET_LOCATION="${1#*=}"
      shift
      ;;
    --service-account)
      CLI_SA_NAME="${2:?Missing value for $1}"
      shift 2
      ;;
    --service-account=*)
      CLI_SA_NAME="${1#*=}"
      shift
      ;;
    --pool)
      CLI_WIF_POOL_NAME="${2:?Missing value for $1}"
      shift 2
      ;;
    --pool=*)
      CLI_WIF_POOL_NAME="${1#*=}"
      shift
      ;;
    --provider)
      CLI_WIF_PROVIDER_NAME="${2:?Missing value for $1}"
      shift 2
      ;;
    --provider=*)
      CLI_WIF_PROVIDER_NAME="${1#*=}"
      shift
      ;;
    --device-model)
      CLI_FTL_DEVICE_MODEL="${2:?Missing value for $1}"
      shift 2
      ;;
    --device-model=*)
      CLI_FTL_DEVICE_MODEL="${1#*=}"
      shift
      ;;
    --os-version)
      CLI_FTL_OS_VERSION="${2:?Missing value for $1}"
      shift 2
      ;;
    --os-version=*)
      CLI_FTL_OS_VERSION="${1#*=}"
      shift
      ;;
    *)
      log_err "Unknown argument: $1"
      usage >&2
      exit 1
      ;;
  esac
done

# ------------------------------------------------------------------------------
# Validate CLI Prerequisites (Live Mode)
# ------------------------------------------------------------------------------
if [[ "${DRY_RUN}" == "false" ]]; then
  for required_bin in gcloud gh python3; do
    if ! command -v "${required_bin}" >/dev/null 2>&1; then
      log_err "Required command '${required_bin}' is not installed or not on PATH."
      exit 1
    fi
  done
fi

# ------------------------------------------------------------------------------
# 1. Resolve GCP_PROJECT_ID & GITHUB_REPO
# ------------------------------------------------------------------------------
log_step "1/7 Resolving GCP project and GitHub repository"

GCP_PROJECT_ID="${CLI_GCP_PROJECT_ID:-${GCP_PROJECT_ID:-}}"
if [[ -z "${GCP_PROJECT_ID}" ]] && command -v gcloud >/dev/null 2>&1; then
  gcloud_proj="$(gcloud config get-value project 2>/dev/null || true)"
  if [[ -n "${gcloud_proj}" && "${gcloud_proj}" != "(unset)" ]]; then
    GCP_PROJECT_ID="${gcloud_proj}"
  fi
fi

if [[ -z "${GCP_PROJECT_ID}" ]]; then
  log_err "Could not determine GCP_PROJECT_ID. Pass --project <ID> or set GCP_PROJECT_ID."
  exit 1
fi

GITHUB_REPO="${CLI_GITHUB_REPO:-${GITHUB_REPO:-}}"
if [[ -z "${GITHUB_REPO}" ]] && command -v gh >/dev/null 2>&1 && [[ "${DRY_RUN}" == "false" ]]; then
  GITHUB_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi
if [[ -z "${GITHUB_REPO}" ]] && command -v git >/dev/null 2>&1; then
  origin_url="$(git config --get remote.origin.url 2>/dev/null || true)"
  if [[ -n "${origin_url}" ]]; then
    GITHUB_REPO="$(parse_github_repo_from_url "${origin_url}" || true)"
  fi
fi
if [[ -z "${GITHUB_REPO}" ]] && command -v gh >/dev/null 2>&1; then
  GITHUB_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi

REPO_RE='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
if [[ -z "${GITHUB_REPO}" || ! "${GITHUB_REPO}" =~ ${REPO_RE} ]]; then
  log_err "Could not resolve valid GITHUB_REPO (expected owner/repo). Pass --repo <owner/repo> or set GITHUB_REPO."
  exit 1
fi

GCP_SA_NAME="${CLI_SA_NAME:-${GCP_SA_NAME:-github-ftl-ci}}"
SA_EMAIL="${GCP_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

FTL_RESULTS_BUCKET="${CLI_FTL_RESULTS_BUCKET:-${FTL_RESULTS_BUCKET:-${GCP_PROJECT_ID}-ainventory-ftl-logs}}"
FTL_RESULTS_BUCKET="${FTL_RESULTS_BUCKET#gs://}"
FTL_RESULTS_BUCKET="${FTL_RESULTS_BUCKET%/}"

GCP_BUCKET_LOCATION="${CLI_BUCKET_LOCATION:-${GCP_BUCKET_LOCATION:-us-central1}}"
GCP_WIF_POOL_NAME="${CLI_WIF_POOL_NAME:-${GCP_WIF_POOL_NAME:-github-actions-pool}}"
GCP_WIF_PROVIDER_NAME="${CLI_WIF_PROVIDER_NAME:-${GCP_WIF_PROVIDER_NAME:-github-oidc}}"

log_info "Mode:                $([[ "${DRY_RUN}" == "true" ]] && echo "DRY-RUN (no changes applied)" || echo "LIVE")"
log_info "GCP_PROJECT_ID:      ${GCP_PROJECT_ID}"
log_info "GITHUB_REPO:         ${GITHUB_REPO}"
log_info "Service Account:     ${SA_EMAIL}"
log_info "FTL Results Bucket:  gs://${FTL_RESULTS_BUCKET} (${GCP_BUCKET_LOCATION})"
log_info "WIF Pool / Provider: ${GCP_WIF_POOL_NAME} / ${GCP_WIF_PROVIDER_NAME}"

# ------------------------------------------------------------------------------
# 2. Enable Required GCP APIs (Idempotent)
# ------------------------------------------------------------------------------
log_step "2/7 Enabling required Google Cloud APIs"

REQUIRED_APIS=(
  "testing.googleapis.com"
  "toolresults.googleapis.com"
  "iam.googleapis.com"
  "iamcredentials.googleapis.com"
  "sts.googleapis.com"
  "storage.googleapis.com"
  "cloudresourcemanager.googleapis.com"
)

run_cmd gcloud services enable "${REQUIRED_APIS[@]}" --project="${GCP_PROJECT_ID}"

# ------------------------------------------------------------------------------
# 3. Least-Privilege Service Account (Keyless Only)
# ------------------------------------------------------------------------------
log_step "3/7 Provisioning least-privilege Service Account (${SA_EMAIL})"

if [[ "${DRY_RUN}" == "true" ]]; then
  log_info "[DRY-RUN] Check existence: gcloud iam service-accounts describe ${SA_EMAIL} --project=${GCP_PROJECT_ID}"
  run_cmd gcloud iam service-accounts create "${GCP_SA_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --display-name="GitHub Actions Firebase Test Lab CI" \
    --description="Keyless OIDC runner for Ainventory Firebase Test Lab Robo tests"
else
  if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
    log_info "Service Account ${SA_EMAIL} already exists (skipping creation)."
  else
    log_info "Creating Service Account ${SA_EMAIL}..."
    gcloud iam service-accounts create "${GCP_SA_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --display-name="GitHub Actions Firebase Test Lab CI" \
      --description="Keyless OIDC runner for Ainventory Firebase Test Lab Robo tests"
    # Wait briefly for IAM eventual consistency on newly created service accounts.
    for _ in 1 2 3 4 5; do
      if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  fi
fi

SA_PROJECT_ROLES=(
  "roles/cloudtestservice.testAdmin"
  "roles/serviceusage.serviceUsageConsumer"
)

for role in "${SA_PROJECT_ROLES[@]}"; do
  if [[ "${DRY_RUN}" == "true" ]]; then
    run_cmd gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="${role}" \
      --condition=None \
      --quiet
  else
    log_info "Ensuring project role ${role} on ${SA_EMAIL}..."
    gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="${role}" \
      --condition=None \
      --quiet >/dev/null
  fi
done

# ------------------------------------------------------------------------------
# 4. Dedicated 14-Day Auto-Delete GCS Bucket & Bucket-Scoped IAM
# ------------------------------------------------------------------------------
log_step "4/7 Provisioning dedicated 14-day auto-delete GCS bucket (gs://${FTL_RESULTS_BUCKET})"

if [[ "${DRY_RUN}" == "true" ]]; then
  log_info "[DRY-RUN] Check existence: gcloud storage buckets describe gs://${FTL_RESULTS_BUCKET} --project=${GCP_PROJECT_ID}"
  run_cmd gcloud storage buckets create "gs://${FTL_RESULTS_BUCKET}" \
    --project="${GCP_PROJECT_ID}" \
    --location="${GCP_BUCKET_LOCATION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
else
  if gcloud storage buckets describe "gs://${FTL_RESULTS_BUCKET}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
    log_info "GCS bucket gs://${FTL_RESULTS_BUCKET} already exists (ensuring uniform access)."
    gcloud storage buckets update "gs://${FTL_RESULTS_BUCKET}" \
      --project="${GCP_PROJECT_ID}" \
      --uniform-bucket-level-access >/dev/null
  else
    log_info "Creating GCS bucket gs://${FTL_RESULTS_BUCKET}..."
    gcloud storage buckets create "gs://${FTL_RESULTS_BUCKET}" \
      --project="${GCP_PROJECT_ID}" \
      --location="${GCP_BUCKET_LOCATION}" \
      --uniform-bucket-level-access \
      --public-access-prevention
  fi
fi

LIFECYCLE_FILE="$(mktemp "${TMPDIR:-/tmp}/ftl-gcs-lifecycle.XXXXXX.json")"
TMP_FILES+=("${LIFECYCLE_FILE}")
cat > "${LIFECYCLE_FILE}" <<'EOF'
{
  "rule": [
    {
      "action": {
        "type": "Delete"
      },
      "condition": {
        "age": 14
      }
    }
  ]
}
EOF

run_cmd gcloud storage buckets update "gs://${FTL_RESULTS_BUCKET}" \
  --project="${GCP_PROJECT_ID}" \
  --lifecycle-file="${LIFECYCLE_FILE}"

if [[ "${DRY_RUN}" == "true" ]]; then
  run_cmd gcloud storage buckets add-iam-policy-binding "gs://${FTL_RESULTS_BUCKET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --quiet
else
  log_info "Binding bucket-scoped roles/storage.objectAdmin on gs://${FTL_RESULTS_BUCKET} to ${SA_EMAIL}..."
  gcloud storage buckets add-iam-policy-binding "gs://${FTL_RESULTS_BUCKET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --quiet >/dev/null
fi

# ------------------------------------------------------------------------------
# 5. Repo-Bound OIDC Workload Identity Pool & Provider
# ------------------------------------------------------------------------------
log_step "5/7 Configuring repo-bound Workload Identity Pool & OIDC Provider"

OIDC_ISSUER_URI="https://token.actions.githubusercontent.com"
OIDC_ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner"
OIDC_ATTRIBUTE_CONDITION="assertion.repository == '${GITHUB_REPO}'"

if [[ "${DRY_RUN}" == "true" ]]; then
  run_cmd gcloud iam workload-identity-pools create "${GCP_WIF_POOL_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions OIDC Pool" \
    --description="Keyless OIDC Workload Identity Pool for GitHub Actions CI"

  WORKLOAD_IDENTITY_POOL_ID="projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/${GCP_WIF_POOL_NAME}"

  run_cmd gcloud iam workload-identity-pools providers create-oidc "${GCP_WIF_PROVIDER_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${GCP_WIF_POOL_NAME}" \
    --display-name="GitHub Actions OIDC Provider" \
    --issuer-uri="${OIDC_ISSUER_URI}" \
    --attribute-mapping="${OIDC_ATTRIBUTE_MAPPING}" \
    --attribute-condition="${OIDC_ATTRIBUTE_CONDITION}"

  GCP_WORKLOAD_IDENTITY_PROVIDER="${WORKLOAD_IDENTITY_POOL_ID}/providers/${GCP_WIF_PROVIDER_NAME}"

  run_cmd gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
    --project="${GCP_PROJECT_ID}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_REPO}" \
    --condition=None \
    --quiet
else
  pool_state="$(
    gcloud iam workload-identity-pools describe "${GCP_WIF_POOL_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --format="value(state)" 2>/dev/null || true
  )"
  if [[ -z "${pool_state}" ]]; then
    log_info "Creating Workload Identity Pool '${GCP_WIF_POOL_NAME}'..."
    gcloud iam workload-identity-pools create "${GCP_WIF_POOL_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --display-name="GitHub Actions OIDC Pool" \
      --description="Keyless OIDC Workload Identity Pool for GitHub Actions CI"
  elif [[ "${pool_state}" == "DELETED" ]]; then
    log_info "Restoring soft-deleted Workload Identity Pool '${GCP_WIF_POOL_NAME}'..."
    gcloud iam workload-identity-pools undelete "${GCP_WIF_POOL_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global"
  else
    log_info "Workload Identity Pool '${GCP_WIF_POOL_NAME}' is ${pool_state} (reusing)."
  fi

  WORKLOAD_IDENTITY_POOL_ID="$(
    gcloud iam workload-identity-pools describe "${GCP_WIF_POOL_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --format="value(name)"
  )"

  provider_state="$(
    gcloud iam workload-identity-pools providers describe "${GCP_WIF_PROVIDER_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --workload-identity-pool="${GCP_WIF_POOL_NAME}" \
      --format="value(state)" 2>/dev/null || true
  )"
  if [[ -z "${provider_state}" ]]; then
    log_info "Creating OIDC Provider '${GCP_WIF_PROVIDER_NAME}' restricted to '${GITHUB_REPO}'..."
    gcloud iam workload-identity-pools providers create-oidc "${GCP_WIF_PROVIDER_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --workload-identity-pool="${GCP_WIF_POOL_NAME}" \
      --display-name="GitHub Actions OIDC Provider" \
      --issuer-uri="${OIDC_ISSUER_URI}" \
      --attribute-mapping="${OIDC_ATTRIBUTE_MAPPING}" \
      --attribute-condition="${OIDC_ATTRIBUTE_CONDITION}"
  else
    if [[ "${provider_state}" == "DELETED" ]]; then
      log_info "Restoring soft-deleted OIDC Provider '${GCP_WIF_PROVIDER_NAME}'..."
      gcloud iam workload-identity-pools providers undelete "${GCP_WIF_PROVIDER_NAME}" \
        --project="${GCP_PROJECT_ID}" \
        --location="global" \
        --workload-identity-pool="${GCP_WIF_POOL_NAME}"
    fi
    log_info "Updating OIDC Provider '${GCP_WIF_PROVIDER_NAME}' attribute condition idempotently..."
    gcloud iam workload-identity-pools providers update-oidc "${GCP_WIF_PROVIDER_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --workload-identity-pool="${GCP_WIF_POOL_NAME}" \
      --issuer-uri="${OIDC_ISSUER_URI}" \
      --attribute-mapping="${OIDC_ATTRIBUTE_MAPPING}" \
      --attribute-condition="${OIDC_ATTRIBUTE_CONDITION}" >/dev/null
  fi

  GCP_WORKLOAD_IDENTITY_PROVIDER="$(
    gcloud iam workload-identity-pools providers describe "${GCP_WIF_PROVIDER_NAME}" \
      --project="${GCP_PROJECT_ID}" \
      --location="global" \
      --workload-identity-pool="${GCP_WIF_POOL_NAME}" \
      --format="value(name)"
  )"

  log_info "Binding roles/iam.workloadIdentityUser strictly for repository '${GITHUB_REPO}'..."
  gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
    --project="${GCP_PROJECT_ID}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_REPO}" \
    --condition=None \
    --quiet >/dev/null
fi

# ------------------------------------------------------------------------------
# 6. Physical Android Device Auto-Discovery
# ------------------------------------------------------------------------------
log_step "6/7 Discovering Firebase Test Lab PHYSICAL Android device model & OS version"

FTL_DEVICE_MODEL="${CLI_FTL_DEVICE_MODEL:-${FTL_DEVICE_MODEL:-}}"
FTL_OS_VERSION="${CLI_FTL_OS_VERSION:-${FTL_OS_VERSION:-}}"

select_physical_android_device() {
  python3 -c '
import json, sys

FALLBACK = ("shiba", "34")
raw = sys.stdin.read().strip()
if not raw:
    print(f"{FALLBACK[0]} {FALLBACK[1]}")
    sys.exit(0)

try:
    models = json.loads(raw)
except Exception:
    print(f"{FALLBACK[0]} {FALLBACK[1]}")
    sys.exit(0)

candidates = []
for m in models if isinstance(models, list) else []:
    if not isinstance(m, dict):
        continue
    if str(m.get("form", "")).upper() != "PHYSICAL":
        continue
    tags = [str(t).lower() for t in (m.get("tags") or [])]
    if any("deprecated" in t for t in tags):
        continue
    versions = [int(v) for v in (m.get("supportedVersionIds") or []) if str(v).isdigit()]
    if not versions:
        continue
    model_id = str(m.get("id") or "").strip()
    if not model_id:
        continue
    max_os = max(versions)
    name_lc = str(m.get("name") or "").lower()
    mfg_lc = str(m.get("manufacturer") or m.get("brand") or "").lower()
    form_factor = str(m.get("formFactor") or "PHONE").upper()

    is_phone = 1 if form_factor == "PHONE" else 0
    has_os_34_plus = 1 if max_os >= 34 else 0
    is_shiba = 1 if model_id == "shiba" else 0
    is_pixel = 1 if ("pixel" in name_lc or mfg_lc == "google") else 0
    is_default = 1 if "default" in tags else 0

    rank = (is_phone, has_os_34_plus, is_shiba, is_pixel, is_default, max_os)
    candidates.append((rank, model_id, str(max_os)))

if not candidates:
    print(f"{FALLBACK[0]} {FALLBACK[1]}")
else:
    candidates.sort(key=lambda item: item[0], reverse=True)
    _, chosen_model, chosen_os = candidates[0]
    print(f"{chosen_model} {chosen_os}")
'
}

if [[ -n "${FTL_DEVICE_MODEL}" && -n "${FTL_OS_VERSION}" ]]; then
  log_info "Using explicitly configured FTL device: model=${FTL_DEVICE_MODEL}, version=${FTL_OS_VERSION}"
elif [[ "${DRY_RUN}" == "true" ]]; then
  log_info "[DRY-RUN] Querying catalog: gcloud firebase test android models list --project=${GCP_PROJECT_ID} --format=json"
  FTL_DEVICE_MODEL="${FTL_DEVICE_MODEL:-shiba}"
  FTL_OS_VERSION="${FTL_OS_VERSION:-34}"
  log_info "[DRY-RUN] Fallback physical device selected: model=${FTL_DEVICE_MODEL}, version=${FTL_OS_VERSION}"
else
  models_json="$(gcloud firebase test android models list --project="${GCP_PROJECT_ID}" --format=json 2>/dev/null || true)"
  if [[ -n "${models_json}" ]] && command -v python3 >/dev/null 2>&1; then
    read -r discovered_model discovered_os < <(printf '%s' "${models_json}" | select_physical_android_device)
    FTL_DEVICE_MODEL="${FTL_DEVICE_MODEL:-${discovered_model:-shiba}}"
    FTL_OS_VERSION="${FTL_OS_VERSION:-${discovered_os:-34}}"
  else
    log_info "Catalog unavailable offline; falling back to physical Pixel defaults (shiba / 34)."
    FTL_DEVICE_MODEL="${FTL_DEVICE_MODEL:-shiba}"
    FTL_OS_VERSION="${FTL_OS_VERSION:-34}"
  fi
  log_info "Selected PHYSICAL Android target: model=${FTL_DEVICE_MODEL}, version=${FTL_OS_VERSION}"
fi

# ------------------------------------------------------------------------------
# 7. Idempotent GitHub Variables Batch Registration
# ------------------------------------------------------------------------------
log_step "7/7 Registering GitHub Actions repository variables on ${GITHUB_REPO}"

GH_VARIABLES=(
  "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
  "GCP_WORKLOAD_IDENTITY_PROVIDER=${GCP_WORKLOAD_IDENTITY_PROVIDER}"
  "GCP_SERVICE_ACCOUNT=${SA_EMAIL}"
  "FTL_RESULTS_BUCKET=${FTL_RESULTS_BUCKET}"
  "FTL_DEVICE_MODEL=${FTL_DEVICE_MODEL}"
  "FTL_OS_VERSION=${FTL_OS_VERSION}"
)

for entry in "${GH_VARIABLES[@]}"; do
  var_name="${entry%%=*}"
  var_value="${entry#*=}"
  run_cmd gh variable set "${var_name}" --body "${var_value}" --repo "${GITHUB_REPO}"
done

cat <<EOF

================================================================================
Provisioning complete ($([[ "${DRY_RUN}" == "true" ]] && echo "DRY-RUN" || echo "LIVE"))
  Repository:                 ${GITHUB_REPO}
  GCP Project:                ${GCP_PROJECT_ID}
  Workload Identity Provider: ${GCP_WORKLOAD_IDENTITY_PROVIDER}
  Service Account (Keyless):  ${SA_EMAIL}
  FTL Results Bucket (14d):   gs://${FTL_RESULTS_BUCKET}
  FTL Physical Device:        model=${FTL_DEVICE_MODEL}, version=${FTL_OS_VERSION}
================================================================================
EOF
