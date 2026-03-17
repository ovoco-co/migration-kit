# ServiceNow Migration Guide

> **Tested against:** ServiceNow Zurich release (March 2026). Table API endpoints, query parameters, authentication, CMDB class hierarchy, and all table names referenced below have been verified against a live Zurich instance. Basic auth, offset-based pagination, and the `{ result: [...] }` response wrapper are unchanged from Xanadu.

This document covers both directions: migrating from ServiceNow to JSM, and migrating from Jira (DC or Cloud) to ServiceNow. Both directions are increasingly common as Atlassian Data Center reaches end-of-life and government programs evaluate platform options.


## ServiceNow Platform Overview for Jira Professionals

ServiceNow's architecture is fundamentally different from Jira. Understanding the differences before planning a migration saves weeks of wrong assumptions.

### Table hierarchy vs flat issues

Jira treats everything as an "issue" differentiated by issue type. ServiceNow uses a table hierarchy with inheritance. The Task table is the parent. Incident, Change Request, Problem, and Request Item are all child tables that inherit Task's fields and add their own. When you query the Task table, you get records from all child tables. When you query the Incident table, you only get incidents.

This inheritance model means fields defined on Task (like assignment_group, state, priority, short_description) exist on every child table automatically. In Jira, you would configure these fields individually on each issue type.

### Key table mapping

| ServiceNow Table | Technical Name | Jira Equivalent |
|-----------------|----------------|-----------------|
| Incident | incident | JSM Incident issue type |
| Change Request | change_request | JSM Change issue type |
| Problem | problem | JSM Problem issue type |
| Request | sc_request | JSM Service Request |
| Request Item | sc_req_item | JSM subtask or linked issue |
| Catalog Task | sc_task | JSM subtask |
| Knowledge Article | kb_knowledge | Confluence page |
| CI | cmdb_ci (and subclasses) | JSM Assets object |
| User | sys_user | Jira user / Atlassian account |
| Group | sys_user_group | Jira group / project role |
| Category | sys_choice | Jira custom field options |

### State models

ServiceNow uses numeric state values with display labels. A typical Incident lifecycle: New (1), In Progress (2), On Hold (3), Resolved (6), Closed (7), Canceled (8). These map to Jira status categories but the models are different. ServiceNow states are integers on the record. Jira statuses are named workflow positions with transitions.

Change Request states follow ITIL: New, Assess, Authorize, Scheduled, Implement, Review, Closed, Canceled. Each state has sub-states and mandatory fields. Jira Change workflows are simpler and typically rely on custom fields for approval tracking.

### Assignment and access control

ServiceNow uses Assignment Groups (analogous to Jira project roles or teams) and ACL rules for record-level security. ACLs can restrict access by table, field, operation (read, write, create, delete), and conditions. This is significantly more granular than Jira permission schemes.

ServiceNow roles (like itil, admin, catalog_admin) gate access to platform features. These map loosely to Jira global permissions and project roles but are managed differently.

### Scripting and automation

ServiceNow scripting is server-side JavaScript (GlideRecord API) and client-side JavaScript (GlideForm API). The scripting entry points:

- Business Rules: server-side triggers on record insert, update, delete, query. Similar to Jira Automation rules but with full JavaScript.
- Client Scripts: browser-side form behavior (onChange, onLoad, onSubmit). Similar to Jira Cloud Forms conditional logic but more powerful.
- Script Includes: reusable server-side functions. No Jira equivalent.
- UI Policies: declarative field visibility and mandatory rules. Similar to Jira field configurations but per-table and condition-based.
- Flow Designer: visual automation builder. Closest to Jira Automation rules.
- Scheduled Jobs: cron-style background tasks. Similar to Jira scheduled triggers.

Jira Cloud Automation rules have no direct ServiceNow equivalent. Flow Designer is the closest match but the execution model, conditions, and available actions are different. Every automation must be rebuilt.


## Jira to ServiceNow Migration

### When this path applies

Government programs migrating off Jira Data Center before the March 2029 EOL, where Atlassian Government Cloud does not meet compliance requirements (FedRAMP High, IL4, IL5). ServiceNow's US Government Community Cloud is FedRAMP High certified. ServiceNow's National Security Cloud supports IL5.

### Extraction from Jira

Use the existing migration-kit extraction tools to pull data from Jira:

```bash
# Extract project metadata
node tools/extract/field-inventory.js --source-only
node tools/extract/workflow-inventory.js
node tools/extract/issue-counts.js
node tools/extract/user-inventory.js --source-only
node tools/extract/scheme-inventory.js --source-only
```

For ScriptRunner-heavy instances, also run:
```bash
node tools/extract/scriptrunner-audit.js
```

The extraction output gives you a complete inventory of what exists in Jira: custom fields, workflows, statuses, users, groups, and permission schemes.

### Data transformation approach

The transformation from Jira to ServiceNow is a design exercise, not a mechanical mapping. Jira's flexible schema (custom fields, issue types, workflows per project) must be mapped to ServiceNow's structured tables.

Key decisions:

**Issue types to tables.** Standard ITSM issue types (Incident, Problem, Change, Service Request) map to their ServiceNow equivalents. Project-specific issue types (Feature, User Story, Task) map to either ServiceNow's Agile Development or Project Portfolio Management tables, or to custom tables if needed.

**Custom fields to table columns.** Each Jira custom field must be mapped to either an existing ServiceNow field, a new field on the target table, or dropped. ServiceNow tables have many OOTB fields that cover common use cases. Audit the existing ServiceNow fields before creating new ones.

**Workflows to state models.** Map each Jira status to a ServiceNow state value. Jira workflows with 15 statuses need to be simplified to fit ServiceNow's typically 6 to 8 state model. The status mapping CSV template works for this:

```
source_status,source_category,target_status,target_category,notes
Open,To Do,1 - New,New,
In Progress,In Progress,2 - In Progress,Active,
Code Review,In Progress,2 - In Progress,Active,Collapse into In Progress
Testing,In Progress,2 - In Progress,Active,Collapse into In Progress
Blocked,In Progress,3 - On Hold,Pending,
Resolved,Done,6 - Resolved,Resolved,
Closed,Done,7 - Closed,Complete,
```

**Users and groups.** Map Jira users to ServiceNow sys_user records by email. Map Jira groups and project roles to ServiceNow groups (sys_user_group) and roles. User provisioning in ServiceNow is typically handled by LDAP or SAML integration, not manual creation.

### Import into ServiceNow

ServiceNow provides several data import mechanisms:

**Import Sets** are the standard approach for bulk data loading. Create an import set table, load CSV or JSON data, define a transform map that maps source columns to target table fields, and run the transform. Import Sets handle duplicate detection, reference resolution (looking up related records by name or other identifier), and error logging.

**Table API** (REST) can create individual records programmatically. Use this for smaller datasets or for records that need complex logic during creation.

**Data Source** records automate recurring imports from external systems via JDBC, LDAP, REST, or file.

For a migration, the typical sequence:

1. Import users and groups first (they are referenced by other records)
2. Import CMDB CIs and relationships
3. Import ITSM records (incidents, changes, problems, requests) with references to users and CIs
4. Import knowledge articles
5. Import attachments

### CMDB migration specifics

ServiceNow's CMDB uses a class hierarchy aligned to the Common Service Data Model (CSDM). The top-level class is cmdb_ci. Below it are Hardware, Software, Service, and other category classes. Below those are specific types: Server, Network Gear, Database, Application, Business Service.

When migrating from JSM Assets or a CMDB designed with CMDB-Kit:

**CI types to CMDB classes.** Map each Assets object type to a ServiceNow CMDB class. Use OOTB classes where possible. ServiceNow ships with hundreds of CI classes covering servers, applications, databases, network devices, cloud resources, and more. Only create custom classes for types that have no OOTB match.

**Attributes to CI fields.** Map each Assets attribute to a ServiceNow CI field. Many common attributes (name, serial number, IP address, OS, manufacturer, model) already exist on OOTB classes. Custom attributes become custom fields on the appropriate class.

**Relationships.** JSM Assets references become ServiceNow CI relationships (cmdb_rel_ci table). The relationship types are different: ServiceNow uses OOTB relationship types like "Depends on::Used by", "Runs on::Runs", "Contains::Contained by". Map your Assets references to the appropriate ServiceNow relationship type.

**CSDM alignment.** If the target ServiceNow instance follows CSDM, map your Business Services, Technical Services, and Service Offerings according to the CSDM domain model. CSDM 5.0 defines seven domains. Focus on Foundation (CIs, locations, groups) and Service Delivery (business services, technical services, service offerings) first.

**Import order matters.** Import Foundation data first (locations, departments, companies, users, groups). Then import CI records starting from the top of the hierarchy (applications and services before components and servers). Then import relationships. Then import ITSM records that reference CIs.

### Post-migration validation

After import, validate:

- Record counts match source extraction (use issue-counts.js output as baseline)
- State mapping is correct (open Jira issues are active ServiceNow records, closed Jira issues are resolved/closed)
- Reference fields resolved correctly (assignment groups, assigned to, CI references)
- Attachments imported and accessible
- Knowledge articles rendered correctly


## ServiceNow to JSM Migration

ServiceNow to JSM migrations are full rebuilds. The platforms share ITIL vocabulary but have fundamentally different architectures.

### Data model mapping

- ServiceNow Incident table maps to JSM Incident work type
- ServiceNow Request/RITM maps to JSM request types
- ServiceNow Problem maps to JSM Problem work type
- ServiceNow Change Request maps to JSM Change work type
- ServiceNow Knowledge Base maps to Confluence pages
- ServiceNow CMDB maps to JSM Assets (significant schema redesign)
- ServiceNow ITSM workflows map to JSM workflows with automation rules

### Extraction approach

Use the ServiceNow Table API or export sets to pull data as JSON or CSV. Key tables: incident, sc_request, sc_req_item, problem, change_request, kb_knowledge, cmdb_ci (and subtables). Export sys_choice for field option lists and sys_user for user accounts.

```
GET https://instance.service-now.com/api/now/table/incident
    ?sysparm_query=sys_created_on>=2020-01-01
    &sysparm_fields=number,short_description,description,state,priority,
      assignment_group,assigned_to,caller_id,category,subcategory,
      cmdb_ci,sys_created_on,sys_updated_on,resolved_at,closed_at
    &sysparm_limit=1000
    &sysparm_offset=0
```

Authentication: Basic auth with username/password, or OAuth 2.0 token. The Table API returns JSON by default. Set the Accept header to application/json.

Pagination: Use sysparm_limit and sysparm_offset. The response includes X-Total-Count header for total record count.

For CMDB extraction, query cmdb_ci with sysparm_fields that match your target Assets schema. To get records from specific CI classes, query the class table directly (e.g., cmdb_ci_server for servers, or custom tables like u_cmdbk_product for CMDB-Kit product-delivery types). Query cmdb_rel_ci for relationships.

### Common challenges

- ServiceNow's CMDB is class-based with inheritance. JSM Assets uses a flat type hierarchy with references. Every CMDB class needs to be mapped to an Assets object type, and inherited attributes need to be explicitly defined on each type.
- ServiceNow workflows use conditions, activities, and approvals that have no direct Jira equivalent. Approval workflows need particular attention since JSM's approval mechanism works differently.
- ServiceNow assignment groups map to Jira project roles or teams, but the permission model is different. ServiceNow ACLs are more granular than Jira permission schemes.
- ServiceNow update sets and scoped applications have no Jira equivalent. Custom application logic must be rebuilt as Forge apps or automation rules.
- ServiceNow UI policies and client scripts (dynamic form behavior) have no direct Cloud equivalent. Some can be replicated with Cloud Forms conditional logic; others need Forge apps or process changes.
- ServiceNow business rules (server-side triggers) map to Automation rules, but complex rules with GlideRecord queries need redesign.

### Typical approach

Extract data and configuration from ServiceNow. Design the target JSM environment from scratch using the ServiceNow configuration as requirements, not as a template. Build target workflows, fields, SLAs, and automation. Transform exported data to match the target schema. Import via REST API. This is the most labor-intensive migration type, plan for weeks of design and build before any data moves.

### Quirks

- ServiceNow uses "dot-walking" for related record fields (e.g., caller_id.department). These flattened references must be resolved to actual JSM Assets references or custom field values.
- ServiceNow update sets contain customizations but not data. Export customizations separately from data, and use them as requirements documentation for the JSM target design.
- ServiceNow scoped applications create isolated namespaces. Custom tables in scoped apps may not be accessible via the standard Table API. Check access before planning extraction.
- ServiceNow GlideRecord queries in business rules use a proprietary syntax. There is no automated translation to Jira automation rules. Each business rule is a manual redesign.
- ServiceNow's CMDB has a "Reclassification" feature (changing a CI's class). JSM Assets does not support changing an object's type after creation. Reclassified CIs need to be deleted and recreated as the new type.
- ServiceNow CMDB identification rules (used for reconciliation) have no JSM equivalent. Define a Name-based uniqueness convention instead.
