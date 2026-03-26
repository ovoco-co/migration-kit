# Code Quality Fixes

**Status**: Not Started
**Updated**: 2026-03-26
**Priority**: High
**Source**: Code review 2026-03-24

### What's pending
- lib/client.js: Add 5xx retry with exponential backoff, fix config parse error handling, cap cursor pagination, fix fragile results key detection
- CSV parsers (field-mapper.js, status-mapper.js): Handle quoted fields with commas (match user-mapper.js pattern)
- delta-extract.js: Stop silently swallowing comment fetch errors, fix timezone handling in JQL date formatting
- issue-counts.js: Batch JQL queries instead of one API call per (project, type, status) combination
- field-inventory.js: Use chunked Promise.all instead of sequential context/option fetches
- scheme-inventory.js: Implement unused scheme detection (data is already collected)
- gitlab-client.js: Add 5xx retry, cap pagination to prevent infinite loops
- extract-issues.js: Make story points field ID configurable instead of hardcoded, expand Jira wiki markup conversion (nested lists, tables, colors, macros)
- import-issues.js: Add idempotency/resume capability, escape filenames in multipart body, cache user lookups

## Overview

Address all issues identified in the 2026-03-24 code review. The tools work but have error handling gaps, performance issues on large instances, and inconsistent CSV parsing across modules.

## Why

These are the tools people run against their production Jira instances during migrations. Silent error swallowing, missing retry logic, and performance issues that trigger rate limiting on large instances are not acceptable for production use.

## Approach

Fix each issue in isolation with a targeted commit. No architectural changes. The review documented specific line-level issues with clear fixes.
