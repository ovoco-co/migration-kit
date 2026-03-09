# CLAUDE.md

## Project Overview

migration-kit is an Atlassian ITSM migration toolkit covering Jira DC to Cloud, Ivanti to JSM, and JSM to JSM migrations. It provides documentation, scripts, templates, and reference material for the full migration lifecycle.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| docs/assessment/ | Platform audit templates, gap analysis |
| docs/field-mapping/ | Field type reference, custom field mapping |
| docs/workflow-mapping/ | Status categories, transition mapping |
| docs/assets-cmdb/ | Assets/CMDB schema and data migration |
| docs/quirks/ | Platform gotchas, JCMA behavior, silent failures |
| docs/ivanti/ | Ivanti-specific extraction and mapping |
| docs/runbooks/ | Step-by-step migration runbooks |
| tools/extract/ | API extraction scripts |
| tools/transform/ | Data transformation scripts |
| tools/validate/ | Migration validation scripts |
| templates/ | Spreadsheet templates, checklists |
| src/reference/ | Pulled platform docs (gitignored) |

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
