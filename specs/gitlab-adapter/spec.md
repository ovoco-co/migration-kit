# GitLab Migration Adapter

**Status**: Done
**Updated**: 2026-03-26

### What's done
- GitLab API client with pagination and rate limiting
- Extract projects tool
- Extract issues tool (Jira markup to Markdown conversion, story points, custom fields)
- Import issues tool with label mapping
- Post-import validation tool
- Label mapping CSV template
- Full migration guide (docs/gitlab-migration.md)

### Known issues (from code review)
- No 5xx retry in gitlab-client.js
- Pagination has no max page cap (could loop on API errors)
- Story points field ID is hardcoded
- Jira wiki markup conversion incomplete (missing nested lists, tables, colors, macros)
- Import tool lacks idempotency (would create duplicates on retry)
- Tracked in specs/code-quality/ for fixes

## Overview

Complete Jira-to-GitLab migration adapter. Extracts issues from Jira (DC or Cloud), converts to GitLab format with label mapping, imports to GitLab, and validates the result. Covers the full extract-transform-load cycle for teams moving from Jira to GitLab Issues.
