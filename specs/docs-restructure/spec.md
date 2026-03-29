# Documentation Restructure

| Field | Value |
|-------|-------|
| Feature Branch | docs-restructure |
| Created | 2026-03-26 |
| Status | In Progress |
| Input | Organic growth of docs/ directory |

## User Scenarios and Testing

### P1: Find platform-specific migration guidance quickly
A migration engineer working on a Jira-to-ServiceNow migration needs to find all ServiceNow-relevant content without reading the entire 820-line migration outline.

**Why this priority**: The primary value of restructuring is discoverability. If engineers still have to search through the monolithic outline, the restructure has failed.

**Independent Test**: A new reader can locate all ServiceNow migration content by browsing the directory structure, without needing to search inside the migration outline.

**Acceptance Scenarios**:
- Given the docs directory has been restructured, when an engineer looks for ServiceNow migration guidance, then a dedicated file contains all ServiceNow-specific content extracted from the outline.
- Given platform-specific content has been extracted, when an engineer reads the migration outline, then it contains no platform-specific implementation details (only cross-references to dedicated guides).

### P2: Self-contained platform guides
A migration engineer reads the BMC Remedy guide without having read the migration outline first.

**Why this priority**: Guides that depend on context from the outline force engineers to read multiple documents, defeating the purpose of extraction.

**Independent Test**: Read any platform guide in isolation and confirm it makes sense without prior context from the outline.

**Acceptance Scenarios**:
- Given the BMC Remedy guide exists as a standalone file, when an engineer reads it without reading the outline, then all necessary context is included or clearly cross-referenced.
- Given the Ivanti guide exists as a standalone file, when it references a concept from the outline, then the reference includes enough context to be useful without navigating away.

### P3: Clean directory structure
An engineer browses the docs/ directory and sees a logical organization with no empty subdirectories or orphaned files.

**Why this priority**: Empty directories and unclear organization signal an incomplete project and confuse contributors.

**Independent Test**: List the docs/ directory tree and confirm every subdirectory contains files and every file is referenced or discoverable.

**Acceptance Scenarios**:
- Given the restructure is complete, when listing the docs/ directory, then no empty subdirectories exist.
- Given cross-references between documents, when following any cross-reference link, then the target file exists and the referenced section is present.

## Edge Cases

- Platform-specific content in the outline that applies to multiple platforms (shared between guides)
- Cross-references between documents that become circular after extraction
- Content in the outline that is partly platform-specific and partly general
- Empty subdirectories (assessment/, field-mapping/) that were planned but never populated
- External links in extracted content that need updating

## Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | Migration outline (Parts 1-8) remains as the narrative guide with platform-specific content replaced by cross-references |
| FR-002 | Platform-specific content extracted to dedicated standalone guides |
| FR-003 | Each platform guide is self-contained (readable without the outline) |
| FR-004 | Empty subdirectories either populated with content or removed |
| FR-005 | All cross-references between documents are valid and bidirectional |
| FR-006 | Directory structure uses logical groupings (not a flat list) |

### Key Entities

- `docs/migration-outline.md` - Narrative guide, Parts 1-8 (820 lines)
- `docs/servicenow-migration.md` - ServiceNow to/from JSM guide
- `docs/bmc-remedy-migration.md` - BMC Remedy/Helix to JSM guide
- `docs/ivanti-migration.md` - Ivanti to JSM guide
- `docs/cherwell-migration.md` - Cherwell to JSM guide
- `docs/gitlab-migration.md` - Jira to GitLab migration guide
- `docs/assessment-template.md` - Assessment deliverable template
- `docs/field-type-reference.md` - Custom field types reference
- `docs/scriptrunner-parity.md` - ScriptRunner DC vs Cloud feature table
- `docs/assets-migration-reference.md` - Assets import reference
- `docs/cutover-runbook.md` - Cutover runbook template
- `docs/quirks/` - Platform gotchas and terminology maps

### Completed Work

- Migration outline (820 lines, Parts 1-8) complete
- Assessment template complete
- Field type reference complete
- ScriptRunner parity table complete
- Assets migration reference complete
- Cutover runbook template complete
- Platform-specific guides: ServiceNow, BMC Remedy, Ivanti, Cherwell, GitLab
- Platform quirks: Jira Cloud gotchas, Cloud-DC terminology map
- Migration checklists: DC-to-DC, DC-to-Cloud, Cloud-to-Cloud

### Pending Work

- Extract platform-specific content from migration outline into standalone guides
- Organize directory structure (assessment/, field-mapping/ subdirs planned but empty)
- ServiceNow field references need live instance validation
- BMC Remedy and Ivanti field references pending live instance access

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | Every platform-specific guide is readable as a standalone document without requiring the migration outline |
| SC-002 | The migration outline contains no platform-specific implementation details, only cross-references |
| SC-003 | No empty subdirectories exist in docs/ |
| SC-004 | All cross-references between documents resolve to valid files and sections |
| SC-005 | No content from the original outline is lost during extraction |

## Assumptions

- The migration outline's 8-part structure is correct and should be preserved
- Platform guides already written (ServiceNow, BMC Remedy, Ivanti, Cherwell, GitLab) may already contain some of the content that needs extracting
- Live instance access for ServiceNow, BMC Remedy, and Ivanti field validation is not available now but will be later
- The quirks/ subdirectory pattern is the right model for organizing supplementary content
