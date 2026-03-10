#!/usr/bin/env node
/**
 * extract-projects.js - Extract Jira projects and map to GitLab project structure.
 *
 * Pulls project list from the Jira source instance and generates a mapping
 * file for creating or linking GitLab projects. Also extracts issue types,
 * priorities, and resolutions to prepare the label mapping.
 *
 * Usage:
 *   node tools/gitlab/extract-projects.js [--project KEY1,KEY2]
 *
 * Output:
 *   output/gitlab/projects-source.json
 *   output/gitlab/label-defaults.json
 */

const { loadConfig, get, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/gitlab/extract-projects.js [options]

Options:
  --project KEY1,KEY2   Only extract these projects (comma-separated)
  --help                Show this help
`.trim();

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const source = config.source;
  const projectFilter = flags.project ? flags.project.split(',').map(k => k.trim()) : null;

  console.log(`\nExtracting projects from ${source.baseUrl}...`);

  // Fetch all projects
  let projects = await paginate(source, '/rest/api/2/project', {}, null, 50);
  if (projectFilter) {
    projects = projects.filter(p => projectFilter.includes(p.key));
  }

  console.log(`  ${projects.length} projects found`);

  const projectData = [];
  for (const p of projects) {
    // Get project detail for lead, description, category
    let detail;
    try {
      detail = await get(source, `/rest/api/2/project/${p.key}`);
    } catch {
      detail = p;
    }

    projectData.push({
      key: p.key,
      name: p.name,
      description: detail.description || '',
      projectType: detail.projectTypeKey || 'software',
      lead: detail.lead ? detail.lead.displayName : '',
      category: detail.projectCategory ? detail.projectCategory.name : '',
    });
  }

  writeOutput(config, projectData, 'gitlab', 'projects-source.json');

  // Extract issue types, priorities, resolutions for label mapping
  console.log('\nExtracting issue metadata for label mapping...');

  const issueTypes = await get(source, '/rest/api/2/issuetype');
  const priorities = await get(source, '/rest/api/2/priority');
  let resolutions = [];
  try {
    resolutions = await get(source, '/rest/api/2/resolution');
  } catch {
    console.log('  Could not fetch resolutions (may not be available)');
  }

  const labelDefaults = {
    issueTypes: issueTypes.map(t => ({
      name: t.name,
      subtask: t.subtask,
      suggestedLabel: `type::${t.name.toLowerCase().replace(/\s+/g, '-')}`,
    })),
    priorities: priorities.map(p => ({
      name: p.name,
      suggestedLabel: `priority::${p.name.toLowerCase().replace(/\s+/g, '-')}`,
    })),
    resolutions: resolutions.map(r => ({
      name: r.name,
      suggestedLabel: `resolution::${r.name.toLowerCase().replace(/\s+/g, '-')}`,
    })),
    statusCategories: [
      { jiraCategory: 'To Do', suggestedLabel: 'workflow::to-do' },
      { jiraCategory: 'In Progress', suggestedLabel: 'workflow::in-progress' },
      { jiraCategory: 'Done', suggestedLabel: 'workflow::done' },
    ],
  };

  writeOutput(config, labelDefaults, 'gitlab', 'label-defaults.json');

  console.log(`\nExtracted ${projectData.length} projects, ${issueTypes.length} issue types, ${priorities.length} priorities`);
  console.log('Next: review label-defaults.json and edit the label mapping CSV');
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
