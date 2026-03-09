# Custom Field Type Reference

Every Jira custom field type with DC behavior, Cloud behavior, and migration notes.


## Standard Field Types

| Field Type | DC Behavior | Cloud Behavior | Migration Notes |
|---|---|---|---|
| Text Field (single line) | 255 char limit | 255 char limit | Direct mapping. JCMA handles this. |
| Text Field (multi-line) | Unlimited plain text | Unlimited plain text | Direct mapping. |
| Text Field (read only) | Displays computed value | Not available on Cloud | Replace with a scripted field or automation-populated text field. |
| Number Field | Decimal number | Decimal number | Direct mapping. Watch for locale-specific decimal separators in imports. |
| Date Picker | Date only (YYYY-MM-DD) | Date only (YYYY-MM-DD) | Direct mapping. JCMA handles this. |
| Date Time Picker | Date + time with timezone | Date + time with timezone | Direct mapping. Timezone handling differs slightly — Cloud normalizes to UTC in API responses. |
| URL Field | Clickable hyperlink | Clickable hyperlink | Direct mapping. |
| Labels | Multi-value text tags | Multi-value text tags | Direct mapping. Labels are global, not project-scoped. |
| Select List (single choice) | Single option from list | Single option from list | JCMA maps by option name. Options must match exactly (case-sensitive). Orphaned option values on issues that no longer exist in the option list will still migrate but may cause confusion. |
| Select List (cascading) | Parent-child option hierarchy | Parent-child option hierarchy | High risk. JCMA can map these, but context-scoped cascading selects (different options per project) flatten to a single global option list on Cloud. Review every context. |
| Checkboxes | Multi-select checkboxes | Multi-select checkboxes | Direct mapping. Same caveats as Select List for option matching. |
| Radio Buttons | Single select via radio UI | Single select via radio UI | Direct mapping. |
| Multi Select | Multi-value select from list | Multi-value select from list | Direct mapping. Same caveats as Select List for option matching. |
| User Picker (single user) | Selects one user by username | Selects one user by account ID | Username-to-account-ID mapping required. JCMA handles this if user migration is done first. Inactive users may not resolve. |
| User Picker (multi user) | Multiple users by username | Multiple users by account ID | Same mapping requirement as single user picker. |
| Group Picker (single group) | Selects one group | Selects one group | Group names must match between instances. JCMA maps groups by name. |
| Group Picker (multi group) | Multiple groups | Multiple groups | Same as single group picker. |
| Project Picker | Selects a project | Selects a project | Project key or ID changes between instances. Values need remapping. |
| Version Picker (single) | Selects a project version | Selects a project version | Version names must match within the target project. |
| Version Picker (multi) | Multiple versions | Multiple versions | Same as single version picker. |


## Assets / Insight Field Types

| Field Type | DC Behavior | Cloud Behavior | Migration Notes |
|---|---|---|---|
| Assets Object (single) | Selects one Assets object by AQL | Selects one Assets object by AQL | Object must exist on target. AQL query in field config uses attribute display names (Title Case). Reference is by object Name, case-sensitive. |
| Assets Object (multi) | Multiple Assets objects | Multiple Assets objects | Same as single. Each referenced object must exist on target. |
| Assets Referenced Object | Shows objects that reference this issue | Not available on Cloud | Cloud has a single Assets object field type. Reverse references must be modeled differently. |
| Assets Read-only | Displays attribute from referenced object | Not available on Cloud | No equivalent. Use automation to copy the value to a text field, or accept the loss. |


## ScriptRunner Field Types

| Field Type | DC Behavior | Cloud Behavior | Migration Notes |
|---|---|---|---|
| Scripted Field | Computed value via Groovy script | Computed value via ScriptRunner Cloud (partial parity) | Review each script. Simple property access scripts often work. Scripts using HAPI, advanced JVM libraries, or database queries need rewriting or replacement with automation. |
| Behaviour-controlled Field | Field visibility/required/options change based on form state | Not available on Cloud | Replace with Cloud Forms conditional logic. Cloud Forms can show/hide fields and set required, but cannot dynamically change option lists. |


## Context and Configuration Notes

**Contexts (DC).** A custom field can have multiple contexts on DC, each scoping the field to specific projects with different default values and option sets. On Cloud, JCMA flattens contexts: all options merge into a single global list, and project scoping is replaced by issue type scoping. This is the single most common source of post-migration field issues.

**Default values.** DC supports per-context defaults. Cloud supports a single global default per field. After migration, verify defaults are correct for each project's use case.

**Field screens.** DC uses screen schemes to control which fields appear on Create, Edit, and View screens per issue type. Cloud uses the same model but adds Cloud Forms for portal-facing request types. Migration tools handle screen schemes, but Forms must be configured manually.

**Field descriptions.** Custom field descriptions migrate, but long descriptions may be truncated. Verify after migration.


## JCMA Handling Summary

JCMA (Jira Cloud Migration Assistant) handles most field types automatically when migrating DC to Cloud:
- Text, number, date, URL, labels: automatic
- Select/multi-select/cascading: automatic, but contexts flatten
- User/group pickers: automatic if users and groups are migrated first
- Version/project pickers: automatic if projects are migrated in the same batch
- Assets object fields: NOT handled by JCMA — requires separate Assets migration
- ScriptRunner fields: NOT handled — values migrate as static snapshots, scripts do not
- Read-only/referenced Assets fields: NOT handled — no Cloud equivalent
