# Feature Specification: Legacy record tool migration

**Feature Branch**: `legacy-record-tool-migration`
**Created**: 2026-08-12
**Status**: Draft
**Input**: Move historical configuration management records out of a legacy record tool and its traceability database into a schema-validated CMDB, with a round trip that proves nothing was lost or altered.

## Problem Statement

Programs running a legacy configuration management record tool hold years of records that matter: work packages, source file status, peer reviews, unit tests, anomalies, discrepancy reports, and a separate traceability database rebuilt per release. Those records are audit evidence. They cannot be abandoned when the tooling is replaced, and re-keying them is neither affordable nor trustworthy.

Migration is usually treated as a one-way load, which makes it unprovable. A load that says it moved forty thousand rows has demonstrated nothing about whether those rows still say what they said. What is needed is a round trip: extract, transform, validate, load, then export back out and reconcile against what was extracted.

The other common failure is sequencing. Migrating before the target domains exist means the migration designs the schema by accident, and the resulting model is shaped by whatever the legacy tool happened to store.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extraction is frozen and provable (Priority: P1)

An extract is a dated, checksummed snapshot, not a query someone ran once.

**Independent Test**: Re-run a reconciliation months later against the same extract and get the same answer.

**Acceptance Scenarios**:

1. **Given** an extract, **When** taken, **Then** its date, source, scope, and a checksum per extracted set are recorded.
2. **Given** an extract, **When** used, **Then** every downstream step references it rather than re-querying the source.
3. **Given** a second extract, **When** taken, **Then** it is a distinct record and does not replace the first.

---

### User Story 2 - Every record keeps its legacy identity (Priority: P1)

Migrated records carry where they came from.

**Acceptance Scenarios**:

1. **Given** a migrated record, **When** inspected, **Then** it carries its legacy identifier and the extract it came from.
2. **Given** a crosswalk between legacy and new identifiers, **When** maintained, **Then** it lives with the migration rather than in the target.
3. **Given** the same extract loaded twice, **When** the second load completes, **Then** no duplicates exist.

---

### User Story 3 - Transformation reports rather than guesses (Priority: P1)

Anything the transform cannot map is surfaced, not filled in.

**Acceptance Scenarios**:

1. **Given** a legacy field with no target, **When** transformed, **Then** it is reported with a count rather than dropped.
2. **Given** a legacy record type with no target domain, **When** encountered, **Then** it is listed with a count as a scope decision.
3. **Given** a missing value, **When** transformed, **Then** the target field is left unspecified and counted rather than defaulted.
4. **Given** a controlled value that does not appear in the target vocabulary, **When** encountered, **Then** it is reported rather than mapped to the nearest match.

---

### User Story 4 - Closed records arrive as history (Priority: P1)

Historical records do not pass through the live lifecycle.

**Acceptance Scenarios**:

1. **Given** a closed legacy record, **When** loaded, **Then** it arrives with its final status and dates intact.
2. **Given** a record with status history, **When** loaded, **Then** the history is preserved in order.
3. **Given** loading, **When** it runs, **Then** no workflow, approval, or notification is triggered by historical data.

---

### User Story 5 - The round trip proves the migration (Priority: P1)

Exported target data is reconciled against the staged extract.

**Independent Test**: Export the loaded records, compare against the extract, and produce a reconciliation showing counts by type and a sampled field comparison.

**Acceptance Scenarios**:

1. **Given** a completed load, **When** the target is exported, **Then** the export is compared against the staged extract.
2. **Given** the comparison, **When** produced, **Then** it reports counts by type for extracted, loaded, and exported.
3. **Given** the comparison, **When** produced, **Then** a sampled field-level comparison is included.
4. **Given** differences, **When** found, **Then** they are reported and are not corrected silently.
5. **Given** a reconciliation, **When** complete, **Then** it is retained as the evidence that the migration happened as described.

---

### User Story 6 - Validation gates the load (Priority: P1)

Records validate against the target schema before entering it.

**Acceptance Scenarios**:

1. **Given** candidate records, **When** validated, **Then** those failing do not enter the target.
2. **Given** failures, **When** reported, **Then** they identify the record and the rule.
3. **Given** a schema change, **When** it occurs, **Then** revalidation is possible without re-extracting.

### Edge Cases

- A legacy record references another that was never migrated. Retained as an unresolved reference and reported.
- Two legacy records share an identifier. Reported as a collision rather than merged.
- A legacy record is amended after extraction. The extract governs; a later extract is its own record.
- Free text encodes structure by convention. Parsed only where the convention is documented, and reported otherwise.
- The legacy tool holds attachments or binaries. Their existence migrates; their storage is a separate decision.
- A record type is deliberately not migrated. Recorded as an exclusion with its rationale, not silently absent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An extract MUST record date, source, scope, and a checksum per extracted set.
- **FR-002**: Downstream steps MUST reference the extract rather than re-querying the source.
- **FR-003**: Migrated records MUST carry their legacy identifier and the extract they came from.
- **FR-004**: The legacy-to-target identifier crosswalk MUST be held by the migration, not the target.
- **FR-005**: Loads MUST be idempotent.
- **FR-006**: Unmappable fields, record types, and controlled values MUST be reported with counts rather than dropped, defaulted, or approximated.
- **FR-007**: Closed records MUST load with final status and dates intact, preserving status history in order.
- **FR-008**: Loading MUST NOT trigger workflow, approval, or notification.
- **FR-009**: Records MUST validate against the target schema before entering it, and failures MUST identify the record and the rule.
- **FR-010**: A round trip MUST export loaded data and reconcile it against the staged extract.
- **FR-011**: Reconciliation MUST report counts by type for extracted, loaded, and exported, plus a sampled field comparison.
- **FR-012**: Differences MUST be reported and MUST NOT be corrected silently.
- **FR-013**: The reconciliation MUST be retained as migration evidence.
- **FR-014**: Unresolved references and identifier collisions MUST be retained and reported.
- **FR-015**: Deliberate exclusions MUST be recorded with rationale.
- **FR-016**: Migration MUST NOT proceed for a record family whose target domain does not yet exist.
- **FR-017**: Where a record family has been deliberately retired rather than given a target domain, its history MUST be able to load into the reporting store as historical evidence rather than into the record store. The absence of a record type is a decision, not a blocker, and the audit trail those records hold is still real. Such a load MUST be reconciled the same way as any other.

### Key Entities

- **Extract**: A dated, checksummed snapshot of a legacy set.
- **Staged Record**: A legacy record as extracted, before transformation.
- **Crosswalk**: Legacy identifier to target identifier, held by the migration.
- **Transformation Report**: What could not be mapped, with counts.
- **Reconciliation**: Extracted against loaded against exported, with sampled comparison.
- **Exclusion**: A record type or set deliberately not migrated, with rationale.

## Success Criteria *(mandatory)*

- **SC-001**: A migration can be re-run from the same extract and produce the same result.
- **SC-002**: Every migrated record resolves to its legacy identifier.
- **SC-003**: Nothing is defaulted, approximated, or dropped without appearing in a report.
- **SC-004**: The round trip demonstrates that loaded records still say what the extract said.
- **SC-005**: Historical loading triggers no live process.
- **SC-006**: What was deliberately not migrated is stated.

## Assumptions

- The target schema is validated by the shared validator before load.
- Every record family in scope has either a target domain that already exists or a recorded decision that its history loads into the reporting store instead.
- The legacy tool can be read, by export or by direct query.

## Out of scope

- Designing the target domains. Migration follows them; it does not shape them.
- Decommissioning the legacy tool.
- Attachment and binary storage.
- Any interpretation of record content beyond documented conventions.

## Dependencies

- The target CMDB schema and its validator.
- Existing extract, transform, and validate tooling in this kit.
