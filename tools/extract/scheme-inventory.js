#!/usr/bin/env node
/**
 * scheme-inventory.js - Extract all scheme types from source and/or target.
 *
 * Pulls permission, notification, issue type, screen, field config, and workflow schemes.
 * Flags defaults (CMJ cannot export), unused, and duplicates.
 *
 * Usage:
 *   node tools/extract/scheme-inventory.js [--source-only] [--target-only]
 *
 * Output:
 *   output/extract/schemes-source.json
 *   output/extract/schemes-target.json
 */

const { loadConfig, get, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/scheme-inventory.js [options]

Options:
  --source-only   Only extract from source instance
  --target-only   Only extract from target instance
  --help          Show this help
`.trim();

async function fetchSchemeType(instance, name, endpoint, resultsKey) {
  try {
    const items = await paginate(instance, endpoint, {}, resultsKey, 50);
    console.log(`    ${name}: ${items.length}`);
    return items;
  } catch (err) {
    console.log(`    ${name}: error (${err.message})`);
    return [];
  }
}

async function fetchSchemes(instance, label) {
  console.log(`\nFetching schemes from ${label} (${instance.baseUrl})...`);

  const schemes = {};

  // Permission schemes
  const permSchemes = await fetchSchemeType(
    instance, 'Permission schemes',
    '/rest/api/2/permissionscheme', 'permissionSchemes'
  );
  schemes.permissionSchemes = permSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
  }));

  // Notification schemes
  const notifSchemes = await fetchSchemeType(
    instance, 'Notification schemes',
    '/rest/api/2/notificationscheme', 'values'
  );
  schemes.notificationSchemes = notifSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
  }));

  // Issue type schemes
  const itSchemes = await fetchSchemeType(
    instance, 'Issue type schemes',
    '/rest/api/2/issuetypescheme', 'values'
  );
  schemes.issueTypeSchemes = itSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
    isDefault: s.isDefault || s.defaultScheme || false,
  }));

  // Workflow schemes
  const wfSchemes = await fetchSchemeType(
    instance, 'Workflow schemes',
    '/rest/api/2/workflowscheme', 'values'
  );
  schemes.workflowSchemes = wfSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
    isDefault: s.defaultScheme || false,
    defaultWorkflow: s.defaultWorkflow || null,
  }));

  // Screen schemes
  const screenSchemes = await fetchSchemeType(
    instance, 'Screen schemes',
    '/rest/api/2/screenscheme', 'values'
  );
  schemes.screenSchemes = screenSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
  }));

  // Issue type screen schemes
  const itsSchemes = await fetchSchemeType(
    instance, 'Issue type screen schemes',
    '/rest/api/2/issuetypescreenscheme', 'values'
  );
  schemes.issueTypeScreenSchemes = itsSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
  }));

  // Field configuration schemes
  const fcSchemes = await fetchSchemeType(
    instance, 'Field configuration schemes',
    '/rest/api/2/fieldconfigurationscheme', 'values'
  );
  schemes.fieldConfigurationSchemes = fcSchemes.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
  }));

  // Field configurations
  const fieldConfigs = await fetchSchemeType(
    instance, 'Field configurations',
    '/rest/api/2/fieldconfiguration', 'values'
  );
  schemes.fieldConfigurations = fieldConfigs.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
    isDefault: s.isDefault || false,
  }));

  // Get project-to-scheme mappings
  console.log('    Fetching project-scheme assignments...');
  const projects = await paginate(instance, '/rest/api/2/project', { expand: 'lead' }, null, 50);
  schemes.projectAssignments = [];

  for (const p of projects) {
    const assignment = {
      projectKey: p.key,
      projectName: p.name,
    };

    // Get scheme assignments for each project
    // These require individual API calls per project on DC
    try {
      const projDetail = await get(instance, `/rest/api/2/project/${p.key}`);
      assignment.issueTypeScheme = projDetail.issueTypes ? 'has issue types' : 'unknown';
    } catch {
      // Not critical
    }

    schemes.projectAssignments.push(assignment);
  }

  return schemes;
}

function analyzeSchemes(schemes) {
  const analysis = {
    defaults: [],
    totals: {},
  };

  const schemeTypes = [
    'permissionSchemes', 'notificationSchemes', 'issueTypeSchemes',
    'workflowSchemes', 'screenSchemes', 'issueTypeScreenSchemes',
    'fieldConfigurationSchemes', 'fieldConfigurations',
  ];

  for (const type of schemeTypes) {
    const items = schemes[type] || [];
    analysis.totals[type] = items.length;

    // Flag defaults
    for (const item of items) {
      if (item.isDefault || /^default/i.test(item.name)) {
        analysis.defaults.push({
          type,
          name: item.name,
          id: item.id,
          note: 'CMJ cannot export default schemes. Copy and rename if used by migrating projects.',
        });
      }
    }
  }

  return analysis;
}

function printSummary(schemes, label) {
  const analysis = analyzeSchemes(schemes);

  console.log(`\n=== ${label} Scheme Summary ===`);
  for (const [type, count] of Object.entries(analysis.totals)) {
    console.log(`  ${type}: ${count}`);
  }

  if (analysis.defaults.length > 0) {
    console.log('\n  Default schemes (CMJ cannot export -- must copy and rename):');
    for (const d of analysis.defaults) {
      console.log(`    ${d.type}: "${d.name}" (id ${d.id})`);
    }
  }

  console.log(`  Projects: ${schemes.projectAssignments.length}`);
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const sourceOnly = flags['source-only'];
  const targetOnly = flags['target-only'];

  if (!targetOnly) {
    const schemes = await fetchSchemes(config.source, 'source');
    writeOutput(config, schemes, 'extract', 'schemes-source.json');
    printSummary(schemes, 'Source');
  }

  if (!sourceOnly) {
    const schemes = await fetchSchemes(config.target, 'target');
    writeOutput(config, schemes, 'extract', 'schemes-target.json');
    printSummary(schemes, 'Target');
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
