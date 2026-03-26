# Docs Restructure - Plan

## Goal

Reorganize the `docs/` directory from a monolithic outline with empty subdirectories into a flat structure of focused, self-contained documents. Each platform gets its own migration guide. New reference and template documents fill gaps that force users to read vendor documentation for common questions.

## Architecture Decisions

**Flat structure, not nested.** The original plan had empty subdirectories (`assessment/`, `field-mapping/`, `workflow-mapping/`, `assets-cmdb/`, `ivanti/`, `runbooks/`) that were never populated. These have been removed. The target structure keeps `docs/` flat except for `quirks/` (already has content), `wip/` (internal), and a future `platforms/` directory for field-level reference material.

**Extract, do not duplicate.** Platform-specific content is moved out of `migration-outline.md` into standalone guides, with the original sections replaced by one-line links. The outline stays as the narrative guide (Parts 1-8) but shrinks from ~820 lines to ~550.

**Three document types.** Every doc is one of: Guide (narrative how-to), Reference (look-up table), or Template (fill-in-the-blank deliverable). This distinction drives formatting choices.

**No vendor-pulled content in git.** Platform field references (`platforms/servicenow-fields.md`, etc.) require live instance data. These are created from real instance exports, not written from memory. They ship when the data is available.

## Implementation Approach

### Phase 1: Platform Content Extraction (done)

Extract platform-specific sections from the migration outline into standalone guides. Each guide gets the relevant content from Part 3 (platform overview) and Part 8 (platform quirks) of the outline.

Files created:
- `docs/servicenow-migration.md` - ServiceNow to JSM, both directions
- `docs/bmc-remedy-migration.md` - BMC Remedy/Helix to JSM
- `docs/ivanti-migration.md` - Ivanti to JSM
- `docs/cherwell-migration.md` - Cherwell to JSM
- `docs/gitlab-migration.md` - Jira to GitLab (separate from outline, written with the GitLab adapter)
- `docs/quirks/jira-cloud-gotchas.md` - Cloud quirks and DC-to-Cloud gaps

### Phase 2: New Reference and Template Documents (done)

New documents that do not duplicate outline content:
- `docs/assessment-template.md` - fill-in-the-blank assessment deliverable with source inventory table, complexity scoring, risk register, recommendations, effort estimate
- `docs/field-type-reference.md` - every Jira custom field type with DC behavior, Cloud behavior, migration notes, JCMA handling
- `docs/scriptrunner-parity.md` - ScriptRunner DC feature vs Cloud availability table with replacement paths
- `docs/assets-migration-reference.md` - Assets import ordering, two-pass pattern, circular deps, schema sync, Data Manager, AQL vs IQL
- `docs/cutover-runbook.md` - pre-cutover checklist, numbered execution steps with timing/owner blanks, go/no-go matrix, rollback steps

### Phase 3: Directory Cleanup (done)

Empty subdirectories (`assessment/`, `field-mapping/`, `workflow-mapping/`, `assets-cmdb/`, `ivanti/`, `runbooks/`) deleted. These were placeholder directories that never got content because the flat structure works better.

### Phase 4: Outline Trimming (pending)

Replace extracted sections in `migration-outline.md` with one-line links to the standalone guides. Sections to extract:
- Part 3: ServiceNow to JSM (~25 lines)
- Part 3: BMC Remedy/Helix to JSM (~25 lines)
- Part 3: Ivanti to JSM (~20 lines)
- Part 3: Cherwell to JSM (~20 lines)
- Part 8: Jira Cloud Quirks (~8 lines)
- Part 8: BMC Remedy Quirks (~6 lines)
- Part 8: Cherwell Quirks (~4 lines)
- Part 8: Ivanti Quirks (~4 lines)
- Part 8: ServiceNow Quirks (~6 lines)
- Part 8: DC to Cloud Gaps (~8 lines)

Smaller platforms (HPSM, Freshservice, Zendesk, ManageEngine, TOPdesk) stay in the outline since there is not enough content for standalone docs.

### Phase 5: Platform Field References (pending)

Field-level mapping references for migration planners. One file per platform, pulled from live instances, not written from memory.

Target files in `docs/platforms/`:
- `servicenow-fields.md` - every field on incident, change_request, problem, cmdb_ci subclasses, sys_user, sys_user_group, core_company, cmn_location
- `servicenow-jira-field-map.md` - side-by-side Jira to ServiceNow field mapping
- `jsm-assets-fields.md` - JSM Assets object type and attribute reference
- `bmc-remedy-fields.md` - BMC Remedy/Helix field reference (pending instance access)
- `ivanti-fields.md` - Ivanti field reference (pending instance access)

### Phase 6: Housekeeping (pending)

- Update `CLAUDE.md` directory tree to reflect final structure
- Update `README.md` structure section
- Verify all cross-references between documents resolve

## Dependencies

- Phase 4 depends on Phase 1 (standalone guides must exist before outline sections are replaced with links)
- Phase 5 depends on live instance access for each platform
- Phase 6 depends on all other phases being complete
- No dependencies on the code-quality or gitlab-adapter specs

## File Paths

Source (current docs):
- `docs/migration-outline.md` - 820-line narrative guide, contains platform sections to extract
- `docs/quirks/cloud-dc-terminology-map.md` - existing, stays
- `docs/quirks/jira-cloud-gotchas.md` - created in Phase 1

Created docs (Phase 1-2):
- `docs/assessment-template.md`
- `docs/field-type-reference.md`
- `docs/scriptrunner-parity.md`
- `docs/assets-migration-reference.md`
- `docs/cutover-runbook.md`
- `docs/servicenow-migration.md`
- `docs/bmc-remedy-migration.md`
- `docs/ivanti-migration.md`
- `docs/cherwell-migration.md`
- `docs/gitlab-migration.md`

Pending docs (Phase 5):
- `docs/platforms/servicenow-fields.md`
- `docs/platforms/servicenow-jira-field-map.md`
- `docs/platforms/jsm-assets-fields.md`

Config files updated (Phase 6):
- `CLAUDE.md`
- `README.md`
