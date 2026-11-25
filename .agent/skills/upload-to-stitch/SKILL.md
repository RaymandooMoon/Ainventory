---
name: upload-to-stitch
description: >-
  Upload local assets (images, mockups, extracted HTML, design markdown) to a Stitch project.
  ALWAYS use this skill when you need to upload visual assets, HTML pages, or design docs
  to Stitch, particularly when direct MCP tool calls fail or truncate due to
  base64 token limits.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
metadata:
  origin: google-labs-code/stitch-skills
  plugin: stitch-design
  upstream_name: stitch::upload-to-stitch
  upstream_commit: 75f4696f162000fb69fca6a31489b5b21d47a506
  license: Apache-2.0
---
<!-- Modified for Ainventory internalization (Apache-2.0 §4(b)): normalized kebab-case skill name, added provenance metadata, resolved local script paths, and added STITCH_API_KEY env-var guidance. -->

# Upload-to-Stitch

Upload local assets (images, mockups, HTML, and markdown files) to a Stitch project using the
provided upload script, which bypasses the MCP tool's base64 output token limits.

> [!NOTE]
> The AI model cannot upload files via MCP tools directly because the base64
> encoding of even a small file exceeds the model's output token limit (~16K
> tokens). This script reads the file and sends it directly over HTTP.

## Steps

### 1. Identify Target Project

Use `list_projects` to find the correct `projectId` (Ainventory default: `11505180160165595336` for `projects/11505180160165595336`).

### 2. Load the API Key Safely (Never Print or Commit)

Per [.agent/rules/web/stitch-first-ui.md](../../rules/web/stitch-first-ui.md), **never print, log, or commit the Stitch API key**. Prefer loading `STITCH_API_KEY` into the environment directly from gitignored local configs:
- **Ainventory local env**: `.env.local` (`STITCH_API_KEY=...`, gitignored)
- **Antigravity**: `~/.gemini/config/mcp_config.json`, gitignored `.agent/mcp_config.json` (`.agents/mcp_config.json`), `.gemini/antigravity/mcp_config.json`, or `.gemini/jetski/mcp_config.json`
- **Gemini CLI**: `~/.gemini/settings.json` or `~/.gemini/extensions/Stitch/gemini-extension.json`
- **Claude Code**: `~/.claude.json`

Extract in memory (never echo to stdout):
- **API Key**: From `STITCH_API_KEY` or the `X-Goog-Api-Key` header
- **MCP URL** (optional): From the `httpUrl`/`serverUrl` or endpoint argument (defaults to `https://stitch.googleapis.com`)

> [!IMPORTANT]
> If you cannot find the API key in any of these locations, or if you cannot access these files, you MUST ask the user to provide/configure the Stitch API key. Do not proceed without a valid API key.

### 3. Run Upload Script

> [!WARNING]
> **Checkpoint — User Confirmation Required.**
> Before running the upload script, you **MUST** pause and present the file(s)
> to be uploaded (paths, sizes, and types) to the user and wait for explicit
> approval. Do **NOT** execute the upload script until the user confirms.

Use `run_command` to execute the Python script (preferring `STITCH_API_KEY` in the environment over passing `--api-key` on the command line):

```bash
python3 .agent/skills/upload-to-stitch/scripts/upload_to_stitch.py \
  --project-id <PROJECT_ID> \
  --file-path <PATH_TO_FILE> \
  [--api-url <STITCH_API_URL>] \
  [--title <SCREEN_TITLE>] \
  [--generated-by <GENERATED_BY>]
```

> [!TIP]
> **macOS / SSL Certificate Troubleshooting:**
> If the upload fails with `ssl.SSLCertVerificationError: [SSL: CERTIFICATE_VERIFY_FAILED] unable to get local issuer certificate`, this means your Python installation does not have root certificate authorities configured.
> 
> The script automatically attempts to use the `certifi` package to load the CA bundle if it is installed in your python environment. If `certifi` is not installed, you can either install it (`pip install certifi`) or manually supply the `SSL_CERT_FILE` environment variable when running the script:
> ```bash
> SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())") python3 .agent/skills/upload-to-stitch/scripts/upload_to_stitch.py \
>   --project-id <PROJECT_ID> \
>   --file-path <PATH_TO_FILE> \
>   [--api-url <STITCH_API_URL>] \
>   [--title <SCREEN_TITLE>] \
>   [--generated-by <GENERATED_BY>]
> ```

### Supported File Types

| Extension | MIME Type |
|:---|:---|
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.webp` | `image/webp` |
| `.html`, `.htm` | `text/html` |
| `.md` | `text/markdown` |

The script auto-detects MIME type from the file extension.

### Script Options

- `--project-id`: **Required**. The Stitch project ID.
- `--file-path`: **Required**. Path to the local file to upload.
- `--api-key`: Optional if `STITCH_API_KEY` environment variable is set (preferred for secret hygiene). API key for Stitch authorization.
- `--api-url`: Optional. Base URL of the Stitch API. Defaults to `https://stitch.googleapis.com`.
- `--title`: Optional. Title for the uploaded screen. When uploading extracted HTML from a web app, set this to the **route path** of the page (e.g., `'/dashboard'`, `'/settings/profile'`, `'/inbox'`) so that the screen name/title in Stitch clearly identifies the route.
- `--generated-by`: Optional. Specify how the uploaded file was generated (e.g., 'stitch::extract-static-html' skill, 'Claude Code', 'Codex', 'Gemini' etc.).