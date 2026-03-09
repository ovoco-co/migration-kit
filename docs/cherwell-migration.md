# Cherwell to JSM Migration Guide

Cherwell was acquired by Ivanti in 2021, and Ivanti is sunsetting it. Cherwell customers are being pushed to move, making this a high-demand migration corridor.


## Data Model Mapping

- Cherwell Incident maps to JSM Incident issue type
- Cherwell Service Request maps to JSM request types
- Cherwell Problem maps to JSM Problem issue type
- Cherwell Change Request maps to JSM Change issue type
- Cherwell Knowledge Article maps to Confluence pages
- Cherwell CMDB maps to JSM Assets
- Cherwell Task maps to JSM Task issue type


## Common Challenges

- Cherwell uses a "One-Step" automation engine with visual action chains. These must be decomposed into individual Jira automation rules.
- Cherwell Forms are highly customized with tabs, grids, and embedded related items. JSM request forms are simpler. Complex Cherwell forms need to be simplified or split across multiple request types.
- Cherwell uses "Business Object" as its record type abstraction. Each Business Object has its own field set, relationships, and lifecycle. Mapping these to Jira issue types requires understanding which Business Objects are true ticket types vs reference data (which belongs in Assets).
- Cherwell's API is REST-based but uses its own query syntax. Extraction scripts need Cherwell-specific query logic.
- Cherwell supports Customer-facing portals with shopping cart style service catalogs. JSM's portal model is different, so the service catalog structure needs redesign.
- Cherwell CMDB uses a relational model with Configuration Item types. The schema maps more cleanly to JSM Assets than Remedy's CDM, but relationship types still need explicit mapping.


## Timeline Pressure

Since Ivanti is sunsetting Cherwell, these clients often have a hard deadline. Discovery and design phases get compressed. Prioritize: what data must migrate (open tickets, last 12 months of history, CMDB) vs what can be archived (closed tickets older than 2 years).


## Quirks

- Cherwell Business Object IDs are GUIDs. The extraction API uses these GUIDs, not human-readable names, for queries.
- Cherwell "One-Step" actions can chain dozens of operations. Document each step before attempting to replicate in Jira automation.
- Cherwell supports "Merged" tickets (combining duplicates). Jira does not have native ticket merging. Use issue linking with "duplicates" link type instead.
- Cherwell's Journal (activity log) is a single field with formatted entries. Splitting journal entries into individual Jira comments requires parsing the formatting.
