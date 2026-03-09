# Cloud vs Data Center Terminology Map

This reference maps terminology, features, and behavioral differences between Atlassian Cloud and Data Center (DC) for JSM, Jira, Confluence, and Assets. It is based on the current Cloud documentation (pulled March 2026) compared against JSM DC 5.x and ScriptRunner DC docs.

The Cloud terminology reflects Atlassian's ongoing renaming campaign. Some terms appear in documentation inconsistently because the rename is rolling out gradually. Where a Cloud doc still uses the old DC term in URLs or link text, the new term is used in headings and body copy.


## Renamed Concepts

These exist on both platforms but use different names.

| Cloud term | DC term | Notes |
|---|---|---|
| Work item | Issue | Cloud docs now say "work item" for the internal agent-facing record. URLs and some older pages still say "issue." The underlying Jira data model still uses issue internally. |
| Work type | Issue type | The foundational type that defines fields and workflow. Cloud renamed to "work type" to distinguish from request types. URLs still reference "issue-types." |
| Request (customer-facing) | Request / Issue | Same concept on both, but Cloud draws a sharper distinction: "request" is the customer view, "work item" is the agent view of the same record. |
| Service space | Service project | Cloud docs systematically use "space" where DC uses "project." Breadcrumbs, sidebar labels, and admin pages all say "space." File names in docs still say "project" in many URLs. |
| Space template | Project template | Cloud offers 12 space templates (IT, General, Customer, HR, Facilities, Legal, Finance, Marketing, Analytics, Sales, Design, Blank). DC has fewer built-in templates. |
| Space roles | Project roles | Same permission model, renamed to match "space" terminology. |
| Work categories | Ticket categories | Cloud renamed the grouping mechanism that sorts requests into Incidents, Changes, Problems, and Service Requests queues. |
| AQL (Assets Query Language) | IQL (Insight Query Language) / AQL | DC originally used "IQL" when the product was called Insight. DC 5.x docs now also say "AQL," but older scripts, custom fields, and ScriptRunner references still use "IQL." Cloud exclusively uses "AQL." |
| Assets | Insight / Assets | DC product was "Insight" until Atlassian rebranded it "Assets" in JSM DC 4.15+. Cloud has always used "Assets" since the rebrand. ScriptRunner docs still reference "Insight" alongside "Assets." |
| Help center | Customer portal (site-level) | Cloud uses "help center" for the site-wide portal aggregating all service spaces. DC uses "customer portal" more generically. |
| Portal | Portal | Same on both for the per-project customer portal. |
| Service Collection | JSM license tier | Cloud bundles JSM into "Service Collection" plans (Free, Standard, Premium, Enterprise). DC uses traditional per-agent licensing. |
| Collaborator | Collaborator | Same concept on both, but Cloud docs define it more explicitly as a licensed user in the Service Desk Team role who can only add internal comments. |
| Stakeholder | (no direct equivalent) | Cloud Premium/Enterprise adds a "Stakeholder" role for incident observers who do not consume agent licenses. DC has no built-in equivalent. |


## Cloud-Only Features

These exist on Cloud but have no DC equivalent.

| Cloud feature | Notes |
|---|---|
| Assets Data Manager | A full ETL pipeline (Raw, Transformed, Cleansed, Reconciled, Schema Objects) for ingesting, normalizing, and deduplicating data from 20+ adapters (AD, Azure VM, Entra ID, Defender, Falcon, SCCM, Intune, Jamf, ServiceNow, Snow, Qualys, Tenable, and others). Included in Premium/Enterprise plans. No DC equivalent exists. |
| Data Manager Adapters Client | A locally installed agent that runs PowerShell, SQL, flat-file, and API-based jobs against on-premises data sources, pushing results to Cloud Data Manager. |
| Data Manager golden records | The reconciliation stage merges multiple data sources into a single "Data Manager Object" (golden record) before importing to an Assets schema. |
| Virtual service agent | AI-powered chatbot that handles customer requests automatically. Usage limits and billing are plan-dependent. |
| Opsgenie integration (built-in) | Cloud JSM Premium/Enterprise includes Opsgenie for major incident management, on-call scheduling, alerting, and incident swarming. DC requires a separate Opsgenie license and manual integration. |
| Compass | Atlassian's developer portal for tracking services, components, and software catalog. Cloud-only product. |
| Atlas (now Goals in Jira) | Work tracking at the goal/project level. Cloud-only. |
| Forge apps | Cloud app framework that runs in Atlassian's infrastructure with OAuth 2.0 scopes. No DC equivalent (DC uses server-side plugins). |
| Connect apps | Cloud app framework using JWT authentication. DC uses Atlassian SDK/P2 plugins instead. |
| Container tokens | Assets-specific tokens for API authentication, generated within Assets to grant import permissions. DC uses session-based or basic auth against the local instance. |
| Modern incident management UI | Cloud JSM has a dedicated Incidents sidebar with escalation to major incidents, incident swarming, stakeholder updates, and post-incident reviews. DC handles incidents as standard issue types without a dedicated UI. |
| Service registry (built-in) | Cloud has a first-class "Services" section for registering services, assigning owner teams, and linking change approvers. DC has no built-in service registry (typically modeled in Assets). |
| Deployment gating | Cloud can gate deployments through approval workflows integrated with CI/CD tools (Bitbucket Pipelines, Jenkins, CircleCI). DC requires manual configuration or plugins. |
| Embeddable widget | Cloud provides an embeddable request widget for external websites. DC has no built-in equivalent. |
| Assets moved to platform | Cloud Assets is now accessible from any Jira app via the app switcher, not just JSM. DC Assets is still bundled specifically with JSM DC. |
| Smart Links for Assets | Cloud can display Assets objects via Atlassian Smart Links in Jira and Confluence. DC does not have Smart Link support. |
| Forms (dynamic, conditional) | Cloud has a built-in Forms feature with conditional logic, field validation, tables, and rich formatting, usable in portals and on work items. DC requires ProForma or similar plugins. |


## DC-Only Features

These exist on DC but have no Cloud equivalent or have been replaced.

| DC feature | Notes |
|---|---|
| ScriptRunner Behaviours | Client-side form behaviors (show/hide fields, set field values dynamically based on other fields). Cloud ScriptRunner has only "partial parity." |
| ScriptRunner custom REST endpoints | DC allows creating custom REST endpoints via ScriptRunner. Cloud does not support custom endpoints at all. |
| ScriptRunner Escalation Services | Automated issue escalation based on elapsed time using JQL + cron. Cloud has "partial parity" through Automation for Jira, but the ScriptRunner-specific implementation is DC-only. |
| ScriptRunner Listeners | Server-side event listeners that run Groovy scripts on issue events. Cloud has "partial parity." |
| ScriptRunner Script Fields | Custom calculated fields powered by Groovy scripts. Cloud has "partial parity." |
| ScriptRunner Workflow functions | Custom conditions, validators, and post-functions written in Groovy for Jira workflows. Cloud has "partial parity." |
| HAPI (ScriptRunner) | High-level API for scripting against Jira and Assets in Groovy. DC-only. |
| Groovy scripting in Assets workflows | DC Assets includes Groovy-based post-functions, conditions, and validators in workflow transitions. Cloud workflows do not support Groovy. |
| Assets Discovery (DC standalone) | Assets Discovery is available on both Cloud and DC. On DC it works standalone with built-in importers. On Cloud it feeds into Data Manager. Listed here because DC's standalone Discovery workflow (scan, import directly to schema) has no Cloud equivalent - Cloud requires the Data Manager pipeline. |
| Built-in importers (CSV, Database, JSON, LDAP, Jira Users, Object Schema) | DC Assets has six built-in import types configured directly in the schema UI. Cloud Assets supports CSV and JSON import but relies on Data Manager for database, LDAP, and advanced imports. |
| Assets Marketplace integrations (DC) | DC has free Marketplace integrations for AWS, Azure, Google Cloud, ServiceNow. Cloud handles these through Data Manager adapters instead. |
| Direct database access for Assets | DC allows database-level queries to find objects and attributes. Cloud has no database access. |
| Print labels and QR codes (template editor) | DC Assets has a built-in label template editor with HTML source editing, responsive height, and borders for printing physical labels. Cloud has limited label/QR support. |
| Configuring global Jira settings for Assets | DC exposes global Jira settings for Assets (reindex, cache, attachments). Cloud handles these automatically. |
| Object type-level permissions | DC Assets allows setting role permissions at the individual object type level (overriding schema-level permissions). Cloud Assets has simplified permission controls. |
| Referenced Assets custom field (cascading) | DC supports "Referenced Assets custom field" where one custom field's value depends on another. Cloud has simplified custom field options. |
| Read-only Assets custom field | DC has a dedicated read-only custom field type for Assets. Cloud handles read-only through field configuration. |
| IQL function names | DC ScriptRunner and older Assets versions use `iqlFunction()` as a JQL function name. Cloud uses `aqlFunction()` exclusively. |


## API Differences

| Aspect | Cloud | DC |
|---|---|---|
| Base URL pattern | `https://api.atlassian.com/jsm/assets/workspace/{workspaceId}/v1/` | `https://{host}/rest/insight/1.0/` or `https://{host}/rest/assets/1.0/` |
| Authentication | API token (email + token as basic auth), OAuth 2.0 (3LO), Forge (OAuth 2.0 scopes), Connect (JWT), Container tokens | Basic auth (username + password), session cookies, personal access tokens |
| API token format | Atlassian Account API token (site-scoped) | Local username + password or PAT |
| Query language endpoint | `/aql/objects` | `/iql/objects` (older) or `/aql/objects` (newer DC) |
| Object schema endpoint | `/objectschema/list` | `/objectschema/list` (same path, different base) |
| Object CRUD | `/object/{id}` | `/object/{id}` (same paths, different base) |
| Import source | `/importsource` | Import configurations are managed differently, often through the UI |
| Rate limiting | Cloud enforces rate limits on all APIs | DC has no rate limiting (self-hosted) |
| API documentation | Published at developer.atlassian.com/cloud/assets/ | Versioned Javadoc-style docs (e.g., Assets 10.4.4 REST API) |
| Workspace ID | Required in Cloud API paths; obtained from admin settings | Not applicable; DC connects directly to the instance |
| Pagination | Cloud uses cursor-based pagination on some endpoints | DC uses offset-based pagination |
| Connected tickets endpoint | `/objectconnectedtickets` (dedicated endpoint) | Connected tickets are queried through object endpoints |


## UI Navigation Differences

| Area | Cloud location | DC location |
|---|---|---|
| Assets access | App switcher (top nav), available from any Jira app | Top nav bar: Assets > Object schemas |
| Assets configuration | Settings icon within Assets, or admin Settings > Products | Top nav: Assets > Configure |
| Schema creation | Assets home > Create schema (plus schema templates from ITAM guide) | Assets > Object schemas > Create object schema (with schema templates) |
| Object schema config | Within schema > gear icon > schema settings | Within schema > Object Schema dropdown > Configure (tabs: General, Roles, Automation, Label templates, Statuses, References) |
| AQL/IQL search | Assets > AQL search bar | Assets > advanced search / IQL search bar |
| Import configuration | Assets > schema > Import (or via Data Manager for advanced) | Assets > schema > Object Schema > Import configurations |
| Automation rules | Settings > Automation (Jira-level) or within schema for Assets automation | Within schema > Object Schema > Configure > Automation tab |
| Custom fields | Settings > Issues > Custom fields (Jira admin), Assets fields auto-appear | Administration > Issues > Custom fields, then manually add to screens |
| Screens configuration | Managed automatically (field configuration context) | Administration > Issues > Screens (manual screen assignment) |
| Workflow editor | Project settings > Workflows (visual editor, simplified) | Administration > Workflows (text + diagram editor) |
| Services | Project sidebar > Services | No built-in equivalent; modeled in Assets |
| Incident management | Project sidebar > Incidents (with Opsgenie integration) | Standard issue types, no dedicated sidebar |
| Change management | Project sidebar > Changes (with deployment gating) | Standard issue types with custom workflows |
| Reports | Project sidebar > Reports (custom report builder) | Project sidebar > Reports (more limited) |
| Data Manager | Assets > Data Manager (left nav within Assets) | Not available |
| Knowledge base | Project sidebar > Knowledge base (Confluence-powered) | Project sidebar > Knowledge base (Confluence-powered, same concept) |


## Feature Parity Gaps

Differences significant enough to affect CMDB implementations.

| Area | Cloud behavior | DC behavior | Impact |
|---|---|---|---|
| Query language naming | AQL everywhere, `aqlFunction()` in JQL | Mix of IQL and AQL depending on version; `iqlFunction()` in older ScriptRunner scripts | Scripts and automation rules referencing `iqlFunction()` must be rewritten for Cloud. AQL syntax is identical. |
| Workflow post-functions | Automation rules or ScriptRunner Cloud (partial parity); no raw Groovy with full JVM access | Assets post-functions (create/update/set attribute), Groovy scripts, conditions, validators | Many DC workflow post-functions can be ported to ScriptRunner Cloud. Complex logic (e.g., create Asset on transition, set attributes from issue fields) may need Cloud Automation rules or Forge apps if ScriptRunner Cloud doesn't cover the specific capability. |
| Schema export/import | Limited; no full XML export of schema structure | Full XML export/import of object schemas | DC schemas can be backed up and restored via XML. Cloud relies on API-based schema management. |
| Attribute inheritance | Supported | Supported, with explicit inheritance configuration UI | Both support inheritance, but DC has a dedicated configuration page for fine-tuning which attributes inherit. |
| Automation trigger types | Jira Automation rules (component-based rule builder) | Assets-native automation (WHEN/IF/THEN with cron, object events) plus Jira Automation | DC Assets automation rules are built into the schema config. Cloud uses Jira Automation rules globally. The trigger model differs, particularly for scheduled/cron-based rules on Assets objects. |
| Object schema templates | ITAM-focused templates available | DC also has schema templates (IT Assets, HR, etc.) | Functionally similar, but the specific templates may differ between platforms. |
| Custom field types for Assets | "Assets object" field (simplified) | Three types: Default, Referenced, Read-only | DC offers more granular control over how Assets fields appear on issues. Cloud simplifies to a single configurable field type. |
| Bulk operations | ML-powered bulk categorize, link, and transition | Standard Jira bulk change | Cloud adds machine learning to suggest bulk actions. |
| Placeholders in AQL | Supported in custom field filters | Supported with more options (issue-context placeholders like `${MyCustomField${0}}`) | DC supports richer placeholder syntax in AQL for custom fields. Cloud placeholder support is more limited. |
| Discovery and Data Manager | Assets Discovery available on Premium/Enterprise (same agent-based scanner as DC). Data Manager adds ETL pipeline on top. | Assets Discovery scans networks agentlessly. Built-in importers (CSV, Database, JSON, LDAP) handle data ingestion. No Data Manager. | Both platforms have Discovery. Cloud adds Data Manager for cleansing and reconciliation. DC has built-in importers that Cloud replaced with Data Manager. |
| Groovy-based integrations | ScriptRunner Cloud available with partial parity; Forge, Connect, or REST API for gaps | Full Groovy scripting via Assets workflow functions and ScriptRunner with unrestricted JVM access | Many ScriptRunner scripts port to Cloud ScriptRunner. DC-only features (Behaviours, custom REST endpoints, Escalation Services, HAPI) must be redesigned using Forge, Connect, Automation rules, or process changes. |
| User administration | Centralized Atlassian account management (id.atlassian.com) | Local user directory, LDAP, Crowd, or Active Directory | User provisioning and group management work fundamentally differently. |
| Plugin/app ecosystem | Forge and Connect apps from Marketplace | Atlassian SDK P2 plugins from Marketplace | Many DC plugins have Cloud equivalents, but feature parity varies. Some DC plugins (especially those using Groovy or database access) have no Cloud equivalent. |
| Performance tuning | Managed by Atlassian; plan-based limits | Self-managed; tunable JVM, database, caching | DC administrators can tune reindex frequency, cache sizes, and database connections. Cloud abstracts this entirely. |
| Licensing model | Service Collection plans (site-wide, user-tier pricing) | Per-agent licensing for JSM; Assets bundled with JSM DC 4.15+ | Cost model differs significantly. Cloud charges per user tier for the entire site. DC charges per licensed agent. |
