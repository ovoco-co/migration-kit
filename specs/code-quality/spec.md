# Code Quality Fixes

| Field | Value |
|-------|-------|
| Feature Branch | code-quality |
| Created | 2026-03-24 |
| Status | In Progress (Groups 1-3 done, Groups 4-7 pending) |
| Input | Code review 2026-03-24 |

## User Scenarios and Testing

### P1: Resilient API calls on flaky networks
A migration engineer runs extract tools against a production Jira or GitLab instance. The API returns intermittent 5xx errors due to load.

**Why this priority**: Silent failures during extraction produce incomplete data sets that are discovered only after import, wasting hours of rework.

**Independent Test**: Simulate 5xx responses from the API and confirm the client retries with exponential backoff before failing.

**Acceptance Scenarios**:
- Given a Jira API call returns a 502, when the client retries with exponential backoff, then the call succeeds on the next attempt and extraction continues without data loss.
- Given the API returns 5xx on every attempt, when the retry limit is reached, then the tool exits with a clear error message identifying the failed endpoint.
- Given the GitLab client encounters a 503, when it retries, then backoff delays increase exponentially and the request eventually succeeds.

### P2: Correct CSV parsing across all modules
A migration engineer provides a field mapping CSV where values contain commas inside quoted fields.

**Why this priority**: Inconsistent CSV parsing across modules means mappings that work in one tool break silently in another, producing wrong field values after import.

**Independent Test**: Feed a CSV with quoted fields containing commas to field-mapper.js and status-mapper.js and verify parsed output matches user-mapper.js behavior.

**Acceptance Scenarios**:
- Given a CSV row with `"value, with comma"` in a field, when field-mapper.js parses it, then the full quoted string is treated as a single value.
- Given a CSV row with `"value, with comma"` in a field, when status-mapper.js parses it, then the output matches user-mapper.js parsing for the same input.

### P3: Reliable delta extraction
A migration engineer runs delta-extract.js to pull only issues modified since the last run.

**Why this priority**: Silent error swallowing and timezone bugs in delta extraction cause missed issues or duplicate pulls, undermining incremental migration workflows.

**Independent Test**: Run delta-extract against a project with known comment fetch errors and timezone edge cases. Verify errors are surfaced and JQL date formatting is correct across timezones.

**Acceptance Scenarios**:
- Given a comment fetch fails for an issue, when delta-extract processes that issue, then the error is logged with the issue key and the tool exits with a non-zero status.
- Given the local timezone is UTC+5, when delta-extract formats a JQL date filter, then the date string correctly reflects the intended UTC boundary.

### P4: Performant large-instance operations
A migration engineer runs issue-counts.js or field-inventory.js against a Jira instance with hundreds of projects and thousands of custom fields.

**Why this priority**: One API call per (project, type, status) combination triggers rate limiting on large instances, making the tool unusable at scale.

**Independent Test**: Run issue-counts.js against a mock with 200 projects and confirm API calls are batched. Run field-inventory.js and confirm context/option fetches use chunked Promise.all.

**Acceptance Scenarios**:
- Given a Jira instance with 200 projects and 50 issue types, when issue-counts.js runs, then JQL queries are batched and total API calls are reduced by at least 10x compared to current behavior.
- Given a Jira instance with 500 custom fields, when field-inventory.js fetches contexts and options, then requests run in parallel chunks rather than sequentially.

### P5: Pagination safety
API pagination in both the Jira and GitLab clients runs without a maximum page cap.

**Why this priority**: An API error returning a non-advancing cursor causes an infinite loop, but this is an edge case that only manifests on specific error conditions.

**Independent Test**: Simulate a non-advancing pagination cursor and confirm the client stops after hitting the page cap.

**Acceptance Scenarios**:
- Given the Jira API returns the same cursor value twice, when the client detects no pagination progress, then it stops and raises an error.
- Given the GitLab client has fetched 1000 pages, when the cap is reached, then pagination stops with a warning.

## Edge Cases

- API returns 5xx on the final page of a paginated result set (partial data already collected)
- CSV field contains escaped quotes inside a quoted field (`"value with ""quotes"""`))
- Delta extract runs across a DST transition boundary
- Jira instance has custom fields with identical names but different IDs
- GitLab import retried after partial completion (duplicate detection needed)
- Multipart upload with filenames containing special characters (spaces, unicode)

## Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | lib/client.js retries 5xx responses with exponential backoff (configurable max retries) |
| FR-002 | lib/client.js caps cursor pagination to prevent infinite loops on non-advancing cursors |
| FR-003 | lib/client.js handles config parse errors gracefully with actionable messages |
| FR-004 | lib/client.js uses robust results key detection instead of fragile heuristic |
| FR-005 | field-mapper.js and status-mapper.js parse quoted CSV fields with commas (matching user-mapper.js) |
| FR-006 | delta-extract.js surfaces comment fetch errors instead of swallowing them |
| FR-007 | delta-extract.js formats JQL dates with correct timezone handling |
| FR-008 | issue-counts.js batches JQL queries instead of one API call per (project, type, status) |
| FR-009 | field-inventory.js fetches contexts and options in parallel chunks |
| FR-010 | scheme-inventory.js implements unused scheme detection using already-collected data |
| FR-011 | gitlab-client.js adds 5xx retry with exponential backoff |
| FR-012 | gitlab-client.js caps pagination to prevent infinite loops |
| FR-013 | extract-issues.js makes story points field ID configurable instead of hardcoded |
| FR-014 | extract-issues.js expands Jira wiki markup conversion (nested lists, tables, colors, macros) |
| FR-015 | import-issues.js adds idempotency/resume capability to prevent duplicates on retry |
| FR-016 | import-issues.js escapes filenames in multipart body |
| FR-017 | import-issues.js caches user lookups to avoid redundant API calls |

### Key Entities

- `lib/client.js` - Shared Jira API client (retry, pagination, config parsing)
- `tools/gitlab/gitlab-client.js` - GitLab API client (retry, pagination)
- `transform/field-mapper.js` - CSV-based field mapping
- `transform/status-mapper.js` - CSV-based status mapping
- `transform/user-mapper.js` - CSV-based user mapping (reference implementation for CSV parsing)
- `extract/delta-extract.js` - Incremental issue extraction
- `extract/issue-counts.js` - Project/type/status counting
- `extract/field-inventory.js` - Custom field discovery
- `extract/scheme-inventory.js` - Scheme inventory and unused detection
- `tools/gitlab/extract-issues.js` - Jira issue extraction for GitLab import
- `tools/gitlab/import-issues.js` - GitLab issue import

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | All API clients retry 5xx errors with exponential backoff and fail with clear messages after max retries |
| SC-002 | All CSV parsers handle quoted fields with embedded commas identically |
| SC-003 | delta-extract.js exits non-zero when comment fetches fail, with issue keys in the error output |
| SC-004 | issue-counts.js completes against a 200-project instance without triggering rate limiting |
| SC-005 | Pagination in both clients terminates when cursor does not advance or page cap is reached |
| SC-006 | GitLab import can be retried without creating duplicate issues |
| SC-007 | All fixes are isolated commits with no architectural changes |

## Assumptions

- The existing test infrastructure (if any) supports adding unit tests for retry and CSV parsing behavior
- The user-mapper.js CSV parsing pattern is the correct reference implementation
- Rate limiting thresholds are known for target Jira and GitLab instances
- No breaking changes to CLI interfaces or output formats
- Each fix is small enough to be a single targeted commit
