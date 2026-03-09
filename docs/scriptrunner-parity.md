# ScriptRunner DC vs Cloud Feature Parity

ScriptRunner is available on both DC and Cloud, but with partial parity. This reference covers what works, what doesn't, and replacement paths.


## Feature Availability

| Feature | DC | Cloud | Replacement Path |
|---|---|---|---|
| Script Console | Yes | Yes | Direct use. Different execution environment but same concept. |
| Script Fields | Yes | Yes (partial) | Simple property access scripts work. Scripts using JVM libraries, database queries, or HAPI need rewriting. |
| Script Listeners | Yes | Yes (partial) | Event-based scripts work. Some events differ between DC and Cloud. Test each listener individually. |
| Workflow Post-Functions | Yes | Yes (partial) | Many post-functions work on Cloud. Complex ones using HAPI or JVM-specific code need rewriting. |
| Workflow Conditions | Yes | Yes (partial) | Same partial parity as post-functions. |
| Workflow Validators | Yes | Yes (partial) | Same partial parity as post-functions. |
| Behaviours | Yes | **No** | Replace with Cloud Forms conditional logic. Cloud Forms can show/hide fields and set required status, but cannot dynamically change option lists or run arbitrary logic on field change. |
| Custom REST Endpoints | Yes | **No** | Rewrite as Forge apps or use the standard Jira REST API. External integrations calling ScriptRunner endpoints must be redesigned. |
| Escalation Services | Yes | **No** | Replace with Jira Automation scheduled rules (JQL + time trigger + actions). Automation covers most escalation patterns but lacks arbitrary script execution. |
| HAPI (Helper API) | Yes | **No** | HAPI methods (like `issue.update()` shorthand) are DC-only. Rewrite using the standard ScriptRunner Cloud API or REST calls. |
| Script Fragments | Yes | Yes (partial) | Web panels and web items work on Cloud. Custom web sections do not. |
| Built-in Scripts | Yes | Yes (partial) | Many built-in scripts (bulk change, copy project) are available on Cloud. Check the ScriptRunner Cloud documentation for current availability. |
| Script JQL Functions | Yes | Yes (partial) | Some JQL functions are available on Cloud. Complex functions using HAPI are not. |
| Job Scheduling (cron) | Yes | **No** | Replace with Jira Automation scheduled rules. |


## Decision Tree for Evaluating a ScriptRunner Inventory

For each ScriptRunner item in the source instance:

**Is it a Behaviour?**
- Yes → Redesign using Cloud Forms conditional logic. Document what the Behaviour does (field visibility, required status, dynamic options) and determine which parts Cloud Forms can replicate. File a gap for anything Cloud Forms cannot handle.

**Is it a custom REST endpoint?**
- Yes → Identify all callers (integrations, scripts, other apps). Rewrite as a Forge app with custom API endpoints, or redesign the integration to use standard Jira REST API.

**Is it an Escalation Service or scheduled job?**
- Yes → Convert to a Jira Automation rule: JQL condition + scheduled trigger + automation actions. If the script does something automation cannot (external API calls, complex logic), wrap it in a Forge scheduled trigger.

**Does the script use HAPI methods?**
- Yes → Rewrite using ScriptRunner Cloud's API (which does not include HAPI). Simple HAPI calls like `issue.update()` have straightforward Cloud equivalents. Complex HAPI chains need decomposition.

**Does the script use JVM libraries or database queries?**
- Yes → Full rewrite required. Determine what the script accomplishes, then implement using Forge app, automation rules, or a combination.

**None of the above?**
- Test on Cloud. Many standard ScriptRunner scripts work on Cloud with minor adjustments (import paths, API method names). Run in a Cloud sandbox and fix errors as they appear.


## Effort Estimation

| Category | Typical Effort per Item | Notes |
|---|---|---|
| Script that works on Cloud as-is | Minimal (test and verify) | ~30% of scripts in a typical DC instance |
| Script needing minor Cloud adjustments | Low (hours) | Import path changes, API method renames |
| Behaviour → Cloud Forms | Medium (hours to days) | Depends on complexity of the form logic |
| Escalation → Automation rule | Medium (hours) | Straightforward for simple JQL + action patterns |
| Custom REST endpoint → Forge app | High (days) | Requires Forge development, testing, deployment |
| Complex HAPI script → rewrite | High (days) | Full redesign of the logic |
| JVM library dependency → Forge | High (days to weeks) | May require significant architectural changes |


## Common ScriptRunner Class Names in Workflows

When auditing workflows, these class name patterns indicate ScriptRunner involvement:

- `com.onresolve.scriptrunner` — ScriptRunner (Adaptavist)
- `com.adaptavist.sr` — ScriptRunner (newer package naming)
- `canned-script` — ScriptRunner built-in script
- `com.onresolve.scriptrunner.canned` — ScriptRunner canned script

Any workflow transition with a post-function, condition, or validator containing these patterns needs ScriptRunner parity evaluation.
