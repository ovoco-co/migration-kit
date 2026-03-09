# Migration Assessment Template

Fill in this template during the discovery phase. It becomes the assessment deliverable for the client.


## Engagement Overview

| Field | Value |
|---|---|
| Client name | |
| Source platform | |
| Source version | |
| Source hosting | DC / Cloud / On-premise |
| Target platform | JSM Cloud / JSM DC |
| Target tier | Standard / Premium / Enterprise |
| Target date | |
| Assessment date | |
| Assessed by | |


## Source Inventory

### Projects / Service Desks

| Project Key | Name | Issue Types | Approximate Issue Count | Active? | Owner | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

### Custom Fields

| Count | Notes |
|---|---|
| Total custom fields | |
| Fields with data | |
| Orphaned fields (no data, no context) | |
| Duplicate fields (same name + type) | |
| Cascading select fields | |
| Assets/Insight object fields | |
| ScriptRunner scripted fields | |
| User picker fields | |

Run `tools/extract/field-inventory.js` for detailed cross-reference.

### Workflows

| Count | Notes |
|---|---|
| Total workflows | |
| Workflows with ScriptRunner post-functions | |
| Workflows with ScriptRunner conditions/validators | |
| Workflows with other app post-functions | |

Run `tools/extract/workflow-inventory.js` for transition-level detail.

### Schemes

| Scheme Type | Count | Unused | Duplicates |
|---|---|---|---|
| Permission schemes | | | |
| Notification schemes | | | |
| Issue type schemes | | | |
| Screen schemes | | | |
| Issue type screen schemes | | | |
| Field configuration schemes | | | |
| Workflow schemes | | | |

Run `tools/extract/scheme-inventory.js` for full scheme audit.

### Users and Groups

| Count | Notes |
|---|---|
| Total users | |
| Active users | |
| Inactive users | |
| Service accounts (no real email) | |
| Groups | |

Run `tools/extract/user-inventory.js` for cross-reference with target.

### ScriptRunner (DC only)

| Feature | Count | Cloud-Compatible | Needs Rewrite | Notes |
|---|---|---|---|---|
| Script fields | | | | |
| Listeners | | | | |
| Behaviours | | | | |
| Escalation services | | | | |
| Custom REST endpoints | | | | |
| Scheduled jobs | | | | |

Run `tools/extract/scriptrunner-audit.js` for auto-categorization.

### Assets/CMDB

| Count | Notes |
|---|---|
| Schemas | |
| Object types | |
| Total objects | |
| Import configurations | |
| AQL-dependent automation rules | |

### Marketplace Apps

| App Name | Used On | Cloud Equivalent? | Notes |
|---|---|---|---|
| | | | |


## Complexity Scoring

Rate each dimension. The overall complexity is the highest individual score, not an average.

| Dimension | Low | Medium | High | Score |
|---|---|---|---|---|
| Custom fields | <50 with data | 50-150 with data | >150 with data | |
| Workflows | <10, no scripts | 10-30, some scripts | >30, heavy scripting | |
| ScriptRunner items | <10, mostly portable | 10-30, mixed portability | >30, many DC-only features | |
| Assets/CMDB | No Assets or <5 types | 5-20 types, <10k objects | >20 types or >10k objects | |
| Users | <100 active | 100-500 active | >500 active | |
| Data volume | <50k issues | 50k-500k issues | >500k issues | |
| Integrations | <3 integrations | 3-10 integrations | >10 or custom-built | |
| Timeline pressure | >6 months | 3-6 months | <3 months | |

**Overall complexity:** Low / Medium / High


## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Custom field context flattening causes data ambiguity | | | Review cascading selects and multi-context fields before migration |
| ScriptRunner features have no Cloud equivalent | | | Audit with scriptrunner-audit.js, plan replacements early |
| User mapping failures (service accounts, inactive users) | | | Run user-inventory.js, resolve unmatched users before migration |
| Data volume exceeds JCMA limits or timeouts | | | Plan for batched migration by project |
| Marketplace app not available on Cloud | | | Identify alternatives during discovery |
| Assets reference integrity broken by import ordering | | | Use two-pass import, validate with assets-verify.js |
| | | | |


## Recommendations

_Fill in based on assessment findings._

**Migration approach:**
- [ ] JCMA (DC to Cloud)
- [ ] CMJ (Cloud to Cloud configuration)
- [ ] REST API scripted transfer
- [ ] Combination

**Pre-migration cleanup:**
-
-
-

**Phasing strategy (which projects first, which last):**
-
-
-

**Estimated effort:**
- Discovery and assessment: ___
- Cleanup and preparation: ___
- Target design and build: ___
- Test migration cycles: ___
- Cutover and validation: ___
- Post-migration support: ___


## Dependencies

| Dependency | Owner | Status | Notes |
|---|---|---|---|
| Target instance provisioned | | | |
| User accounts created on target | | | |
| Marketplace apps installed on target | | | |
| Source system freeze window agreed | | | |
| Rollback plan approved | | | |
| | | | |
