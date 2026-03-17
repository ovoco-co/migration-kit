# Cutover Runbook

Fill-in-the-blank runbook for migration cutover. Customize per engagement.


## Pre-Cutover Checklist

Complete all items before starting the cutover window.

- [ ] All test migration cycles completed and validated
- [ ] Field mapping CSV finalized and validated (`tools/transform/field-mapper.js`)
- [ ] Status mapping CSV finalized and validated (`tools/transform/status-mapper.js`)
- [ ] User mapping finalized (`tools/transform/user-mapper.js`)
- [ ] Source issue counts captured (`tools/extract/issue-counts.js`)
- [ ] Assets schema synced to target (if applicable)
- [ ] ScriptRunner replacements built and tested on target
- [ ] Automation rules disabled on target (prevent execution during import)
- [ ] Communication sent to stakeholders: cutover window, expected downtime, rollback criteria
- [ ] Rollback plan documented and approved
- [ ] Source system freeze confirmed (no changes during cutover)
- [ ] Target instance backup taken (Cloud: note the point-in-time for support request if rollback needed)


## Cutover Execution

Fill in timing, owner, and status for each step during execution.

| Step | Owner | Planned Start | Actual Start | Actual End | Status |
|---|---|---|---|---|---|
| Announce source freeze to users | | | | | |
| Set source to read-only (if possible) | | | | | |
| Run delta extraction (`--since` = last test migration) | | | | | |
| Run JCMA migration / REST API import | | | | | |
| Import delta issues | | | | | |
| Import Assets data (if applicable) | | | | | |
| Run count-compare validation | | | | | |
| Run field-spot-check validation | | | | | |
| Run link-integrity validation | | | | | |
| Run assets-verify validation (if applicable) | | | | | |
| Go/no-go decision | | | | | |
| Enable automation rules on target | | | | | |
| Switch DNS / update bookmarks / redirect users | | | | | |
| Announce migration complete to users | | | | | |


## Validation Script Invocations

Run these after the import completes. All scripts exit 0 on success, 1 on failures.

```bash
# Compare issue counts between source extraction and live target
node tools/validate/count-compare.js

# Spot-check 50 random issues across all projects
node tools/validate/field-spot-check.js --sample 50

# Verify issue links survived migration
node tools/validate/link-integrity.js

# Verify Assets data (if applicable)
node tools/validate/assets-verify.js --schema "IT Assets" --sample 50
```

Scope to specific projects if migrating in batches:

```bash
node tools/validate/count-compare.js --project KEY1,KEY2
node tools/validate/field-spot-check.js --sample 50 --project KEY1,KEY2
node tools/validate/link-integrity.js --project KEY1,KEY2
```


## Go / No-Go Matrix

| Check | Pass Criteria | Result | Notes |
|---|---|---|---|
| Issue count match | Source and target counts match (±0) | | |
| Field spot-check | >95% field values match across sampled issues | | |
| Link integrity | All issue links present on target | | |
| Assets object count | Source and target counts match per type | | |
| Assets spot-check | >95% attribute values match across sampled objects | | |
| Workflow transitions | Key workflows can transition (manual test) | | |
| Portal access | Customers can submit requests (manual test) | | |
| SLA tracking | SLAs are running on target issues (manual test) | | |
| Automation rules | Key rules fire correctly (manual test) | | |

**Go criteria:** All automated checks pass AND manual tests pass.
**No-go criteria:** Any count mismatch >1% OR field match rate <90% OR critical workflow broken.


## Rollback Plan

### DC to Cloud (JCMA)

- Atlassian does not provide a one-click rollback for JCMA migrations
- Cloud data can be deleted project-by-project, but this is manual and slow
- Best rollback: revert source to read-write, notify users to use the source system, delete migrated projects on Cloud
- For large migrations: contact Atlassian Support to request a point-in-time restore of the Cloud instance

### Cloud to Cloud (REST API)

- Delete imported issues via bulk delete or REST API
- Delete imported Assets objects via API
- Revert any configuration changes (workflows, fields, schemes) manually
- This is faster than JCMA rollback since you control the import process

### Assets Rollback

- Delete imported objects by type (reverse order of import)
- Delete imported object types and attributes
- Delete the schema if it was created for this migration
- CMDB-Kit can script this: export the object IDs during import, delete by ID list on rollback


## Communication Templates

### Pre-Cutover Announcement

> Subject: [Action Required] ITSM Migration — Cutover Window
>
> We are migrating from _[source]_ to _[target]_ on _[date]_ from _[start time]_ to _[end time]_.
>
> During this window:
> - _[source]_ will be read-only (no new tickets or updates)
> - _[target]_ will be unavailable until migration completes
>
> After the cutover, all work should be done in _[target]_ at _[URL]_.
>
> If you have urgent issues during the window, contact _[escalation contact]_.

### Post-Cutover Announcement

> Subject: ITSM Migration Complete — Start Using _[target]_
>
> The migration is complete. Please use _[target]_ at _[URL]_ for all ITSM work going forward.
>
> _[source]_ is now archived and read-only.
>
> Known issues:
> - _[list any known issues]_
>
> If you notice missing data or incorrect information, contact _[support contact]_.
