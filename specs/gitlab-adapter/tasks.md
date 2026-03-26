# GitLab Migration Adapter - Tasks

## Phase 1: Client and Extraction

- [x] Create `tools/gitlab/gitlab-client.js` with GitLab API client (personal access token auth, page-number pagination, 429 rate limit retry)
- [x] Implement `glGet()`, `glPost()`, `glPut()` methods in `gitlab-client.js`
- [x] Implement `glPaginate()` for automatic multi-page fetching in `gitlab-client.js`
- [x] Create `tools/gitlab/extract-projects.js` to list Jira projects with key, name, and issue count
- [x] Create `tools/gitlab/extract-issues.js` to extract full issue data from a Jira project
- [x] Implement `stripJiraMarkup()` function in `extract-issues.js` for Jira wiki to Markdown conversion (handles headings, bold, italic, code blocks, links, lists, panels, quotes)
- [x] Extract story points from custom field in `extract-issues.js`
- [x] Map issue type, priority, status, and components to label names in `extract-issues.js`
- [x] Preserve comments with author attribution in `extract-issues.js`
- [x] Collect attachment metadata in `extract-issues.js`

## Phase 2: Import

- [x] Create `tools/gitlab/import-issues.js` to import extracted issues into GitLab
- [x] Prefix issue titles with Jira key (`[PROJ-123] Summary`) in `import-issues.js`
- [x] Apply labels from `templates/gitlab-label-mapping.csv` during import
- [x] Set `created_at` on issues when token has admin permissions in `import-issues.js`
- [x] Create comments with original author and timestamp in `import-issues.js`
- [x] Download attachments from Jira and upload to GitLab in `import-issues.js`
- [x] Support `--user-map` JSON file for assignee mapping in `import-issues.js`
- [x] Close issues that were in "Done" category status in `import-issues.js`
- [x] Write results to `output/gitlab/import-results-PROJECT.json`

## Phase 3: Validation

- [x] Create `tools/gitlab/validate-import.js` to verify import completeness
- [x] Compare total issue count between source extraction and GitLab project
- [x] Compare open/closed issue counts
- [x] Spot-check random sample of issues for title, label, and description accuracy
- [x] Report pass/fail with details for each check

## Phase 4: Documentation

- [x] Create `docs/gitlab-migration.md` with step-by-step migration guide
- [x] Create `templates/gitlab-label-mapping.csv` with default label colors
- [x] Update `README.md` with GitLab adapter in structure section
- [x] Update `CLAUDE.md` with GitLab tools in directory tree

## Phase 5: Quality Fixes (pending, tracked in specs/code-quality/)

Critical:
- [ ] Add idempotency to `tools/gitlab/import-issues.js` (lines 221-308): check for existing issue with Jira key in title before creating, write results file for resume capability

Medium:
- [ ] Add 5xx retry to `tools/gitlab/gitlab-client.js` (lines 60-81): retry on 500/502/503 with exponential backoff, matching existing 429 handling
- [ ] Escape filenames in multipart body in `tools/gitlab/import-issues.js` (lines 104-109): sanitize quotes and boundary string in attachment filenames
- [ ] Cache user lookups in `tools/gitlab/import-issues.js` (lines 252-259): build username-to-ID map on first lookup, reuse for subsequent issues

Low:
- [ ] Add max page cap to `tools/gitlab/gitlab-client.js` `glPaginate()` (lines 89-111): limit to 500 pages to prevent infinite loops
- [ ] Make story points field configurable in `tools/gitlab/extract-issues.js` line 84: add `jira.storyPointsField` to `.migrationrc.json` or `--story-points-field` CLI flag
- [ ] Expand `stripJiraMarkup()` in `tools/gitlab/extract-issues.js` (lines 28-61): add handlers for nested lists (`** `), table markup (`||header||`, `|cell|`), color macros, image macros, `{anchor}` links
- [ ] Remove unused `glPaginate` calls for `openIssues` and `closedIssues` in `tools/gitlab/validate-import.js` (lines 84-85)
- [ ] Add `--seed` flag or log selected keys in `tools/gitlab/validate-import.js` line 142 for reproducible spot-check sampling
- [ ] Document `created_at` admin token requirement in `tools/gitlab/import-issues.js` `--help` output and in `docs/gitlab-migration.md`
- [ ] Document that the `--user-map` JSON format (`{ "email": "username" }`) differs from the `tools/transform/user-mapper.js` output format, in `docs/gitlab-migration.md`
