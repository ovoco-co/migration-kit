# Documentation Restructure

**Status**: In Progress
**Updated**: 2026-03-26
**Priority**: Medium

### What's done
- Migration outline (820 lines, Parts 1-8) complete
- Assessment template complete
- Field type reference complete
- ScriptRunner parity table complete
- Assets migration reference complete
- Cutover runbook template complete
- Platform-specific guides: ServiceNow, BMC Remedy, Ivanti, Cherwell, GitLab
- Platform quirks: Jira Cloud gotchas, Cloud-DC terminology map
- Migration checklists: DC-to-DC, DC-to-Cloud, Cloud-to-Cloud

### What's pending
- Extract platform-specific content from migration outline into standalone guides
- Organize directory structure (assessment/, field-mapping/ subdirs planned but empty)
- ServiceNow field references need live instance validation
- BMC Remedy and Ivanti field references pending live instance access

## Overview

Reorganize the flat docs/ directory. The migration outline grew organically and now contains platform-specific content that should live in dedicated guides. Extract that content, create proper subdirectories, and make each document self-contained.

## Scope

- Migration outline stays as the narrative guide (Parts 1-8)
- Platform-specific content extracted to dedicated files
- Empty subdirectories either populated or removed
- Cross-references updated between documents
