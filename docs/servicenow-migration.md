# ServiceNow to JSM Migration Guide

ServiceNow migrations are full rebuilds. The platforms share ITIL vocabulary but have fundamentally different architectures.


## Data Model Mapping

- ServiceNow Incident table maps to JSM Incident work type
- ServiceNow Request/RITM maps to JSM request types
- ServiceNow Problem maps to JSM Problem work type
- ServiceNow Change Request maps to JSM Change work type
- ServiceNow Knowledge Base maps to Confluence pages
- ServiceNow CMDB maps to JSM Assets (significant schema redesign)
- ServiceNow ITSM workflows map to JSM workflows with automation rules


## Extraction Approach

Use the ServiceNow Table API or export sets to pull data as JSON or CSV. Key tables: incident, sc_request, sc_req_item, problem, change_request, kb_knowledge, cmdb_ci (and subtables). Export sys_choice for field option lists and sys_user for user accounts.


## Common Challenges

- ServiceNow's CMDB is class-based with inheritance. JSM Assets uses a flat type hierarchy with references. Every CMDB class needs to be mapped to an Assets object type, and inherited attributes need to be explicitly defined on each type.
- ServiceNow workflows use conditions, activities, and approvals that have no direct Jira equivalent. Approval workflows need particular attention since JSM's approval mechanism works differently.
- ServiceNow assignment groups map to Jira project roles or teams, but the permission model is different. ServiceNow ACLs are more granular than Jira permission schemes.
- ServiceNow update sets and scoped applications have no Jira equivalent. Custom application logic must be rebuilt as Forge apps or automation rules.
- ServiceNow UI policies and client scripts (dynamic form behavior) have no direct Cloud equivalent. Some can be replicated with Cloud Forms conditional logic; others need Forge apps or process changes.
- ServiceNow business rules (server-side triggers) map to Automation rules, but complex rules with GlideRecord queries need redesign.


## Typical Approach

Extract data and configuration from ServiceNow. Design the target JSM environment from scratch using the ServiceNow configuration as requirements, not as a template. Build target workflows, fields, SLAs, and automation. Transform exported data to match the target schema. Import via REST API. This is the most labor-intensive migration type — plan for weeks of design and build before any data moves.


## Quirks

- ServiceNow uses "dot-walking" for related record fields (e.g., caller_id.department). These flattened references must be resolved to actual JSM Assets references or custom field values.
- ServiceNow update sets contain customizations but not data. Export customizations separately from data, and use them as requirements documentation for the JSM target design.
- ServiceNow scoped applications create isolated namespaces. Custom tables in scoped apps may not be accessible via the standard Table API. Check access before planning extraction.
- ServiceNow GlideRecord queries in business rules use a proprietary syntax. There is no automated translation to Jira automation rules. Each business rule is a manual redesign.
- ServiceNow's CMDB has a "Reclassification" feature (changing a CI's class). JSM Assets does not support changing an object's type after creation. Reclassified CIs need to be deleted and recreated as the new type.
- ServiceNow CMDB identification rules (used for reconciliation) have no JSM equivalent. Define a Name-based uniqueness convention instead.
