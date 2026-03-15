# AI Code Reviewer

A Node.js service that listens to GitLab and GitHub webhooks and posts AI-powered code reviews using Claude. Reviews follow Google's "The Standard of Code Review" guidelines and are tailored to the detected technology stack of each project.

## How It Works

1. A merge request (GitLab) or pull request (GitHub) is opened or updated
2. The platform sends a webhook to this service
3. The service fetches the diff and detects the project's tech stack (languages, frameworks, build tools)
4. Claude reviews the code and returns structured feedback
5. Inline comments are posted on specific diff lines, and a summary comment is posted on the MR/PR

## Requirements

- Node.js v24+
- pnpm
- A GitLab Personal Access Token with `api` scope (for GitLab integration)
- A GitHub Personal Access Token (for GitHub integration)
- An Anthropic API key

## Setup

```bash
# Install dependencies
pnpm install

# Copy the example env file and fill in your values
cp .env.example .env
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
| `GITLAB_TOKEN` | Yes | — | GitLab Personal Access Token |
| `GITLAB_URL` | No | `https://gitlab.com` | GitLab instance URL |
| `GITLAB_WEBHOOK_SECRET` | Yes | — | Webhook secret token for verification |
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-5-20250929` | Claude model to use |
| `TRIGGER_MODE` | No | `all` | When to trigger reviews: `all`, `label`, or `comment` |
| `TRIGGER_LABEL` | No | `ai-review` | Label that triggers a review (when mode is `label`) |
| `TRIGGER_COMMENT` | No | `/review` | Comment text that triggers a review (when mode is `comment`) |
| `LOG_LEVEL` | No | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `USAGE_MONTHLY_TOKEN_LIMIT` | No | `0` (disabled) | Monthly token budget (input + output combined) |
| `USAGE_MONTHLY_DOLLAR_LIMIT` | No | `0` (disabled) | Monthly dollar budget in USD |
| `USAGE_INPUT_TOKEN_COST` | No | `0.003` | Cost per 1K input tokens in USD |
| `USAGE_OUTPUT_TOKEN_COST` | No | `0.015` | Cost per 1K output tokens in USD |
| `USAGE_ALERT_WEBHOOK_URL` | No | `""` (disabled) | Webhook URL for usage alerts (Slack, Discord, etc.) |
| `USAGE_DATA_DIR` | No | `data` | Directory for the usage persistence file |
| `HEALTH_CHECK_TIMEOUT_MS` | No | `5000` | Timeout in ms for each health check |
| `GITHUB_TOKEN` | No | `""` | GitHub Personal Access Token (enables GitHub integration) |
| `GITHUB_WEBHOOK_SECRET` | No | `""` | GitHub webhook secret for HMAC-SHA256 verification |

## Running

```bash
# Development (with hot reload)
pnpm dev

# Production
pnpm build
pnpm start
```

The server exposes these endpoints:

- `GET /health` — deep readiness check (returns 200 if healthy, 503 if unhealthy)
- `GET /health/live` — shallow liveness check (always returns 200 if the process is running)
- `GET /usage` — current month's token usage and estimated cost
- `POST /webhook` — GitLab webhook receiver (legacy alias for `/webhook/gitlab`)
- `POST /webhook/gitlab` — GitLab webhook receiver
- `POST /webhook/github` — GitHub webhook receiver (only registered when `GITHUB_TOKEN` and `GITHUB_WEBHOOK_SECRET` are set)

### Health Check

`GET /health` validates connectivity to external dependencies and returns a structured response:

```json
{
  "status": "healthy",
  "checks": {
    "platforms": {
      "gitlab": { "status": "healthy", "latencyMs": 45 },
      "github": { "status": "healthy", "latencyMs": 80 }
    },
    "claude": { "status": "healthy", "latencyMs": 120 },
    "usage": {
      "status": "healthy",
      "tokenUsagePercent": 42,
      "dollarUsagePercent": 35
    }
  }
}
```

- **GitLab** — validates the personal access token via `GET /api/v4/personal_access_tokens/self`
- **GitHub** — validates the token via `GET /user` (only shown when `GITHUB_TOKEN` is configured)
- **Claude** — validates the Anthropic API key using a lightweight `countTokens` call (no billing)
- **Usage** — reports budget consumption: `"healthy"` (< 80%), `"warning"` (80–95%), `"unhealthy"` (> 95%), or `"disabled"` if no limits are set

Overall `status` is `"healthy"` only when all checks pass. Each check has a 5-second timeout.

## Setting Up the GitLab Webhook

1. Go to your GitLab project → **Settings** → **Webhooks**
2. Set the URL to `https://<your-host>:3000/webhook/gitlab` (or `/webhook`)
3. Set the **Secret token** to the same value as `GITLAB_WEBHOOK_SECRET` in your `.env`
4. Under **Trigger**, enable:
   - **Merge request events**
   - **Comments** (if using `comment` trigger mode)
5. Click **Add webhook**

## Setting Up the GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. Set the **Payload URL** to `https://<your-host>:3000/webhook/github`
3. Set **Content type** to `application/json`
4. Set the **Secret** to the same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
5. Under **Which events would you like to trigger this webhook?**, select **Let me select individual events** and enable:
   - **Pull requests** (for `all` and `label` trigger modes)
   - **Issue comments** (if using `comment` trigger mode)
6. Click **Add webhook**

## Trigger Modes

Trigger modes apply identically to both GitLab and GitHub.

### `all` (default)

Reviews every merge request / pull request when it is opened or updated (GitLab: `open`/`update` actions; GitHub: `opened`/`synchronize` actions).

### `label`

Only reviews when a specific label is present (configured via `TRIGGER_LABEL`).
- **GitLab**: Reviews MRs that have the label when opened or updated.
- **GitHub**: Reviews PRs when the matching label is added (`labeled` action).

### `comment`

Only reviews when someone posts a comment matching `TRIGGER_COMMENT` (default: `/review`).
- **GitLab**: Triggered by Note Hook events on merge requests.
- **GitHub**: Triggered by `issue_comment` events on pull requests.

## Tech Stack Detection

The reviewer automatically detects the project's technology stack by analyzing:

- **File extensions** in the diff (`.ts` → TypeScript, `.py` → Python, `.go` → Go, etc.)
- **Config files** in the repository root:
  - `package.json` → Node.js, with framework detection (React, Next.js, Express, Fastify, etc.)
  - `go.mod` → Go (Gin, Fiber, Echo)
  - `pom.xml` / `build.gradle` → Java (Spring Boot, Quarkus)
  - `requirements.txt` / `pyproject.toml` → Python (Django, Flask, FastAPI)
  - `Cargo.toml` → Rust (Actix, Axum, Rocket)
  - `Gemfile` → Ruby (Rails, Sinatra)

The detected stack is injected into the review prompt so Claude applies technology-specific best practices.

## Review Output

Each review produces:

- **Inline comments** on specific lines of the diff, each with a severity level:
  - 🚨 **Critical** — bugs, security issues, data loss risks
  - ⚠️ **Major** — design problems, performance issues
  - ℹ️ **Minor** — style, naming, small improvements
  - 💡 **Suggestion** — optional improvements, alternatives
- **A summary comment** on the MR/PR with an overall verdict (`approve`, `request changes`, or `comment`) and a table of findings by severity

## Usage Tracking & Budget Alerts

The service tracks Claude API token consumption per month and can alert an administrator when usage approaches a configured budget.

**How it works:**
- After each Claude API call, input and output tokens are recorded
- Usage is kept in memory and persisted to `data/usage.json`
- When usage crosses 80% or 95% of a configured limit, an alert is dispatched
- Alerts are always logged as warnings; optionally sent to a webhook (Slack, Discord, etc.)

**Supported thresholds:**
- **Token budget** — set `USAGE_MONTHLY_TOKEN_LIMIT` to a total token count (e.g., `10000000` for 10M tokens)
- **Dollar budget** — set `USAGE_MONTHLY_DOLLAR_LIMIT` to a USD amount (e.g., `50` for $50/month). Cost is estimated using `USAGE_INPUT_TOKEN_COST` and `USAGE_OUTPUT_TOKEN_COST`

**Webhook payload** (Slack-compatible):
```json
{
  "text": "⚠️ AI Reviewer: 80% of monthly token budget used (8.00M / 10.00M tokens)",
  "alert": {
    "type": "token_limit",
    "threshold": 80,
    "currentValue": 8000000,
    "limitValue": 10000000,
    "month": "2026-03"
  }
}
```

Check current usage at any time via `GET /usage`.

## Linting

The project uses [ESLint](https://eslint.org/) with [typescript-eslint](https://typescript-eslint.io/) for static analysis. The configuration lives in `eslint.config.js` (flat config format).

```bash
# Run the linter
pnpm lint
```

Linting runs automatically on every commit via a Husky pre-commit hook.

## Project Structure

```
src/
├── index.ts                        # Fastify server entry point
├── config.ts                       # Environment variable validation
├── logger.ts                       # Shared pino logger instance
├── routes/
│   ├── webhook.ts                  # Aggregator (registers GitLab + GitHub routes)
│   ├── webhook.gitlab.ts           # POST /webhook/gitlab (+ /webhook alias)
│   └── webhook.github.ts           # POST /webhook/github (HMAC-SHA256 auth)
├── services/
│   ├── review.service.ts           # Platform-agnostic review orchestration
│   ├── review.formatter.ts         # Markdown formatting for reviews
│   ├── tech-detector.service.ts    # Tech stack detection
│   ├── trigger.gitlab.ts           # GitLab trigger mode logic
│   ├── trigger.github.ts           # GitHub trigger mode logic
│   ├── health.service.ts           # Health check orchestration
│   ├── usage.service.ts            # Token usage tracking & threshold checks
│   ├── usage.persistence.ts        # Usage data file I/O
│   └── notification.service.ts     # Usage alert dispatching (channel registry)
├── clients/
│   ├── gitlab.client.ts            # GitLab API wrapper
│   ├── gitlab.platform.ts          # GitLab PlatformClient adapter
│   ├── github.client.ts            # GitHub PlatformClient (Octokit)
│   └── claude.client.ts            # Anthropic SDK wrapper
├── prompts/
│   ├── system.prompt.ts            # System prompt (Google code review standards)
│   └── review.prompt.ts            # Diff review prompt builder + chunking
└── types/
    ├── config.types.ts             # Config interface
    ├── platform.types.ts           # Platform abstractions (FileDiff, PlatformClient, etc.)
    ├── gitlab.types.ts             # GitLab webhook & API types
    ├── github.types.ts             # GitHub webhook & API types
    ├── review.types.ts             # Review result types
    └── usage.types.ts              # Usage tracking types
```

## Large Diff Handling

When a merge request diff exceeds ~150K characters, the service splits it into batches by file and reviews each batch separately. Results are merged — inline comments from all batches are posted, and the summary combines all batch summaries with the most severe verdict.
