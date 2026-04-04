#!/usr/bin/env node
/**
 * import-issues.js - Import extracted Jira issues into a GitLab project.
 *
 * Reads the normalized issue JSON from extract-issues.js and creates GitLab
 * issues with labels, comments, assignees, and state. Handles user mapping,
 * label creation, and attachment migration.
 *
 * Usage:
 *   node tools/gitlab/import-issues.js --file output/gitlab/issues-KEY.json --gitlab-project ID
 *     [--user-map output/transform/user-map.json]
 *     [--dry-run]
 *     [--skip-attachments]
 *     [--skip-comments]
 *
 * Output:
 *   output/gitlab/import-results-{KEY}.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, get: jiraGet, writeOutput, parseFlags } = require('../lib/client');
const { loadGitLabConfig, glGet, glPost, glPut, glPaginate } = require('./gitlab-client');

const USAGE = `
Usage: node tools/gitlab/import-issues.js --file <path> --gitlab-project <id> [options]

Options:
  --file <path>             Path to extracted issues JSON (required)
  --gitlab-project <id>     GitLab project ID or path (required)
  --user-map <path>         User mapping JSON (email-to-username)
  --dry-run                 Validate without creating anything
  --skip-attachments        Do not migrate attachments
  --skip-comments           Do not migrate comments
  --batch-delay <ms>        Delay between API calls in ms (default 200)
  --help                    Show this help
`.trim();

async function ensureLabelsExist(glConfig, projectId, labels) {
  // Get existing labels
  const existing = await glPaginate(
    glConfig,
    `/api/v4/projects/${projectId}/labels`
  );
  const existingNames = new Set(existing.map(l => l.name));

  const created = [];
  for (const label of labels) {
    if (existingNames.has(label)) continue;

    // Assign colors based on label prefix
    let color = '#428BCA'; // default blue
    if (label.startsWith('type::')) color = '#7F8C8D';
    else if (label.startsWith('priority::')) color = '#E67E22';
    else if (label.startsWith('workflow::')) color = '#2ECC71';
    else if (label.startsWith('component::')) color = '#9B59B6';
    else if (label.startsWith('resolution::')) color = '#1ABC9C';

    try {
      await glPost(glConfig, `/api/v4/projects/${projectId}/labels`, {
        name: label,
        color,
      });
      created.push(label);
      existingNames.add(label);
    } catch (err) {
      // Label may already exist (race condition or scoped label)
      if (!err.message.includes('409') && !err.message.includes('already exists')) {
        console.error(`  Warning: could not create label "${label}": ${err.message}`);
      }
    }
  }

  if (created.length > 0) {
    console.log(`  Created ${created.length} new labels`);
  }
}

function resolveAssignee(issue, userMap) {
  if (!issue.assignee) return null;
  const email = issue.assignee.email;
  if (userMap && email && userMap[email]) {
    return userMap[email];
  }
  return null;
}

async function uploadAttachment(glConfig, jiraConfig, projectId, attachment) {
  // Download from Jira
  const jiraHeaders = {
    Authorization: 'Basic ' + Buffer.from(
      `${jiraConfig.auth.username || jiraConfig.auth.email}:${jiraConfig.auth.token}`
    ).toString('base64'),
  };

  const resp = await fetch(attachment.contentUrl, { headers: jiraHeaders });
  if (!resp.ok) {
    throw new Error(`Failed to download ${attachment.filename}: HTTP ${resp.status}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());

  // Upload to GitLab
  const boundary = '----MigrationKitBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${attachment.filename}"\r\nContent-Type: ${attachment.mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const glHeaders = {
    'PRIVATE-TOKEN': glConfig.token,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  };

  const uploadResp = await fetch(
    `${glConfig.baseUrl}/api/v4/projects/${projectId}/uploads`,
    { method: 'POST', headers: glHeaders, body }
  );

  if (!uploadResp.ok) {
    throw new Error(`Failed to upload ${attachment.filename}: HTTP ${uploadResp.status}`);
  }

  return uploadResp.json();
}

function buildDescription(issue, attachmentLinks) {
  let desc = '';

  // Original Jira metadata header
  desc += `> Migrated from Jira ${issue.jiraKey}\n`;
  desc += `> Original reporter: ${issue.reporter ? issue.reporter.name : 'Unknown'}\n`;
  desc += `> Created: ${issue.created}\n`;
  if (issue.dueDate) desc += `> Due date: ${issue.dueDate}\n`;
  if (issue.storyPoints) desc += `> Story points: ${issue.storyPoints}\n`;
  if (issue.resolution) desc += `> Resolution: ${issue.resolution}\n`;
  desc += '\n---\n\n';

  // Issue body
  desc += issue.description || '*No description provided.*';

  // Attachment references
  if (attachmentLinks && attachmentLinks.length > 0) {
    desc += '\n\n---\n\n**Attachments:**\n';
    for (const att of attachmentLinks) {
      desc += `- ${att}\n`;
    }
  }

  // Linked issues
  if (issue.links && issue.links.length > 0) {
    desc += '\n\n**Linked Jira issues:**\n';
    for (const link of issue.links) {
      desc += `- ${link.type} (${link.direction}): ${link.linkedKey} - ${link.linkedSummary}\n`;
    }
  }

  return desc;
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help || !flags.file || !flags['gitlab-project']) {
    console.log(USAGE);
    return;
  }

  const config = loadConfig();
  const glFullConfig = loadGitLabConfig();
  const glConfig = glFullConfig.gitlab;
  const projectId = encodeURIComponent(flags['gitlab-project']);
  const dryRun = !!flags['dry-run'];
  const skipAttachments = !!flags['skip-attachments'];
  const skipComments = !!flags['skip-comments'];
  const batchDelay = parseInt(flags['batch-delay'] || '200', 10);

  // Load extracted issues
  const issueData = JSON.parse(fs.readFileSync(flags.file, 'utf8'));
  const issues = issueData.issues;
  console.log(`\nLoaded ${issues.length} issues from ${flags.file}`);

  // Load user map if provided
  let userMap = null;
  if (flags['user-map']) {
    userMap = JSON.parse(fs.readFileSync(flags['user-map'], 'utf8'));
    console.log(`Loaded user map with ${Object.keys(userMap).length} entries`);
  }

  if (dryRun) {
    console.log('\n*** DRY RUN - no changes will be made ***\n');
  }

  // Collect all unique labels
  const allLabels = new Set();
  for (const issue of issues) {
    for (const label of issue.suggestedLabels) {
      allLabels.add(label);
    }
  }

  console.log(`\n${allLabels.size} unique labels needed`);

  if (!dryRun) {
    await ensureLabelsExist(glConfig, projectId, [...allLabels]);
  }

  // Import issues
  const results = {
    timestamp: new Date().toISOString(),
    project: issueData.project,
    gitlabProject: flags['gitlab-project'],
    dryRun,
    total: issues.length,
    created: 0,
    failed: 0,
    errors: [],
    mapping: {},  // jiraKey -> gitlabIssueIid
  };

  // Check for previously imported issues to enable safe re-runs
  console.log('Checking for previously imported issues...');
  const existingIssues = await glPaginate(
    glConfig,
    `/api/v4/projects/${projectId}/issues?per_page=100&state=all`
  );
  const importedKeys = new Set();
  for (const gi of existingIssues) {
    if (!gi.description) continue;
    const match = gi.description.match(/Migrated from Jira ([A-Z][A-Z0-9]+-\d+)/);
    if (match) importedKeys.add(match[1]);
  }
  if (importedKeys.size > 0) {
    console.log(`Found ${importedKeys.size} previously imported issues, will skip duplicates`);
  }

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    process.stdout.write(`  [${i + 1}/${issues.length}] ${issue.jiraKey}...`);

    if (importedKeys.has(issue.jiraKey)) {
      results.mapping[issue.jiraKey] = '(skipped-existing)';
      console.log(' SKIP (already imported)');
      continue;
    }

    if (dryRun) {
      results.mapping[issue.jiraKey] = `(dry-run)`;
      results.created++;
      console.log(' OK (dry-run)');
      continue;
    }

    try {
      // Upload attachments first to get markdown links
      let attachmentLinks = [];
      if (!skipAttachments && issue.attachments.length > 0) {
        for (const att of issue.attachments) {
          try {
            const uploaded = await uploadAttachment(glConfig, config.source, projectId, att);
            attachmentLinks.push(uploaded.markdown || `[${att.filename}](${uploaded.url})`);
          } catch (err) {
            console.error(`\n    Attachment warning: ${att.filename}: ${err.message}`);
          }
        }
      }

      // Build description with metadata header
      const description = buildDescription(issue, attachmentLinks);

      // Resolve assignee
      const assigneeUsername = resolveAssignee(issue, userMap);
      let assigneeId = null;
      if (assigneeUsername) {
        try {
          const users = await glGet(glConfig, `/api/v4/users?username=${assigneeUsername}`);
          if (Array.isArray(users) && users.length > 0) {
            assigneeId = users[0].id;
          }
        } catch { /* skip assignment */ }
      }

      // Create issue
      const body = {
        title: issue.title,
        description,
        labels: issue.suggestedLabels.join(','),
        created_at: issue.created,
      };
      if (assigneeId) body.assignee_ids = [assigneeId];
      if (issue.dueDate) body.due_date = issue.dueDate;
      if (issue.storyPoints) body.weight = Math.round(issue.storyPoints);

      const created = await glPost(glConfig, `/api/v4/projects/${projectId}/issues`, body);
      const iid = created.iid;
      results.mapping[issue.jiraKey] = iid;

      // Add comments
      if (!skipComments && issue.comments.length > 0) {
        for (const comment of issue.comments) {
          const noteBody = `> *${comment.author}* commented on ${comment.created}:\n\n${comment.body}`;
          await glPost(glConfig, `/api/v4/projects/${projectId}/issues/${iid}/notes`, {
            body: noteBody,
            created_at: comment.created,
          });
        }
      }

      // Close if resolved
      if (issue.gitlabState === 'closed') {
        await glPut(glConfig, `/api/v4/projects/${projectId}/issues/${iid}`, {
          state_event: 'close',
          updated_at: issue.updated,
        });
      }

      results.created++;
      console.log(` #${iid}`);

    } catch (err) {
      results.failed++;
      results.errors.push({ jiraKey: issue.jiraKey, error: err.message });
      console.log(` FAILED: ${err.message}`);
    }

    // Rate limit courtesy
    if (batchDelay > 0) {
      await new Promise(r => setTimeout(r, batchDelay));
    }
  }

  writeOutput(config, results, 'gitlab', `import-results-${issueData.project}.json`);

  console.log(`\n=== Import Summary ===`);
  console.log(`  Total:   ${results.total}`);
  console.log(`  Created: ${results.created}`);
  console.log(`  Failed:  ${results.failed}`);
  if (results.failed > 0) {
    console.log('\n  Errors:');
    for (const e of results.errors) {
      console.log(`    ${e.jiraKey}: ${e.error}`);
    }
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
