#!/usr/bin/env node
/**
 * workflow-inventory.js - Extract all workflows with full transition detail.
 *
 * Flags transitions that use ScriptRunner post-functions (class contains 'com.onresolve').
 *
 * Usage:
 *   node tools/extract/workflow-inventory.js [--side source|target]
 *
 * Output:
 *   output/extract/workflows-source.json (or workflows-target.json)
 */

const { loadConfig, get, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/workflow-inventory.js [options]

Options:
  --side source|target  Which instance to query (default: source)
  --help                Show this help
`.trim();

const SCRIPTRUNNER_CLASSES = [
  'com.onresolve',
  'com.adaptavist',
  'scriptrunner',
];

function isScriptRunner(className) {
  if (!className) return false;
  const lower = className.toLowerCase();
  return SCRIPTRUNNER_CLASSES.some(c => lower.includes(c));
}

function classifyExtensions(items) {
  if (!items || !Array.isArray(items)) return [];
  return items.map(item => ({
    name: item.name || item.id || 'unknown',
    type: item.type || 'unknown',
    className: item.configuration ? item.configuration.class : null,
    isScriptRunner: isScriptRunner(item.configuration ? item.configuration.class : null),
    configuration: item.configuration || null,
  }));
}

async function fetchWorkflows(instance, label) {
  console.log(`\nFetching workflows from ${label} (${instance.baseUrl})...`);

  // Get workflow list
  const workflowList = await paginate(instance, '/rest/api/2/workflow', {}, 'values', 50);
  console.log(`  Found ${workflowList.length} workflows`);

  const workflows = [];

  for (const wf of workflowList) {
    process.stdout.write(`  ${wf.name}...`);

    const workflow = {
      name: wf.name,
      description: wf.description || '',
      isDefault: wf.isDefault || false,
      statuses: [],
      transitions: [],
      scriptRunnerCount: 0,
    };

    // Get detailed workflow with transitions
    // DC: /rest/api/2/workflow/{name}/transitions  (not always available)
    // Alternative: use /rest/api/2/workflow?workflowName=X&expand=transitions
    try {
      const encodedName = encodeURIComponent(wf.name);
      // Try the detailed endpoint
      const detail = await get(
        instance,
        `/rest/api/2/workflow?workflowName=${encodedName}`
      );

      if (detail && detail.length > 0) {
        const d = detail[0];

        // Statuses
        if (d.statuses) {
          workflow.statuses = d.statuses.map(s => ({
            id: s.id,
            name: s.name,
            category: s.statusCategory ? s.statusCategory.name : 'unknown',
          }));
        }

        // Transitions (from the workflow scheme layout or transitions endpoint)
        if (d.transitions) {
          for (const t of d.transitions) {
            const transition = {
              id: t.id,
              name: t.name,
              from: t.from || 'any',
              to: t.to || 'unknown',
              conditions: classifyExtensions(t.conditions),
              validators: classifyExtensions(t.validators),
              postFunctions: classifyExtensions(t.postFunctions),
            };

            const srCount = [
              ...transition.conditions,
              ...transition.validators,
              ...transition.postFunctions,
            ].filter(x => x.isScriptRunner).length;

            transition.scriptRunnerCount = srCount;
            workflow.scriptRunnerCount += srCount;
            workflow.transitions.push(transition);
          }
        }
      }
    } catch {
      // Detailed endpoint not available; record what we have from the list
      if (wf.statuses) {
        workflow.statuses = wf.statuses.map(s => ({
          id: s.id,
          name: s.name,
          category: s.statusCategory ? s.statusCategory.name : 'unknown',
        }));
      }
    }

    const srLabel = workflow.scriptRunnerCount > 0
      ? ` [${workflow.scriptRunnerCount} ScriptRunner]`
      : '';
    console.log(` ${workflow.statuses.length} statuses, ${workflow.transitions.length} transitions${srLabel}`);

    workflows.push(workflow);
  }

  return workflows;
}

function printSummary(workflows) {
  const totalSR = workflows.reduce((sum, w) => sum + w.scriptRunnerCount, 0);
  const workflowsWithSR = workflows.filter(w => w.scriptRunnerCount > 0);

  console.log('\n=== Workflow Summary ===');
  console.log(`  Total workflows:                ${workflows.length}`);
  console.log(`  Total ScriptRunner extensions:   ${totalSR}`);
  console.log(`  Workflows with ScriptRunner:     ${workflowsWithSR.length}`);

  if (workflowsWithSR.length > 0) {
    console.log('\n  ScriptRunner usage by workflow:');
    for (const w of workflowsWithSR.sort((a, b) => b.scriptRunnerCount - a.scriptRunnerCount)) {
      console.log(`    ${w.name}: ${w.scriptRunnerCount} extensions`);
      for (const t of w.transitions.filter(t => t.scriptRunnerCount > 0)) {
        const types = [];
        const srConditions = t.conditions.filter(x => x.isScriptRunner).length;
        const srValidators = t.validators.filter(x => x.isScriptRunner).length;
        const srPostFunctions = t.postFunctions.filter(x => x.isScriptRunner).length;
        if (srConditions) types.push(`${srConditions} condition(s)`);
        if (srValidators) types.push(`${srValidators} validator(s)`);
        if (srPostFunctions) types.push(`${srPostFunctions} post-function(s)`);
        console.log(`      transition "${t.name}": ${types.join(', ')}`);
      }
    }
  }

  // Flag default workflow
  const defaultWf = workflows.find(w => w.isDefault);
  if (defaultWf) {
    console.log(`\n  Default workflow: "${defaultWf.name}" (cannot be exported by CMJ -- copy and rename if in use)`);
  }
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const side = flags.side || 'source';
  const instance = side === 'target' ? config.target : config.source;

  const workflows = await fetchWorkflows(instance, side);

  const filename = side === 'target' ? 'workflows-target.json' : 'workflows-source.json';
  writeOutput(config, workflows, 'extract', filename);
  printSummary(workflows);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
