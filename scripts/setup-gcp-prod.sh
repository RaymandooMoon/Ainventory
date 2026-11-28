#!/usr/bin/env bash
# ==============================================================================
# setup-gcp-prod.sh
#
# Keyless & idempotent lightweight GCP Seoul (asia-northeast3) provisioning
# script for Ainventory (iNVTRY) production API + Cloud SQL PostgreSQL +
# GCS 3-Zone Private/Scratch buckets + Secret Manager + GitHub Actions CD.
#
# Designed to integrate safely into the EXISTING GCP project (Gemini / Maps /
# Firebase Test Lab) by reusing the existing Workload Identity Pool & OIDC
# provider while isolating least-privilege Service Accounts.
#
# Security guarantees:
#   - 100% keyless Workload Identity Federation (OIDC) — zero static JSON keys.
#   - Seoul region (asia-northeast3) data residency (Korean PIPA compliance).
#   - GCS Zone B enforces Public Access Prevention + Uniform Bucket-Level Access.
#   - GCS Zone C enforces 24-hour (age: 1 day) automatic permanent deletion.
#   - Least-privilege dedicated Runtime SA (`ainventory-api-run`) and Deploy SA
#     (`github-cloudrun-cd`), never reusing default Compute Engine SA.
# ==============================================================================

set -euo pipefail

DRY_RUN=false
CLI_GCP_PROJECT_ID=""
CLI_GITHUB_REPO=""
CLI_REGION="asia-northeast3"
CLI_AR_REPO="ainventory"
CLI_RUN_SERVICE="ainventory-api"
CLI_SQL_INSTANCE="ainventory-pg"
CLI_SQL_TIER="db-f1-micro"
CLI_SQL_DB="ainventory"
CLI_SQL_USER="ainventory_app"
CLI_PRIVATE_BUCKET=""
CLI_SCRATCH_BUCKET=""
CLI_RUNTIME_SA="ainventory-api-run"
CLI_DEPLOY_SA="github-cloudrun-cd"
CLI_WIF_POOL="github-actions-pool"
CLI_WIF_PROVIDER="github-oidc"

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
Usage: ./scripts/setup-gcp-prod.sh [OPTIONS]

Idempotently provisions lightweight GCP Seoul (asia-northeast3) infrastructure
in your existing GCP project for Ainventory (iNVTRY):
  - Artifact Registry Docker repository (3-image cleanup policy)
  - Cloud SQL for PostgreSQL 16 (db-f1-micro, 10GB SSD, 7-day daily backups)
  - GCS Zone B Private User Vault (Public Access Prevention + Uniform Access)
  - GCS Zone C Ephemeral VTON Scratch (1-day Lifecycle auto-delete)
  - Secret Manager empty secret containers (zero values logged or committed)
  - Least-privilege Runtime SA & GitHub Actions Keyless WIF Deploy SA

Options:
  -p, --project <PROJECT_ID>     Existing GCP Project ID (env: GCP_PROJECT_ID)
  -r, --repo <OWNER/REPO>        GitHub repo (default: RaymandooMoon/Ainventory)
  -l, --region <REGION>          GCP region (default: asia-northeast3)
      --service <NAME>           Cloud Run service name (default: ainventory-api)
      --sql-instance <NAME>      Cloud SQL instance ID (default: ainventory-pg)
      --sql-tier <TIER>          Cloud SQL tier (default: db-f1-micro)
      --private-bucket <NAME>    Zone B bucket (default: <project>-invtry-user-private)
      --scratch-bucket <NAME>    Zone C bucket (default: <project>-invtry-vton-scratch)
      --pool <POOL_NAME>         Existing WIF pool ID (default: github-actions-pool)
      --provider <PROVIDER_NAME> Existing WIF provider ID (default: github-oidc)
  -n, --dry-run                  Preview all commands without modifying GCP/GitHub
  -h, --help                     Show this help message and exit

Examples:
  GCP_PROJECT_ID=my-existing-gcp-proj ./scripts/setup-gcp-prod.sh --dry-run
  GCP_PROJECT_ID=my-existing-gcp-proj ./scripts/setup-gcp-prod.sh
EOF
}

log_info() { printf '[INFO] %s\n' "$*"; }
log_step() { printf '\n==> %s\n' "$*"; }
log_warn() { printf '[WARN] %s\n' "$*" >&2; }
log_err()  { printf '[ERROR] %s\n' "$*" >&2; }

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[DRY-RUN]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--project)        CLI_GCP_PROJECT_ID="$2"; shift 2 ;;
    -r|--repo)           CLI_GITHUB_REPO="$2"; shift 2 ;;
    -l|--region)         CLI_REGION="$2"; shift 2 ;;
    --service)           CLI_RUN_SERVICE="$2"; shift 2 ;;
    --sql-instance)      CLI_SQL_INSTANCE="$2"; shift 2 ;;
    --sql-tier)          CLI_SQL_TIER="$2"; shift 2 ;;
    --private-bucket)    CLI_PRIVATE_BUCKET="$2"; shift 2 ;;
    --scratch-bucket)    CLI_SCRATCH_BUCKET="$2"; shift 2 ;;
    --pool)              CLI_WIF_POOL="$2"; shift 2 ;;
    --provider)          CLI_WIF_PROVIDER="$2"; shift 2 ;;
    -n|--dry-run)        DRY_RUN=true; shift ;;
    -h|--help)           usage; exit 0 ;;
    *)                   log_err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

PROJECT_ID="${CLI_GCP_PROJECT_ID:-${GCP_PROJECT_ID:-}}"
if [[ -z "${PROJECT_ID}" ]] && command -v gcloud >/dev/null 2>&1; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  log_err "GCP_PROJECT_ID is required. Pass --project <ID> or set GCP_PROJECT_ID."
  exit 1
fi

GITHUB_REPO="${CLI_GITHUB_REPO:-${GITHUB_REPO:-RaymandooMoon/Ainventory}}"
REGION="${CLI_REGION}"
PRIVATE_BUCKET="${CLI_PRIVATE_BUCKET:-${PROJECT_ID}-invtry-user-private}"
SCRATCH_BUCKET="${CLI_SCRATCH_BUCKET:-${PROJECT_ID}-invtry-vton-scratch}"
RUNTIME_SA_EMAIL="${CLI_RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA_EMAIL="${CLI_DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_SQL_CONNECTION="${PROJECT_ID}:${REGION}:${CLI_SQL_INSTANCE}"

PROJECT_RE='^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
REPO_RE='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
if [[ ! "${PROJECT_ID}" =~ ${PROJECT_RE} ]]; then
  log_err "Invalid GCP project ID '${PROJECT_ID}'."
  exit 1
fi
if [[ ! "${GITHUB_REPO}" =~ ${REPO_RE} ]]; then
  log_err "Invalid GitHub repo '${GITHUB_REPO}' (expected owner/repo)."
  exit 1
fi

if [[ "${DRY_RUN}" != "true" ]] && ! command -v gcloud >/dev/null 2>&1; then
  log_err "gcloud CLI is required for live execution. Install Google Cloud SDK or run with --dry-run."
  exit 1
fi

log_step "1/8 Validating lightweight GCP Seoul configuration"
log_info "Project ID:            ${PROJECT_ID}"
log_info "Region:                ${REGION} (Seoul — Korean PIPA residency)"
log_info "GitHub Repo:           ${GITHUB_REPO}"
log_info "Cloud Run Service:     ${CLI_RUN_SERVICE}"
log_info "Cloud SQL Instance:    ${CLOUD_SQL_CONNECTION} (${CLI_SQL_TIER}, PostgreSQL 16)"
log_info "Zone B Private Bucket: gs://${PRIVATE_BUCKET}"
log_info "Zone C Scratch Bucket: gs://${SCRATCH_BUCKET} (24h auto-delete)"
log_info "Runtime SA:            ${RUNTIME_SA_EMAIL}"
log_info "Deploy SA:             ${DEPLOY_SA_EMAIL}"

log_step "2/8 Enabling required Google Cloud APIs (idempotent)"
REQUIRED_APIS=(
  "run.googleapis.com"
  "sqladmin.googleapis.com"
  "storage.googleapis.com"
  "secretmanager.googleapis.com"
  "artifactregistry.googleapis.com"
  "iam.googleapis.com"
  "iamcredentials.googleapis.com"
  "cloudresourcemanager.googleapis.com"
)
run_cmd gcloud services enable "${REQUIRED_APIS[@]}" --project="${PROJECT_ID}"

log_step "3/8 Provisioning Artifact Registry repository (${CLI_AR_REPO} in ${REGION})"
if [[ "${DRY_RUN}" == "true" ]]; then
  run_cmd gcloud artifacts repositories create "${CLI_AR_REPO}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository-format=docker \
    --description="Ainventory production Cloud Run container images"
else
  if ! gcloud artifacts repositories describe "${CLI_AR_REPO}" \
    --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
    gcloud artifacts repositories create "${CLI_AR_REPO}" \
      --project="${PROJECT_ID}" \
      --location="${REGION}" \
      --repository-format=docker \
      --description="Ainventory production Cloud Run container images"
  else
    log_info "Artifact Registry '${CLI_AR_REPO}' already exists (reusing)."
  fi
fi

CLEANUP_POLICY_JSON="$(mktemp)"
TMP_FILES+=("${CLEANUP_POLICY_JSON}")
cat > "${CLEANUP_POLICY_JSON}" <<'JSON'
[
  {
    "name": "delete-old-versions",
    "action": { "type": "Delete" },
    "condition": { "tagState": "any", "olderThan": "14d" }
  },
  {
    "name": "keep-recent-3",
    "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": 3 }
  }
]
JSON
run_cmd gcloud artifacts repositories set-cleanup-policies "${CLI_AR_REPO}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --policy="${CLEANUP_POLICY_JSON}"

log_step "4/8 Provisioning dedicated least-privilege Service Accounts"
ensure_sa() {
  local sa_name="$1"
  local sa_email="$2"
  local display_name="$3"
  if [[ "${DRY_RUN}" == "true" ]]; then
    run_cmd gcloud iam service-accounts create "${sa_name}" \
      --project="${PROJECT_ID}" \
      --display-name="${display_name}"
  else
    if ! gcloud iam service-accounts describe "${sa_email}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
      gcloud iam service-accounts create "${sa_name}" \
        --project="${PROJECT_ID}" \
        --display-name="${display_name}"
      # Wait briefly for GCP IAM eventual consistency before binding roles.
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        if gcloud iam service-accounts describe "${sa_email}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
    else
      log_info "Service Account '${sa_email}' already exists (reusing)."
    fi
  fi
}

ensure_sa "${CLI_RUNTIME_SA}" "${RUNTIME_SA_EMAIL}" "Ainventory Cloud Run API Runtime SA"
ensure_sa "${CLI_DEPLOY_SA}" "${DEPLOY_SA_EMAIL}" "Ainventory GitHub Actions Cloud Run Deploy SA"

for role in \
  "roles/cloudsql.client" \
  "roles/secretmanager.secretAccessor" \
  "roles/iam.serviceAccountTokenCreator"; do
  run_cmd gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="${role}" \
    --condition=None \
    --quiet
done

for role in \
  "roles/run.admin" \
  "roles/artifactregistry.writer"; do
  run_cmd gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="${role}" \
    --condition=None \
    --quiet
done

run_cmd gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

log_step "5/8 Provisioning GCS Zone B (Private Vault) & Zone C (24h VTON Scratch) in ${REGION}"
ensure_private_bucket() {
  local bucket="$1"
  if [[ "${DRY_RUN}" == "true" ]]; then
    run_cmd gcloud storage buckets create "gs://${bucket}" \
      --project="${PROJECT_ID}" \
      --location="${REGION}" \
      --default-storage-class=STANDARD \
      --uniform-bucket-level-access \
      --public-access-prevention
  else
    if ! gcloud storage buckets describe "gs://${bucket}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
      gcloud storage buckets create "gs://${bucket}" \
        --project="${PROJECT_ID}" \
        --location="${REGION}" \
        --default-storage-class=STANDARD \
        --uniform-bucket-level-access \
        --public-access-prevention
    else
      gcloud storage buckets update "gs://${bucket}" \
        --uniform-bucket-level-access \
        --public-access-prevention
      log_info "Bucket 'gs://${bucket}' already exists (verified PAP + UBLA)."
    fi
  fi
  run_cmd gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --quiet
}

ensure_private_bucket "${PRIVATE_BUCKET}"
ensure_private_bucket "${SCRATCH_BUCKET}"

SCRATCH_LIFECYCLE_JSON="$(mktemp)"
TMP_FILES+=("${SCRATCH_LIFECYCLE_JSON}")
cat > "${SCRATCH_LIFECYCLE_JSON}" <<'JSON'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 1 }
    }
  ]
}
JSON
run_cmd gcloud storage buckets update "gs://${SCRATCH_BUCKET}" \
  --lifecycle-file="${SCRATCH_LIFECYCLE_JSON}"

log_step "6/8 Provisioning Cloud SQL for PostgreSQL 16 (${CLI_SQL_INSTANCE} in ${REGION})"
if [[ "${DRY_RUN}" == "true" ]]; then
  run_cmd gcloud sql instances create "${CLI_SQL_INSTANCE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier="${CLI_SQL_TIER}" \
    --storage-type=SSD \
    --storage-size=10GB \
    --storage-auto-increase \
    --availability-type=zonal \
    --backup-start-time=19:00 \
    --backup-location="${REGION}" \
    --retained-backups-count=7
  run_cmd gcloud sql databases create "${CLI_SQL_DB}" \
    --project="${PROJECT_ID}" \
    --instance="${CLI_SQL_INSTANCE}"
else
  if ! gcloud sql instances describe "${CLI_SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud sql instances create "${CLI_SQL_INSTANCE}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --database-version=POSTGRES_16 \
      --edition=ENTERPRISE \
      --tier="${CLI_SQL_TIER}" \
      --storage-type=SSD \
      --storage-size=10GB \
      --storage-auto-increase \
      --availability-type=zonal \
      --backup-start-time=19:00 \
      --backup-location="${REGION}" \
      --retained-backups-count=7
  else
    log_info "Cloud SQL instance '${CLI_SQL_INSTANCE}' already exists (reusing)."
  fi
  if ! gcloud sql databases describe "${CLI_SQL_DB}" \
    --project="${PROJECT_ID}" --instance="${CLI_SQL_INSTANCE}" >/dev/null 2>&1; then
    gcloud sql databases create "${CLI_SQL_DB}" \
      --project="${PROJECT_ID}" \
      --instance="${CLI_SQL_INSTANCE}"
  fi
fi

log_step "7/8 Creating Secret Manager secret shells (values managed out-of-band)"
SECRET_NAMES=(
  "AINVENTORY_DATABASE_URL"
  "AINVENTORY_GOOGLE_CLIENT_ID"
  "AINVENTORY_GOOGLE_CLIENT_SECRET"
  "AINVENTORY_OAUTH_STATE_SECRET"
  "AINVENTORY_GEMINI_API_KEY"
  "AINVENTORY_GOOGLE_MAPS_API_KEY"
  "AINVENTORY_RESEND_API_KEY"
  "AINVENTORY_SITE_DEMO_PASSWORD"
  "AINVENTORY_ADMIN_INITIAL_PASSWORD"
)
for secret_name in "${SECRET_NAMES[@]}"; do
  if [[ "${DRY_RUN}" == "true" ]]; then
    run_cmd gcloud secrets create "${secret_name}" \
      --project="${PROJECT_ID}" \
      --replication-policy=user-managed \
      --locations="${REGION}"
  else
    if ! gcloud secrets describe "${secret_name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
      gcloud secrets create "${secret_name}" \
        --project="${PROJECT_ID}" \
        --replication-policy=user-managed \
        --locations="${REGION}"
    else
      log_info "Secret '${secret_name}' already exists (reusing)."
    fi
  fi
done

log_step "8/8 Binding existing GitHub OIDC Workload Identity Pool to Cloud Run Deploy SA"
if [[ "${DRY_RUN}" == "true" ]]; then
  PROJECT_NUMBER="<PROJECT_NUMBER>"
else
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
  pool_state="$(gcloud iam workload-identity-pools describe "${CLI_WIF_POOL}" \
    --project="${PROJECT_ID}" --location=global --format='value(state)' 2>/dev/null || true)"
  if [[ -z "${pool_state}" ]]; then
    gcloud iam workload-identity-pools create "${CLI_WIF_POOL}" \
      --project="${PROJECT_ID}" \
      --location=global \
      --display-name="GitHub Actions OIDC Pool"
  elif [[ "${pool_state}" == "DELETED" ]]; then
    gcloud iam workload-identity-pools undelete "${CLI_WIF_POOL}" \
      --project="${PROJECT_ID}" \
      --location=global
  else
    log_info "Workload Identity Pool '${CLI_WIF_POOL}' already exists (${pool_state}, reusing)."
  fi

  provider_state="$(gcloud iam workload-identity-pools providers describe "${CLI_WIF_PROVIDER}" \
    --project="${PROJECT_ID}" --location=global \
    --workload-identity-pool="${CLI_WIF_POOL}" --format='value(state)' 2>/dev/null || true)"
  if [[ -z "${provider_state}" ]]; then
    gcloud iam workload-identity-pools providers create-oidc "${CLI_WIF_PROVIDER}" \
      --project="${PROJECT_ID}" \
      --location=global \
      --workload-identity-pool="${CLI_WIF_POOL}" \
      --display-name="GitHub Actions OIDC" \
      --issuer-uri="https://token.actions.githubusercontent.com" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
      --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
  elif [[ "${provider_state}" == "DELETED" ]]; then
    gcloud iam workload-identity-pools providers undelete "${CLI_WIF_PROVIDER}" \
      --project="${PROJECT_ID}" \
      --location=global \
      --workload-identity-pool="${CLI_WIF_POOL}"
  else
    log_info "OIDC Provider '${CLI_WIF_PROVIDER}' already exists (${provider_state}, reusing)."
  fi
fi

PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${CLI_WIF_POOL}/attribute.repository/${GITHUB_REPO}"
run_cmd gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="${PRINCIPAL_SET}" \
  --quiet

cat <<EOF

==============================================================================
Lightweight GCP Seoul (asia-northeast3) provisioning complete!
==============================================================================
1. Create Cloud SQL app user & set strong password (never commit):
   gcloud sql users create ${CLI_SQL_USER} --instance=${CLI_SQL_INSTANCE} --project=${PROJECT_ID} --password='<STRONG_PASSWORD>'

2. Populate Secret Manager versions (stdin pipe, never in shell history):
   # Example for DATABASE_URL (Cloud Run Unix socket connection):
   printf 'postgresql://${CLI_SQL_USER}:<URL_ENCODED_PW>@/${CLI_SQL_DB}?host=/cloudsql/${CLOUD_SQL_CONNECTION}' | \\
     gcloud secrets versions add AINVENTORY_DATABASE_URL --project=${PROJECT_ID} --data-file=-

   # Generate 32-byte hex OAuth state signing secret:
   openssl rand -hex 32 | \\
     gcloud secrets versions add AINVENTORY_OAUTH_STATE_SECRET --project=${PROJECT_ID} --data-file=-

   # Add remaining secrets:
   #   AINVENTORY_GOOGLE_CLIENT_ID
   #   AINVENTORY_GOOGLE_CLIENT_SECRET
   #   AINVENTORY_GEMINI_API_KEY
   #   AINVENTORY_GOOGLE_MAPS_API_KEY
   #   AINVENTORY_RESEND_API_KEY
   #   AINVENTORY_SITE_DEMO_PASSWORD
   #   AINVENTORY_ADMIN_INITIAL_PASSWORD

3. Configure GitHub Repository Variables for .github/workflows/deploy-cloud-run.yml:
   GCP_PROJECT_ID=${PROJECT_ID}
   GCP_REGION=${REGION}
   GCP_ARTIFACT_REGISTRY_REPO=${CLI_AR_REPO}
   GCP_CLOUD_RUN_SERVICE=${CLI_RUN_SERVICE}
   GCP_CLOUD_RUN_RUNTIME_SA=${RUNTIME_SA_EMAIL}
   GCP_CLOUD_RUN_DEPLOY_SA=${DEPLOY_SA_EMAIL}
   GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${CLI_WIF_POOL}/providers/${CLI_WIF_PROVIDER}
   GCP_CLOUD_SQL_CONNECTION=${CLOUD_SQL_CONNECTION}
   GCP_GCS_PRIVATE_BUCKET=${PRIVATE_BUCKET}
   GCP_GCS_SCRATCH_BUCKET=${SCRATCH_BUCKET}

4. Recommended Billing Guardrails:
   Configure GCP Billing Budget Alerts at ₩20,000 / ₩50,000 / ₩100,000 in
   Console -> Billing -> Budgets & alerts.

5. After first Cloud Run deploy, copy the returned https://*.run.app URL into
   wrangler.jsonc (vars.API_UPSTREAM_ORIGIN) or Cloudflare Workers env var.
==============================================================================
EOF
