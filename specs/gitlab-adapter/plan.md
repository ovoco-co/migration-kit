# GitLab Migration Adapter - Plan

## Goal

Provide a complete Jira-to-GitLab migration path: extract issues from Jira (DC or Cloud), convert to GitLab format with label mapping, import to GitLab, and validate the result. This is a standalone adapter within migration-kit, separate from the Jira-to-Jira tooling.

## Architecture Decisions

**Separate client, same patterns.** The GitLab adapter uses its own API client (`tools/gitlab/gitlab-client.js`) rather than extending `tools/lib/client.js`. This is intentional: the Jira client handles DC/Cloud auth switching, offset/cursor pagination, and Jira-specific rate limiting. The GitLab client handles GitLab personal access tokens, keyset/page-number pagination, and GitLab rate limit headers. Sharing a client would add complexity without reducing code.

**One-way migration only.** The adapter moves data from Jira to GitLab. There is no GitLab-to-Jira direction. GitLab Issues are a simpler model than Jira (no issue types, no custom fields, no workflows), so the conversion is lossy by design. Metadata that has no GitLab equivalent (components, fix versions, sprints) is appended to the issue description as a reference section.

**Labels as the mapping layer.** Jira issue types, priorities, and components all become GitLab labels. The `templates/gitlab-label-mapping.csv` template defines the mapping with colors. This is the primary user-configurable transform.

**Jira key preserved in title.** Every imported GitLab issue title is prefixed with the Jira key (e.g., `[PROJ-123] Original summary`). This provides traceability and is used by the validation tool to cross-reference.

**User mapping is optional.** GitLab issue creation can set `assignee_id` if a user map is provided. Without it, issues are unassigned. The user map is a simple JSON file (`{ "jira-email": "gitlab-username" }`), separate from the Jira-to-Jira `user-mapper.js` output format which uses a richer structure.

**Attachments are best-effort.** Attachment migration downloads from Jira and uploads to GitLab. This requires Jira credentials for download and GitLab admin/maintainer permissions for upload. Failures are logged but do not block issue import.

## Implementation Approach

### Phase 1: Client and Extraction (done)

**`tools/gitlab/gitlab-client.js`** - GitLab API client.
- Personal access token authentication via `PRIVATE-TOKEN` header
- Page-number pagination following GitLab `x-next-page` response header
- Rate limit handling (429 retry with backoff)
- `glGet()`, `glPost()`, `glPut()` methods
- `glPaginate()` for automatic multi-page fetching
- Reads GitLab config from `.migrationrc.json` `gitlab` section

**`tools/gitlab/extract-projects.js`** - List Jira projects available for migration.
- Connects to Jira source via `tools/lib/client.js`
- Lists all projects with key, name, issue count
- Writes to `output/gitlab/projects.json`

**`tools/gitlab/extract-issues.js`** - Extract issues from a Jira project.
- Fetches all issues for a given project key with full field data
- Converts Jira wiki markup to Markdown via `stripJiraMarkup()` function
- Extracts story points from `customfield_10016`
- Maps issue type, priority, status, and components to label names
- Preserves comments with author attribution
- Collects attachment metadata (URL, filename, mime type)
- Writes to `output/gitlab/issues-PROJECT.json`

### Phase 2: Import (done)

**`tools/gitlab/import-issues.js`** - Import extracted issues into GitLab.
- Creates issues with Jira key prefix in title
- Applies labels from the label mapping CSV
- Sets `created_at` if the token has admin permissions
- Creates comments with original author and timestamp in the body
- Downloads attachments from Jira and uploads to GitLab
- Optionally assigns users via `--user-map` JSON file
- Closes issues that were in a "Done" category status in Jira
- Writes results to `output/gitlab/import-results-PROJECT.json`

### Phase 3: Validation (done)

**`tools/gitlab/validate-import.js`** - Verify import completeness.
- Compares total issue count between source extraction and GitLab project
- Compares open/closed issue counts
- Spot-checks a random sample of issues for title, label, and description accuracy
- Reports pass/fail with details for each check

### Phase 4: Quality Fixes (pending, tracked in specs/code-quality/)

The following issues were identified in the code review and are tracked in the code-quality spec:

**Critical:**
- `import-issues.js`: No idempotency. Re-running after partial failure creates duplicates.

**Medium:**
- `gitlab-client.js`: No 5xx retry (only retries 429)
- `import-issues.js`: Multipart attachment filename not escaped
- `import-issues.js`: User lookup not cached (one API call per issue)

**Low:**
- `gitlab-client.js`: `glPaginate` has no max page cap
- `extract-issues.js`: Story points field ID hardcoded as `customfield_10016`
- `extract-issues.js`: `stripJiraMarkup` incomplete (missing nested lists, tables, colors, macros)
- `validate-import.js`: Two unused API calls (`openIssues`, `closedIssues`)
- `validate-import.js`: Spot-check sample not reproducible
- `import-issues.js`: `created_at` requires admin token, not documented

## Dependencies

- Depends on `tools/lib/client.js` for Jira API access (extraction side)
- Depends on `.migrationrc.json` for both Jira and GitLab connection config
- Quality fixes depend on the code-quality spec (Groups 1, 2, 5, 6)
- No dependency on docs-restructure spec

## File Paths

Adapter files (all exist):
```
tools/gitlab/gitlab-client.js     GitLab API client
tools/gitlab/extract-projects.js  List Jira projects
tools/gitlab/extract-issues.js    Extract issues from Jira
tools/gitlab/import-issues.js     Import issues to GitLab
tools/gitlab/validate-import.js   Validate import results
```

Supporting files (all exist):
```
templates/gitlab-label-mapping.csv   Label mapping template with default colors
docs/gitlab-migration.md             Step-by-step migration guide
```

Config (in `.migrationrc.json`, gitignored):
```json
{
  "source": { ... },
  "gitlab": {
    "url": "https://gitlab.example.com",
    "token": "glpat-xxxxxxxxxxxx"
  }
}
```

Output files (generated at runtime):
```
output/gitlab/projects.json              Available Jira projects
output/gitlab/issues-PROJECT.json        Extracted issues per project
output/gitlab/import-results-PROJECT.json  Import results per project
```
