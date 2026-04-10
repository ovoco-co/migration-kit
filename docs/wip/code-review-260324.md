# Code Review: migration-kit

Review date: 2026-03-24


## Tools

### tools/lib/client.js

**[Medium] Config file parse error not caught (line 37).** `JSON.parse(fs.readFileSync(...))` will throw a generic SyntaxError if `.migrationrc.json` is malformed. Wrap in try/catch with a message pointing to the config file.

**[Medium] Infinite retry loop on non-429 transient errors (lines 60-92).** The `request()` function retries on 429 but throws immediately on all other non-2xx responses. Server errors (500, 502, 503) during large extractions are common on DC instances under load. Consider retrying on 5xx with backoff, similar to the 429 handling.

**[Low] `paginate()` does not support cursor-based pagination (lines 109-145).** The doc comment on line 100 says "Assets Cloud uses cursor-based pagination on some endpoints" but the implementation only uses offset-based (`startAt`/`maxResults`). The Assets Cloud API returns a `cursor` or `pageToken` field. This will silently return only the first page for those endpoints.

**[Low] `paginate()` auto-detection of results key is fragile (line 129).** When `resultsKey` is null, it tries `data.values`, then `data.issues`, then `data` itself. If the response has both a `values` key and an `issues` key, the wrong one could be selected. Every caller should pass an explicit `resultsKey`.

**[Low] `parseFlags` does not handle short flags with values (lines 186-209).** Single-dash flags like `-h` work for `--help`, but `-s` or other short flags are silently pushed to `positional`. Not a bug today since only `--help`/`-h` uses a short form, but worth noting.

**[Low] `outputPath` resolves relative to cwd, not repo root (line 167).** `config.outputDir` defaults to `./output`, which resolves relative to the working directory at invocation time. If someone runs a script from a subdirectory, output lands in the wrong place. Consider resolving relative to the config file location (same as the config loader does).

### tools/extract/delta-extract.js

**[Medium] Silent swallowing of comment fetch errors (line 51).** The `catch` block on the comment pagination is empty. If comments fail for a permission reason, the issue is exported with zero comments and no indication that something went wrong. At minimum, log a warning or set a flag on the output.

**[Low] JQL date formatting discards timezone (line 118).** `sinceDate.toISOString().slice(0, 16)` produces a UTC timestamp. If the user passes a local-time string like `"2026-03-01T00:00:00"`, it is parsed as local time by `new Date()`, then converted to UTC for the JQL. The JQL will use server time. This mismatch could miss issues or include extras near the boundary. Document this behavior or always treat the input as UTC.

### tools/extract/issue-counts.js

**[Medium] Makes one API call per issue type per project per status (lines 132-160).** For an instance with 30 projects, 15 issue types, and 20 statuses per project, this is 30 * (1 + 15 + 20) = 1,080 API calls. On Cloud with rate limiting, this can take a very long time. Consider using JQL aggregation or batching (e.g., `GROUP BY issuetype` via JQL analytics if available).

**[Low] `getStatusesForProject` uses JSON.stringify/parse for deduplication (lines 51-65).** This works but is fragile if the status object shape changes. A Map keyed by status name would be cleaner and faster.

### tools/extract/field-inventory.js

**[Medium] Fetches contexts and options for every custom field sequentially (lines 50-96).** On instances with 200+ custom fields, this makes 200+ API calls just for contexts, then another batch for options. No parallelism or batching. Consider chunked `Promise.all` with a concurrency limit.

### tools/extract/scriptrunner-audit.js

**[Low] `workflowFunctions` array is always empty (line 184-186).** The summary includes `audit.workflowFunctions` in the total count, but nothing ever populates it. The workflow post-functions are captured by `workflow-inventory.js` instead. The field should either be removed from the audit output or cross-referenced from the workflow inventory.

### tools/extract/user-inventory.js

**[Low] DC user search with `username=.` may not return all users (line 60).** The comment acknowledges this: "The '.' query returns all users on most DC installations." On some DC versions with LDAP backends, this pattern does not match all users. Consider also trying `username=%` or the `/rest/api/2/group/member` endpoint for critical groups.

### tools/extract/scheme-inventory.js

**[Low] Does not detect unused schemes (line 161).** The tooling plan says the script should flag "unused schemes (not assigned to any project)" but the `analyzeSchemes()` function only checks for defaults, not for unused schemes. The project assignment data is collected but not cross-referenced against scheme IDs.

### tools/transform/field-mapper.js, status-mapper.js

**[Medium] CSV parser does not handle quoted fields with commas (field-mapper.js line 31-46, status-mapper.js line 34-49).** Both use a simple `split(',')` parser. If a field name or note contains a comma, the row will be mis-parsed. The `user-mapper.js` has a proper quote-aware parser (line 38-55) but the other two mappers do not. This is inconsistent and will break on real data where field names like "Priority, Custom" or notes with commas are common.

### tools/transform/user-mapper.js

**[Low] Auto-generated user map uses first match for key (line 115).** When building the key from `entry.source.username || entry.source.email`, if username is empty string (not null), it becomes the key. Should use `entry.source.username || entry.source.email || entry.source.accountId` with a truthiness check, not just `||`.

### tools/gitlab/gitlab-client.js

**[Medium] No retry on 5xx errors (lines 60-81).** Same issue as `client.js`. GitLab self-managed instances return 500/502 during deployments or high load. The client only retries on 429.

**[Low] `glPaginate` does not cap total pages (lines 89-111).** If a GitLab API returns unexpected pagination headers or gets stuck in a loop, this will paginate forever. Add a safety limit (e.g., max 500 pages).

### tools/gitlab/extract-issues.js

**[Low] Hardcoded custom field ID for story points (line 84).** `customfield_10016` is the story points field on most Jira Cloud instances but varies on DC. Should be configurable via `.migrationrc.json` or a CLI flag.

**[Low] Jira wiki markup conversion is incomplete (lines 28-61).** The `stripJiraMarkup` function handles common patterns but misses: nested lists (`** ` for level 2), table markup (`||header||` and `|cell|`), color/image macros, and `{anchor}` links. For large migrations, unconverted markup will appear as literal Jira syntax in GitLab issues.

### tools/gitlab/import-issues.js

**[Critical] No idempotency or resume capability (lines 221-308).** If the import fails partway through (network error, rate limit exhaustion, GitLab downtime), re-running the script will create duplicate issues for everything already imported. The script should check if an issue with the same Jira key in the title already exists before creating, or accept a `--resume-from` flag that skips already-imported keys using the results file.

**[Medium] Attachment upload uses hand-built multipart body (lines 104-109).** The boundary construction does not escape the filename, so filenames containing quotes or the boundary string will produce a malformed request. Use a proper multipart library or at minimum sanitize the filename.

**[Medium] User lookup is one API call per issue (lines 252-259).** For large imports, this makes thousands of redundant user lookups. Cache the username-to-ID mapping after the first lookup.

**[Low] `created_at` on issue creation requires admin token (line 266).** GitLab's `created_at` parameter on issue creation is only available to project owners and admins. If the token belongs to a regular maintainer, the parameter is silently ignored and all issues get the current timestamp. The docs should note this requirement.

### tools/gitlab/validate-import.js

**[Low] Spot-check sample selection is not reproducible (line 142).** `Math.random()` with `.sort()` produces a different sample each run. Consider accepting a `--seed` flag or logging the selected keys so the same sample can be re-validated.

**[Low] Fetches open and closed issue lists but does not use them (lines 84-85).** `openIssues` and `closedIssues` are fetched via `glPaginate` with `per_page: '1'` but the results are never used. The actual count comes from the `issues_statistics` endpoint. These two calls are wasted.

### tools/validate/field-spot-check.js

**[Medium] Makes one API call per random offset to get sample keys (lines 82-96).** For a sample of 50 issues, this makes 50 separate search API calls, each fetching one issue. A single search with `maxResults=50` and a random `startAt` would be far more efficient, though less uniformly random.

### tools/validate/assets-verify.js

**[Low] Does not use rate limiting or the shared client for Assets API calls (lines 46-61).** The `assetsGet` function constructs its own `fetch` calls, bypassing `client.js` entirely. This means no rate limit handling, no retry on 429, and no request logging for Assets endpoints.

### tools/validate/link-integrity.js

**[Low] Uses `issueFunction in hasLinks()` which requires ScriptRunner (line 63).** The primary JQL uses a ScriptRunner function. The fallback fetches `sampleSize * 2` issues and filters, which could miss issues with links if the first batch happens to have few linked issues. Consider sorting by a field more likely to correlate with links, or increasing the fallback multiplier.

### tools/pull-docs.js

**[Medium] Requires `node-fetch` but it is not in package.json (line 34).** The package lists `cheerio` and `turndown` as optionalDependencies but not `node-fetch`. On Node 18+, the global `fetch` is available (used by all other tools), but this script explicitly `require('node-fetch')`. Either add `node-fetch` to optionalDependencies or switch to the built-in `fetch` (would need to replace `resp.text()` usage pattern but it's compatible).

**[Low] User-Agent says `cmdb-kit-doc-pull/1.0` (line 174).** This is a copy from cmdb-kit and should say `migration-kit-doc-pull/1.0` or similar.


## Documentation

### docs/gitlab-migration.md

**[Low] User map format inconsistency.** Step 4 shows a JSON user map (`{ "email": "username" }`), but `import-issues.js` loads it with `--user-map` and uses it as `userMap[email]` expecting the value to be a GitLab username string. This is correct, but the existing `tools/transform/user-mapper.js` produces a different format (objects with `sourceUsername`, `targetAccountId`, etc.). The GitLab user map is a separate simpler format that is not generated by any tool. The doc should note this or provide a script to generate it from the user inventory.

### docs/servicenow-migration.md

**[Low] No reference to ServiceNow extraction tooling.** The "Extraction from Jira" section shows how to use migration-kit tools to extract from Jira, but the "ServiceNow to JSM" section says to use "ServiceNow Table API or export sets" without any tooling support. The tooling plan does not include a ServiceNow extraction adapter. This is fine as a known gap, but the doc should note that ServiceNow extraction is manual.

### docs/wip/tooling-plan.md

**[Low] "All done" note in Build Order section (line 321).** States "All done. Listed here by priority for reference." This is accurate since all planned tools are built, but the plan does not include the GitLab adapter tools. The gitlab tools were added after the plan was written. Consider adding a "GitLab adapter" section to the plan for completeness.

**[Low] Design Principles section says "node-fetch (already in package.json)" (line 357).** node-fetch is NOT in package.json. Only cheerio and turndown are listed.

### docs/wip/docs-restructure-plan.md

**[Low] References `platforms/` subdirectory that does not exist.** The plan targets files like `platforms/servicenow-fields.md` and `platforms/servicenow-jira-field-map.md`. These have not been created. This is a plan document so it describes future work, but worth noting the gap.

### CLAUDE.md

**[Low] Does not mention the `src/reference/` directory is empty.** The directory tree shows `src/reference/` as "Pulled platform docs (gitignored)" but the directory is empty and has never had content (no .gitkeep). Anyone running the tools for the first time might be confused by the empty structure.

### README.md

No issues found. Accurate and consistent with the codebase.


## Templates

### templates/field-mapping.csv

**[Low] Header-only file.** This is correct (it is a template), but there is no example row or README explaining the expected values for each column. The `action` column accepts `map`, `skip`, `create`, `rename` but this is only documented in `field-mapper.js` source code, not in the template itself.

### templates/status-mapping.csv

**[Low] Same as above.** No example row. The column values are only documented in source code.

### templates/user-mapping.csv

**[Low] Same as above.** No example row. However, the user-mapper.js can auto-generate from cross-reference, so manual editing is optional.

### templates/gitlab-label-mapping.csv

No issues. Good default values with reasonable colors. Only template that ships with example data.

### Missing template

**[Low] No `.migrationrc.json.example` template.** The config file structure is documented in `tooling-plan.md` and printed to stderr when missing, but there is no copyable template file in the repo. A `.migrationrc.json.example` in the repo root would make setup easier.


## Package and Config

### package.json

**[Medium] Missing `node-fetch` dependency.** As noted above, `pull-docs.js` requires it. Either add to optionalDependencies or refactor to use built-in fetch.

**[Low] No `scripts` section.** No `npm test`, no linting, no formatting. Not a problem for a small toolkit but makes it harder to enforce consistency as the codebase grows.

**[Low] No `"type": "module"` or `"type": "commonjs"` field.** All files use `require()` (CommonJS), which is the default, so this works. But being explicit prevents confusion.

### .gitignore

No issues. Correctly ignores `node_modules/`, `.env`, `*.log`, `.DS_Store`, `src/reference/`, `output/`, and `.migrationrc.json`.

### output/ directory

**[Low] Empty directory with no .gitkeep.** The directory exists in git but is also gitignored. Once cloned fresh, the `output/` directory will not exist. The `writeOutput` function in `client.js` creates it via `mkdirSync({ recursive: true })`, so this is not a functional problem, but the empty tracked directory is confusing.


## Security

**[Low] `.migrationrc.json` is properly gitignored.** Confirmed in `.gitignore` line 7.

**[Low] No credential validation on config load.** `client.js` loads auth credentials and uses them immediately. If `token` is empty string, the script will make unauthenticated requests that fail with 401, but the error message will not clearly indicate "your token is empty." A simple check in `loadConfig()` would improve the experience.

**[Low] GitLab token sent via `PRIVATE-TOKEN` header.** This is the standard GitLab authentication method. No issue, but note that the token is logged in request URLs in the console output (via `console.error` on line 57 of `gitlab-client.js`). The URL does not contain the token (it's in headers), so this is fine.

**[Low] Attachment download in import-issues.js passes Jira credentials in-band (line 91-94).** The Jira auth header is constructed inline rather than going through `client.js`. This works but bypasses the shared auth logic. If someone changes their auth config structure, this code will break independently.


## Cross-Repo Consistency

### pull-docs.js

The files are byte-identical between migration-kit and cmdb-kit. No divergence. If one is updated, the other should be updated to match. Consider noting this in both repos' CLAUDE.md files.

### User-Agent string

Both copies use `cmdb-kit-doc-pull/1.0` as the User-Agent. The migration-kit copy should use its own name.


## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Medium | 9 |
| Low | 28 |

The one critical issue is the lack of idempotency in `import-issues.js`. Re-running after a partial failure creates duplicates. Everything else is error handling hardening, performance improvements, or documentation polish.

The codebase is well-structured overall. Consistent patterns across scripts (parseFlags, loadConfig, writeOutput, main().catch), good help text, and clean separation between extract/transform/validate phases. The biggest structural gap is the CSV parsers: two of the three mappers cannot handle commas in quoted fields.
"},"caller":{"type":"direct"}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"cache_creation_input_tokens":425,"cache_read_input_tokens":104825,"cache_creation":{"ephemeral_5m_input_tokens":425,"ephemeral_1h_input_tokens":0},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"}},"requestId":"req_011CZNCUHWLxZdxcjPoj6G54","type":"assistant","uuid":"c0417d08-f034-49bd-ad6f-e5ec931c4db7","timestamp":"2026-03-24T16:13:26.917Z","userType":"external","entrypoint":"cli","cwd":"/home/admin1/ovoco","sessionId":"eb3adeb3-9e99-430a-9d8c-198fa5a9ae74","version":"2.1.81","gitBranch":"master","slug":"calm-juggling-thimble"}
{"parentUuid":"c0417d08-f034-49bd-ad6f-e5ec931c4db7","isSidechain":true,"promptId":"d9d9ae9d-7d01-46da-883e-ee6b4c968cdb","agentId":"ae798e2c49e364cfe","type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"Permission to use Write has been denied. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways, e.g. do not use your ability to run tests to execute non-test actions. You should only try to work around this restriction in reasonable ways that do not attempt to bypass the intent behind this denial. If you believe this capability is essential to complete the user's request, STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed.","is_error":true,"tool_use_id":"toolu_01KG1zwCPZHdCm2zqHQrsZeD