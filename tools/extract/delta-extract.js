#!/usr/bin/env node
/**
 * delta-extract.js - Extract issues created or modified since a given timestamp.
 *
 * Used for the final cutover delta after source freeze.
 *
 * Usage:
 *   node tools/extract/delta-extract.js --since "2026-03-01T00:00:00" [--project KEY1,KEY2]
 *
 * Output:
 *   output/extract/delta-YYYY-MM-DDTHH-MM.json
 */

const { loadConfig, get, post, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/delta-extract.js [options]

Extracts issues created or modified since a given timestamp from the source.

Options:
  --since <timestamp>   ISO timestamp (required). Example: "2026-03-01T00:00:00"
  --project KEY1,KEY2   Only extract from these projects
  --help                Show this help
`.trim();

async function extractIssue(instance, key) {
  // Fetch full issue with all fields, comments, changelog
  const issue = await get(
    instance,
    `/rest/api/2/issue/${key}?expand=changelog,renderedFields`
  );

  // Fetch comments separately for full detail
  let comments = [];
  try {
    const commentData = await paginate(
      instance,
      `/rest/api/2/issue/${key}/comment`,
      {},
      'comments',
      100
    );
    comments = commentData.map(c => ({
      id: c.id,
      author: c.author ? (c.author.name || c.author.accountId || c.author.displayName) : 'unknown',
      body: c.body,
      created: c.created,
      updated: c.updated,
    }));
  } catch {
    // Comments not accessible
  }

  // Extract attachment metadata (not binary)
  const attachments = (issue.fields.attachment || []).map(a => ({
    id: a.id,
    filename: a.filename,
    size: a.size,
    mimeType: a.mimeType,
    author: a.author ? (a.author.name || a.author.accountId) : 'unknown',
    created: a.created,
    contentUrl: a.content, // URL to download (requires auth)
  }));

  // Extract issue links
  const links = (issue.fields.issuelinks || []).map(l => ({
    type: l.type.name,
    outwardKey: l.outwardIssue ? l.outwardIssue.key : null,
    inwardKey: l.inwardIssue ? l.inwardIssue.key : null,
  }));

  // Extract changelog
  const changelog = [];
  if (issue.changelog && issue.changelog.histories) {
    for (const history of issue.changelog.histories) {
      changelog.push({
        id: history.id,
        author: history.author ? (history.author.name || history.author.accountId) : 'unknown',
        created: history.created,
        items: history.items.map(item => ({
          field: item.field,
          fieldId: item.fieldId,
          from: item.fromString,
          to: item.toString,
        })),
      });
    }
  }

  return {
    key: issue.key,
    id: issue.id,
    fields: issue.fields,
    comments,
    attachments,
    links,
    changelog,
  };
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const since = flags.since;
  const projectFilter = flags.project ? flags.project.split(',').map(k => k.trim()) : null;

  if (!since) {
    console.error('--since is required. Specify an ISO timestamp.');
    console.error('Example: --since "2026-03-01T00:00:00"');
    process.exit(1);
  }

  // Format for JQL (Jira date format)
  const sinceDate = new Date(since);
  const jqlDate = `"${sinceDate.toISOString().slice(0, 16).replace('T', ' ')}"`;

  let jql = `updated >= ${jqlDate}`;
  if (projectFilter) {
    jql = `project in (${projectFilter.map(k => `"${k}"`).join(',')}) AND ${jql}`;
  }
  jql += ' ORDER BY key ASC';

  console.log(`\nExtracting delta since ${since}...`);
  console.log(`JQL: ${jql}\n`);

  // Get matching issue keys
  const allIssues = [];
  let startAt = 0;
  const pageSize = 100;

  while (true) {
    const result = await post(config.source, '/rest/api/2/search', {
      jql,
      startAt,
      maxResults: pageSize,
      fields: ['key'],
    });

    if (!result.issues || result.issues.length === 0) break;

    const keys = result.issues.map(i => i.key);
    console.log(`  Found ${keys.length} issues (batch ${startAt / pageSize + 1}, total so far: ${startAt + keys.length} of ${result.total})`);

    for (const key of keys) {
      process.stdout.write(`    ${key}...`);
      try {
        const issue = await extractIssue(config.source, key);
        allIssues.push(issue);
        console.log(` OK (${issue.comments.length} comments, ${issue.attachments.length} attachments)`);
      } catch (err) {
        console.log(` ERROR: ${err.message}`);
        allIssues.push({ key, error: err.message });
      }
    }

    if (result.issues.length < pageSize) break;
    startAt += result.issues.length;
  }

  // Generate filename with timestamp
  const ts = new Date().toISOString().slice(0, 16).replace(':', '-');
  const filename = `delta-${ts}.json`;

  const output = {
    timestamp: new Date().toISOString(),
    since,
    jql,
    issueCount: allIssues.length,
    errorCount: allIssues.filter(i => i.error).length,
    issues: allIssues,
  };

  writeOutput(config, output, 'extract', filename);

  console.log(`\nExtracted ${allIssues.length} issues (${output.errorCount} errors)`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
