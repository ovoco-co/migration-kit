# BMC Remedy/Helix to JSM Migration Guide

BMC Remedy is one of the oldest and most deeply customized ITSM platforms in enterprise IT. Migrations from Remedy are among the most complex engagements you will encounter.


## Data Model Mapping

- Remedy Incident (HPD:Help Desk) maps to JSM Incident issue type
- Remedy Service Request (SRM:Request) maps to JSM request types
- Remedy Problem (PBM:Problem Investigation) maps to JSM Problem issue type
- Remedy Change (CHG:Infrastructure Change) maps to JSM Change issue type
- Remedy Known Error maps to Confluence knowledge articles
- Remedy Asset/CMDB (BMC.CORE:BMC_BaseElement) maps to JSM Assets
- Remedy Work Orders maps to JSM Task issue type


## Common Challenges

- Remedy's data model is deeply normalized with hundreds of forms (tables). A single incident touches HPD:Help Desk, HPD:Associations, HPD:WorkLog, HPD:Audit, and more. You must join these into a flat Jira issue structure.
- Remedy workflows use Active Link Guides, Filters, and Escalations that have no Jira equivalent. Active Links (client-side logic) and Filters (server-side triggers) must be mapped to automation rules or Forge apps.
- Remedy supports multi-tenancy natively. If the client uses multi-tenancy, each tenant may need a separate JSM project or a tagging strategy.
- Remedy custom fields use AR System field IDs (integers like 536870913). The field mapping table needs the field ID, display name, and type for every field.
- Remedy categorization uses a three-tier model (Tier 1, Tier 2, Tier 3) that maps to cascading selects or Assets references on JSM.
- Remedy CMDB uses a class hierarchy based on the Common Data Model (CDM). Classes inherit attributes from parent classes. JSM Assets does not support inheritance, so inherited attributes must be explicitly defined on each object type.
- Attachment extraction requires AR System API calls per record. Large Remedy instances with millions of records and extensive attachment histories need batched extraction with checkpoint/resume capability.


## Extraction Approach

Use the BMC REST API (available on Helix) or the AR System API (legacy Remedy). For large datasets, database-level extraction may be faster but requires DBA access and knowledge of the Remedy schema. Export to JSON with work logs, associations, and attachments as nested objects.


## Quirks

- Remedy form names use a vendor-prefix convention (HPD:Help Desk, CHG:Infrastructure Change). Extraction scripts must handle the colon in form names.
- Remedy stores work log entries in a separate form (HPD:WorkLog) joined by Incident Number. Each work log entry becomes a Jira comment.
- Remedy's "Assigned Group" and "Assignee" model uses Support Groups and People forms. These must be mapped to Jira project roles and user accounts.
- Remedy categorization (Tier 1/2/3) supports different option trees per template. If the client uses multiple templates, each has its own category hierarchy to map.
- Remedy CMDB (Atrium) uses reconciliation rules to merge discovery data with manual entries. JSM Assets has no native reconciliation. Plan for a single source of truth per attribute.
- Helix (cloud version) has a different API from on-premise Remedy. Confirm which version before writing extraction scripts.
