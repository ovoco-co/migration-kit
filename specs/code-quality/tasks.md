# Code Quality Fixes - Tasks

## Group 1: Critical - Idempotency

- [x] Add duplicate detection to `tools/gitlab/import-issues.js`: before importing, fetch existing issues and match Jira keys from description text. Done 2026-04-04 (commit e15fe59).
- [x] Results file already written by `writeOutput()` at end of import. Duplicate detection makes `--resume-from` unnecessary.
- [x] Resume handled by duplicate detection: re-running safely skips already-imported issues.

## Group 2: Shared Infrastructure

- [ ] Add 5xx retry with exponential backoff to `tools/lib/client.js` `request()` function (lines 60-92), retry on 500/502/503, max 3 retries
- [ ] Add 5xx retry with exponential backoff to `tools/gitlab/gitlab-client.js` (lines 60-81), same pattern
- [ ] Wrap `JSON.parse(fs.readFileSync(...))` in try/catch in `tools/lib/client.js` line 37, print message pointing to `.migrationrc.json` on `SyntaxError`
- [ ] Add cursor-based pagination support to `tools/lib/client.js` `paginate()` (lines 109-145) for Assets Cloud endpoints that use `cursor`/`pageToken`
- [ ] Add max pages safety cap (500) to `tools/gitlab/gitlab-client.js` `glPaginate()` (lines 89-111)
- [ ] Update all callers of `paginate()` to pass explicit `resultsKey` instead of relying on auto-detection (line 129)
- [ ] Add credential validation in `tools/lib/client.js` `loadConfig()`: check token/email fields are non-empty before proceeding
- [ ] Fix `tools/lib/client.js` `outputPath` (line 167) to resolve relative to config file location, not `process.cwd()`

## Group 3: CSV Parser Consistency

- [ ] Extract the quote-aware CSV parser into a shared utility (`tools/lib/csv.js`) and have all three mappers import from it
- [x] Replace naive `split(',')` parser in `tools/transform/field-mapper.js` with quote-aware parser. Done 2026-04-04 (commit e15fe59).
- [x] Replace naive `split(',')` parser in `tools/transform/status-mapper.js` with quote-aware parser. Done 2026-04-04 (commit e15fe59).
- [ ] Update `tools/transform/user-mapper.js` to import from the shared utility instead of its inline implementation

## Group 4: Error Handling and Silent Failures

- [ ] Replace empty catch block in `tools/extract/delta-extract.js` line 51 with a warning log and `commentsFailed: true` flag on the issue output
- [ ] Fix timezone handling in `tools/extract/delta-extract.js` line 118: document UTC behavior in `--help` or treat `--since` input as UTC explicitly
- [ ] Fix `tools/extract/scriptrunner-audit.js` lines 184-186: either remove `workflowFunctions` from the audit output or cross-reference from `workflow-inventory.js` output
- [ ] Implement unused scheme detection in `tools/extract/scheme-inventory.js` `analyzeSchemes()` (line 161): cross-reference collected project assignment data against scheme IDs

## Group 5: Performance

- [ ] Reduce API calls in `tools/extract/issue-counts.js` (lines 132-160): batch JQL queries or use in-memory bucketing instead of one call per (project, type, status)
- [ ] Replace `JSON.stringify/parse` deduplication in `tools/extract/issue-counts.js` (lines 51-65) with a Map keyed by status name
- [ ] Add chunked `Promise.all` with concurrency limit to `tools/extract/field-inventory.js` (lines 50-96) for parallel context/option fetches
- [ ] Reduce sample fetch in `tools/validate/field-spot-check.js` (lines 82-96) from 50 individual API calls to a single search with `maxResults=50` and random `startAt`
- [ ] Cache username-to-ID mapping in `tools/gitlab/import-issues.js` (lines 252-259) to avoid redundant user lookups per issue

## Group 6: GitLab Adapter

- [ ] Make story points field configurable in `tools/gitlab/extract-issues.js` line 84: add `.migrationrc.json` field `jira.storyPointsField` or `--story-points-field` CLI flag instead of hardcoded `customfield_10016`
- [ ] Expand `stripJiraMarkup` in `tools/gitlab/extract-issues.js` (lines 28-61) to handle: nested lists (`** `), table markup (`||header||`, `|cell|`), color macros, image macros, `{anchor}` links
- [ ] Sanitize filenames in multipart body construction in `tools/gitlab/import-issues.js` (lines 104-109): escape quotes and boundary string in attachment filenames
- [ ] Remove unused `openIssues` and `closedIssues` `glPaginate` calls in `tools/gitlab/validate-import.js` (lines 84-85)
- [ ] Add `--seed` flag or log selected keys in `tools/gitlab/validate-import.js` line 142 for reproducible spot-check sampling
- [ ] Document `created_at` admin token requirement in `tools/gitlab/import-issues.js` `--help` output (line 266: GitLab silently ignores `created_at` for non-admin tokens)

## Group 7: Miscellaneous

- [ ] Refactor `tools/validate/assets-verify.js` (lines 46-61) to use `client.js` shared client instead of raw `fetch` calls (gets rate limiting, retry, and request logging)
- [ ] Improve fallback in `tools/validate/link-integrity.js` line 63: increase fallback multiplier or use alternative approach for instances without ScriptRunner (current JQL uses `issueFunction in hasLinks()`)
- [ ] Change User-Agent in `tools/pull-docs.js` line 174 from `cmdb-kit-doc-pull/1.0` to `migration-kit-doc-pull/1.0`
- [ ] Fix `tools/pull-docs.js` line 34: either add `node-fetch` to `package.json` optionalDependencies or switch to built-in `fetch` (Node 18+)
- [ ] Add `entry.source.accountId` as final fallback in `tools/transform/user-mapper.js` line 115 key construction
- [ ] Add fallback user search in `tools/extract/user-inventory.js` line 60: try `username=%` or `/rest/api/2/group/member` for LDAP-backed DC instances where `username=.` misses users
- [ ] Add `"type": "commonjs"` to `package.json`
- [ ] Add `node-fetch` to `package.json` optionalDependencies
- [ ] Add `scripts` section to `package.json` with placeholder test command
- [ ] Document `parseFlags` short flag limitation in `tools/lib/client.js` (lines 186-209) or implement proper short flag handling
