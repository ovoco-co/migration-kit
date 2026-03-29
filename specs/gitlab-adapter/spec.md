# GitLab Migration Adapter

| Field | Value |
|-------|-------|
| Feature Branch | gitlab-adapter |
| Created | 2026-03-26 |
| Status | Done |
| Input | Need for Jira-to-GitLab migration path |

## User Scenarios and Testing

### P1: Extract issues from Jira for GitLab import
A migration engineer extracts all issues from a Jira project (DC or Cloud), converting them to a format suitable for GitLab import.

**Why this priority**: Extraction is the foundation of the entire migration. Without correct, complete extraction, nothing downstream works.

**Independent Test**: Run extract-issues against a Jira project with known issue count, custom fields, story points, and wiki markup. Verify output count, field mapping, and markup conversion.

**Acceptance Scenarios**:
- Given a Jira project with 100 issues, when extract-issues runs, then all 100 issues are extracted with correct field values.
- Given an issue with Jira wiki markup (bold, links, code blocks), when extracted, then the output contains equivalent Markdown formatting.
- Given an issue with story points in a custom field, when extracted, then the story points value appears in the output.

### P2: Import extracted issues into GitLab with label mapping
A migration engineer imports the extracted issues into a GitLab project, mapping Jira statuses and fields to GitLab labels.

**Why this priority**: Import is the delivery step. Label mapping ensures the GitLab project is usable immediately after migration.

**Independent Test**: Import a known set of extracted issues into a test GitLab project using a label mapping CSV. Verify issue count, label assignment, and content integrity.

**Acceptance Scenarios**:
- Given 100 extracted issues and a label mapping CSV, when import-issues runs, then all 100 issues are created in the GitLab project with correct labels.
- Given a label mapping that maps "In Progress" to "workflow::in-progress", when an issue with status "In Progress" is imported, then it receives the "workflow::in-progress" label.

### P3: Validate import completeness
A migration engineer runs post-import validation to confirm all issues were imported correctly.

**Why this priority**: Without validation, the engineer has no confidence the migration is complete and must manually spot-check.

**Independent Test**: Run validate-import after a known import and confirm it reports correct counts and flags any discrepancies.

**Acceptance Scenarios**:
- Given 100 issues were extracted and 100 were imported, when validate-import runs, then it reports 100/100 with no discrepancies.
- Given 100 issues were extracted and 98 were imported, when validate-import runs, then it identifies the 2 missing issues by key.

### P4: Extract project metadata
A migration engineer needs to discover which Jira projects exist before extracting issues.

**Why this priority**: Project discovery is a prerequisite to extraction but is a simpler, lower-risk operation.

**Independent Test**: Run extract-projects against a Jira instance and verify the output lists all accessible projects with correct metadata.

**Acceptance Scenarios**:
- Given a Jira instance with 10 projects, when extract-projects runs, then all 10 projects are listed with key, name, and type.

## Edge Cases

- Issues with attachments that exceed GitLab's file size limit
- Jira wiki markup features not covered by the converter (nested lists, tables, colors, macros)
- Label mapping CSV with unmapped statuses (issues imported without status labels)
- GitLab project with existing issues (import should not conflict)
- Jira issues with subtasks (parent-child relationships)
- Unicode in issue titles, descriptions, and comments
- Story points stored in non-standard custom field IDs across Jira instances

## Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | GitLab API client handles authentication, pagination, and rate limiting |
| FR-002 | Extract-projects lists all accessible Jira projects with metadata |
| FR-003 | Extract-issues pulls all issues from a Jira project with custom fields and story points |
| FR-004 | Extract-issues converts Jira wiki markup to Markdown |
| FR-005 | Import-issues creates GitLab issues from extracted data with label mapping |
| FR-006 | Import-issues applies label mapping from a CSV template |
| FR-007 | Validate-import compares extracted vs imported issue counts and identifies discrepancies |
| FR-008 | Label mapping CSV template provided for user customization |
| FR-009 | Migration guide documents the full extract-transform-load workflow |

### Key Entities

- `tools/gitlab/gitlab-client.js` - GitLab API client with pagination and rate limiting
- `tools/gitlab/extract-projects.js` - Jira project discovery
- `tools/gitlab/extract-issues.js` - Jira issue extraction with markup conversion
- `tools/gitlab/import-issues.js` - GitLab issue import with label mapping
- `tools/gitlab/validate-import.js` - Post-import validation
- `templates/gitlab-label-mapping.csv` - Label mapping CSV template
- `docs/gitlab-migration.md` - Full migration guide

### Completed Work

- GitLab API client with pagination and rate limiting
- Extract projects tool
- Extract issues tool (Jira markup to Markdown conversion, story points, custom fields)
- Import issues tool with label mapping
- Post-import validation tool
- Label mapping CSV template
- Full migration guide (docs/gitlab-migration.md)

### Known Issues (tracked in specs/code-quality/)

- No 5xx retry in gitlab-client.js
- Pagination has no max page cap (could loop on API errors)
- Story points field ID is hardcoded
- Jira wiki markup conversion incomplete (missing nested lists, tables, colors, macros)
- Import tool lacks idempotency (would create duplicates on retry)

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A Jira project's issues can be extracted, imported to GitLab, and validated in a single workflow |
| SC-002 | All extracted issues appear in GitLab with correct labels after import |
| SC-003 | Post-import validation detects and reports any missing or mismatched issues |
| SC-004 | The migration guide enables an engineer to complete the workflow without additional support |
| SC-005 | Label mapping CSV covers the common Jira status-to-GitLab label translations |

## Assumptions

- Engineers have API access to both source Jira instance and target GitLab instance
- GitLab project already exists before import (tool does not create projects)
- Label mapping is manual (engineer fills in the CSV based on their GitLab label scheme)
- Attachments are not migrated in the current implementation
- Comment history is included in the extraction but author attribution may not map 1:1
- Known quality issues (retry, idempotency, markup gaps) are deferred to the code-quality spec
