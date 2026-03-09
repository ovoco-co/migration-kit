# Ivanti (Neurons/ISM) to JSM Migration Guide

Ivanti migrations are rebuilds, not lifts. The data model, workflow engine, and field architecture are fundamentally different. Note: Cherwell migrations are covered separately in [cherwell-migration.md](cherwell-migration.md) since Cherwell has a distinct architecture despite now being under the Ivanti umbrella.


## Data Model Mapping

- Ivanti Incident maps to JSM Incident issue type
- Ivanti Service Request maps to JSM request types
- Ivanti Problem maps to JSM Problem issue type
- Ivanti Change maps to JSM Change issue type
- Ivanti Knowledge Article maps to Confluence pages
- Ivanti CMDB maps to JSM Assets (major schema redesign required)


## Common Challenges

- Ivanti's workflow engine supports conditions and actions that have no Jira equivalent. Every workflow is a redesign.
- Ivanti custom fields use different type names and storage formats. Date fields, multi-value fields, and relationship fields all need transformation logic.
- Ivanti attachments are stored differently and may need format conversion.
- User accounts in Ivanti may use a different identity format than Atlassian accounts.


## Typical Approach

Extract Ivanti data to CSV/JSON. Build the target JSM environment from scratch (projects, issue types, request types, workflows, fields, SLAs, automation). Transform the extracted data to match the target field schema. Import via REST API or CSV import. This is weeks of work, not days.


## Quirks

- Ivanti stores attachments differently than Jira. Binary attachment extraction may require database-level access rather than API.
- Ivanti's "Urgency/Impact to Priority" matrix is built into the platform. Jira has no native equivalent; you rebuild it with automation rules.
- Ivanti workflow states do not have categories. You must assign categories during the status mapping.
- Ivanti custom field IDs are GUIDs, not incrementing integers. Your mapping table needs to handle both formats.
