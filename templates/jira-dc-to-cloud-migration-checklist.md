# Jira DC to Cloud Migration Checklist

Checklist for migrating from Jira Data Center to Jira Cloud (JSM Cloud). Primary tool is JCMA (Jira Cloud Migration Assistant) with ScriptRunner Cloud and Jira Automation handling the customization gap.

This checklist assumes one source DC instance migrating to one target Cloud site.


## Phase 0: Inventory and Prerequisites

### Source Instance Inventory

- [ ] Jira DC version (must be a supported JCMA source version -- check Atlassian docs for current support matrix)
- [ ] Confluence DC version (if migrating knowledge base)
- [ ] All installed Marketplace apps and versions (export from Manage Apps)
- [ ] Run `tools/extract/field-inventory.js --source-only` to pull all custom fields
- [ ] Run `tools/extract/scheme-inventory.js --source-only` to pull all schemes
- [ ] Run `tools/extract/workflow-inventory.js` to pull all workflows
- [ ] Run `tools/extract/user-inventory.js` to pull all users and groups
- [ ] Run `tools/extract/issue-counts.js` to establish baseline counts
- [ ] Run `tools/extract/scriptrunner-audit.js` to inventory all ScriptRunner config

### Target Cloud Site Setup

- [ ] Cloud site provisioned (*.atlassian.net)
- [ ] Cloud plan tier confirmed (Free, Standard, Premium, Enterprise)
  - [ ] Premium or Enterprise required for Assets Data Manager, Opsgenie, and advanced features
- [ ] Admin access confirmed for at least one Atlassian account
- [ ] Run `tools/extract/field-inventory.js --target-only` if target site has existing configuration
- [ ] Run `tools/extract/user-inventory.js --target-only` if target site has existing users

### App and Feature Gap Analysis

- [ ] For each source Marketplace app, determine Cloud status:
  - [ ] Cloud equivalent exists with same functionality -- install on target
  - [ ] Cloud equivalent exists with reduced functionality -- document gaps
  - [ ] No Cloud equivalent -- plan replacement (Forge app, Automation, process change)
  - [ ] App is unused or redundant -- retire
- [ ] ScriptRunner gap analysis (from scriptrunner-audit.js output):
  - [ ] Items categorized `cloud-scriptrunner` -- will port to ScriptRunner Cloud
  - [ ] Items categorized `cloud-automation` -- will be rebuilt as Automation rules
  - [ ] Items categorized `forge-app` -- will need Forge app development
  - [ ] Items categorized `process-change` -- will need workflow redesign
  - [ ] Items categorized `unknown` -- require manual review
- [ ] DC-only ScriptRunner features to address specifically:
  - [ ] Behaviours -- replacement: Cloud Forms conditional logic or Forge
  - [ ] Custom REST endpoints -- replacement: Jira REST API or Forge app
  - [ ] Escalation Services -- replacement: Automation rules with scheduled triggers
  - [ ] HAPI usage -- replacement: standard Jira REST API
  - [ ] Script fields with unrestricted JVM access -- evaluate ScriptRunner Cloud compatibility

### Licensing

- [ ] Cloud agent count confirmed (Cloud charges per agent, not per server)
- [ ] Identify DC agents who should not be Cloud agents (licensing cleanup)
- [ ] Marketplace app licenses purchased for Cloud
- [ ] ScriptRunner Cloud license purchased (if porting scripts)
- [ ] Confluence Cloud license confirmed (if migrating knowledge base)

### User Directory and Identity

- [ ] Document source user directory (Active Directory, LDAP, Crowd, internal)
- [ ] Run user inventory cross-reference to match source users to Atlassian accounts
- [ ] Plan for Cloud identity model:
  - [ ] Atlassian Access (SSO, SCIM provisioning) if using IdP
  - [ ] Manual Atlassian account creation if no IdP
- [ ] Identify service accounts with no real email (cannot be Atlassian accounts)
  - [ ] Plan replacement: API tokens, OAuth apps, or Forge apps
- [ ] Identify external users (customers, collaborators) who need Atlassian accounts
- [ ] Fill `templates/user-mapping.csv` and validate with `tools/transform/user-mapper.js`


## Phase 1: Pre-Migration Cleanup (Source DC)

> Clean the source before migrating. Every orphan, duplicate, and piece of garbage
> you leave behind will migrate to Cloud and cost more to clean up there.

### Custom Fields

- [ ] Review `output/extract/fields-crossref.json` for duplicate fields (same name + same type)
  - [ ] Merge data from duplicates into the canonical field (SQL or ScriptRunner script)
  - [ ] Delete or rename duplicates
- [ ] Identify orphaned fields (not on any screen, no data)
  - [ ] Delete orphans
- [ ] Identify ScriptRunner-generated calculated/scripted fields
  - [ ] Document the script formula for each
  - [ ] Determine if each works on ScriptRunner Cloud or needs replacement
- [ ] Fill `templates/field-mapping.csv`
- [ ] Run `tools/transform/field-mapper.js` to validate mappings

### Workflows

- [ ] Review `output/extract/workflows-source.json` for unused workflows
  - [ ] Deactivate and delete unused workflows
- [ ] Consolidate duplicate workflows (same statuses and transitions, different names)
- [ ] Document every ScriptRunner post-function, condition, and validator
  - [ ] Cross-reference with scriptrunner-audit.js categorization
- [ ] For each workflow transition with ScriptRunner:
  - [ ] `cloud-scriptrunner`: document, will port after migration
  - [ ] `cloud-automation`: design the replacement Automation rule
  - [ ] `forge-app`: scope the Forge app requirement
  - [ ] `process-change`: get stakeholder sign-off on the new process
- [ ] Fill `templates/status-mapping.csv`
- [ ] Run `tools/transform/status-mapper.js` to validate mappings

### Schemes

- [ ] Review `output/extract/schemes-source.json`
- [ ] Delete unused schemes (not assigned to any project)
- [ ] Consolidate duplicate schemes
- [ ] Note: JCMA migrates schemes automatically, but duplicates and orphans create noise

### Projects

- [ ] Classify every project: migrate / archive / retire
- [ ] For retired projects: archive or delete before migration
- [ ] For each migrating project, confirm:
  - [ ] Correct workflow scheme assigned
  - [ ] Correct field configuration scheme assigned
  - [ ] No default schemes in use (JCMA handles defaults, but explicit is better)

### Data Cleanup

- [ ] Identify and delete test issues, test projects, and demo data
- [ ] Identify issues in invalid states (status not in workflow, missing required fields)
  - [ ] Fix or close these before migration
- [ ] Check total attachment volume -- large attachments slow JCMA migration
  - [ ] Remove unnecessary large attachments if possible


## Phase 2: Target Configuration Build

Build the target Cloud configuration before running JCMA. JCMA will create configuration
it cannot find, which leads to duplicates if you build after migration.

### Workflows

- [ ] Build all target workflows in Cloud workflow editor
- [ ] Test each workflow manually (create issue, walk through every transition)
- [ ] Verify status categories are correct (To Do, In Progress, Done)

### Automation Rules (ScriptRunner Replacements)

- [ ] Install ScriptRunner Cloud if porting scripts
- [ ] Port `cloud-scriptrunner` items to ScriptRunner Cloud
  - [ ] Test each ported script
- [ ] Build Automation rules for `cloud-automation` items
  - [ ] Test each rule with a sample issue
- [ ] Disable all Automation rules before JCMA migration (prevent them from firing on imported data)

### Custom Fields

- [ ] Create target custom fields per field mapping table
- [ ] Set field contexts and option lists
- [ ] For Assets object fields: import Assets schema first (Phase 2.5)

### SLAs

- [ ] Rebuild all SLA definitions from scratch (SLAs do not migrate via JCMA)
- [ ] Use target status names in start/pause/stop conditions
- [ ] Disable SLAs before import (prevent them from miscalculating on historical data)

### Portals and Request Types

- [ ] Build customer portal structure (help center, portal groups)
- [ ] Create request types per the type mapping
- [ ] Configure portal forms (Cloud Forms with conditional logic where needed)

### Permission Schemes

- [ ] Build target permission schemes
- [ ] Map source project roles to target roles
- [ ] Verify agent licensing is correct

### Assets/CMDB (if in scope)

- [ ] Import Assets schema to Cloud (use cmdb-kit or manual setup)
- [ ] Import Assets data (use cmdb-kit adapter or Data Manager)
- [ ] Verify schema, object counts, and references
- [ ] Run `tools/validate/assets-verify.js` if using automated import


## Phase 3: Test Migration

### JCMA Pre-Check

- [ ] Install JCMA on the source DC instance
- [ ] Run JCMA pre-migration checks
  - [ ] Review all warnings and errors
  - [ ] Fix blocking issues before proceeding
- [ ] Configure JCMA:
  - [ ] Select projects to migrate
  - [ ] Select users and groups to migrate
  - [ ] Select Confluence spaces (if applicable)

### Test Migration Pass 1 (Smoke Test)

- [ ] Select 2-3 small representative projects
- [ ] Run JCMA migration to Cloud
- [ ] Verify on target:
  - [ ] Issues exist with correct fields populated
  - [ ] Statuses are correct (check JCMA remapping log)
  - [ ] Attachments are present and readable
  - [ ] Comments and history migrated
  - [ ] Issue links are intact
  - [ ] Users are correctly mapped
- [ ] Check JCMA migration log for silent remappings or dropped data
- [ ] Delete test-migrated projects on Cloud (requires Atlassian Support for some operations)

### Test Migration Pass 2 (Full)

- [ ] Run JCMA for all migrating projects
- [ ] Run validation scripts:
  - [ ] `tools/validate/count-compare.js` -- counts match per project/type/status
  - [ ] `tools/validate/field-spot-check.js --sample 50` -- field values match on sample
  - [ ] `tools/validate/link-integrity.js` -- issue links intact
  - [ ] `tools/validate/assets-verify.js` -- Assets references resolve (if applicable)
- [ ] Manual validation:
  - [ ] Enable and test ScriptRunner Cloud scripts
  - [ ] Enable and test Automation rules
  - [ ] Enable and test SLAs (create test request, verify clock behavior)
  - [ ] Test customer portal (submit request as customer, verify queue, resolve)
  - [ ] Test dashboards and filters
  - [ ] Test email notifications
- [ ] Document all failures and fixes
- [ ] Clean up target for next pass (or proceed to staging)

### Test Migration Pass 3 (UAT)

- [ ] Run full migration against staging/production Cloud site
- [ ] Invite business stakeholders for UAT
  - [ ] Service desk leads: verify queues, SLAs, workflows
  - [ ] Customers: verify portal access, request history
  - [ ] CMDB owners: verify Assets data (if applicable)
  - [ ] Managers: verify dashboards and reports
- [ ] Document every defect
- [ ] Fix defects in source cleanup or target config, then re-test


## Phase 4: Cutover

### Pre-Cutover

- [ ] All test passes completed and defects resolved
- [ ] Cutover runbook written and reviewed
- [ ] Communication sent to all stakeholders (dates, what changes, new URLs)
- [ ] Source freeze scheduled (announce read-only period)
- [ ] Rollback criteria defined
- [ ] Support plan for first week post-cutover
- [ ] All Automation rules disabled on target
- [ ] All SLAs disabled on target

### Cutover Execution

- [ ] Freeze source DC instance (read-only or announce freeze)
- [ ] Run `tools/extract/delta-extract.js --since <last-test-timestamp>` for any last-minute changes
- [ ] Run final JCMA migration
- [ ] Import delta data via REST API if needed
- [ ] Run validation scripts against production:
  - [ ] `tools/validate/count-compare.js`
  - [ ] `tools/validate/field-spot-check.js --sample 20`
- [ ] Enable ScriptRunner Cloud scripts
- [ ] Enable Automation rules
- [ ] Enable SLAs
- [ ] Switch DNS (if custom domains point to DC)
- [ ] Switch email channels (inbound email to Cloud)
- [ ] Update portal links in documentation and bookmarks
- [ ] Open Cloud to live traffic

### Go / No-Go Decision

- [ ] Validation scripts pass
- [ ] UAT stakeholders confirm critical workflows work
- [ ] SLAs are calculating correctly
- [ ] Customer portal is accessible
- [ ] **Go**: open to all users, announce migration complete
- [ ] **No-Go**: revert DNS/email to DC, communicate postponement, investigate root cause


## Phase 5: Post-Migration

### Immediate (first 24 hours)

- [ ] Monitor Automation rule execution logs for failures
- [ ] Monitor SLA calculations for anomalies
- [ ] Verify email notifications are sending
- [ ] Have migration team on standby for reported issues

### First Week

- [ ] Collect feedback from agents and customers
- [ ] Fix issues as they surface
- [ ] Run `tools/validate/count-compare.js` one final time
- [ ] Verify all ScriptRunner Cloud scripts are functioning correctly
- [ ] Reset passwords for any users who need them

### First Month

- [ ] Decommission source DC instance (or set to read-only archive)
- [ ] Transfer Cloud administration to internal team
- [ ] Deliver documentation:
  - [ ] As-built configuration document
  - [ ] Known issues and workarounds
  - [ ] Post-migration admin guide
- [ ] Close out migration project


## Key Risks (DC to Cloud Specific)

| Risk | Mitigation |
|---|---|
| JCMA silently remaps statuses | Check migration log line by line; run status validation script |
| ScriptRunner scripts that cannot port to Cloud | ScriptRunner audit categorizes each; plan Automation rules or Forge apps for gaps |
| DC Behaviours have no Cloud equivalent | Use Cloud Forms conditional logic or accept the gap |
| Custom REST endpoints consumed by external systems | Rewrite integrations against Jira REST API or Forge apps |
| Agent licensing cost increase on Cloud | Audit agent list during Phase 0; remove unnecessary agents |
| JCMA does not migrate SLAs, Assets, or Automation rules | Rebuild manually on target before cutover |
| Attachment volume slows JCMA transfer | Clean up large/unnecessary attachments; schedule migration during off-hours |
| Entity IDs change between DC and Cloud | Never hardcode IDs; audit all filters, dashboards, and scripts for ID references |
| Custom field contexts get flattened by JCMA | Document contexts before migration; rebuild manually on Cloud |
| Service accounts cannot become Atlassian accounts | Replace with API tokens or OAuth apps |
