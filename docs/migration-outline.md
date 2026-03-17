# Atlassian ITSM Migration Guide

A practical guide to migrating ITSM platforms to Jira Service Management, organized by what you actually do on an engagement, not by product feature list.


## Discovery

You show up on day one. The client has an existing ITSM platform (Jira DC, Ivanti, ServiceNow, BMC, Cherwell, or some combination) and wants to be on JSM Cloud by a target date. Before you touch anything, you need to understand what exists.

### Walking the Source System

Open the source system and start documenting. Every migration starts with the same inventory exercise regardless of platform.

**Projects and service desks.** How many are there? A 3-project JSM DC instance is a different conversation than a 40-project Ivanti setup. List every project, its issue types, approximate issue count, and who owns it. Some projects will be abandoned but still have data. Some will be test instances someone forgot to delete. Flag them now.

**Custom fields.** Export the full custom field list. Run `tools/extract/field-inventory.js` to pull fields from both source and target and cross-reference them automatically. In Jira DC, there are often 200+ custom fields, and half of them are orphaned or duplicated because three different admins created "Priority" over five years. For each field, note the type (text, select, multi-select, cascading select, user picker, date, Assets object), which projects use it, and whether it has multiple contexts with different option sets. Cascading selects and Assets object fields are the hardest to migrate. User picker fields break when account IDs change between instances.

**Workflows.** Map every workflow: statuses, transitions, conditions, validators, and post-functions. Run `tools/extract/workflow-inventory.js` to pull full transition detail and flag ScriptRunner post-functions. In Jira DC, ScriptRunner post-functions are the biggest risk area because ScriptRunner Cloud has partial parity with DC — many scripts migrate directly, but features like Behaviours, custom REST endpoints, and Escalation Services are DC-only. A workflow with 12 ScriptRunner post-functions needs careful evaluation: some will work on Cloud ScriptRunner, others need Cloud Automation rules or Forge apps. In Ivanti, the workflow engine is fundamentally different from Jira, so every workflow is a rebuild.

**Automation rules and scripts.** Inventory every automation rule, ScriptRunner script, listener, behaviour, escalation service, and scheduled job. Run `tools/extract/scriptrunner-audit.js` to pull the full ScriptRunner configuration and auto-categorize each item for Cloud compatibility. Categorize each one: does it work on ScriptRunner Cloud as-is, can it be replicated in Cloud Automation, does it need a Forge app, or does it require a process change? This categorization drives the biggest timeline decisions on the project.

**SLAs.** Document every SLA definition: the calendar, the goal, the start/pause/stop conditions, and the request types it applies to. SLAs are tightly coupled to workflow statuses. If you change the workflow, every SLA that references those statuses breaks. This is the most common "everything looked fine until we turned on SLAs" failure.

**Permissions and users.** Export permission schemes, project roles, and group memberships. Run `tools/extract/scheme-inventory.js` for schemes and `tools/extract/user-inventory.js` for users and groups. Note any permission scheme that uses custom conditions or ScriptRunner-based permission checks. Map user accounts: who has agent licenses, who is a customer, who is a collaborator? For DC-to-Cloud, every username becomes an Atlassian account tied to an email address. Service accounts with no real email are a problem.

**Assets/CMDB schemas.** If Assets or Insight is in scope, document every object schema: the type hierarchy, attributes per type, reference types, status definitions, automation rules, and record counts. Note any ScriptRunner automation that touches Assets objects. Note any Assets custom fields on Jira issues and which request types use them.

**Attachments and storage.** Check total attachment volume. A 500GB attachment store has different migration logistics than a 5GB one. Check for binary files in unexpected places (PDFs in issue descriptions, screenshots in comments, ZIP files attached to Assets objects).

### The Client Interview

The inventory tells you what exists. The interview tells you what matters.

Ask the service desk leads: Which request types handle 80% of volume? Which workflows have the most complaints? Which SLAs are contractually binding? Which automation rules save the most manual work? Which custom fields do agents actually use vs which are legacy clutter?

Ask the admins: What ScriptRunner scripts run in production? Which ones are fragile? What breaks when you upgrade? What would you change if you were starting fresh?

Ask the customers: What do they see on the portal? What confuses them? What do they wish worked differently?

These conversations determine what to migrate faithfully, what to simplify, and what to leave behind.

### The Assessment Deliverable

Produce a migration assessment document with:

- Source system inventory (projects, fields, workflows, automation, SLAs, permissions, Assets schemas, storage)
- Complexity scoring per component (straightforward, needs redesign, blocked by platform limitation)
- Risk register (the things that will break if you don't handle them)
- Recommendation: what to migrate, what to rebuild, what to retire
- Rough effort estimate by phase
- Dependencies and sequencing (some projects must migrate before others because of cross-project links or shared schemes)


## Target Design

You know what exists. Now design the target environment. This is where the client's wish list meets Jira's reality.

### Space and Project Architecture

On Cloud, Atlassian is renaming "projects" to "spaces" and "issues" to "work items." The rollout is gradual - APIs still use the old terms, and documentation uses both interchangeably. This guide uses "projects" and "issues" throughout since that is what the tooling still expects.

Decide the project structure:

- Are you consolidating multiple source projects into fewer target projects? Common when clients have 15 DC projects that should have been 5.
- Are you keeping the same structure? Safest for migration, easiest for user adoption, but misses the chance to clean up.
- Are you splitting projects? Sometimes a DC project has grown to serve three teams and needs to be separated.

For each target project, decide: company-managed or team-managed? Company-managed gives you full workflow and field control. Team-managed is simpler but limits configuration. Migration targets are almost always company-managed because you need the control.

### Issue Type and Request Type Mapping

Map source issue types to target issue types. In a DC-to-Cloud migration, this is mostly 1:1 unless you are consolidating. In an Ivanti-to-JSM migration, this is a design exercise because Ivanti's incident, request, problem, and change structures do not map cleanly to JSM's model.

For each target issue type, define the request types that face the customer portal. A single issue type can have multiple request types with different forms. The request type controls what the customer sees; the issue type controls what the agent works with.

Map portal groups. How are request types organized on the customer portal? Typical groupings: "Get Help" (incidents and general requests), "Request Something" (service requests), "Report a Problem" (problems), and a group per specialized service.

### Workflow Design

Design target workflows before migrating any data. Every imported issue must land in a valid status.

**Status category alignment.** Jira Cloud requires every status to belong to a category: To Do, In Progress, or Done. Map every source status to a target status with the correct category using `templates/status-mapping.csv` and the workflow inventory at `output/extract/workflows-source.json`. A source system with 45 statuses across 8 workflows might map to 15 target statuses across 3 workflows. The mapping table is the single most important artifact in a workflow migration.

Example mapping:

```
Source (Ivanti)           Target (JSM Cloud)      Category
------------------------------------------------------------
New                       Open                    To Do
Assigned                  In Progress             In Progress
Waiting on Customer       Waiting for Customer    In Progress
Waiting on Vendor         Waiting for Support     In Progress
Resolved                  Resolved                Done
Closed                    Closed                  Done
Reopened                  In Progress             In Progress
```

**Transition logic.** For each transition, document conditions (who can execute it), validators (what must be true), and post-functions (what happens after). On DC, post-functions are often ScriptRunner Groovy scripts that update Assets objects, send custom notifications, or calculate field values. On Cloud, these become Automation rules, which have different capabilities and limitations.

**The ScriptRunner gap.** ScriptRunner is available on Cloud but with partial parity. Many workflow post-functions, listeners, and script fields work on ScriptRunner Cloud, but Behaviours, custom REST endpoints, HAPI, and Escalation Services are DC-only. Every ScriptRunner customization must be evaluated:

- Does it work on ScriptRunner Cloud as-is? (about 40% of cases)
- Can it be replicated with Cloud Automation? (about 30%)
- Does it need a Forge app? (about 15%)
- Is it impossible on Cloud and needs a process change? (about 20%)

Document each one with the replacement approach.

### Field Schema Design

**Field mapping table.** Start from `templates/field-mapping.csv` and the cross-reference in `output/extract/fields-crossref.json`. For every source custom field, define the target:

```
Source Field          Source Type          Target Field        Target Type       Transform
------------------------------------------------------------------------------------------
Priority              Select (4 options)  Priority            Select (4)        Direct
Affected Service      Cascading Select    Affected Service    Assets Object     AQL filter
Customer Impact       ScriptRunner Field  Customer Impact     Automation-set    Rule trigger
Deployment Site       Insight Object      Deployment Site     Assets Object     Schema ref
Region                Text (free)         Region              Select (locked)   Value mapping
```

**Problem fields.** Cascading selects where the parent-child values are different between source and target. Multi-select fields where the options list has diverged. User picker fields where the source uses usernames and the target uses Atlassian account IDs. Date fields where the source stores dates in a non-standard format. Assets object fields where the referenced schema has a different structure on the target.

**Field context conflicts.** Jira custom fields can have different option sets per project context. When consolidating projects, these contexts collide. Two source projects with a "Category" field that has different options need either a merged option list or separate fields on the target.

### SLA Design

Rebuild SLAs from scratch on the target. SLA definitions do not migrate between Jira instances. SLA history does not migrate either - this is a fresh start.

For each SLA:
- Define the calendar (business hours, holidays, timezone)
- Define goals per priority (P1: 1 hour response, P2: 4 hours, etc.)
- Define start condition (typically: issue created with matching request type)
- Define pause conditions (waiting for customer, waiting for vendor)
- Define stop condition (resolution set, or status moves to Done category)

The pause conditions are where SLAs break. If the source workflow has "Waiting on Customer" and the target renames it to "Pending Customer," the SLA condition must reference the new status. Miss one, and the SLA clock runs during customer wait time.

### Permission Design

Map source permission schemes to the target. Key decisions:

- How many distinct permission schemes? (One per project, or shared schemes?)
- Which roles exist? (Administrators, Agents, Customers, Collaborators)
- Group strategy: are source groups migrated as-is, consolidated, or rebuilt?
- Agent licensing: who is an agent on the target? Cloud charges per agent. Moving from DC (where you may have over-provisioned agents because licensing was per-server) to Cloud (where every agent costs money) often triggers a licensing cleanup.
- Customer accounts: every customer in the source system needs to exist in the target. Orphaned customers lose access to their request history.


## Data Migration

### The Migration Pipeline

Every migration follows the same pipeline regardless of source platform:

```
Extract  -->  Normalize  -->  Transform  -->  Validate  -->  Import  -->  Verify
```

**Extract.** Pull data from the source. For Jira, use the REST API or JCMA. For Ivanti, use the Ivanti API or database export. For ServiceNow, use the Table API or export sets. Always extract to a portable format (JSON or CSV) so you can inspect and transform offline.

**Normalize.** Clean the raw data. Trim whitespace. Standardize date formats. Resolve user accounts to target account IDs. Deduplicate records. Remove test data and garbage.

**Transform.** Apply the field mapping table. Map source statuses to target statuses. Convert field values (e.g., source "High" becomes target "P2"). Handle multi-select formatting differences. Restructure nested data.

**Validate.** Before importing, run validation checks offline. Run `tools/transform/field-mapper.js`, `tools/transform/status-mapper.js`, and `tools/transform/user-mapper.js` to validate every mapping. Do all status values map to valid target statuses? Do all user references resolve to valid accounts? Do all Assets references point to objects that exist? Are all required fields populated? Catch errors here, not after import.

**Import.** Push data to the target. For Jira, use JCMA, the REST API, or CSV import. For Assets, use the Assets REST API.

**Verify.** After import, compare source and target. Run `tools/validate/count-compare.js` for record counts, `tools/validate/field-spot-check.js` for field values on a sample, `tools/validate/link-integrity.js` for issue links, and `tools/validate/assets-verify.js` for Assets objects. Verify attachments exist and are readable.

### JCMA (Jira Cloud Migration Assistant)

JCMA handles the bulk of a DC-to-Cloud Jira migration. It migrates projects, issues, attachments, users, groups, and some configurations.

**What JCMA does well:**
- Issue data (fields, comments, history, attachments)
- Users and groups
- Project configurations (basic)
- Issue links

**What JCMA does poorly or not at all:**
- Custom field contexts get flattened or lost
- ScriptRunner scripts and configurations do not migrate via JCMA (must be manually ported to ScriptRunner Cloud or replaced)
- Automation rules do not migrate
- SLA definitions do not migrate
- Dashboard and filter ownership may break
- Marketplace app data may or may not migrate (depends on the app)
- Assets/Insight schemas do not migrate via JCMA

**Silent failures.** JCMA will sometimes remap a status, rename a field context, or drop a field value without error. The migration log says "success" but the data is wrong. This is why post-migration verification is not optional.

**Entity ID changes.** Project IDs, status IDs, and custom field IDs all change between source and target. Any automation, filter, dashboard, or script that references IDs (not names) will break. Audit every ID reference before cutover.

### CMJ (Configuration Manager for Jira)

CMJ from Appfire is an alternative to JCMA for DC-to-DC and DC-to-Cloud migrations. Where JCMA is a one-shot bulk migration tool, CMJ gives you granular control over what gets migrated and in what order.

**When to use CMJ instead of JCMA:**
- You need to migrate specific projects, not the entire instance
- You need to preserve custom field contexts that JCMA flattens
- You are migrating between DC instances (JCMA is Cloud-target only)
- You need repeatable, incremental migrations (CMJ supports delta syncs)
- You need to remap schemes, workflows, or field values during migration

**CMJ limitations:**
- Licensed per source instance, not per migration
- Requires network connectivity between source and target
- Does not migrate Assets/Insight schemas (use CMDB-Kit for that)
- Does not migrate Confluence content
- Complex configuration with a learning curve

CMJ is especially useful for phased migrations where you move projects one at a time over weeks or months, rather than a single big-bang cutover.

### ServiceNow to JSM

See [servicenow-migration.md](servicenow-migration.md) for data model mapping, extraction approach, common challenges, and quirks.

### BMC Remedy/Helix to JSM

See [bmc-remedy-migration.md](bmc-remedy-migration.md) for data model mapping, extraction approach, common challenges, and quirks.

### Cherwell to JSM

See [cherwell-migration.md](cherwell-migration.md) for data model mapping, common challenges, timeline pressure, and quirks.

### Ivanti (Neurons/ISM) to JSM

See [ivanti-migration.md](ivanti-migration.md) for data model mapping, common challenges, typical approach, and quirks.

### HP Service Manager/SMAX to JSM

HP Service Manager (now OpenText SMAX after the Micro Focus acquisition) is being abandoned by many enterprises as OpenText shifts focus. These are urgent migrations with clients who want out.

**Data model mapping:**
- HPSM Incident maps to JSM Incident issue type
- HPSM Request (Service Catalog) maps to JSM request types
- HPSM Problem maps to JSM Problem issue type
- HPSM Change maps to JSM Change issue type
- HPSM Knowledge Document maps to Confluence pages
- HPSM UCMDB maps to JSM Assets

**Common challenges:**
- HPSM uses a proprietary scripting language (RAD - Rapid Application Development) for workflow customization. RAD scripts have no equivalent on any modern platform. Every script is a redesign.
- HPSM's data model uses database dictionary tables that define the schema dynamically. Extracting the effective schema requires reading the dictionary, not just the data.
- HPSM integrations often use Service Manager Web Services (WSDL/SOAP). These must be rebuilt against Jira's REST API.
- UCMDB (Universal CMDB) uses a topology-based model with automatic discovery and reconciliation. JSM Assets is simpler. The topology relationships need to be flattened into reference attributes.
- HPSM supports complex approval chains with delegation and substitution. JSM approvals are simpler. Complex approval workflows may need Forge apps or process simplification.
- License costs on HPSM/SMAX are often the migration driver. Document the current license spend as part of the business case.

**Extraction approach:** Use the HPSM REST API or Web Services API. For UCMDB, use the UCMDB REST API to extract topology data. Export relationships separately from CI records since the topology model does not map directly to JSM's reference-based model.

### Freshservice to JSM

Freshservice migrations are common when organizations outgrow the platform or consolidate onto Atlassian. These are typically simpler than enterprise platform migrations but have their own challenges.

**Data model mapping:**
- Freshservice Ticket (Incident) maps to JSM Incident issue type
- Freshservice Service Request maps to JSM request types
- Freshservice Problem maps to JSM Problem issue type
- Freshservice Change maps to JSM Change issue type
- Freshservice Knowledge Article maps to Confluence pages
- Freshservice Asset maps to JSM Assets
- Freshservice Project maps to Jira project (if using Freshservice PM)

**Common challenges:**
- Freshservice's API is well-documented and REST-based, making extraction straightforward. This is the easiest source platform to extract from.
- Freshservice uses a flat asset model with asset types. JSM Assets supports a richer type hierarchy with references. The migration is an opportunity to build a proper CMDB structure.
- Freshservice automations ("Workflow Automator") map fairly well to Jira automation rules. Most can be recreated 1:1.
- Freshservice's agent groups map to Jira project roles or teams.
- Freshservice custom fields have simpler types than Jira. The mapping is usually direct, but Freshservice's "Dependent Field" type needs either cascading selects or Assets references on JSM.
- Freshservice SLAs are simpler than JSM SLAs. The rebuild is straightforward but must account for JSM's status-category-based conditions.

### Zendesk to JSM

Zendesk migrations happen when organizations need proper ITSM capabilities (change management, problem management, CMDB) that Zendesk does not provide natively.

**Data model mapping:**
- Zendesk Ticket maps to JSM Incident or Service Request issue type
- Zendesk Macro maps to JSM automation rule or canned response
- Zendesk Trigger maps to JSM automation rule
- Zendesk Help Center Article maps to Confluence page
- Zendesk Organization maps to JSM customer organization
- Zendesk does not have a CMDB equivalent (clean start on Assets)

**Common challenges:**
- Zendesk tickets do not have distinct types (Incident, Problem, Change). All tickets are the same type with tags or custom fields indicating category. You must classify each ticket during transformation to assign the correct JSM issue type.
- Zendesk uses a different threading model. Ticket comments (public and internal) map to Jira comments, but the visual presentation differs. Customers used to Zendesk's email-like conversation view may find JSM's comment stream unfamiliar.
- Zendesk Macros (canned responses with field updates) have no single JSM equivalent. Split into automation rules (for field updates) and canned responses or templates (for reply text).
- Zendesk Triggers and Automations overlap with Jira automation rules, but Zendesk's condition syntax is different. Each trigger needs manual translation.
- Zendesk Organizations map to JSM customer organizations, but Zendesk's organization membership model (users belong to one org) differs from JSM's (customers can be in multiple organizations).
- No CMDB on Zendesk means this is a greenfield Assets build. Use CMDB-Kit to design and import the schema from scratch.

### ManageEngine ServiceDesk Plus to JSM

ManageEngine is popular in mid-market, especially organizations that started with the free edition and grew into the paid tiers.

**Data model mapping:**
- ManageEngine Request maps to JSM Incident or Service Request issue type
- ManageEngine Problem maps to JSM Problem issue type
- ManageEngine Change maps to JSM Change issue type
- ManageEngine Solution maps to Confluence page
- ManageEngine Asset maps to JSM Assets
- ManageEngine CMDB CI maps to JSM Assets

**Common challenges:**
- ManageEngine's API is REST-based but varies significantly between on-premise and cloud versions. Confirm which version the client runs before writing extraction scripts.
- ManageEngine uses "Technician" for agent and "Requester" for customer. User mapping must account for these role differences.
- ManageEngine's asset management and CMDB are separate modules with different data models. Assets are inventory-focused (purchase date, warranty, location). CMDB CIs are relationship-focused. Decide whether to merge both into JSM Assets or keep only one.
- ManageEngine custom fields support types that do not exist in Jira (e.g., "Pick List" with dependent fields). These need transformation to Jira equivalents.
- ManageEngine supports site-based data segregation. If the client uses multiple sites, each site's data may need routing to different JSM projects.

### TOPdesk to JSM

TOPdesk is common in European organizations, particularly in the Netherlands, Belgium, and the UK. Migrations to JSM are increasing as organizations standardize on Atlassian.

**Data model mapping:**
- TOPdesk Incident (First Line, Second Line) maps to JSM Incident
- TOPdesk Request maps to JSM Service Request
- TOPdesk Problem maps to JSM Problem issue type
- TOPdesk Change maps to JSM Change issue type
- TOPdesk Knowledge Item maps to Confluence page
- TOPdesk Asset maps to JSM Assets

**Common challenges:**
- TOPdesk distinguishes between "First Line" and "Second Line" incidents, which is a triage/escalation model, not separate types. Map both to a single JSM Incident type and use priority or custom fields to indicate escalation tier.
- TOPdesk's "Operator" (agent) and "Person" (customer) model maps to JSM's agent/customer distinction, but TOPdesk's "Person" records include more detail (department, branch, location) that may belong in Assets rather than Jira user profiles.
- TOPdesk has a built-in asset management module with a simpler model than JSM Assets. The migration is an opportunity to build a richer CMDB structure.
- TOPdesk's REST API is well-documented. Extraction is straightforward but paginated (100 records per page by default).
- TOPdesk uses Dutch and English terminology depending on the client's locale. Extraction scripts must handle localized field names.

### JSM to JSM (Instance Consolidation)

Merging multiple JSM Cloud instances into one. Common after acquisitions or when teams that set up independent instances need to consolidate.

**The hard parts:**
- Custom field collisions. Both instances have a field called "Category" with different option lists. You cannot have two fields with the same name on Cloud, so one needs to be renamed, merged, or retired.
- Workflow conflicts. Both instances have a "Support Workflow" with different statuses. Merging means one workflow wins and the other's issues need status remapping.
- User deduplication. The same person may have different accounts or group memberships on each instance.
- Customer overlap. The same customer organization may exist on both instances with different request history.

### Assets/CMDB Data Migration

Assets migrations have a unique complication: dependency ordering. You cannot import an Application record that references a "Production" Environment Type if the Environment Type records have not been imported yet.

**Import order.** The CMDB-Kit project codifies this as a LOAD_PRIORITY array (in tools/lib/constants.js) that defines the exact sequence:

1. Lookup types (statuses, categories, environment types) - no dependencies
2. Directory types (organizations, teams, people) - reference lookups
3. CI types (applications, servers, databases) - reference lookups and directory
4. Library types (versions, deployments, documents) - reference everything

Every importable type must appear in the priority list, and dependencies must come before dependents. If you are building a custom import for a client, compute the dependency graph from the schema and sort topologically, or use CMDB-Kit's adapter as a starting point.

**Two-pass import.** Separate schema sync from data sync. First pass creates object types and attributes (schema mode). Second pass imports records (data mode). This lets you validate the schema structure before loading data, and makes it easy to re-import data without recreating types.

**Circular dependencies.** Sometimes two types reference each other (Application references Server, Server references Application). Break the cycle with a two-pass data import: create all records in pass one with only non-circular references, then update the circular references in pass two.

**Reference resolution.** Assets references are resolved by Name, not by ID. If the source has an Application with status "Active" and the target's Application Status type has "In Use" instead, the reference will fail silently or error. The field mapping table must include Assets reference value mappings.

**Icon assignment.** Cloud requires an iconId when creating object types via API. Without explicit icon mapping, every type gets a default icon that may not render correctly. Use an icon-map.json (type name to icon GUID) to assign meaningful icons per type. On Data Center, the default icon assignment also produces poor results (trash can icons). Plan to set icons explicitly on both platforms.

**Reference type mapping.** By default, all object references are created as generic "Dependency" links. For a meaningful CMDB, map references to specific link types: "Runs on" for server relationships, "Owned by" for ownership, "Contains" for composition, "Member of" for group membership. A ref-type-map.json (attribute name to reference type name) makes this configurable per schema.

**Schema template pitfalls.** Cloud offers pre-built schema templates (ITAM, People, Facilities). These create populated schemas with types and attributes you may not want. If you are importing a custom schema from CMDB-Kit or another source, choose "Empty schema" to avoid type name collisions and unwanted default data.

**Standalone CMDB sources.** Some clients have a dedicated CMDB tool separate from their ITSM platform:

- Device42 - Data center infrastructure management with auto-discovery. Rich API for extraction. The data model is infrastructure-focused (racks, power, network) and maps well to JSM Assets CI types, but lacks ITIL service management concepts.
- Lansweeper - Network scanning and asset discovery. Export via API or SQL queries against the Lansweeper database. Good for populating hardware and software inventory types in Assets.
- iTop - Open-source ITIL CMDB. Uses a class-based model similar to ServiceNow's. REST API extraction. The ITIL alignment means the data model maps more naturally to CMDB-Kit schemas than most alternatives.
- Snipe-IT - IT asset management focused on hardware lifecycle (purchase, assignment, depreciation, disposal). Maps to the Asset Management and Financial branches of an enterprise CMDB schema.
- NetBox - Network infrastructure source of truth (IP addresses, racks, circuits, devices). Maps to Network Segment, Server, and Facility types in Assets. REST API with good documentation.

For standalone CMDB migrations, the ITSM platform migration and the CMDB migration are independent workstreams. The CMDB migration uses CMDB-Kit's adapter pattern: extract to JSON, map to the target schema, import via the Assets API.


### Confluence and Knowledge Base Migration

Most ITSM migrations include knowledge base content. The source determines the approach.

**Jira DC to Cloud.** JCMA migrates Confluence spaces alongside Jira projects. Page content, attachments, and macros migrate, but some macros have no Cloud equivalent. ScriptRunner for Confluence macros, custom user macros, and macros from unlicensed Marketplace apps will render as "unsupported macro" placeholders. Audit macros before migration and plan replacements.

**Ivanti to JSM.** Ivanti Knowledge Articles extract as HTML. Convert to Confluence pages using the Confluence REST API or a bulk import tool. Preserve the category structure by mapping Ivanti KB categories to Confluence space labels or parent pages. Attachments and inline images need separate extraction and upload.

**ServiceNow to JSM.** ServiceNow Knowledge Base articles (kb_knowledge table) extract as HTML with attachment references. Convert to Confluence pages. Map ServiceNow knowledge categories to Confluence labels. Workflow states (Draft, Review, Published, Retired) do not carry over - all imported pages are published.

**BMC Remedy to JSM.** Remedy Knowledge articles are stored in the KBA:Knowledge form. Extract via API and convert HTML content to Confluence pages. Remedy's knowledge workflow (Draft, Publish, Retire, Archive) does not carry over.

**Cherwell to JSM.** Cherwell Knowledge Articles extract via the Business Object API. Convert to Confluence pages. Cherwell's knowledge categorization and approval workflow must be rebuilt.

**Zendesk to JSM.** Zendesk Help Center articles export via the Help Center API. Content is HTML. Section and category hierarchy maps to Confluence space structure or parent pages. Article translations (if using Zendesk multilingual) need separate handling.

**Freshservice to JSM.** Freshservice Solutions export via API as HTML. Folder structure maps to Confluence page hierarchy. Solution categories map to Confluence labels.

For all sources, test the customer-facing knowledge base on the JSM portal after import. Verify search returns relevant results, articles render correctly, and embedded images display.


## Configuration Build

While data migration runs in test cycles, build the target configuration.

### Workflows

Build every target workflow in the Cloud workflow editor. Test each one by manually creating a test work item and walking it through every transition. Verify conditions fire (right roles can transition), validators check (required fields are enforced), and automation rules trigger on status changes.

### Automation Rules

Build Cloud automation rules or migrate to ScriptRunner Cloud to replace DC post-functions and scripts. Many ScriptRunner scripts work on Cloud ScriptRunner with minimal changes. For scripts that don't port directly, common replacements:

- ScriptRunner "set field value on transition" — often works on ScriptRunner Cloud; alternatively becomes an Automation rule with "When: status changes to X" trigger and "Then: edit fields" action
- ScriptRunner "create linked issue" — works on ScriptRunner Cloud or becomes Automation "Then: create issue"
- ScriptRunner "send custom notification" — works on ScriptRunner Cloud or becomes Automation "Then: send email"
- ScriptRunner "update Assets object" — may need Automation "Then: edit Assets object" (limited support, may need REST API action)

**DC-only ScriptRunner features (not available on Cloud):**
- ScriptRunner Behaviours (dynamic form field visibility) — use Cloud Forms conditional logic or Forge apps
- ScriptRunner custom REST endpoints — rewrite against Jira REST API or Forge apps
- ScriptRunner Escalation Services
- Some HAPI features
- Full server-side Groovy with unrestricted JVM access

For these, evaluate: ScriptRunner Cloud alternatives, Forge app, third-party Marketplace app, manual process change, or accept the gap.

### Custom Fields

Create target custom fields. Set contexts and option lists per the field mapping table. Assign fields to screens. For Assets object fields, configure the AQL filter scope and ensure the Assets schema is imported before testing.

**The cascade field trap.** If field B depends on field A (cascading select or AQL-filtered Assets field), create A first. Test the cascade by selecting values in A and verifying B's options update. The ${FieldName} placeholder in AQL must exactly match the custom field name, including case.

### SLAs

Build SLA definitions. Test with a sample request: create a request, verify the SLA clock starts, transition to a pause status, verify the clock pauses, resolve, verify the clock stops and the elapsed time is correct.

### Portals and Request Types

Build the customer portal. Create request type groups, assign request types, configure which fields appear on each request form. Set portal branding (logo, colors, announcement). Test from a customer account: submit a request, verify it creates a work item with the correct fields populated.


## Test Cycles

### The Three-Pass Approach

**Pass 1: Smoke test.** Migrate a single project or a small subset. Verify the pipeline works end to end. Check that issues appear, fields are populated, statuses are correct, and attachments are present. Fix pipeline bugs.

**Pass 2: Full test migration.** Migrate everything to a staging environment. Run the validation scripts and the complete test plan:

- `tools/validate/count-compare.js` -- record counts match source (per project, per issue type)
- `tools/validate/field-spot-check.js --sample 50` -- sample 50 random issues and verify every field value
- `tools/validate/link-integrity.js` -- issue links survived
- `tools/validate/assets-verify.js` -- Assets objects exist with correct references
- Verify all workflow transitions work (manual)
- Verify SLAs calculate correctly (manual)
- Verify automation rules fire (manual)
- Verify customer portal works (submit request, check queue, resolve)
- Verify dashboards and filters return results
- Verify email notifications send

**Pass 3: UAT.** Business stakeholders test their own workflows. Service desk leads verify their queues and SLAs. Customers verify portal access and request history. CMDB owners verify Assets data. Document every defect, fix, and retest.

### Common Failures Found in Testing

- Status mismatch: imported issues in a status that does not exist in the target workflow. The issue is stuck and cannot be transitioned.
- SLA clock running during pause status because the SLA condition references the old status name.
- Automation rule not firing because the trigger condition uses a status ID from the source instead of the target.
- Assets custom field showing empty dropdown because the AQL filter references a type name that was renamed during migration.
- Customer seeing "no requests" on the portal because the customer account was not linked to the migrated issues.
- Cascading select showing all options instead of filtered options because the parent field name in the AQL placeholder does not match exactly.


## Cutover

### Pre-Cutover Checklist

- All test passes completed, all defects resolved
- Cutover runbook reviewed and approved
- Communication sent to agents and customers (dates, what changes, new URLs)
- Source system freeze scheduled (no new issues during migration window)
- Rollback criteria defined (what constitutes a failed migration)
- Support plan for first week post-cutover

### Cutover Execution

1. Freeze the source system (read-only or announce freeze)
2. Run the final delta extraction with `tools/extract/delta-extract.js --since <last-test-migration-timestamp>` (new issues since last test migration)
3. Transform and validate the delta
4. Import the delta to the production target
5. Run verification checks (counts, sample spot-checks)
6. Switch DNS/URLs if applicable
7. Switch email channels (inbound email addresses point to new instance)
8. Update portal links in documentation and bookmarks
9. Enable the target for live traffic
10. Monitor queues, SLAs, and automation for the first hours

### Rollback Strategy

Define the rollback plan before cutover. The honest answer is that most Jira migrations cannot be cleanly rolled back.

**JCMA migrations** create data on the target that cannot be bulk-deleted. There is no "undo migration" button. Rollback means: revert DNS/email routing to the source system, communicate to users that the migration is postponed, and delete the migrated projects on the target (which requires Atlassian Support for Cloud). Any issues created on the target during the cutover window are lost unless manually re-created on the source.

**CMJ migrations** are more reversible because you control what gets migrated. You can delete migrated projects and re-run, but this still requires manual cleanup of shared configurations (custom fields, statuses) that were created on the target.

**Assets/CMDB migrations** are the most reversible. Delete the schema on the target and re-import. CMDB-Kit's idempotent import approach (skip existing records, only fill gaps) makes re-runs safe.

**Practical rollback criteria:**
- More than 5% of issues have incorrect field values after import
- Any contractually binding SLA is miscalculating
- Customer portal is inaccessible or broken
- A critical automation (on-call routing, escalation) is not firing
- Data loss detected (missing issues, missing attachments)

If rollback triggers, communicate immediately, revert routing, and schedule a post-mortem to fix the root cause before the next attempt.

### Post-Cutover

First 24 hours: watch for automation rule failures, SLA miscalculations, customer access issues, and missing data. Have the migration team on standby.

First week: collect feedback from agents and customers. Fix issues as they surface. Run a full data integrity check comparing source and target.

First month: decommission the source system (or set to read-only archive). Transfer ownership of the target configuration to the internal admin team. Deliver the as-built documentation.


## The Consultant's Toolkit

Every migration uses the same set of scripts, templates, and deliverables. The table below maps each tool to where it lives in the repo and when you use it during the engagement.

### Scripts by Migration Phase

#### Discovery (day one)

Run these immediately to scope the work. Their output feeds every decision that follows.

| Script | Path | What it does | Output |
|---|---|---|---|
| Field inventory | `tools/extract/field-inventory.js` | Pulls all custom fields from source and target, cross-references by name and type. Flags duplicates, orphans, and type mismatches. | `output/extract/fields-source.json`, `fields-target.json`, `fields-crossref.json` |
| Scheme inventory | `tools/extract/scheme-inventory.js` | Pulls permission, notification, issue type, screen, field config, and workflow schemes. Flags defaults (CMJ cannot export), unused, and duplicates. | `output/extract/schemes-source.json`, `schemes-target.json` |
| User inventory | `tools/extract/user-inventory.js` | Pulls all users and groups from both sides. Cross-references by email. Flags conflicts, service accounts, and inactive users. | `output/extract/users-source.json`, `users-target.json`, `users-crossref.json` |
| Issue counts | `tools/extract/issue-counts.js` | Counts issues per project, per type, per status. Baseline for post-migration validation. | `output/extract/issue-counts-source.json` |
| Workflow inventory | `tools/extract/workflow-inventory.js` | Pulls all workflows with full transition detail. Flags ScriptRunner post-functions by class name. | `output/extract/workflows-source.json` |
| ScriptRunner audit | `tools/extract/scriptrunner-audit.js` | Inventories all ScriptRunner config (script fields, listeners, behaviours, escalation services, custom endpoints, scheduled jobs). Auto-categorizes each for Cloud compatibility. | `output/extract/scriptrunner-audit.json` |

The field inventory and issue counts run first. The workflow and ScriptRunner inventories run next because they depend on knowing which fields and projects matter. The scheme inventory can run in parallel with anything.

#### Target Design

No scripts. This is a design phase. You use the extraction output to make decisions and fill in the mapping templates.

| Template | Path | What you do with it |
|---|---|---|
| Field mapping CSV | `templates/field-mapping.csv` | One row per source field. Columns: source name, source ID, source type, target name, target ID, target type, action (map/skip/create/rename), notes. Fill this using the field inventory cross-reference. |
| Status mapping CSV | `templates/status-mapping.csv` | One row per source status. Columns: source status, source category, target status, target category, notes. Fill this using the workflow inventory. |
| User mapping CSV | `templates/user-mapping.csv` | One row per source user. Columns: source username, source email, display name, target account ID, target email, action, notes. Fill this using the user inventory cross-reference. |

These CSVs are the master reference for the rest of the engagement. Keep them in the repo under `output/mappings/` or in a shared spreadsheet.

#### Data Migration (transform phase)

After the mapping templates are filled, these scripts validate the mappings and produce ID translation tables for the import tools.

| Script | Path | What it does | Output |
|---|---|---|---|
| Field mapper | `tools/transform/field-mapper.js` | Reads the field mapping CSV and field inventories. Validates every source field with data has a mapping. Checks type compatibility. Produces field ID translation table. | `output/transform/field-id-map.json` |
| Status mapper | `tools/transform/status-mapper.js` | Reads the status mapping CSV, workflow inventory, and issue counts. Validates every source status with issues has a valid target status. Warns on category misalignment. | `output/transform/status-map.json` |
| User mapper | `tools/transform/user-mapper.js` | Reads the user mapping CSV and user inventories. Produces username-to-account-ID translation table. Flags unresolved accounts. | `output/transform/user-map.json` |

Run these before every test migration pass. If a mapping is missing or invalid, the script fails with a clear error. Fix the CSV and re-run.

#### Test Cycles (validation phase)

After each test import, run these to verify data integrity.

| Script | Path | What it does | Output |
|---|---|---|---|
| Count compare | `tools/validate/count-compare.js` | Compares source issue counts against live target. Flags mismatches per project, per type, per status. | `output/validate/count-compare.json` |
| Field spot-check | `tools/validate/field-spot-check.js` | Samples N random issues from source, fetches same on target, compares every mapped field value. | `output/validate/spot-check.json` |
| Link integrity | `tools/validate/link-integrity.js` | Verifies all issue links survived migration. Flags orphaned or missing links. | `output/validate/link-integrity.json` |
| Assets verify | `tools/validate/assets-verify.js` | Compares Assets object counts per type, samples objects and compares attributes, checks reference integrity. | `output/validate/assets-verify.json` |

Run count-compare first (fast, catches bulk problems). Run field-spot-check next (slower, catches field-level problems). Run link-integrity and assets-verify if those data types are in scope.

#### Cutover

| Script | Path | What it does | Output |
|---|---|---|---|
| Delta extract | `tools/extract/delta-extract.js` | Pulls issues created or modified since a given timestamp. Used for the final cutover delta after source freeze. | `output/extract/delta-YYYY-MM-DDTHH-MM.json` |

After source freeze, run delta-extract to capture anything created since the last test migration. Transform and import the delta. Then run the validation scripts one final time against production.

### Shared Foundation

All scripts use a shared API client and config file.

| Component | Path | Purpose |
|---|---|---|
| API client | `tools/lib/client.js` | Thin wrapper handling DC auth (basic), Cloud auth (email + API token), pagination (offset for DC, cursor for Cloud), and rate limiting (backoff on 429). Every script imports this. |
| Config file | `.migrationrc.json` (gitignored) | Connection details for source and target instances. Base URLs, auth credentials, Assets workspace ID, output directory. |

### External Tools

These are not scripts in this repo. They handle the actual import.

- **JCMA** for bulk DC-to-Cloud Jira migration (issues, users, groups, basic config)
- **CMJ** (Appfire) for granular DC-to-DC and DC-to-Cloud migration (schemes, workflows, incremental)
- **CMDB-Kit** for Assets/CMDB schema design, dependency sorting (LOAD_PRIORITY), and idempotent import via JSM adapter
- **Source platform APIs** (ServiceNow Table API, BMC REST API, Cherwell Business Object API, Freshservice API, Zendesk API) for non-Jira source extraction
- **pull-docs.js** (`tools/pull-docs.js`) for pulling vendor documentation to markdown for offline reference

### Documents You Will Deliver on Every Engagement

| Document | When | Source |
|---|---|---|
| Migration assessment | End of Part 1 | Discovery script output, stakeholder interviews |
| Field mapping table | Part 2, updated throughout | `templates/field-mapping.csv` + field inventory |
| Status mapping table | Part 2, updated throughout | `templates/status-mapping.csv` + workflow inventory |
| User mapping table | Part 2, updated throughout | `templates/user-mapping.csv` + user inventory |
| ScriptRunner compatibility report | Part 2 | `output/extract/scriptrunner-audit.json` |
| Workflow design document | Part 2 | Target workflows with transition diagrams |
| Test plan and test results | Part 5 | Validation script output |
| Cutover runbook | Before Part 6 | Step-by-step with timing estimates from test cycles |
| As-built configuration document | After Part 6 | Final target state |
| Known issues and workarounds | After Part 6 | Accumulated during test cycles |
| Post-migration admin guide | After Part 6 | Ongoing operations for the client team |

### File Layout

```
tools/
  lib/
    client.js              Shared API client (auth, pagination, rate limiting)
  extract/
    field-inventory.js     Part 1: custom fields from source and target
    scheme-inventory.js    Part 1: all scheme types from source and target
    user-inventory.js      Part 1: users and groups from source and target
    issue-counts.js        Part 1: issue counts per project/type/status
    workflow-inventory.js  Part 1: workflows with transition detail
    scriptrunner-audit.js  Part 1: ScriptRunner config and Cloud compatibility
    delta-extract.js       Part 6: issues changed since timestamp
  transform/
    field-mapper.js        Part 3: validate field mapping, produce ID translation
    status-mapper.js       Part 3: validate status mapping
    user-mapper.js         Part 3: validate user mapping, produce account ID map
  validate/
    count-compare.js       Part 5: compare issue counts source vs target
    field-spot-check.js    Part 5: sample issues, compare field values
    link-integrity.js      Part 5: verify issue links survived
    assets-verify.js       Part 5: verify Assets objects and references
templates/
  field-mapping.csv        Blank template, filled during Part 2
  status-mapping.csv       Blank template, filled during Part 2
  user-mapping.csv         Blank template, filled during Part 2
output/                    All script output (gitignored)
  extract/                 Raw extraction JSON
  transform/               Mapping and translation JSON
  validate/                Verification reports
  mappings/                Filled-in mapping CSVs (working copies)
```


## Platform Quirks Reference

The knowledge that separates a consultant who has done this from one who has read about it.

### Jira Cloud Quirks

See [quirks/jira-cloud-gotchas.md](quirks/jira-cloud-gotchas.md) for Cloud quirks and DC-to-Cloud gaps.

### Assets/CMDB Quirks

- Cloud requires iconId when creating object types via API. Omitting it returns "Icon needs to be set." The assigned icon may not render in the type tree (JSDCLOUD-11064), but omitting it fails the request entirely.
- Cloud Assets is now a platform-level app, accessible from any Jira app, not just JSM. This changes how schema permissions work.
- AQL attribute names use the display name (Title Case), not the internal name. "Site Status" works, "siteStatus" does not.
- Reference resolution is by Name, case-sensitive. "Active" and "active" are different values.
- The Services schema is read-only and auto-populated from JSM Services. You cannot import into it or modify it.
- Schema templates (ITAM, People, Facilities) create pre-populated schemas. If you need a clean schema for CMDB-Kit, choose "Empty schema."
- Data Manager is Cloud-only, Premium/Enterprise. It has 5 object classes (Compute, Software, People, Network, Peripherals) with 15 to 79 attributes each. It replaces DC's Assets Discovery and built-in importers.

### BMC Remedy/Helix Quirks

See [bmc-remedy-migration.md](bmc-remedy-migration.md#quirks).

### Cherwell Quirks

See [cherwell-migration.md](cherwell-migration.md#quirks).

### Ivanti Quirks

See [ivanti-migration.md](ivanti-migration.md#quirks).

### ServiceNow Quirks

See [servicenow-migration.md](servicenow-migration.md#quirks).

### HPSM/SMAX Quirks

- HPSM uses a "Mandanten" (tenant) model for multi-tenancy. Each tenant's data may need extraction and import as a separate workstream.
- HPSM RAD applications are compiled and often undocumented. Reverse- engineering RAD logic requires access to the RAD debugger and someone who knows the RAD language.
- HPSM's database schema uses dbdict (database dictionary) tables that define the runtime schema. The effective field list for any form requires reading dbdict, not just querying the data tables.
- UCMDB relationships use a "provider-consumer" model that is more specific than JSM's reference types. Map UCMDB relationship types to JSM reference types (Runs on, Owned by, Contains, etc.).

### Freshservice Quirks

- Freshservice ticket IDs are sequential integers. They will not match Jira issue keys. Maintain a mapping table and consider adding the original Freshservice ID as a custom field on imported issues.
- Freshservice "Canned Responses" do not have a direct JSM equivalent. Convert them to Jira automation rule templates or document them as standard operating procedures.
- Freshservice's asset discovery agent feeds directly into the asset module. After migration, reconfigure discovery to feed into JSM Assets via Data Manager (Cloud) or import scripts (DC).

### Zendesk Quirks

- Zendesk ticket fields use a "ticket_field_" prefix in the API. Extraction scripts must strip this prefix for readability.
- Zendesk "Views" (saved filters with sorting) map to Jira queues and filters, but Zendesk's view conditions use different field names and operators.
- Zendesk "Satisfaction Ratings" (CSAT) can be exported but JSM uses a different CSAT mechanism. Historical CSAT data can be stored as custom field values but will not integrate with JSM's native CSAT reporting.
- Zendesk "Side Conversations" (child tickets within a ticket) map to Jira subtasks or linked issues, but the threading model is different.

### DC to Cloud Gaps

See [quirks/jira-cloud-gotchas.md](quirks/jira-cloud-gotchas.md#dc-to-cloud-gaps).
