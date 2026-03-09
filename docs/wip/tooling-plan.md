# migration-kit Tooling Plan

Scripts for the `tools/` directory. All scripts are Node.js, use JSON-RPC or REST against Jira/Assets APIs, and read configuration from a shared `.migrationrc.json` file at the repo root (gitignored).


## Shared Foundation

### `.migrationrc.json` (gitignored)

Connection config for source and target instances. Every script reads this.

```json
{
  "source": {
    "type": "dc",
    "baseUrl": "https://jira-source.example.com",
    "auth": { "username": "", "token": "" },
    "assetsBaseUrl": "https://jira-source.example.com/rest/assets/1.0"
  },
  "target": {
    "type": "cloud",
    "baseUrl": "https://example.atlassian.net",
    "auth": { "email": "", "token": "" },
    "assetsWorkspaceId": "",
    "assetsBaseUrl": "https://api.atlassian.com/jsm/assets/workspace/{workspaceId}/v1"
  },
  "outputDir": "./output"
}
```

### `tools/lib/client.js`

Thin API client wrapper that:
- Reads `.migrationrc.json`
- Handles DC auth (basic auth with username + token/password) and Cloud auth (email + API token)
- Handles pagination (offset-based for DC, cursor-based for Cloud)
- Handles rate limiting (retry with backoff for Cloud 429s)
- Provides `get()`, `post()`, `put()`, `delete()` for both Jira REST and Assets REST
- Logs every request to stdout for debugging


## tools/extract/

Scripts that pull data from the source instance. Output is JSON files in `output/extract/`.

### `field-inventory.js`

Pulls all custom fields from source and target, cross-references by name and type.

Output: `output/extract/fields-source.json`, `output/extract/fields-target.json`, `output/extract/fields-crossref.json`

For each field:
- id, name, type, description
- Contexts (global vs project-scoped, which projects)
- Options (for select/multi-select/cascading)
- Which screens reference it
- Whether it has data (at least one issue with a non-null value)

The cross-reference file flags:
- Same name + same type on both sides (CMJ will merge)
- Same name + different type (CMJ will create new)
- Source-only fields (will be created on target)
- Target-only fields (will remain as-is)
- Duplicates within a single instance (same name + same type, ambiguous)

Usage: `node tools/extract/field-inventory.js [--source-only] [--target-only]`

### `workflow-inventory.js`

Pulls all workflows from source with full transition detail.

Output: `output/extract/workflows-source.json`

For each workflow:
- Name, description, associated workflow scheme(s)
- Statuses (name, category, id)
- Transitions (name, from, to)
- Conditions, validators, post-functions on each transition
- Flags transitions with ScriptRunner post-functions (class name contains `com.onresolve`)
- Flags transitions with custom conditions or validators

Usage: `node tools/extract/workflow-inventory.js`

### `scriptrunner-audit.js`

Pulls all ScriptRunner configuration from the source DC instance via ScriptRunner REST API (`/rest/scriptrunner/latest/`).

Output: `output/extract/scriptrunner-audit.json`

Inventories:
- Script fields (name, script, referenced custom field IDs)
- Listeners (event, script, notes)
- Behaviours (which fields, which forms, script logic summary)
- Escalation Services (JQL, cron, script)
- Workflow post-functions (from workflow-inventory cross-reference)
- Custom REST endpoints (method, path, script)
- Scheduled jobs

For each item, auto-categorizes Cloud compatibility:
- `cloud-scriptrunner` — likely works on ScriptRunner Cloud (no Behaviours, no custom endpoints, no raw JVM access)
- `cloud-automation` — replaceable with Jira Automation rule
- `forge-app` — needs a Forge app
- `process-change` — needs a manual process redesign
- `unknown` — requires manual review

Usage: `node tools/extract/scriptrunner-audit.js`

### `scheme-inventory.js`

Pulls all scheme types from source and target. Used to scope the cleanup work before migration.

Output: `output/extract/schemes-source.json`, `output/extract/schemes-target.json`

Scheme types:
- Permission schemes (name, grants, projects)
- Notification schemes (name, events, projects)
- Issue type schemes (name, issue types, projects)
- Screen schemes (name, screen mappings, projects)
- Issue type screen schemes (name, mappings, projects)
- Field configuration schemes (name, mappings, projects)
- Workflow schemes (name, mappings, projects)

For each, flags:
- Default schemes (cannot be exported by CMJ)
- Unused schemes (not assigned to any project)
- Duplicate schemes (same configuration, different name)

Usage: `node tools/extract/scheme-inventory.js [--source-only] [--target-only]`

### `user-inventory.js`

Pulls all users and groups from source and target.

Output: `output/extract/users-source.json`, `output/extract/users-target.json`, `output/extract/users-crossref.json`

For each user:
- Username/account ID, display name, email, active/inactive, groups, project roles
- Last login date (if available)

Cross-reference flags:
- Same email on both sides (will match)
- Same username, different email (conflict)
- Source-only users (will be created on target)
- Service accounts with no real email (problem for Cloud)

Usage: `node tools/extract/user-inventory.js`

### `issue-counts.js`

Counts issues per project, per issue type, per status on the source. Used for validation after migration.

Output: `output/extract/issue-counts-source.json`

Usage: `node tools/extract/issue-counts.js [--project KEY1,KEY2]`

### `delta-extract.js`

Pulls issues created or modified since a given timestamp. Used for the final cutover delta.

Output: `output/extract/delta-YYYY-MM-DDTHH-MM.json`

For each issue: key, all fields, comments, attachments (metadata only, not binary), issue links, changelog.

Usage: `node tools/extract/delta-extract.js --since "2026-03-01T00:00:00" --project KEY1,KEY2`


## tools/transform/

Scripts that transform extracted data into target-ready format. Input is `output/extract/`, output is `output/transform/`.

### `field-mapper.js`

Reads a field mapping CSV (user-maintained) and the extracted field inventories. Validates the mapping and produces a field ID translation table.

Input:
- `output/extract/fields-crossref.json`
- `templates/field-mapping.csv` (user fills this out)

Output: `output/transform/field-id-map.json`

The CSV has columns: source_field_name, source_field_id, target_field_name, target_field_id, action (map/skip/create/rename)

Validation:
- Every source field with data must have a mapping
- No target field mapped to twice (unless intentional merge)
- Type compatibility (text to text, select to select, etc.)
- Flags cascading selects and Assets object fields for manual review

Usage: `node tools/transform/field-mapper.js`

### `status-mapper.js`

Reads a status mapping CSV and validates every source issue has a valid target status.

Input:
- `output/extract/workflows-source.json`
- `output/extract/issue-counts-source.json`
- `templates/status-mapping.csv` (user fills this out)

Output: `output/transform/status-map.json`, warnings to stdout

The CSV has columns: source_status, source_category, target_status, target_category

Validation:
- Every source status with issues must have a mapping
- Target statuses must exist (checked against target API if `--live` flag)
- Category alignment (a source "Done" status should not map to a target "In Progress" status without a warning)

Usage: `node tools/transform/status-mapper.js [--live]`

### `user-mapper.js`

Reads user inventories, produces a username-to-account-ID mapping for import.

Input: `output/extract/users-crossref.json`

Output: `output/transform/user-map.json`

Flags:
- Unmatched source users (need manual resolution)
- Service accounts (need Atlassian account creation)
- Inactive users being mapped to active accounts (or vice versa)

Usage: `node tools/transform/user-mapper.js`


## tools/validate/

Scripts that run after migration to verify data integrity. Input is the source extractions plus live API calls against the target.

### `count-compare.js`

Compares issue counts between source extraction and live target.

Input: `output/extract/issue-counts-source.json`

Output: stdout report + `output/validate/count-compare.json`

Checks:
- Total issues per project match
- Issues per issue type per project match
- Issues per status per project match (using the status mapping)
- Flags any project/type/status with a count mismatch

Usage: `node tools/validate/count-compare.js`

### `field-spot-check.js`

Samples N random issues from the source extraction, fetches the same issues on the target, and compares field values.

Input:
- `output/transform/field-id-map.json`
- Source issue data (fetched live or from extraction)

Output: `output/validate/spot-check.json`

For each sampled issue:
- Pass/fail per field
- Expected vs actual value for failures
- Summary: X of Y fields match, Z issues sampled, N failures

Usage: `node tools/validate/field-spot-check.js --sample 50 [--project KEY1,KEY2]`

### `link-integrity.js`

Verifies issue links survived migration. Compares source issue links against target.

Input: source extraction or live API

Output: `output/validate/link-integrity.json`

Checks:
- All issue links present on target
- Link types match (or map correctly)
- No orphaned links (pointing to non-existent issues)

Usage: `node tools/validate/link-integrity.js [--project KEY1,KEY2]`

### `assets-verify.js`

Verifies Assets/CMDB data after migration. Compares source schema objects against target.

Input: source Assets extraction or live API

Output: `output/validate/assets-verify.json`

Checks:
- Object counts per type match
- Sample N objects and compare all attributes
- Reference integrity (referenced objects exist on target)
- AQL queries that worked on source return equivalent results on target

Usage: `node tools/validate/assets-verify.js --schema "IT Assets" --sample 50`


## Templates

### `templates/field-mapping.csv`

Blank template with headers. User fills in during discovery.

```
source_field_name,source_field_id,source_field_type,target_field_name,target_field_id,target_field_type,action,notes
```

### `templates/status-mapping.csv`

```
source_status,source_category,target_status,target_category,notes
```

### `templates/user-mapping.csv`

```
source_username,source_email,source_display_name,target_account_id,target_email,target_display_name,action,notes
```


## Build Order

All done. Listed here by priority for reference.

**Foundation and extraction** (needed on day one of any engagement):
- `lib/client.js`
- `extract/field-inventory.js`
- `extract/issue-counts.js`
- `extract/user-inventory.js`
- Templates (field, status, user mapping CSVs)

**Transformation and deeper extraction**:
- `extract/workflow-inventory.js`
- `extract/scheme-inventory.js`
- `extract/scriptrunner-audit.js`
- `transform/field-mapper.js`
- `transform/status-mapper.js`
- `transform/user-mapper.js`

**Validation** (needed for test cycles):
- `validate/count-compare.js`
- `validate/field-spot-check.js`
- `validate/link-integrity.js`
- `validate/assets-verify.js`

**Cutover support**:
- `extract/delta-extract.js`


## Design Principles

- Every script is a standalone CLI. No orchestration framework. Run them in order manually.
- Output is always JSON (machine-readable) with human-readable summaries to stdout.
- Scripts never modify the source or target. Extract and validate are read-only. Transform produces files locally.
- The actual import into the target is done by JCMA, CMJ, or cmdb-kit, not by these scripts. These scripts prepare the data and verify the results.
- All API calls go through `lib/client.js` so auth, pagination, and rate limiting are handled once.
- Scripts fail loudly on API errors. No silent swallowing of 4xx/5xx responses.
- Every script accepts `--help` and prints usage.
- No dependencies beyond node-fetch (already in package.json for pull-docs.js). Cheerio and Turndown are only needed by pull-docs.js.
