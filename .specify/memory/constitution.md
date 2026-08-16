# Migration Kit Constitution

This constitution governs this repository. Unresolved items are collected under Open Questions at the end.

## Purpose

Migration-kit moves records out of one tracking system and into another. It is a standalone open-source project.

The work is extract, transform, load, and prove the result matches the source. What makes it hard is that a migration runs once against data nobody can regenerate, so a silent loss is discovered long after the source is gone.

## Core Principles

Four principles govern this repository. Principle I decides any conflict between them.

### I. A Migration Is Provable or It Did Not Happen

Every stage validates data integrity, and the validation is a check a reviewer can repeat rather than a claim in a log.

Counts match at extract, at transform, and at load. A record that could not be migrated is reported by identifier and reason. Silence means everything crossed, so silence has to be earned.

The failure this prevents: a migration reports success, the source is decommissioned, and a family of records turns out to have been dropped by a filter nobody reviewed.

### II. Every Tool Is Safe to Re-Run

Running a migration twice produces the same result as running it once. A partial run followed by a full run produces a complete result rather than duplicates.

A migration that cannot be re-run cannot be tested, and one that cannot be tested is run for the first time against real data.

### III. No Source or Target Is Assumed

Migration-kit supports several source and target platforms. A platform-specific concept lives in that platform's adapter and never in the shared layers.

A transformation that works for one target and silently corrupts another is worse than one that refuses to run.

### IV. Deliberately Retired Records Still Have a Home

A record family the target no longer uses is still history. It loads into the reporting store rather than being dropped, and the specification says which families those are.

Retiring a record type is a decision about future work. It is not a decision to lose the past.

## Writing Standards

These rules apply to every document in this repository, including commit messages.

### Specs Are Exempt From the Formatting Rules

Specifications under `specs/` follow the Naming, Attribution, Unknowns, and Scope Statements rules and are exempt from Headings, Sentences, Length, and Mechanics.

Those four are about what a claim says and how well it is grounded. They matter more in a spec than anywhere else, because a spec is what everything downstream is built against.

The formatting rules are exempt because the tooling writes most of the structure. `**Feature Branch**`, `**Why this priority**`, `**Independent Test**`, `**Acceptance Scenarios**`, the `**Given**` and `**When**` and `**Then**` markers, and the horizontal rules between user stories all come from `.specify/templates/spec-template.md`. Enforcing against them would mean every new spec violates this constitution the moment `speckit-specify` finishes, and reformatting would fight the tooling on the next run.

The exemption is for specs, not for everything a spec touches. Plans, research notes, working documents, and commit messages follow every rule.

### Naming

The test: a reader who does not already know which system, adapter, or record family is meant must be able to tell from the sentence alone.

The test governs. A banned word list cannot anticipate every phrasing, and swapping a pronoun for a noun phrase hides the same thing. "The tracker" fails for the same reason "it" fails when two trackers are in play.

Name the source platform, the target platform, and the record family every time. "The migration" is ambiguous the moment a second adapter exists.

Common failures: "here", "the source", "the tool", "we", "our", "they". Treat these as examples rather than as the whole rule.

### Attribution

State how a claim was established.

```
Read:  The GitLab adapter maps issue state to a two-value field.
Ran:   Migrated the 412 record fixture and compared counts at each stage.
```

A claim about how a platform behaves is a conclusion until something has been run against that platform. Platform documentation is frequently wrong about edge cases, which is precisely where a migration loses records.

### Read the Documentation First

Consult the platform's documentation and this repository's own docs before reading adapter source and before running experiments.

Source says what the adapter does. Documentation says what the platform promises. When they disagree, the disagreement is the finding.

### Unknowns

An unknown is written as an unknown, and it names what would resolve it.

```
Unverified: whether the target preserves attachment ordering.
            Resolved by migrating a record with three attachments and reading them back.
```

Without this, unknowns get written in the same voice as knowns and are read as settled by the next person.

### Scope Statements

Anything deferred says what happens instead in the meantime. A record family that is out of scope for this version says so and says where it goes. Silence reads as an oversight, and a reader cannot tell the difference later.

### Precision

Write the specific file, field, adapter, or record identifier. `gitlab-adapter/transform.js` rather than "the transformer".

No invented shorthand. If a term needs a definition to be understood, use plain words instead.

In reference material, state a fact, then the next fact, and avoid chains of subordinate clauses. This does not apply to rationale, where the causal link is the content.

Do not substitute a list of exclusions for saying what a thing is.

### Length

Every sentence carries a fact a reader needs. Cut sentences that set up another sentence, restate the previous one, or announce what the document is about to say.

No hedging that adds no information. No closing offers, no summaries of what was just read.

If a paragraph can be a line, make it a line.

### Headings

Every section starts with a real heading. A heading is a line beginning with hash marks. Nothing else is a heading.

Use the level to show nesting. Do not skip a level to get a smaller size.

Content follows every heading. A heading followed immediately by another heading tells the reader nothing.

No run in headings. A bold phrase opening a paragraph is not a heading, whatever punctuation follows it.

Wrong:

    **Idempotent.** Running a migration twice produces the same result.

Right:

    #### Idempotent

    Running a migration twice produces the same result.

One idea per heading. No combined categories. Any heading joining two nouns with "and" is two headings.

### Sentences

- Default to one clause per sentence. Join two clauses only when the relationship between them is the point, as in a cause or a contrast. Never join three.
- No em dashes. Split the sentence instead. En dashes in numeric ranges are fine.
- Use active voice when the actor matters. Passive voice is correct when the actor is genuinely irrelevant. The test is whether a reader needs to know who performs the action.
- No rhetorical flourishes. State the thing.

### Mechanics

- No ampersands standing in for "and".
- No horizontal rules.
- No numbered section headings. Use header levels.
- No tables of contents.
- No bold inside table cells.
- Use "section" rather than "chapter".
- Write a count only when it is the evidence for the claim, and date it. "412 of 415 records reconciled" is evidence. "Four extract scripts and three transforms" is decoration, and the sentence is better without it.
- Title case for headings.
- Acronyms stay capitalized. ETL, CSV, API, JSON.
- US spelling.

## Corrections Reach Every Document

A correction is not finished when the finding is recorded. It is finished when every document repeating the old claim has been found and corrected.

Search for the claim rather than recalling where it was written. A correction that reaches one document while five others assert the old version leaves the next reader believing whichever they open first.

## Development Workflow

Specifications come before implementation.

A specification for work already delivered is history. Corrections are carried in a later specification rather than by editing it.

An adapter change is verified against that platform, not against a fixture alone. A fixture proves the transformation. Only the platform proves the load.

### Refreshing the Spec Tooling Destroys This File

`specify init --here --force` skips confirmation and overwrites project files.

Back up `.specify/memory/constitution.md` and any customized template before refreshing the tooling, and diff afterwards rather than assuming.

## Quality Gates

- Counts reconcile at extract, transform, and load, and the reconciliation is repeatable by a reviewer.
- Every unmigrated record is reported with its identifier and reason.
- Running any tool twice changes nothing the first run did not already change.
- No Ovoco or Odoo references appear in file contents.
- Every claim states whether it was read or run, and every unknown says what resolves it.

## Governance

This constitution outranks other practices in this repository. Amendments update this document and the project instructions together.

Principle I decides ties.

## Open Questions

Which record families are deliberately retired for the current target, and where their history lands. Principle IV states the rule and the list belongs in the specification that names the target.

The version number and ratification date for this document.
