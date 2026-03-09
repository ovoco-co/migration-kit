# migration-kit

Atlassian ITSM migration toolkit. Scripts, templates, and documentation for migrating to Jira Service Management from other ITSM platforms (Jira DC, Ivanti, ServiceNow) or between JSM instances.

## What This Covers

- Platform assessment and gap analysis
- Field mapping (custom field types, contexts, edge cases)
- Workflow mapping (statuses, transitions, post-functions, category alignment)
- Assets/CMDB schema and data migration
- SLA, automation, and permission scheme migration
- User and group migration
- Testing and validation
- Platform quirks and silent failure modes

## Structure

```
docs/
  assessment/        Platform audit templates and gap analysis
  field-mapping/     Field type reference and mapping guides
  workflow-mapping/  Status category guide and transition mapping
  assets-cmdb/       Schema and data migration for Assets/CMDB
  quirks/            Platform gotchas, JCMA behavior, silent failures
  ivanti/            Ivanti-specific extraction and mapping
  runbooks/          Step-by-step migration runbooks
tools/
  extract/           Extraction scripts (API pulls, exports)
  transform/         Data transformation (field mapping, normalization)
  validate/          Pre and post migration validation
templates/           Mapping spreadsheets, checklists, test plans
src/reference/       Pulled platform docs (gitignored)
```

## Related

- [cmdb-kit](https://github.com/ovoco/cmdb-kit) - CMDB schema starter kit with JSM Assets adapter. Use cmdb-kit's schema-as-code pattern and validation tools for the Assets/CMDB portion of a migration.
