Jira Server Migration Checklist

Comprehensive checklist derived from migration planning meeting and Appfire Configuration Manager for Jira (CMJ) documentation.

## Phase 0: Inventory and Prerequisites

### Tool and Version Inventory (Spreadsheet)

- [ ] **Source side**: Compile full list of Atlassian tools and current versions
  - [ ] Jira version
  - [ ] Confluence version
  - [ ] Bitbucket / GitLab version
  - [ ] All installed Jira plugins and their versions (export from Manage Apps)
- [ ] **Target side**: Compile full list of Atlassian tools and current versions
  - [ ] Jira version
  - [ ] Confluence version
  - [ ] Bitbucket version
  - [ ] All installed Jira plugins and their versions
- [ ] Merge both inventories into a single shared spreadsheet (by tool, by version, by site)
- [ ] Identify version gaps that must be resolved before migration

### Jira Version Alignment

- [ ] Determine target Jira version both instances will run (must match for CMJ migration)
- [ ] Plan upgrade path for source Jira instance if behind
- [ ] Schedule and execute Jira upgrade on source side
- [ ] Verify both instances are on the same Jira version post-upgrade

### Plugin / App Alignment

- [ ] Compare plugin lists between source and target instances
- [ ] Identify plugins present on one side but not the other
- [ ] Ensure matching plugin versions on both instances (CMJ requires same apps with same versions)
- [ ] Address Zephyr specifically:
  - [ ] Source has basic Zephyr -- determine if upgrade to Zephyr Scale is needed
  - [ ] Target uses Zephyr -- confirm edition (basic vs. Scale)
  - [ ] Verify CMJ supports the Zephyr version in use (check integrated apps list)
- [ ] Address ScriptRunner:
  - [ ] Document all ScriptRunner scripts, listeners, and custom fields on target side
  - [ ] Document all ScriptRunner usage on source side
  - [ ] Identify scripts that reference custom fields by native ID (these will break -- see CMJ docs on Calculated/Scripted Fields Migration)
  - [ ] Refactor scripts to reference fields by name instead of `customfield_XXXXX` where possible
- [ ] Address any requirements management plugins (RMsis, etc.)
  - [ ] Document how requirements are stored (as issues vs. entries in RM tool)
  - [ ] Plan for workflow changes if issues convert to RM entries

### Licensing

- [ ] **CMJ Licenses**:
  - [ ] Purchase commercial CMJ license for the **target** production instance
  - [ ] Obtain free trial/developer CMJ license for the **source** instance (CMJ docs confirm source can use trial)
  - [ ] Obtain two free developer CMJ licenses for test and staging instances
- [ ] **Zephyr**: Confirm license tier and funding for any upgrade needed
- [ ] **Confluence**: Assess licensing needs if consolidating Confluence spaces
- [ ] **Other plugins**: Confirm all plugin licenses cover the combined user count post-migration

## Phase 1: Pre-Migration Cleanup and Analysis

> **Why this order matters:** Jira configuration objects have a strict dependency chain.
> You must clean bottom-up -- leaf objects first, then the schemes that reference them --
> or you'll break references and create orphans along the way.
>
> **Dependency chain (bottom to top):**
>
> ```
> Custom Fields -> Screens -> Screen Schemes -> Issue Type Screen Schemes -> Projects
> Custom Fields -> Field Configurations -> Field Configuration Schemes -> Projects
> Statuses -> Workflows -> Workflow Schemes -> Projects
> Issue Types -> Issue Type Schemes -> Projects
> Permission Schemes, Notification Schemes, Issue Security Schemes -> Projects
> ```

### Project Audit (Both Instances)

Do this first on both sides to scope the work. Everything downstream depends on knowing which projects are in play.

#### Source

- [ ] Export full project list (key, name, lead, category, last issue activity date)
- [ ] Classify each project: **active** / **dormant** / **archive candidate**
- [ ] Identify which projects are migrating to target vs. staying/being retired
- [ ] For each migrating project, document:
  - [ ] Project type (Software, Service Management, Business)
  - [ ] Current workflow scheme
  - [ ] Current issue type scheme
  - [ ] Current screen scheme / issue type screen scheme
  - [ ] Current field configuration scheme
  - [ ] Current permission scheme
  - [ ] Current notification scheme
  - [ ] Current issue security scheme (if any)
- [ ] Note projects using **default schemes** (these must be copied and renamed before migration -- CMJ cannot export default schemes)

#### Target

- [ ] Export full project list with same details
- [ ] Classify projects: existing native projects / landing zone projects / PMO projects
- [ ] For each existing project, document same scheme associations as above
- [ ] Identify any project keys that **conflict** with source project keys

### Custom Fields (Both Instances)

Custom fields are the foundation -- screens, field configs, workflows, and filters all reference them. Clean these first.

#### Inventory

- [ ] **Source**: Export all custom fields (Admin -> Issues -> Custom Fields)
  - [ ] For each: name, type, description, contexts (global vs. project-specific), which screens it appears on
- [ ] **Target**: Export same list
- [ ] Cross-reference: identify fields with the **same name and type** on both instances
  - [ ] CMJ matches by name+type -- duplicates within a single instance cause ambiguity and potential data loss
  - [ ] Fields with same name but different types will be created as new on target

#### Cleanup (Source)

- [ ] Identify **duplicate custom fields** (same name + same type on source)
  - [ ] Determine which is the "real" one (has data, is on screens)
  - [ ] Rename or delete the duplicate before creating any CMJ snapshots
  - [ ] If both have data, plan a merge strategy (SQL or ScriptRunner script to consolidate values)
- [ ] Identify **orphaned custom fields** (not on any screen, no data in any issue)
  - [ ] Delete orphans to reduce noise in migration
- [ ] Identify **ScriptRunner-generated calculated/scripted fields**
  - [ ] Document the script formula for each
  - [ ] Note: these reference other fields by `customfield_XXXXX` native ID -- IDs will change on target
  - [ ] Plan to update references post-migration using CMJ's ID mapping file

#### Cleanup (Target)

- [ ] Identify and remove duplicate/orphaned custom fields (same process)
- [ ] Identify target fields that are semantically identical to source fields (same purpose, different name)
  - [ ] Decide: rename to match (so CMJ merges them) or keep separate

#### Custom Field Silo Strategy (Both Instances)

Custom field silos apply to the entire merged instance, not just JSM. Without silos, every user sees every field from every team in every dropdown -- slowing Jira and causing confusion. Plan this now before touching screens or field configs.

- [ ] **Categorize every custom field** on both instances into one of these silos:
  - [ ] **Shared / Global** -- fields used across all project types (e.g., Priority, Story Points, Sprint)
  - [ ] **Source development** -- fields specific to source dev projects (will remain scoped to those projects post-migration)
  - [ ] **Target development** -- fields specific to target dev projects
  - [ ] **JSM / Service Management** -- fields used only by service desk projects (request type, SLA-related, customer-facing fields)
  - [ ] **Test management** -- Zephyr or other test tool fields
  - [ ] **Requirements management** -- RMsis or other RM tool fields
  - [ ] **CM / Admin** -- fields used only for configuration management or admin workflows
- [ ] **For each silo, define the field configuration context**:
  - [ ] Which projects (or project categories) should see these fields
  - [ ] Which projects should NOT see them (hidden via field configuration)
  - [ ] Whether the context is global or project-scoped
- [ ] **Cross-reference source and target silos**:
  - [ ] Identify fields that belong to the same silo on both sides (candidates for merging)
  - [ ] Identify fields that look similar but serve different purposes across instances (must stay separate with clear naming)
  - [ ] Identify fields that only exist on one side -- assign them to the correct silo
- [ ] **Plan the post-migration field configuration contexts on target**:
  - [ ] Source dev fields: scoped to source-origin projects only
  - [ ] Target dev fields: scoped to target-origin projects only
  - [ ] JSM fields: scoped to service management projects only (both source and target JSM projects)
  - [ ] Shared fields: global context, visible everywhere
  - [ ] Test/RM/CM fields: scoped to relevant project categories
- [ ] **Document the silo map** in the AMS as a reference table:
  - [ ] Field name | Type | Silo | Context (which projects) | Source instance | Target instance
  - [ ] This becomes the authoritative reference for field configuration work in the Field Configurations and Field Configuration Schemes sections
- [ ] **Validate silo decisions against screens (preview)**:
  - [ ] For each screen, verify it only contains fields from the appropriate silo(s)
  - [ ] Flag screens that mix silos -- these will need to be split or fields removed

### Screens

Screens are groups of fields shown during create/edit/view/transition. Clean these after custom fields are sorted.

#### Inventory (Both Instances)

- [ ] **Source**: Export all screens (Admin -> Issues -> Screens)
  - [ ] For each: name, which fields it contains, which screen schemes reference it
- [ ] **Target**: Export same list
- [ ] Identify screens that are **functionally identical** (same fields, different names)
- [ ] Identify screens that are **unused** (not referenced by any screen scheme)

#### Consolidation (Source)

- [ ] Group screens by function (e.g., all "Create Bug" screens with same fields)
- [ ] For identical screens:
  - [ ] Pick one canonical screen
  - [ ] Update all screen schemes that reference the duplicates to point to the canonical one
  - [ ] Delete the now-unreferenced duplicate screens
- [ ] Delete any unused screens (not in any screen scheme)
- [ ] Document remaining screens and their purpose

#### Consolidation (Target)

- [ ] Same process -- consolidate duplicate screens
- [ ] Ensure landing zone projects use shared screens (not per-project copies)
- [ ] If 6 projects all need the same fields on create, they should share 1 create screen, not 6 copies

### Screen Schemes

Screen schemes map operations (Create / Edit / View) to screens. Clean after screens are consolidated.

#### Inventory (Both Instances)

- [ ] **Source**: Export all screen schemes (Admin -> Issues -> Screen Schemes)
  - [ ] For each: name, which screen it maps to for Create/Edit/View, which issue type screen schemes reference it
- [ ] **Target**: Export same list
- [ ] Identify screen schemes that map to the **exact same screens** for Create/Edit/View

#### Consolidation (Source)

- [ ] For identical screen schemes:
  - [ ] Pick one canonical screen scheme
  - [ ] Update all issue type screen schemes that reference duplicates to point to the canonical one
  - [ ] Delete unreferenced duplicates
- [ ] Delete unused screen schemes

#### Consolidation (Target)

- [ ] Same process
- [ ] Ensure all target dev projects use shared screen schemes where they share the same screens

### Issue Type Screen Schemes

These map issue types to screen schemes. Clean after screen schemes are consolidated.

#### Inventory (Both Instances)

- [ ] **Source**: Export all issue type screen schemes (Admin -> Issues -> Issue Type Screen Schemes)
  - [ ] For each: name, which issue type maps to which screen scheme, which projects use it
- [ ] **Target**: Export same list
- [ ] Identify issue type screen schemes that are **functionally identical** (same mappings)

#### Consolidation (Source)

- [ ] For identical issue type screen schemes:
  - [ ] Pick one canonical scheme
  - [ ] Reassign projects from duplicates to the canonical one
  - [ ] Delete unreferenced duplicates
- [ ] If a project uses the **Default Issue Type Screen Scheme**, copy it, rename the copy, and assign the project to the copy (CMJ cannot export defaults)

#### Consolidation (Target)

- [ ] Same process
- [ ] Ensure landing zone projects don't each have their own issue type screen scheme if they're identical

### Field Configurations

Field configurations define per-field behavior (required / optional / hidden / renderer). Independent of screens -- can clean in parallel or after.

#### Inventory (Both Instances)

- [ ] **Source**: Export all field configurations (Admin -> Issues -> Field Configurations)
  - [ ] For each: name, which fields are required/optional/hidden, which field config schemes reference it
- [ ] **Target**: Export same list
- [ ] Identify field configurations that are **functionally identical**
- [ ] Note: "Default Field Configuration" cannot be exported by CMJ

#### Consolidation (Source)

- [ ] Merge identical field configurations
- [ ] If a project uses "Default Field Configuration": copy it, rename, assign the project to the copy
- [ ] Delete unused field configurations

#### Consolidation (Target)

- [ ] Same process
- [ ] Plan field configurations for incoming source custom fields (decide required/optional/hidden per field per context)

### Field Configuration Schemes

These map issue types to field configurations. Clean after field configurations are sorted.

#### Inventory (Both Instances)

- [ ] **Source**: Export all field configuration schemes (Admin -> Issues -> Field Configuration Schemes)
  - [ ] For each: name, which issue type maps to which field configuration, which projects use it
- [ ] **Target**: Export same list
- [ ] Identify identical schemes

#### Consolidation (Both Instances)

- [ ] Merge identical field configuration schemes
- [ ] Reassign projects; delete orphans
- [ ] If using "System Default Field Configuration" scheme: copy, rename, reassign (CMJ cannot export this default)

### Issue Types and Issue Type Schemes

#### Issue Type Inventory (Both Instances)

- [ ] **Source**: List all issue types (standard + sub-task types)
  - [ ] For each: name, description, which issue type schemes include it
- [ ] **Target**: List all issue types
- [ ] Cross-reference: identify name matches, name conflicts (same name, different meaning), and gaps
- [ ] Decide "As Is" vs. normalization for each (e.g., does source "Defect" map to target "Bug"?)

#### Issue Type Scheme Consolidation (Both Instances)

- [ ] **Source**: Export all issue type schemes
  - [ ] For each: name, which issue types are included, which projects use it
- [ ] Merge identical schemes, reassign projects, delete orphans
- [ ] **Target**: Same process
- [ ] If using "Default Issue Type Scheme": copy, rename, reassign

### Statuses, Workflows and Workflow Schemes

Workflows reference statuses, screens (for transitions), and can contain ScriptRunner post-functions. This is the most complex cleanup area.

#### Status Inventory (Both Instances)

- [ ] **Source**: List all statuses and which category each belongs to (To Do / In Progress / Done)
- [ ] **Target**: List all statuses
- [ ] Cross-reference: identify duplicates (e.g., "In Progress" vs. "Working" meaning the same thing)
- [ ] Plan normalization: agree on a standard set of statuses across both orgs

#### Workflow Inventory (Both Instances)

- [ ] **Source**: Export all workflows
  - [ ] For each: name, statuses, transitions, conditions, validators, post-functions
  - [ ] Flag workflows with **ScriptRunner** post-functions, conditions, or validators
  - [ ] Flag workflows with **post-trigger events** (CMJ docs flag these as conflict-prone)
  - [ ] Flag workflows referencing **custom field IDs** in transition screens or conditions
- [ ] **Target**: Same inventory
- [ ] Cross-reference: identify workflows that are functionally identical (same statuses + transitions, different name)

#### Workflow Consolidation (Source)

- [ ] Group projects by workflow pattern (e.g., all projects using Open -> In Progress -> Done)
- [ ] If multiple projects use functionally identical workflows:
  - [ ] Pick one canonical workflow
  - [ ] Update workflow schemes to reference the canonical one
  - [ ] Deactivate and delete duplicates
- [ ] Note: default workflow ("jira") cannot be exported by CMJ -- copy, rename, reassign if in use
- [ ] Document every ScriptRunner extension in workflows in detail for post-migration fixup

#### Workflow Scheme Consolidation (Both Instances)

- [ ] **Source**: Export all workflow schemes
  - [ ] For each: name, which issue type maps to which workflow, which projects use it
- [ ] Merge identical workflow schemes, reassign projects, delete orphans
- [ ] If using "Default Workflow Scheme": copy, rename, reassign
- [ ] **Target**: Same process

### Permission Schemes

These are independent of the screen/field/workflow chain and can be done in parallel with the Screens through Workflows sections.

#### Inventory (Both Instances)

- [ ] **Source**: Export all permission schemes
  - [ ] For each: name, which permissions are granted to which roles/groups/users, which projects use it
- [ ] **Target**: Export same list
- [ ] Identify identical permission schemes; merge and reassign

#### Consolidation

- [ ] Merge identical schemes on each instance
- [ ] Decide if source projects will adopt target permission schemes or bring their own
- [ ] Ensure role names match between instances (CMJ maps by role name)

### Notification Schemes

Also independent -- can be done in parallel with the Screens through Workflows sections.

#### Inventory (Both Instances)

- [ ] **Source**: Export all notification schemes
  - [ ] For each: name, which events notify which roles/groups/emails, which projects use it
- [ ] **Target**: Export same list

#### Consolidation

- [ ] Merge identical schemes on each instance; delete orphans
- [ ] Decide whether source projects adopt target notification schemes post-migration

### Issue Security Schemes

#### Inventory (Both Instances)

- [ ] **Source**: Export all issue security schemes (if any)
  - [ ] For each: name, security levels, which groups/roles have access at each level, which projects use it
- [ ] **Target**: Export same list
- [ ] CMJ has specific handling for issue security migration -- see [Issue Security Migration](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/197923369) docs

#### Consolidation

- [ ] Merge identical schemes; plan how security levels map between instances

### JSM-Specific Configuration (If Applicable)

Only applies to Service Management projects. Do this after all the above is clean. JSM custom field silos are already planned in the Custom Field Silo Strategy section -- this step covers the remaining JSM-specific objects.

- [ ] Document JSM-specific objects per project:
  - [ ] Request types and request type groups
  - [ ] Queues and queue groups
  - [ ] SLAs (time metrics)
  - [ ] Email channels (CMJ matches by email address -- see [JSM Special Cases](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198214397))
  - [ ] Customer organizations
  - [ ] Portal settings
  - [ ] Automation rules
  - [ ] Knowledge base links

### Health Checks and CMJ Installation

Do this last, after cleanup, so the health checks reflect the cleaned state.

#### Source

- [ ] Run Jira's built-in Database Integrity Checker
- [ ] Fix any issues found
- [ ] Install CMJ (trial or developer license)
- [ ] Run CMJ Integrity Check
- [ ] Fix any CMJ-reported issues (see [Integrity Error Types](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198116253))
- [ ] Re-run both checks until clean

#### Target

- [ ] Run Jira's built-in Database Integrity Checker
- [ ] Fix any issues found
- [ ] Install CMJ (commercial license)
- [ ] Run CMJ Integrity Check
- [ ] Fix any CMJ-reported issues
- [ ] Re-run both checks until clean

### Landing Zone Preparation (Target)

After all cleanup is done, finalize the target environment.

- [ ] **Project templates**: Create standard project templates so all new projects inherit shared schemes
  - [ ] Development project template (shared workflow, screen scheme, field config scheme)
  - [ ] JSM project template (if applicable)
- [ ] **Verify landing zone projects**:
  - [ ] Confirm all target projects exist with correct keys
  - [ ] Confirm they use the standardized templates (not ad-hoc per-project config)
  - [ ] Confirm required fields, screens, and workflows are in place
- [ ] **Implement field configuration contexts per the silo map from the Custom Field Silo Strategy section**:
  - [ ] Create the field configuration contexts for each silo (source dev, target dev, JSM, shared, test/RM/CM)
  - [ ] Assign project categories to the correct contexts
  - [ ] Verify developers on each team only see fields relevant to their silo

### User and Directory Normalization

- [ ] Determine user directory setup on both sides (Active Directory, LDAP, Crowd, internal)
- [ ] Export user lists from both instances
- [ ] Identify **gaps**: same person, different usernames across instances
- [ ] Identify **conflicts**: same username, different people
- [ ] Plan username normalization (rename on source or target to ensure consistency)
- [ ] Validate group names match between instances (CMJ exports groups empty -- membership must be re-applied)
- [ ] Document resolution decisions in the Application Migration Specification (AMS)
- [ ] Note: CMJ creates users in the default directory on the target; passwords must be reset by users

### Application Migration Specification (AMS) Document

Per CMJ best practices, create an AMS document covering:

- [ ] Apps and version requirements
- [ ] User management normalization plan
- [ ] "As Is" vs. transformation strategy decision for each project
- [ ] Configuration conflicts and gaps with resolution mappings
- [ ] Default scheme handling (copy and rename any default schemes used by migrating projects)
- [ ] Quality strategy and test plans
- [ ] Post-migration remediation plan with SLA

## Phase 2: Network and Infrastructure

### Connectivity

- [ ] Confirm network connectivity status and bandwidth between source and target sites
- [ ] Evaluate whether upload bandwidth is sufficient for snapshot transfers
- [ ] Assess alternative connections for migration traffic
- [ ] Plan for network redundancy (if one leg goes down, migration should not stall)
- [ ] Test actual transfer speeds between source and target with representative file sizes

### Environments

- [ ] **Test environment**: Set up Jira test instance (clone of target production) for development stage
  - [ ] Install CMJ with free developer license
  - [ ] Ensure same Jira version and plugins as production
- [ ] **Staging environment**: Set up Jira staging instance (close replica of target production)
  - [ ] Install CMJ with free developer license
  - [ ] Must mirror production including all project configs and issue data
- [ ] **Production instances**: Both source and target with CMJ installed
- [ ] Allocate sufficient memory/resources per Atlassian sizing guide (CMJ loads configs and performs analysis in memory)

## Phase 3: Test Migrations (Development Stage)

### Select Pilot Projects

- [ ] Choose 2-3 small/representative projects for initial test migration
- [ ] Include at least one project with:
  - [ ] ScriptRunner customizations
  - [ ] Custom fields with scripted references
  - [ ] JSM configuration (if applicable)
  - [ ] Zephyr test data

### Execute Test Migration

- [ ] **On Source**:
  - [ ] Create project snapshot(s) including issues, agile boards, filters, dashboards
  - [ ] Download the snapshot file
  - [ ] Run CMJ Integrity Check on snapshot
- [ ] **On Test Server (clone of target production)**:
  - [ ] Deploy snapshot using Project Merge mode
  - [ ] Review change and impact analysis carefully -- compare against AMS
  - [ ] Resolve any errors or warnings before proceeding
  - [ ] If changes don't match AMS, restore backups and iterate
- [ ] Record deployment time for capacity planning

### Validate Test Migration

- [ ] **Filters**: Verify issue counts, ordering, column layout
- [ ] **Dashboards**: Verify layout, gadgets, gadget content
- [ ] **Agile boards**:
  - [ ] Board views (backlog, active sprints)
  - [ ] Issues, ranking, epics, versions, estimates
  - [ ] Quick filters
  - [ ] Sprint ordering and content
  - [ ] Reports
  - [ ] Project-to-board associations
- [ ] **Issues**:
  - [ ] Sprint and epic link data
  - [ ] Comments and history
  - [ ] All field values (including 3rd-party custom fields, time tracking)
  - [ ] Issue links
  - [ ] Attachments
  - [ ] Confluence links
  - [ ] Git links (Bitbucket/GitLab branches and commits)
- [ ] **Security**:
  - [ ] Project role memberships
  - [ ] Access and operations for different roles
  - [ ] Board, filter, and dashboard ownership
- [ ] **Operations**: Test workflow transitions, issue create/edit/delete, comments
- [ ] **ScriptRunner**: Verify all scripted fields and workflow functions work correctly
  - [ ] Check for broken `customfield_XXXXX` references (use CMJ's native ID mapping file)
  - [ ] Manually update any scripted field references using the mapping JSON
- [ ] **JSM-specific** (if applicable):
  - [ ] Customer organizations transferred correctly
  - [ ] Email channels handled per CMJ rules
  - [ ] Request types intact
  - [ ] SLAs and queues functioning

## Phase 4: Staging (Dress Rehearsal)

- [ ] Refresh staging environment to match current target production
- [ ] Execute full migration procedure exactly as documented (no ad-hoc changes)
- [ ] Time the entire process to estimate production maintenance window duration
- [ ] Run all development-stage validation tests again
- [ ] Conduct User Acceptance Testing (UAT) with actual users from both source and target orgs
- [ ] If failures occur, fix in test environment and repeat staging -- never fix directly on staging
- [ ] Document any deviations or surprises for production runbook

## Phase 5: Production Migration

- [ ] **Pre-migration**:
  - [ ] Create full backups of both source and target production Jira instances
  - [ ] Create CMJ system snapshot of target production for rollback capability
  - [ ] Restrict user access to target production (maintenance window)
  - [ ] Communicate migration schedule and expected downtime to all stakeholders
- [ ] **Execute migration**:
  - [ ] Create fresh project snapshots from source production (not from clones)
  - [ ] Deploy snapshots to target production using Project Merge mode
  - [ ] Verify change/impact analysis matches what was seen in staging exactly
  - [ ] If analysis differs from staging, STOP -- environments have diverged
  - [ ] Proceed with deployment
- [ ] **Post-migration validation**:
  - [ ] Execute subset of development-stage tests
  - [ ] Conduct limited UAT within maintenance window time limit
  - [ ] Verify ScriptRunner functions work
  - [ ] Verify JSM services are operational
- [ ] **Go / No-Go decision**:
  - [ ] If successful: open system to all users
  - [ ] If failed: restore from backup, reschedule, investigate root cause

## Phase 6: Post-Migration

### Immediate

- [ ] Monitor audit logs for any warnings or errors
- [ ] Have users reset passwords if new accounts were created by CMJ
- [ ] Verify group memberships (CMJ creates groups empty -- re-populate as needed)
- [ ] Execute post-migration remediation plan for any known issues

### Standardization

- [ ] Normalize handoff processes between development and CM teams across both orgs
- [ ] Establish standard change issue type and change management board for all teams
- [ ] Ensure consistent workflow naming across merged projects
- [ ] Set up field configuration silos so custom fields stay organized long-term

### Documentation and Governance

- [ ] Assign Jira Administrator role (ongoing) -- this is a noted gap
- [ ] Document all migration decisions and outcomes
- [ ] Set up project templates so new projects don't create duplicate schemes
- [ ] Establish governance for creating new custom fields, workflows, screens

## Action Items from Meeting

| # | Action Item | Owner | Due |
|---|------------|-------|-----|
| 1 | Compile tool/version spreadsheet (source side) | Source sysadmin | 2 weeks |
| 2 | Compile tool/version spreadsheet (target side) | Target team | 2 weeks |
| 3 | Identify tool gaps and missing capabilities (both sides) | All | 2 weeks |
| 4 | Enumerate ScriptRunner usage and dependencies | Target team | TBD |
| 5 | Review CMJ best practices and create recommendations list | Migration lead | 2 weeks |
| 6 | Schedule session with source sysadmin to assess source Jira config state | Migration lead + source sysadmin | After spreadsheet |
| 7 | Investigate Active Directory / user migration approach | Infrastructure | TBD |
| 8 | Confirm network upgrade timeline and actual bandwidth | Infrastructure | TBD |
| 9 | Determine if source needs Git repo migration (decided: not immediate) | N/A | Deferred |
| 10 | Investigate SharePoint as documentation solution (free license available) | Infrastructure | TBD |
| 11 | Confirm CMJ license procurement (1 commercial + trial for source + 2 dev) | TBD | Before test migrations |
| 12 | Post CM/sysadmin job rec on source side | Source management | In progress |

## Key Risks and Concerns

| Risk | Mitigation |
|------|-----------|
| Limited upload bandwidth may slow large snapshot transfers | Use alternative connection if available; transfer during off-hours; compress snapshots |
| ScriptRunner fields referencing native IDs will break on target | Audit all scripts pre-migration; refactor to use field names; use CMJ ID mapping file post-deploy |
| Duplicate custom fields cause ambiguous matching and potential data loss | Clean up duplicates on both sides before migration; use CMJ's Resolve Custom Field Conflicts UI |
| No dedicated Jira Administrator role exists | Migration lead filling gap informally; source posting job req; establish role formally |
| Scheme proliferation (hundreds of duplicate screens/workflows) | Consolidate before migration; standardize on templates going forward |
| JSM custom fields conflating with development custom fields | Set up field configuration contexts to silo JSM fields separately |
| Network reliability (single connection leg) | Push for redundant connection approval; have offline snapshot transfer as fallback |
| User directory mismatch between instances | Normalize usernames/groups before migration per AMS document |

## CMJ Reference Docs

Key Configuration Manager documentation pages for this migration:

- [Merge Jira Servers](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198021865) -- primary use case guide
- [Test - Staging - Production](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198279492) -- environment setup process
- [Special Cases](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198214051) -- users, groups, custom fields, workflows
- [Calculated/Scripted Fields Migration](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198021933) -- ScriptRunner field handling
- [Duplicate Custom Fields](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198181755) -- conflict resolution
- [JSM Special Cases](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198214397) -- Service Management migration
- [Data Loss Prevention](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/197923030) -- rollback and safety features
- [Configuration Support Matrix](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198246502) -- what CMJ can migrate
- [License Options](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198246431) -- licensing for migrations
- [Integrity Check](https://appfire.atlassian.net/wiki/spaces/CMJ/pages/198116074) -- pre-migration health check
