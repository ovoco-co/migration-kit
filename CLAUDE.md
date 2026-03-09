# CLAUDE.md

## Project Overview

migration-kit is an Atlassian ITSM migration toolkit covering Jira DC to Cloud, Ivanti to JSM, and JSM to JSM migrations. It provides documentation, scripts, templates, and reference material for the full migration lifecycle.

## Key Files and Directories

```
docs/
  migration-outline.md              End-to-end migration guide
  assessment-template.md            Fill-in-the-blank assessment deliverable
  field-type-reference.md           Custom field types with DC/Cloud migration notes
  scriptrunner-parity.md            ScriptRunner DC vs Cloud feature table
  assets-migration-reference.md     Assets import ordering, schema, Data Manager
  cutover-runbook.md                Fill-in-the-blank cutover runbook
  servicenow-migration.md           ServiceNow to JSM guide
  bmc-remedy-migration.md           BMC Remedy/Helix to JSM guide
  ivanti-migration.md               Ivanti to JSM guide
  cherwell-migration.md             Cherwell to JSM guide
  quirks/                           Platform gotchas and terminology
  wip/                              Plans and drafts
tools/
  lib/                              Shared API client (auth, pagination, rate limiting)
  extract/                          Extraction scripts (API pulls, exports)
  transform/                        Data transformation (field mapping, normalization)
  validate/                         Pre and post migration validation
templates/                          Checklists and CSV mapping templates
src/reference/                      Pulled platform docs (gitignored)
```

## Related Projects

- cmdb-kit (../cmdb-kit) provides the Assets/CMDB schema-as-code pattern, JSM adapter, and validation tools

## Documentation Formatting Rules

- No em dashes (use hyphen or comma instead)
- No ampersands as "and" (proper acronyms are fine)
- No horizontal rules
- No numbered sections, just use header levels
- No tables of contents
- No bold in table cells

## Git Workflow

- Main branch: main
- Keep docs and tools changes in separate commits
