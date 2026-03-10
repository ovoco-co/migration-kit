#!/usr/bin/env node
/**
 * extract-issues.js - Extract Jira issues for GitLab import.
 *
 * Pulls all issues (with comments, attachments metadata, links, and history)
 * from the Jira source instance and writes them as normalized JSON ready for
 * the import-issues.js script to push into GitLab.
 *
 * Usage:
 *   node tools/gitlab/extract-issues.js --project KEY [--since 2024-01-01] [--batch 500]
 *
 * Output:
 *   output/gitlab/issues-{KEY}.json
 */

const { loadConfig, get, post, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/gitlab/extract-issues.js --project KEY [options]

Options:
  --project KEY        Jira project key (required)
  --since YYYY-MM-DD   Only issues updated after this date
  --batch N            Issues per API page (default 100)
  --help               Show this help
`.trim();

function stripJiraMarkup(text) {
  if (!text) return '';
  // Convert common Jira wiki markup to markdown
  return text
    // Headers
    .replace(/^h([1-6])\.\s*/gm, (_, n) => '#'.repeat(parseInt(n)) + ' ')
    // Bold
    .replace(/\*([^*\n]+)\*/g, '**$1**')
    // Italic
    .replace(/_([^_\n]+)_/g, '*$1*')
    // Strikethrough
    .replace(/-([^-\n]+)-/g, '~~$1~~')
    // Code blocks
    .replace(/\{code(?::([^}]*))?\}([\s\S]*?)\{code\}/g, (_, lang, code) => {
      return '```' + (lang || '') + '\n' + code.trim() + '\n```';
    })
    // Inline code
    .replace(/\{\{([^}]+)\}\}/g, '`$1`')
    // Links
    .replace(/\[([^|]+)\|([^\]]+)\]/g, '[$1]($2)')
    // Unordered lists
    .replace(/^\*\s+/gm, '- ')
    // Ordered lists
    .replace(/^#\s+/gm, '1. ')
    // Quotes
    .replace(/\{quote\}([\s\S]*?)\{quote\}/g, (_, q) => {
      return q.trim().split('\n').map(l => '> ' + l).join('\n');
    })
    // Mentions
    .replace(/\[~([^\]]+)\]/g, '@$1')
    // Panels and noformat
    .replace(/\{panel(?::[^}]*)?\}([\s\S]*?)\{panel\}/g, '$1')
    .replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, '```\n$1\n```');
}

async function fetchIssues(source, projectKey, since, batchSize) {
  let jql = `project = "${projectKey}" ORDER BY key ASC`;
  if (since) {
    jql = `project = "${projectKey}" AND updated >= "${since}" ORDER BY key ASC`;
  }

  console.log(`  JQL: ${jql}`);

  const allIssues = [];
  let startAt = 0;

  while (true) {
    const result = await post(source, '/rest/api/2/search', {
      jql,
      startAt,
      maxResults: batchSize,
      fields: [
        'summary', 'description', 'issuetype', 'status', 'priority',
        'resolution', 'assignee', 'reporter', 'created', 'updated',
        'labels', 'components', 'fixVersions', 'comment', 'attachment',
        'issuelinks', 'subtasks', 'parent', 'timetracking', 'duedate',
        'customfield_10016', // story points (common)
      ],
      expand: ['names'],
    });

    if (!result.issues || result.issues.length === 0) break;
    allIssues.push(...result.issues);

    console.log(`  Fetched ${allIssues.length} / ${result.total} issues`);

    if (allIssues.length >= result.total) break;
    startAt += result.issues.length;
  }

  return allIssues;
}

function transformIssue(jiraIssue) {
  const f = jiraIssue.fields;

  const issue = {
    jiraKey: jiraIssue.key,
    jiraId: jiraIssue.id,
    title: `[${jiraIssue.key}] ${f.summary}`,
    description: stripJiraMarkup(f.description),
    type: f.issuetype ? f.issuetype.name : 'Task',
    status: f.status ? f.status.name : '',
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.name : '',
    priority: f.priority ? f.priority.name : '',
    resolution: f.resolution ? f.resolution.name : null,
    assignee: f.assignee ? {
      name: f.assignee.displayName,
      email: f.assignee.emailAddress || '',
      key: f.assignee.key || f.assignee.accountId || '',
    } : null,
    reporter: f.reporter ? {
      name: f.reporter.displayName,
      email: f.reporter.emailAddress || '',
      key: f.reporter.key || f.reporter.accountId || '',
    } : null,
    created: f.created,
    updated: f.updated,
    dueDate: f.duedate || null,
    labels: f.labels || [],
    components: (f.components || []).map(c => c.name),
    fixVersions: (f.fixVersions || []).map(v => v.name),
    storyPoints: f.customfield_10016 || null,
    timeTracking: f.timetracking || null,
    comments: (f.comment ? f.comment.comments : []).map(c => ({
      author: c.author ? c.author.displayName : 'Unknown',
      authorEmail: c.author ? (c.author.emailAddress || '') : '',
      body: stripJiraMarkup(c.body),
      created: c.created,
    })),
    attachments: (f.attachment || []).map(a => ({
      filename: a.filename,
      size: a.size,
      mimeType: a.mimeType,
      contentUrl: a.content,
      author: a.author ? a.author.displayName : '',
      created: a.created,
    })),
    links: (f.issuelinks || []).map(l => ({
      type: l.type ? l.type.name : '',
      direction: l.inwardIssue ? 'inward' : 'outward',
      linkedKey: l.inwardIssue ? l.inwardIssue.key : (l.outwardIssue ? l.outwardIssue.key : ''),
      linkedSummary: l.inwardIssue
        ? l.inwardIssue.fields.summary
        : (l.outwardIssue ? l.outwardIssue.fields.summary : ''),
    })),
    subtasks: (f.subtasks || []).map(s => s.key),
    parentKey: f.parent ? f.parent.key : null,
  };

  // Determine GitLab state: open or closed
  issue.gitlabState = issue.statusCategory === 'Done' ? 'closed' : 'opened';

  // Build suggested labels from Jira metadata
  issue.suggestedLabels = [];
  if (issue.type) issue.suggestedLabels.push(`type::${issue.type.toLowerCase().replace(/\s+/g, '-')}`);
  if (issue.priority) issue.suggestedLabels.push(`priority::${issue.priority.toLowerCase().replace(/\s+/g, '-')}`);
  if (issue.resolution) issue.suggestedLabels.push(`resolution::${issue.resolution.toLowerCase().replace(/\s+/g, '-')}`);
  if (issue.statusCategory && issue.statusCategory !== 'Done') {
    issue.suggestedLabels.push(`workflow::${issue.statusCategory.toLowerCase().replace(/\s+/g, '-')}`);
  }
  for (const label of issue.labels) {
    issue.suggestedLabels.push(label);
  }
  for (const comp of issue.components) {
    issue.suggestedLabels.push(`component::${comp.toLowerCase().replace(/\s+/g, '-')}`);
  }

  return issue;
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help || !flags.project) { console.log(USAGE); return; }

  const config = loadConfig();
  const source = config.source;
  const projectKey = flags.project;
  const since = flags.since || null;
  const batchSize = parseInt(flags.batch || '100', 10);

  console.log(`\nExtracting issues from ${source.baseUrl} project ${projectKey}...`);

  const rawIssues = await fetchIssues(source, projectKey, since, batchSize);
  const issues = rawIssues.map(transformIssue);

  // Summary
  const statusCounts = {};
  const typeCounts = {};
  for (const issue of issues) {
    statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;
    typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
  }

  const output = {
    timestamp: new Date().toISOString(),
    source: source.baseUrl,
    project: projectKey,
    total: issues.length,
    byStatus: statusCounts,
    byType: typeCounts,
    issues,
  };

  writeOutput(config, output, 'gitlab', `issues-${projectKey}.json`);

  console.log(`\nExtracted ${issues.length} issues from ${projectKey}`);
  console.log(`  Types: ${Object.entries(typeCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  console.log(`  Statuses: ${Object.entries(statusCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
