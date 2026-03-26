# Code Quality Fixes - Plan

## Goal

Address all 38 issues (1 critical, 9 medium, 28 low) identified in the 2026-03-24 code review. The tools work but have error handling gaps, performance problems on large instances, and inconsistent patterns across modules. These tools run against production Jira instances during migrations, so silent failures and missing retry logic are not acceptable.

## Architecture Decisions

**Fix in place, no refactors.** Every fix targets a specific function at a specific line. No architectural changes, no new abstractions. The codebase structure (extract/transform/validate with shared client) is sound.

**Consistent patterns across all scripts.** Where the same problem exists in multiple files (CSV parsing, 5xx retry, pagination caps), apply the same fix pattern everywhere. The `user-mapper.js` quote-aware CSV parser is the reference implementation for the other two mappers.

**Shared client handles all retries.** Both `tools/lib/client.js` and `tools/gitlab/gitlab-client.js` get 5xx retry with exponential backoff. No individual scripts implement their own retry logic. `tools/validate/assets-verify.js` stops bypassing the shared client.

## Implementation Approach

### Group 1: Critical - Idempotency (import-issues.js)

The one critical issue. `tools/gitlab/import-issues.js` (lines 221-308) has no idempotency or resume capability. If the import fails partway through, re-running creates duplicate issues.

Fix: Before creating each issue, check if an issue with the Jira key in the title already exists in the target GitLab project. Use the search API (`GET /projects/:id/issues?search=JIRA-123`). If found, skip and log. Also write a results file after each successful import so `--resume-from` can skip already-imported keys.

### Group 2: Shared Infrastructure Fixes (client.js, gitlab-client.js)

**5xx retry with exponential backoff.** Add to `request()` in `tools/lib/client.js` (lines 60-92) and the equivalent in `tools/gitlab/gitlab-client.js` (lines 60-81). Retry on 500, 502, 503 with backoff matching the existing 429 handling. Cap at 3 retries.

**Config parse error handling.** `tools/lib/client.js` line 37: wrap `JSON.parse(fs.readFileSync(...))` in try/catch. On `SyntaxError`, print a message pointing to `.migrationrc.json` with the parse error details.

**Cursor-based pagination.** `tools/lib/client.js` `paginate()` (lines 109-145): add cursor/pageToken support for Assets Cloud endpoints that return pagination cursors instead of offset-based results.

**Pagination safety cap.** `tools/gitlab/gitlab-client.js` `glPaginate()` (lines 89-111): add a max pages limit (500) to prevent infinite loops on unexpected pagination headers.

**Explicit resultsKey in all callers.** Every script that calls `paginate()` should pass an explicit `resultsKey` instead of relying on auto-detection (line 129 fragile fallback).

**Credential validation.** `tools/lib/client.js` `loadConfig()`: check that auth token/email fields are non-empty strings before proceeding.

**Output path resolution.** `tools/lib/client.js` line 167: resolve `config.outputDir` relative to the config file location, not `process.cwd()`.

### Group 3: CSV Parser Consistency (field-mapper.js, status-mapper.js)

`tools/transform/field-mapper.js` (lines 31-46) and `tools/transform/status-mapper.js` (lines 34-49) use `split(',')` which breaks on quoted fields containing commas. `tools/transform/user-mapper.js` (lines 38-55) has a proper quote-aware parser.

Fix: Extract the `user-mapper.js` CSV parser into a shared function in `tools/lib/client.js` (or a new `tools/lib/csv.js`). Replace the naive parsers in field-mapper and status-mapper with calls to the shared function.

### Group 4: Error Handling and Silent Failures

**delta-extract.js silent comment swallowing.** `tools/extract/delta-extract.js` line 51: empty catch block on comment fetch. Replace with a warning log and a `commentsFailed: true` flag on the issue output.

**delta-extract.js timezone mismatch.** `tools/extract/delta-extract.js` line 118: `new Date()` parses local time, then `toISOString()` converts to UTC for JQL. Document this behavior in the `--help` output, or always treat `--since` input as UTC.

**scriptrunner-audit.js empty workflowFunctions.** `tools/extract/scriptrunner-audit.js` lines 184-186: `audit.workflowFunctions` is always empty because workflow post-functions are captured by `workflow-inventory.js`. Either remove the field or cross-reference from the workflow inventory output.

**scheme-inventory.js missing unused detection.** `tools/extract/scheme-inventory.js` line 161: project assignment data is collected but never cross-referenced to flag unused schemes. Add the cross-reference in `analyzeSchemes()`.

### Group 5: Performance

**issue-counts.js API call explosion.** `tools/extract/issue-counts.js` (lines 132-160): one API call per (project, type, status) combination. For large instances this is 1000+ calls. Batch using JQL with `GROUP BY` or reduce to one call per project with in-memory bucketing.

**field-inventory.js sequential fetches.** `tools/extract/field-inventory.js` (lines 50-96): sequential API calls for contexts and options on each custom field. Use chunked `Promise.all` with a concurrency limit (e.g., 5 concurrent requests).

**field-spot-check.js one-call-per-sample.** `tools/validate/field-spot-check.js` (lines 82-96): 50 separate API calls to get 50 sample issues. Use a single search with `maxResults=50` and a random `startAt`.

**import-issues.js uncached user lookups.** `tools/gitlab/import-issues.js` (lines 252-259): one API call per issue for user lookup. Cache the username-to-ID mapping after first lookup.

**issue-counts.js JSON dedup.** `tools/extract/issue-counts.js` (lines 51-65): `JSON.stringify/parse` for deduplication. Replace with a Map keyed by status name.

### Group 6: GitLab Adapter Fixes

**Hardcoded story points field.** `tools/gitlab/extract-issues.js` line 84: `customfield_10016` is hardcoded. Make configurable via `.migrationrc.json` field `jira.storyPointsField` or `--story-points-field` CLI flag.

**Incomplete Jira wiki markup conversion.** `tools/gitlab/extract-issues.js` lines 28-61: `stripJiraMarkup` misses nested lists (`** `), table markup (`||header||`, `|cell|`), color/image macros, and `{anchor}` links. Add handlers for each.

**Multipart filename escaping.** `tools/gitlab/import-issues.js` lines 104-109: attachment upload boundary construction does not escape filenames containing quotes or the boundary string. Sanitize filenames before embedding in the multipart body.

**Unused API calls in validate-import.js.** `tools/gitlab/validate-import.js` lines 84-85: `openIssues` and `closedIssues` fetched but never used. Remove the two wasted `glPaginate` calls.

**Non-reproducible spot-check sample.** `tools/gitlab/validate-import.js` line 142: `Math.random()` sort. Accept a `--seed` flag or log the selected keys for reproducibility.

**created_at admin requirement.** `tools/gitlab/import-issues.js` line 266: GitLab `created_at` parameter requires admin/owner token. Document this in `docs/gitlab-migration.md` and in `--help` output.

### Group 7: Miscellaneous

**assets-verify.js bypasses shared client.** `tools/validate/assets-verify.js` (lines 46-61): constructs its own `fetch` calls instead of using `client.js`. Refactor to use the shared client for rate limiting, retry, and request logging.

**link-integrity.js ScriptRunner JQL dependency.** `tools/validate/link-integrity.js` line 63: primary JQL uses `issueFunction in hasLinks()` which requires ScriptRunner. Improve the fallback multiplier or use a different approach for non-ScriptRunner instances.

**pull-docs.js wrong User-Agent.** `tools/pull-docs.js` line 174: says `cmdb-kit-doc-pull/1.0`. Change to `migration-kit-doc-pull/1.0`.

**pull-docs.js node-fetch dependency.** `tools/pull-docs.js` line 34: requires `node-fetch` but it is not in `package.json`. Either add `node-fetch` to optionalDependencies or switch to built-in `fetch` (Node 18+).

**user-mapper.js empty string key.** `tools/transform/user-mapper.js` line 115: `entry.source.username || entry.source.email` uses falsy check, but empty string passes as falsy, which is correct. However, add `entry.source.accountId` as a final fallback.

**user-inventory.js DC user search.** `tools/extract/user-inventory.js` line 60: `username=.` may not return all users on LDAP-backed DC instances. Add a fallback to `username=%` or group-member enumeration.

**package.json hygiene.** Add `"type": "commonjs"` field, add `node-fetch` to optionalDependencies, add basic `scripts` section with placeholder test command.

**parseFlags short flag handling.** `tools/lib/client.js` lines 186-209: single-dash flags with values silently go to `positional`. Not a bug today but document the limitation or handle properly.

## Dependencies

- Group 1 (idempotency) is the highest priority, no dependencies
- Group 2 (shared infrastructure) should come before Groups 4-6 since some fixes depend on improved client behavior
- Group 3 (CSV parsers) is independent
- Groups 4-7 are independent of each other
- No dependencies on docs-restructure or gitlab-adapter specs

## File Paths

All files requiring changes:

```
tools/lib/client.js              Groups 2, 3, 7
tools/extract/delta-extract.js   Group 4
tools/extract/issue-counts.js    Group 5
tools/extract/field-inventory.js Group 5
tools/extract/scriptrunner-audit.js  Group 4
tools/extract/scheme-inventory.js    Group 4
tools/extract/user-inventory.js  Group 7
tools/transform/field-mapper.js  Group 3
tools/transform/status-mapper.js Group 3
tools/transform/user-mapper.js   Group 7
tools/validate/field-spot-check.js   Group 5
tools/validate/assets-verify.js  Group 7
tools/validate/link-integrity.js Group 7
tools/validate/count-compare.js  (no issues found)
tools/gitlab/gitlab-client.js    Group 2
tools/gitlab/extract-issues.js   Group 6
tools/gitlab/import-issues.js    Groups 1, 5, 6
tools/gitlab/validate-import.js  Group 6
tools/gitlab/extract-projects.js (no issues found)
tools/pull-docs.js               Group 7
package.json                     Group 7
```
