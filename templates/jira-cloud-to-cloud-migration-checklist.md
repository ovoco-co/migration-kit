# Jira Cloud to Cloud Migration Checklist

Checklist for merging two Jira Cloud (JSM Cloud) instances into one. Common after acquisitions, team consolidation, or when independent Cloud sites need to unify.

No JCMA (DC-only source tool) or CMJ (DC-only tool). Cloud-to-Cloud migration uses the Jira REST API, CSV import, or Atlassian's Cloud-to-Cloud migration feature (limited availability). Most of the work is manual configuration alignment and scripted data transfer.


## Phase 0: Inventory and Prerequisites

### Source Instance Inventory

- [ ] Cloud site URL and plan tier (Free, Standard, Premium, Enterprise)
- [ ] Admin access confirmed
- [ ] Run `tools/extract/field-inventory.js --source-only` to pull all custom fields
- [ ] Run `tools/extract/scheme-inventory.js --source-only` to pull all schemes
- [ ] Run `tools/extract/workflow-inventory.js` to pull all workflows
- [ ] Run `tools/extract/user-inventory.js` to pull all users and groups
- [ ] Run `tools/extract/issue-counts.js` to establish baseline counts
- [ ] All installed Marketplace apps and versions
- [ ] Automation rules (export from Settings > System > Automation)
- [ ] SLA definitions per project
- [ ] Assets/CMDB schemas (if applicable)

### Target Instance Inventory

- [ ] Cloud site URL and plan tier
- [ ] Admin access confirmed
- [ ] Run `tools/extract/field-inventory.js --target-only`
- [ ] Run `tools/extract/scheme-inventory.js --target-only`
- [ ] Run `tools/extract/user-inventory.js --target-only`
- [ ] Run `tools/extract/issue-counts.js` (pointed at target)
- [ ] All installed Marketplace apps and versions
- [ ] Existing Automation rules
- [ ] Existing SLA definitions
- [ ] Assets/CMDB schemas (if applicable)

### Conflict Analysis

This is the critical step. Two Cloud instances will have naming collisions everywhere.

- [ ] **Custom field collisions**: Review `output/extract/fields-crossref.json`
  - [ ] Same name + same type on both sides: decide which definition wins (merge options or keep source's)
  - [ ] Same name + different type: one must be renamed before migration
  - [ ] Cloud cannot have two fields with the same name -- all collisions must be resolved
- [ ] **Status collisions**: Both instances likely have "Open," "In Progress," "Done," etc.
  - [ ] Identify statuses with same name but different category or meaning
  - [ ] Decide: reuse target's status or create a new one with a qualified name
- [ ] **Workflow collisions**: Both may have "Support Workflow" or "IT Service Workflow"
  - [ ] Decide which workflow wins, or create a merged workflow
  - [ ] Issues from the losing workflow need status remapping
- [ ] **Project key collisions**: Two projects with key "IT" cannot coexist
  - [ ] One project must be re-keyed before migration (Cloud supports project key change)
- [ ] **User overlap**: Same person may have accounts on both instances
  - [ ] Match by email address
  - [ ] Determine which account survives; merge group memberships
  - [ ] Deactivate the duplicate after migration
- [ ] **Customer overlap**: Same customer organization on both instances
  - [ ] Decide: merge request history or keep separate
- [ ] **Automation rule overlap**: Both instances may have rules that do the same thing
  - [ ] Deduplicate; decide which rules survive
- [ ] Fill all mapping templates:
  - [ ] `templates/field-mapping.csv`
  - [ ] `templates/status-mapping.csv`
  - [ ] `templates/user-mapping.csv`

### Licensing

- [ ] Target plan tier supports the combined user count
- [ ] Marketplace app licenses cover the combined user count
- [ ] ScriptRunner Cloud license covers the combined site (if both use it)
- [ ] Plan for source site decommission timeline and license cancellation

### Identity and Access

- [ ] Both sites use the same IdP (Atlassian Access, Okta, Azure AD, etc.) -- or plan IdP consolidation
- [ ] SCIM provisioning configured for target site (if using IdP)
- [ ] External user (customer) accounts mapped between instances
- [ ] Run `tools/transform/user-mapper.js` to validate user mapping


## Phase 1: Pre-Migration Cleanup

> Clean both sides. Merging two messy instances creates a messier result.

### Source Cleanup

- [ ] Delete unused projects (archived, test, demo)
- [ ] Delete orphaned custom fields (not on any screen, no data)
- [ ] Consolidate duplicate workflows
- [ ] Consolidate duplicate schemes
- [ ] Delete test issues and demo data
- [ ] Resolve custom field naming collisions:
  - [ ] Rename source fields that collide with target fields (where source loses)
  - [ ] Or rename target fields (where source wins)
- [ ] Resolve project key collisions:
  - [ ] Change source project keys that collide with target project keys

### Target Cleanup

- [ ] Same cleanup as source
- [ ] Resolve naming collisions from target side
- [ ] Ensure target has capacity for incoming data (check plan limits)

### Mapping Validation

- [ ] Run `tools/transform/field-mapper.js` -- all source fields with data have a valid mapping
- [ ] Run `tools/transform/status-mapper.js` -- all source statuses with issues have a valid target status
- [ ] Run `tools/transform/user-mapper.js` -- all source users have a target account mapping


## Phase 2: Target Configuration Build

Build the landing zone on the target for incoming source data.

### Workflows

- [ ] For source workflows that have no target equivalent:
  - [ ] Create the workflow on the target
  - [ ] Test all transitions
- [ ] For source workflows being merged into existing target workflows:
  - [ ] Verify the target workflow has all needed statuses
  - [ ] Add missing statuses and transitions if needed
  - [ ] Verify status categories match the mapping

### Custom Fields

- [ ] For source-only fields (no collision):
  - [ ] Create on target with same name, type, and options
  - [ ] Set field contexts (project-scoped or global)
- [ ] For merged fields (collision resolved):
  - [ ] Verify target field has the combined option list
  - [ ] Add missing options from source

### Schemes

- [ ] Create workflow schemes for incoming source projects
- [ ] Create screen schemes, field configuration schemes as needed
- [ ] Create permission schemes for incoming source projects
- [ ] Create notification schemes if source uses different notification patterns

### Projects

- [ ] Create landing zone projects on target (matching source project keys, if changed)
- [ ] Assign correct workflow schemes, screen schemes, field config schemes
- [ ] Assign correct permission schemes

### SLAs

- [ ] Rebuild source SLA definitions on target for incoming JSM projects
- [ ] Use target status names in conditions
- [ ] Disable SLAs on landing zone projects until data import is complete

### Automation Rules

- [ ] Port source Automation rules to target
- [ ] Adjust any rule that references project-specific IDs, field IDs, or status IDs
- [ ] Disable all ported rules until data import is complete

### ScriptRunner

- [ ] Port source ScriptRunner scripts to target ScriptRunner Cloud
- [ ] Adjust any script that references instance-specific IDs
- [ ] Disable all ported scripts until data import is complete

### Assets/CMDB (if in scope)

- [ ] Merge source Assets schema into target
  - [ ] Create missing object types on target
  - [ ] Add missing attributes
  - [ ] Resolve type name collisions
- [ ] Import source Assets data
- [ ] Verify references resolve correctly


## Phase 3: Data Migration

### Migration Method

Cloud-to-Cloud has no JCMA or CMJ. Choose a method:

- [ ] **Atlassian Cloud-to-Cloud migration** (if available -- limited availability, contact Atlassian)
- [ ] **REST API scripted migration** (most common):
  - [ ] Extract issues from source via Jira REST API (search + get issue)
  - [ ] Transform: remap field IDs, status IDs, user account IDs per mapping tables
  - [ ] Import to target via Jira REST API (create issue + update fields)
  - [ ] Migrate comments, attachments, issue links, and history separately
- [ ] **CSV export/import** (simpler but limited):
  - [ ] Export source issues to CSV
  - [ ] Transform CSV per field mapping
  - [ ] Import via Jira CSV importer
  - [ ] Limitation: no comments, attachments, or history in CSV import

### Test Migration Pass 1 (Smoke Test)

- [ ] Migrate 2-3 small source projects to target
- [ ] Verify:
  - [ ] Issues exist with correct fields
  - [ ] Statuses are correct per mapping
  - [ ] Users are correctly attributed (reporter, assignee, commenters)
  - [ ] Attachments are present (if using API method)
  - [ ] Comments migrated with correct author and timestamp (if using API method)
  - [ ] Issue links are intact
- [ ] Delete test data from target and iterate

### Test Migration Pass 2 (Full)

- [ ] Migrate all source projects
- [ ] Run validation scripts:
  - [ ] `tools/validate/count-compare.js`
  - [ ] `tools/validate/field-spot-check.js --sample 50`
  - [ ] `tools/validate/link-integrity.js`
  - [ ] `tools/validate/assets-verify.js` (if applicable)
- [ ] Manual validation:
  - [ ] Enable and test ported Automation rules
  - [ ] Enable and test ported ScriptRunner scripts
  - [ ] Enable and test SLAs
  - [ ] Test customer portal (submit request, verify queue, resolve)
  - [ ] Test dashboards and filters
- [ ] Document all failures and fixes

### Test Migration Pass 3 (UAT)

- [ ] Run full migration
- [ ] Invite stakeholders from both source and target organizations for UAT
  - [ ] Source service desk leads: verify their queues, SLAs, workflows work on target
  - [ ] Source customers: verify portal access and request history
  - [ ] Target service desk leads: verify their existing workflows are not disrupted
  - [ ] Managers: verify combined dashboards and reports
- [ ] Document and fix all defects


## Phase 4: Cutover

### Pre-Cutover

- [ ] All test passes completed and defects resolved
- [ ] Cutover runbook written and reviewed
- [ ] Communication sent to all stakeholders (both organizations)
- [ ] Source freeze scheduled
- [ ] Rollback criteria defined
- [ ] All Automation rules and SLAs disabled on target landing zone projects
- [ ] Support plan for first week

### Cutover Execution

- [ ] Freeze source Cloud instance (restrict to read-only or announce freeze)
- [ ] Run `tools/extract/delta-extract.js --since <last-test-timestamp>` for last-minute changes
- [ ] Run final data migration (full or delta, depending on method)
- [ ] Run validation scripts against production:
  - [ ] `tools/validate/count-compare.js`
  - [ ] `tools/validate/field-spot-check.js --sample 20`
- [ ] Enable ported Automation rules
- [ ] Enable ported ScriptRunner scripts
- [ ] Enable SLAs on landing zone projects
- [ ] Migrate customer portal configuration:
  - [ ] Update help center branding
  - [ ] Verify request types and forms
  - [ ] Update portal URL references in documentation
- [ ] Switch DNS (if source had custom domain)
- [ ] Switch email channels (inbound email addresses to target)
- [ ] Update external integrations (webhooks, API consumers) to point to target
- [ ] Open target to live traffic from both organizations

### Go / No-Go Decision

- [ ] Validation scripts pass
- [ ] Both organizations' stakeholders confirm critical workflows work
- [ ] SLAs are calculating correctly
- [ ] Customer portals are accessible
- [ ] **Go**: announce migration complete to both organizations
- [ ] **No-Go**: revert DNS/email to source, communicate postponement


## Phase 5: Post-Migration

### Immediate (first 24 hours)

- [ ] Monitor Automation rule logs for failures
- [ ] Monitor SLA calculations
- [ ] Verify email notifications are sending
- [ ] Migration team on standby

### First Week

- [ ] Collect feedback from both organizations' users
- [ ] Fix issues as they surface
- [ ] Run `tools/validate/count-compare.js` final time
- [ ] Verify all merged users have correct access and group memberships
- [ ] Verify customer accounts from source can access their request history on target

### First Month

- [ ] Decommission source Cloud site
  - [ ] Export any remaining data for archival
  - [ ] Cancel source site subscription
- [ ] Consolidate Automation rules (deduplicate rules from both orgs)
- [ ] Consolidate dashboards and filters
- [ ] Transfer administration to unified team
- [ ] Deliver documentation:
  - [ ] As-built configuration document
  - [ ] Known issues and workarounds
  - [ ] Combined admin guide
- [ ] Close out migration project


## Key Risks (Cloud to Cloud Specific)

| Risk | Mitigation |
|---|---|
| Custom field name collisions | Resolve all collisions before migration; rename on the losing side |
| Project key collisions | Re-key source projects before migration |
| No JCMA or CMJ available | REST API scripted migration; budget more time for development |
| Comment and history loss (CSV method) | Use REST API method for full fidelity; CSV only for simple data |
| User account deduplication | Match by email; merge group memberships; deactivate duplicates |
| Customer organization overlap | Merge carefully; test portal access for customers from both orgs |
| Automation rule conflicts | Disable all rules during import; enable and test one at a time |
| Combined instance exceeds plan limits | Verify target plan supports combined issue count, storage, and users |
| External integrations pointing to source | Inventory all webhooks, API consumers, and CI/CD pipelines; update URLs |
| Source site data retention after decommission | Export archival data before cancellation; Atlassian deletes data after site removal |
| Rate limiting during API migration | Use backoff and retry; migrate during off-hours; request rate limit increase from Atlassian if needed |
