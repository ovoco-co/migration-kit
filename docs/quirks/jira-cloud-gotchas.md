# Jira Cloud Gotchas

Platform quirks and DC-to-Cloud gaps that affect every migration.


## Cloud Quirks

- Entity IDs (project, status, custom field) change between instances. Never hardcode IDs in automation rules, filters, or scripts.
- JCMA silently remaps statuses when it finds a name collision. Check the migration log, but also spot-check actual issue statuses.
- Cloud custom fields cannot have the same name as a system field. "Summary" as a custom field name will collide.
- Automation rules have execution limits. A rule that fires on every issue update in a 100,000-issue migration will hit the monthly limit and silently stop. Disable non-essential automation during import.
- Cloud Forms replaced the simple field-on-portal model from older JSM. Request types now use Forms for portal display, which changes how field visibility and conditional logic work.
- Atlassian is renaming "issues" to "work items" and "projects" to "spaces." The rollout is gradual. APIs still use the old terms. Build automation and scripts using "issue" and "project" terminology since that is what the APIs expect.


## DC to Cloud Gaps

- ScriptRunner Cloud has partial parity with DC. Many scripts, listeners, and workflow functions work, but with a different execution environment. Evaluate each script individually rather than assuming a full rewrite.
- No Behaviours (DC-only ScriptRunner feature). Cloud Forms conditional logic covers some cases, but not all.
- No custom REST endpoints (DC-only ScriptRunner feature). External integrations that call ScriptRunner endpoints must be rewritten against the standard Jira REST API or a Forge app.
- No Escalation Services or full HAPI on Cloud.
- Assets Discovery works on Cloud (Premium/Enterprise), but the configuration UI and import targets differ from DC. Plan to reconfigure Discovery agents post-migration.
- No object type-level permissions in Assets. Schema-level permissions only.
- No Referenced or Read-only custom field types for Assets. Cloud has a single Assets object field type.
- DC's six built-in importers (CSV, Database, JSON, LDAP, Jira Users, Object Schema) are replaced by Data Manager adapters on Cloud, which are more powerful but work differently.
