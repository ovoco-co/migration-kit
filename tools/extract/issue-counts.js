#!/usr/bin/env node
/**
 * issue-counts.js - Count issues per project, per type, per status.
 *
 * Uses JQL search with grouping to get counts without fetching full issues.
 * Establishes the baseline for post-migration validation.
 *
 * Usage:
 *   node tools/extract/issue-counts.js [--project KEY1,KEY2] [--side source|target]
 *
 * Output:
 *   output/extract/issue-counts-source.json (or issue-counts-target.json)
 */

const { loadConfig, get, post, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/issue-counts.js [options]

Options:
  --project KEY1,KEY2   Only count issues in these projects (comma-separated)
  --side source|target  Which instance to query (default: source)
  --help                Show this help
`.trim();

async function getProjects(instance) {
  console.log('  Fetching project list...');
  const projects = await paginate(instance, '/rest/api/2/project', {}, null, 50);
  return projects.map(p => ({
    id: p.id,
    key: p.key,
    name: p.name,
    projectTypeKey: p.projectTypeKey,
  }));
}

async function countByJql(instance, jql) {
  // Use search with maxResults=0 to get just the total
  const data = await post(instance, '/rest/api/2/search', {
    jql,
    maxResults: 0,
    fields: [],
  });
  return data.total || 0;
}

async function getStatusesForProject(instance, projectKey) {
  try {
    const statuses = await get(instance, `/rest/api/2/project/${projectKey}/statuses`);
    // Returns array of issue types, each with an array of statuses
    const allStatuses = new Set();
    for (const issueType of statuses) {
      for (const status of issueType.statuses) {
        allStatuses.add(JSON.stringify({
          id: status.id,
          name: status.name,
          category: status.statusCategory ? status.statusCategory.name : 'unknown',
        }));
      }
    }
    return [...allStatuses].map(s => JSON.parse(s));
  } catch {
    return [];
  }
}

async function getIssueTypes(instance) {
  const types = await get(instance, '/rest/api/2/issuetype');
  return types.map(t => ({
    id: t.id,
    name: t.name,
    subtask: t.subtask,
  }));
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const side = flags.side || 'source';
  const instance = side === 'target' ? config.target : config.source;
  const projectFilter = flags.project ? flags.project.split(',').map(k => k.trim()) : null;

  console.log(`\nCounting issues on ${side} (${instance.baseUrl})...`);

  // Get all projects
  let projects = await getProjects(instance);
  if (projectFilter) {
    projects = projects.filter(p => projectFilter.includes(p.key));
    if (projects.length === 0) {
      console.error(`No projects matched filter: ${projectFilter.join(', ')}`);
      process.exit(1);
    }
  }
  console.log(`  ${projects.length} projects to count`);

  // Get issue types
  const issueTypes = await getIssueTypes(instance);

  const results = {
    timestamp: new Date().toISOString(),
    instance: instance.baseUrl,
    side,
    projects: [],
  };

  let grandTotal = 0;

  for (const project of projects) {
    process.stdout.write(`  ${project.key} (${project.name})...`);

    const projectData = {
      key: project.key,
      name: project.name,
      total: 0,
      byType: [],
      byStatus: [],
    };

    // Total count
    projectData.total = await countByJql(instance, `project = "${project.key}"`);
    grandTotal += projectData.total;

    if (projectData.total === 0) {
      console.log(` 0 issues`);
      results.projects.push(projectData);
      continue;
    }

    // Count by issue type
    for (const type of issueTypes) {
      const count = await countByJql(
        instance,
        `project = "${project.key}" AND issuetype = "${type.name}"`
      );
      if (count > 0) {
        projectData.byType.push({
          type: type.name,
          typeId: type.id,
          count,
        });
      }
    }

    // Count by status
    const statuses = await getStatusesForProject(instance, project.key);
    for (const status of statuses) {
      const count = await countByJql(
        instance,
        `project = "${project.key}" AND status = "${status.name}"`
      );
      if (count > 0) {
        projectData.byStatus.push({
          status: status.name,
          statusId: status.id,
          category: status.category,
          count,
        });
      }
    }

    console.log(` ${projectData.total} issues (${projectData.byType.length} types, ${projectData.byStatus.length} statuses)`);
    results.projects.push(projectData);
  }

  results.grandTotal = grandTotal;

  const filename = side === 'target' ? 'issue-counts-target.json' : 'issue-counts-source.json';
  writeOutput(config, results, 'extract', filename);

  console.log(`\nTotal: ${grandTotal} issues across ${projects.length} projects`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
