# Docs Restructure - Tasks

## Phase 1: Platform Content Extraction

- [x] Create `docs/servicenow-migration.md` (ServiceNow to JSM guide, both directions)
- [x] Create `docs/bmc-remedy-migration.md` (BMC Remedy/Helix to JSM guide)
- [x] Create `docs/ivanti-migration.md` (Ivanti to JSM guide)
- [x] Create `docs/cherwell-migration.md` (Cherwell to JSM guide)
- [x] Create `docs/gitlab-migration.md` (Jira to GitLab migration guide)
- [x] Create `docs/quirks/jira-cloud-gotchas.md` (Cloud quirks and DC-to-Cloud gaps)
- [x] Delete empty subdirectories (`assessment/`, `field-mapping/`, `workflow-mapping/`, `assets-cmdb/`, `ivanti/`, `runbooks/`)

## Phase 2: New Reference and Template Documents

- [x] Create `docs/assessment-template.md` (fill-in-the-blank assessment deliverable)
- [x] Create `docs/field-type-reference.md` (custom field type reference table)
- [x] Create `docs/scriptrunner-parity.md` (ScriptRunner DC vs Cloud feature table)
- [x] Create `docs/assets-migration-reference.md` (Assets import ordering, schema sync, Data Manager)
- [x] Create `docs/cutover-runbook.md` (fill-in-the-blank cutover runbook)

## Phase 3: Directory Cleanup

- [x] Remove empty subdirectories from `docs/`
- [ ] Verify no broken links reference deleted directories

## Phase 4: Outline Trimming

- [ ] Replace Part 3 ServiceNow section (~25 lines) in `docs/migration-outline.md` with link to `servicenow-migration.md`
- [ ] Replace Part 3 BMC Remedy section (~25 lines) with link to `bmc-remedy-migration.md`
- [ ] Replace Part 3 Ivanti section (~20 lines) with link to `ivanti-migration.md`
- [ ] Replace Part 3 Cherwell section (~20 lines) with link to `cherwell-migration.md`
- [ ] Replace Part 8 Jira Cloud Quirks (~8 lines) with link to `quirks/jira-cloud-gotchas.md`
- [ ] Replace Part 8 BMC Remedy Quirks (~6 lines) with link to `bmc-remedy-migration.md`
- [ ] Replace Part 8 Cherwell Quirks (~4 lines) with link to `cherwell-migration.md`
- [ ] Replace Part 8 Ivanti Quirks (~4 lines) with link to `ivanti-migration.md`
- [ ] Replace Part 8 ServiceNow Quirks (~6 lines) with link to `servicenow-migration.md`
- [ ] Replace Part 8 DC to Cloud Gaps (~8 lines) with link to `quirks/jira-cloud-gotchas.md`
- [ ] Verify outline still reads coherently after extraction (links flow naturally)

## Phase 5: Platform Field References

- [ ] Create `docs/platforms/` directory
- [ ] Create `docs/platforms/servicenow-fields.md` (fields on incident, change_request, problem, cmdb_ci subclasses, sys_user, sys_user_group, core_company, cmn_location)
- [ ] Create `docs/platforms/servicenow-jira-field-map.md` (side-by-side Jira to ServiceNow field mapping: Priority to priority, Assignee to assigned_to, Reporter to caller_id, Status to state, Resolution to close_code)
- [ ] Create `docs/platforms/jsm-assets-fields.md` (JSM Assets object type and attribute reference)
- [ ] Create `docs/platforms/bmc-remedy-fields.md` (pending live instance access)
- [ ] Create `docs/platforms/ivanti-fields.md` (pending live instance access)

## Phase 6: Housekeeping

- [ ] Update `CLAUDE.md` directory tree to reflect final structure including `platforms/`
- [ ] Update `README.md` structure section to include `platforms/` and any new docs
- [ ] Add note to `docs/servicenow-migration.md` that ServiceNow extraction is manual (no tooling, per code review finding)
- [ ] Add note to `docs/gitlab-migration.md` about user map format (code review: `import-issues.js` user map format differs from `user-mapper.js` output format)
- [ ] Verify all internal cross-references between documents resolve correctly

## Documentation Gaps (from code review)

- [ ] Add `.migrationrc.json.example` template to repo root (code review: no copyable config template exists, structure is only documented in tooling plan and printed to stderr)
- [ ] Add example rows to `templates/field-mapping.csv` (code review: header-only, action column values `map`/`skip`/`create`/`rename` only documented in `tools/transform/field-mapper.js` source)
- [ ] Add example rows to `templates/status-mapping.csv` (code review: header-only, column values only in source)
- [ ] Add example rows to `templates/user-mapping.csv` (code review: header-only, auto-generation via `user-mapper.js` not documented)
- [ ] Document that `src/reference/` is empty by default and populated by `tools/pull-docs.js` (code review: empty dir confuses new users)
