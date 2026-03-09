#!/usr/bin/env node
/**
 * scriptrunner-audit.js - Inventory ScriptRunner configuration from a DC instance.
 *
 * Pulls all ScriptRunner config via the ScriptRunner REST API and auto-categorizes
 * each item for Cloud compatibility.
 *
 * Usage:
 *   node tools/extract/scriptrunner-audit.js
 *
 * Output:
 *   output/extract/scriptrunner-audit.json
 *
 * Requires ScriptRunner installed on the source DC instance with admin access.
 */

const { loadConfig, get, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/scriptrunner-audit.js

Extracts ScriptRunner configuration from the source DC instance.
Requires ScriptRunner REST API access (/rest/scriptrunner/latest/).

Options:
  --help   Show this help
`.trim();

// Cloud compatibility categories
const COMPAT = {
  CLOUD_SR: 'cloud-scriptrunner',      // Likely works on ScriptRunner Cloud
  CLOUD_AUTO: 'cloud-automation',       // Replaceable with Jira Automation
  FORGE: 'forge-app',                   // Needs Forge app
  PROCESS: 'process-change',            // Needs process redesign
  UNKNOWN: 'unknown',                   // Manual review needed
};

// DC-only features that have no Cloud ScriptRunner equivalent
const DC_ONLY_FEATURES = [
  'behaviour',
  'rest-endpoint',
  'escalation-service',
  'hapi',
];

function categorize(type, item) {
  // Behaviours are DC-only
  if (type === 'behaviours') return COMPAT.FORGE;

  // Custom REST endpoints are DC-only
  if (type === 'rest-endpoints') return COMPAT.FORGE;

  // Escalation Services are DC-only
  if (type === 'escalation-services') return COMPAT.CLOUD_AUTO;

  // Script fields
  if (type === 'script-fields') {
    const script = (item.scriptBody || item.script || '').toLowerCase();
    // Simple field calculations often work on Cloud SR
    if (script.length < 500 && !script.includes('import ') && !script.includes('sql')) {
      return COMPAT.CLOUD_SR;
    }
    // Complex scripts with imports, SQL, or heavy JVM usage
    if (script.includes('import ') || script.includes('sql') || script.includes('connection')) {
      return COMPAT.FORGE;
    }
    return COMPAT.UNKNOWN;
  }

  // Listeners
  if (type === 'listeners') {
    const script = (item.scriptBody || item.script || '').toLowerCase();
    // Simple listeners (set field, send notification) often map to Automation
    if (script.includes('setcustomfieldvalue') || script.includes('customfield')) {
      return COMPAT.CLOUD_AUTO;
    }
    if (script.length < 500) {
      return COMPAT.CLOUD_SR;
    }
    return COMPAT.UNKNOWN;
  }

  // Workflow post-functions
  if (type === 'workflow-functions') {
    const script = (item.scriptBody || item.script || '').toLowerCase();
    if (!script) return COMPAT.UNKNOWN;
    // Simple field updates
    if (script.includes('setcustomfieldvalue') && script.length < 300) {
      return COMPAT.CLOUD_AUTO;
    }
    // Create linked issue
    if (script.includes('createissue') || script.includes('issueservice.create')) {
      return COMPAT.CLOUD_AUTO;
    }
    // Send email
    if (script.includes('mailserver') || script.includes('sendemail')) {
      return COMPAT.CLOUD_AUTO;
    }
    if (script.length < 500) {
      return COMPAT.CLOUD_SR;
    }
    return COMPAT.UNKNOWN;
  }

  // Scheduled jobs
  if (type === 'scheduled-jobs') {
    return COMPAT.CLOUD_AUTO; // Most map to scheduled Automation rules
  }

  return COMPAT.UNKNOWN;
}

async function fetchEndpoint(instance, path, label) {
  try {
    const data = await get(instance, path);
    const items = Array.isArray(data) ? data : (data.values || data.results || []);
    console.log(`  ${label}: ${items.length}`);
    return items;
  } catch (err) {
    if (err.message.includes('404')) {
      console.log(`  ${label}: not found (endpoint may not exist)`);
    } else if (err.message.includes('403') || err.message.includes('401')) {
      console.log(`  ${label}: access denied (need admin permissions)`);
    } else {
      console.log(`  ${label}: error (${err.message})`);
    }
    return [];
  }
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const instance = config.source;

  if (instance.type !== 'dc') {
    console.log('Warning: ScriptRunner audit is designed for DC instances.');
    console.log('Cloud ScriptRunner has a different API. Proceeding anyway...\n');
  }

  console.log(`\nAuditing ScriptRunner on ${instance.baseUrl}...`);

  const audit = {
    timestamp: new Date().toISOString(),
    instance: instance.baseUrl,
    scriptFields: [],
    listeners: [],
    behaviours: [],
    escalationServices: [],
    restEndpoints: [],
    scheduledJobs: [],
    workflowFunctions: [],
    summary: {},
  };

  // ScriptRunner REST API endpoints (DC)
  const endpoints = [
    { path: '/rest/scriptrunner/latest/custom/customadmin/com.onresolve.scriptrunner.canned.jira.fields.CustomScriptField', type: 'script-fields', label: 'Script fields', key: 'scriptFields' },
    { path: '/rest/scriptrunner/latest/listeners', type: 'listeners', label: 'Listeners', key: 'listeners' },
    { path: '/rest/scriptrunner/latest/behaviours', type: 'behaviours', label: 'Behaviours', key: 'behaviours' },
    { path: '/rest/scriptrunner/latest/escalationServices', type: 'escalation-services', label: 'Escalation Services', key: 'escalationServices' },
    { path: '/rest/scriptrunner/latest/custom/customadmin/com.onresolve.scriptrunner.canned.common.rest.CustomEndpoint', type: 'rest-endpoints', label: 'REST endpoints', key: 'restEndpoints' },
    { path: '/rest/scriptrunner/latest/scheduledJobs', type: 'scheduled-jobs', label: 'Scheduled jobs', key: 'scheduledJobs' },
  ];

  for (const ep of endpoints) {
    const items = await fetchEndpoint(instance, ep.path, ep.label);
    audit[ep.key] = items.map(item => ({
      ...item,
      _cloudCompatibility: categorize(ep.type, item),
      _type: ep.type,
    }));
  }

  // Summary
  const allItems = [
    ...audit.scriptFields,
    ...audit.listeners,
    ...audit.behaviours,
    ...audit.escalationServices,
    ...audit.restEndpoints,
    ...audit.scheduledJobs,
    ...audit.workflowFunctions,
  ];

  const byCat = {};
  for (const item of allItems) {
    const cat = item._cloudCompatibility;
    byCat[cat] = (byCat[cat] || 0) + 1;
  }

  audit.summary = {
    total: allItems.length,
    byCategory: byCat,
    dcOnlyCount: (audit.behaviours.length + audit.restEndpoints.length + audit.escalationServices.length),
  };

  writeOutput(config, audit, 'extract', 'scriptrunner-audit.json');
  printSummary(audit);
}

function printSummary(audit) {
  console.log('\n=== ScriptRunner Audit Summary ===');
  console.log(`  Total items:                     ${audit.summary.total}`);
  console.log(`  DC-only features:                ${audit.summary.dcOnlyCount}`);
  console.log('');
  console.log('  Cloud compatibility breakdown:');
  for (const [cat, count] of Object.entries(audit.summary.byCategory || {})) {
    const label = {
      'cloud-scriptrunner': 'ScriptRunner Cloud (likely works)',
      'cloud-automation': 'Jira Automation (rebuild as rule)',
      'forge-app': 'Forge app (needs development)',
      'process-change': 'Process change (no tech equivalent)',
      'unknown': 'Manual review needed',
    }[cat] || cat;
    console.log(`    ${label}: ${count}`);
  }

  if (audit.behaviours.length > 0) {
    console.log(`\n  Behaviours (DC-only, need Cloud Forms or Forge):`);
    for (const b of audit.behaviours.slice(0, 10)) {
      console.log(`    ${b.name || b.description || 'unnamed'}`);
    }
    if (audit.behaviours.length > 10) {
      console.log(`    ... and ${audit.behaviours.length - 10} more`);
    }
  }

  if (audit.restEndpoints.length > 0) {
    console.log(`\n  Custom REST endpoints (DC-only, need Jira REST API or Forge):`);
    for (const r of audit.restEndpoints.slice(0, 10)) {
      console.log(`    ${r.httpMethod || 'GET'} ${r.path || r.name || 'unnamed'}`);
    }
    if (audit.restEndpoints.length > 10) {
      console.log(`    ... and ${audit.restEndpoints.length - 10} more`);
    }
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
