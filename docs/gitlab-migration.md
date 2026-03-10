# Jira to GitLab Migration

How to migrate Jira projects (DC or Cloud) to GitLab issue tracking using migration-kit tooling.

## When to use this

Jira Data Center reaches end-of-life on March 28, 2029. Teams that cannot or choose not to move to Atlassian Cloud need an alternative. GitLab provides issue tracking, boards, milestones, and CI/CD in a single platform that can run self-managed on any infrastructure, including air-gapped government environments.

This adapter handles the Jira-to-GitLab issue migration: extracting issues with full metadata from Jira, transforming them into GitLab-compatible format, importing into GitLab with labels and comments, and validating the results.

## What migrates

- Issues with title, description (converted from Jira wiki markup to markdown), and timestamps
- Comments with original author attribution and timestamps
- Attachments (downloaded from Jira, re-uploaded to GitLab)
- Issue state (open/closed based on Jira status category)
- Labels generated from Jira issue type, priority, status, components, and existing labels
- Assignee mapping via user map
- Story points mapped to GitLab issue weight
- Due dates
- Issue links and subtask relationships (recorded in description, not as native GitLab links)

## What does not migrate

- Jira workflows (GitLab uses a simpler open/closed model with labels for workflow state)
- Board configurations (recreate manually in GitLab)
- Automations (rebuild using GitLab CI/CD or webhooks)
- Time tracking history (Jira time tracking is noted in metadata but not mapped to GitLab time tracking)
- Watchers
- Custom field values beyond the standard set (story points, due date)

## Prerequisites

- Node.js 18 or later
- Jira instance credentials (DC: username/token, Cloud: email/token)
- GitLab instance with a personal access token (api scope)
- GitLab project(s) created to receive the imported issues

## Configuration

Add a `gitlab` key to your `.migrationrc.json`:

```json
{
  "source": {
    "type": "dc",
    "baseUrl": "https://jira.example.com",
    "auth": { "username": "admin", "token": "your-token" }
  },
  "gitlab": {
    "baseUrl": "https://gitlab.example.com",
    "token": "glpat-xxxxxxxxxxxxxxxxxxxx"
  },
  "outputDir": "./output"
}
```

For GitLab.com, `baseUrl` is `https://gitlab.com`. For self-managed, use your instance URL.

The GitLab token needs `api` scope. Create one at Settings, Access Tokens in your GitLab profile.

## Migration sequence

### Step 1: Extract project metadata

```bash
node tools/gitlab/extract-projects.js
# or filter to specific projects:
node tools/gitlab/extract-projects.js --project PROJ1,PROJ2
```

Output:
- `output/gitlab/projects-source.json` - project list with metadata
- `output/gitlab/label-defaults.json` - suggested labels from issue types, priorities, resolutions

Review `label-defaults.json` and edit `templates/gitlab-label-mapping.csv` if you want to customize label names or colors.

### Step 2: Extract issues

```bash
node tools/gitlab/extract-issues.js --project PROJ1
```

Options:
- `--since 2024-01-01` to extract only recently updated issues
- `--batch 200` to adjust API page size

Output: `output/gitlab/issues-PROJ1.json` with all issues, comments, attachment metadata, and suggested labels.

Review the output before importing. Check the `byStatus` and `byType` summary counts to verify the extraction looks complete.

### Step 3: Create GitLab projects

Create the target GitLab project(s) before importing. The import script needs a project ID or path.

For one Jira project to one GitLab project, create the project in GitLab and note the project ID (visible on the project settings page) or use the full path (e.g., `my-group/my-project`).

### Step 4: Build user map (optional)

If you want assignees mapped, create a JSON file mapping Jira email addresses to GitLab usernames:

```json
{
  "jane.doe@example.com": "jdoe",
  "john.smith@example.com": "jsmith"
}
```

You can also use the existing `tools/extract/user-inventory.js` to pull users from Jira and manually map them.

### Step 5: Dry run

```bash
node tools/gitlab/import-issues.js \
  --file output/gitlab/issues-PROJ1.json \
  --gitlab-project 42 \
  --dry-run
```

The dry run validates all issues can be processed without creating anything in GitLab.

### Step 6: Import

```bash
node tools/gitlab/import-issues.js \
  --file output/gitlab/issues-PROJ1.json \
  --gitlab-project 42 \
  --user-map output/gitlab/user-map.json \
  --batch-delay 200
```

Options:
- `--skip-attachments` to skip attachment migration (faster, useful for initial testing)
- `--skip-comments` to skip comment migration
- `--batch-delay 500` to increase delay between API calls (default 200ms)

Output: `output/gitlab/import-results-PROJ1.json` with the Jira key to GitLab issue IID mapping and any errors.

### Step 7: Validate

```bash
node tools/gitlab/validate-import.js \
  --file output/gitlab/issues-PROJ1.json \
  --results output/gitlab/import-results-PROJ1.json \
  --gitlab-project 42 \
  --sample 30
```

Validation checks:
- Issue count match (source vs imported vs GitLab live count)
- State mapping (open/closed counts match)
- Spot-check sample issues for title, description, state, labels, and comments

## Handling large migrations

For projects with more than a few thousand issues, consider:

- Extract incrementally using `--since` to pull recent changes after an initial full extract
- Import in batches by splitting the issues JSON file
- Increase `--batch-delay` to avoid GitLab rate limits on large self-managed instances
- Skip attachments on the first pass, then run a separate attachment-only import

## How Jira concepts map to GitLab

| Jira | GitLab | Notes |
|------|--------|-------|
| Project | Project | One-to-one or many-to-one (group) |
| Issue | Issue | Title prefixed with Jira key for traceability |
| Epic | Epic or label | GitLab Epics are a Premium feature; labels work on all tiers |
| Story/Task/Bug | Scoped labels | type::story, type::task, type::bug |
| Priority | Scoped labels | priority::high, priority::medium |
| Status | Scoped labels + state | workflow::in-progress; closed state for Done |
| Component | Scoped labels | component::backend, component::api |
| Sprint | Milestone | Create milestones manually, assign after import |
| Fix Version | Milestone | Same as sprint, or use labels |
| Story Points | Weight | Rounded to integer |
| Assignee | Assignee | Via user map |
| Comment | Note | With original author in blockquote |
| Attachment | Upload | Re-uploaded to GitLab project |
| Issue Link | Description reference | Noted in description, not native GitLab links |
