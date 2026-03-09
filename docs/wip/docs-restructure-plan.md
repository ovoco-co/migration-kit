# Docs Restructure Plan (v3)

Flat docs/ directory. No subdirectories except quirks/ (already has content) and wip/.


## Current state

```
docs/
  migration-outline.md              ~820 lines, the narrative guide
  assessment/                       empty
  field-mapping/                    empty
  workflow-mapping/                 empty
  assets-cmdb/                      empty
  ivanti/                           empty
  runbooks/                         empty
  quirks/
    cloud-dc-terminology-map.md     exists
  wip/
    tooling-plan.md                 exists
    docs-restructure-plan.md        this file
```


## Target state

```
docs/
  migration-outline.md              Narrative guide (~550 lines after extracting platform sections)
  assessment-template.md            Fill-in-the-blank assessment deliverable
  field-type-reference.md           Every custom field type with DC/Cloud migration notes
  scriptrunner-parity.md            ScriptRunner DC feature vs Cloud availability table
  assets-migration-reference.md     Import ordering, schema sync, Data Manager, AQL/IQL
  cutover-runbook.md                Fill-in-the-blank cutover runbook with timing placeholders
  servicenow-migration.md           ServiceNow to JSM guide + quirks (moved from outline)
  bmc-remedy-migration.md           BMC Remedy/Helix to JSM guide + quirks (moved from outline)
  ivanti-migration.md               Ivanti to JSM guide + quirks (moved from outline)
  cherwell-migration.md             Cherwell to JSM guide + quirks (moved from outline)
  quirks/
    cloud-dc-terminology-map.md     exists
    jira-cloud-gotchas.md           Cloud quirks + DC-to-Cloud gaps (moved from outline Part 8)
  wip/
    tooling-plan.md                 exists
```

Delete the empty subdirectories: assessment/, field-mapping/, workflow-mapping/, assets-cmdb/, ivanti/, runbooks/.


## What each file contains

| File | Type | Source |
|---|---|---|
| assessment-template.md | Template (fill in) | New. Skeleton: source inventory table, complexity scoring matrix, risk register, recommendations, effort estimate, dependencies. |
| field-type-reference.md | Reference (look up) | New. Table of every Jira custom field type: DC behavior, Cloud behavior, migration notes, JCMA handling, context rules, known issues. |
| scriptrunner-parity.md | Reference (look up) | New. Table of every ScriptRunner DC feature: Cloud availability (yes/no/partial), replacement path, effort level. Decision tree for evaluating a ScriptRunner inventory. |
| assets-migration-reference.md | Reference (look up) | New. Import dependency ordering, two-pass pattern, circular deps, schema sync vs data sync, icon requirements, reference types, AQL vs IQL, DC importers vs Cloud Data Manager, placeholder syntax. |
| cutover-runbook.md | Template (fill in) | New. Pre-cutover checklist, numbered execution steps with timing/owner blanks, validation script invocations, go/no-go matrix, rollback by migration type, communication templates. |
| servicenow-migration.md | Guide (moved) | Move from outline Part 3 ServiceNow section + Part 8 ServiceNow Quirks. |
| bmc-remedy-migration.md | Guide (moved) | Move from outline Part 3 BMC section + Part 8 BMC Quirks. |
| ivanti-migration.md | Guide (moved) | Move from outline Part 3 Ivanti section + Part 8 Ivanti Quirks. |
| cherwell-migration.md | Guide (moved) | Move from outline Part 3 Cherwell section + Part 8 Cherwell Quirks. |
| quirks/jira-cloud-gotchas.md | Reference (moved) | Move from outline Part 8 Jira Cloud Quirks + DC to Cloud Gaps. |


## What changes in the outline

Sections that MOVE out (replaced with a one-line link):
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

Everything else stays. Smaller platforms (HPSM, Freshservice, Zendesk, ManageEngine, TOPdesk) stay in the outline -- not enough content for standalone docs.


## CLAUDE.md and README.md updates

Replace the directory table with a flat file list:

```
docs/
  migration-outline.md       End-to-end migration guide (Parts 1-8)
  assessment-template.md     Fill-in-the-blank assessment deliverable
  field-type-reference.md    Custom field types with DC/Cloud migration notes
  scriptrunner-parity.md     ScriptRunner DC vs Cloud feature table
  assets-migration-reference.md  Assets import ordering, schema, Data Manager
  cutover-runbook.md         Fill-in-the-blank cutover runbook
  servicenow-migration.md    ServiceNow to JSM guide
  bmc-remedy-migration.md    BMC Remedy/Helix to JSM guide
  ivanti-migration.md        Ivanti to JSM guide
  cherwell-migration.md      Cherwell to JSM guide
  quirks/                    Platform gotchas and terminology
  wip/                       Plans and drafts
```


## Build order

Move platform content out of the outline first (biggest cleanup). Then new reference and template docs. Housekeeping last.

**Moves** (extract from outline, replace with links):
- servicenow-migration.md
- bmc-remedy-migration.md
- ivanti-migration.md
- cherwell-migration.md
- quirks/jira-cloud-gotchas.md
- Update outline to link to moved docs
- Delete empty subdirectories

**New docs** (written fresh, not duplicating outline):
- field-type-reference.md
- scriptrunner-parity.md
- assets-migration-reference.md
- assessment-template.md
- cutover-runbook.md

**Housekeeping**:
- Update CLAUDE.md
- Update README.md
