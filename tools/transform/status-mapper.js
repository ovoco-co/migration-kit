#!/usr/bin/env node
/**
 * status-mapper.js - Validate status mapping CSV against actual issue data.
 *
 * Reads the status mapping CSV, workflow inventory, and issue counts.
 * Validates that every source status with issues has a valid target status.
 * Warns on category misalignment.
 *
 * Usage:
 *   node tools/transform/status-mapper.js [--mapping path/to/status-mapping.csv] [--live]
 *
 * Input:
 *   output/extract/workflows-source.json
 *   output/extract/issue-counts-source.json
 *   templates/status-mapping.csv (or --mapping override)
 *
 * Output:
 *   output/transform/status-map.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, get, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/transform/status-mapper.js [options]

Options:
  --mapping <path>   Path to status mapping CSV (default: templates/status-mapping.csv)
  --live             Validate target statuses exist via API
  --help             Show this help
`.trim();

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle commas in quoted fields
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());
    if (values.length < headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }
  return rows;
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const mappingPath = flags.mapping || path.resolve('templates', 'status-mapping.csv');
  const live = flags.live;

  // Load workflow inventory
  const workflowPath = path.resolve(config.outputDir || './output', 'extract', 'workflows-source.json');
  let sourceStatuses = new Map();
  if (fs.existsSync(workflowPath)) {
    const workflows = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    for (const wf of workflows) {
      for (const s of wf.statuses) {
        sourceStatuses.set(s.name.toLowerCase(), {
          name: s.name,
          category: s.category,
          workflows: [...(sourceStatuses.get(s.name.toLowerCase())?.workflows || []), wf.name],
        });
      }
    }
    console.log(`Loaded ${sourceStatuses.size} unique statuses from workflow inventory`);
  } else {
    console.log('Warning: No workflow inventory found. Skipping workflow cross-reference.');
  }

  // Load issue counts to find statuses with actual issues
  const countsPath = path.resolve(config.outputDir || './output', 'extract', 'issue-counts-source.json');
  const statusesWithIssues = new Set();
  if (fs.existsSync(countsPath)) {
    const counts = JSON.parse(fs.readFileSync(countsPath, 'utf8'));
    for (const proj of counts.projects) {
      for (const s of proj.byStatus) {
        if (s.count > 0) statusesWithIssues.add(s.status.toLowerCase());
      }
    }
    console.log(`Found ${statusesWithIssues.size} statuses with actual issues`);
  } else {
    console.log('Warning: No issue counts found. Cannot verify status coverage.');
  }

  // Load mapping CSV
  if (!fs.existsSync(mappingPath)) {
    console.error(`Missing ${mappingPath}. Copy from templates/status-mapping.csv and fill in.`);
    process.exit(1);
  }
  const mappingText = fs.readFileSync(mappingPath, 'utf8');
  const mappings = parseCSV(mappingText);

  if (mappings.length === 0) {
    console.error('Status mapping CSV is empty. Fill in the mapping before running this script.');
    process.exit(1);
  }

  console.log(`\nValidating ${mappings.length} status mappings...\n`);

  // Build mapping lookup
  const mappingBySource = new Map();
  for (const m of mappings) {
    mappingBySource.set(m.source_status.toLowerCase(), m);
  }

  const errors = [];
  const warnings = [];
  const statusMap = {};

  // Check every status with issues has a mapping
  for (const statusName of statusesWithIssues) {
    if (!mappingBySource.has(statusName)) {
      errors.push(`Status "${statusName}" has issues but no mapping in CSV`);
    }
  }

  // Validate each mapping
  for (const m of mappings) {
    if (!m.target_status) {
      errors.push(`Mapping for "${m.source_status}" missing target_status`);
      continue;
    }

    // Category alignment check
    if (m.source_category && m.target_category) {
      const sc = m.source_category.toLowerCase();
      const tc = m.target_category.toLowerCase();
      if (sc === 'done' && tc !== 'done') {
        warnings.push(`Category mismatch: "${m.source_status}" is Done but target "${m.target_status}" is ${m.target_category}`);
      }
      if (sc !== 'done' && tc === 'done') {
        warnings.push(`Category mismatch: "${m.source_status}" is ${m.source_category} but target "${m.target_status}" is Done -- open issues will appear resolved`);
      }
    }

    // Cross-reference with workflow inventory
    const sourceInfo = sourceStatuses.get(m.source_status.toLowerCase());
    if (sourceInfo && m.source_category) {
      if (sourceInfo.category.toLowerCase() !== m.source_category.toLowerCase()) {
        warnings.push(`CSV source_category "${m.source_category}" for "${m.source_status}" does not match workflow inventory category "${sourceInfo.category}"`);
      }
    }

    statusMap[m.source_status] = {
      sourceStatus: m.source_status,
      sourceCategory: m.source_category || (sourceInfo ? sourceInfo.category : ''),
      targetStatus: m.target_status,
      targetCategory: m.target_category,
      hasIssues: statusesWithIssues.has(m.source_status.toLowerCase()),
      notes: m.notes,
    };
  }

  // Live validation: check target statuses exist
  if (live) {
    console.log('Validating target statuses via API...');
    try {
      const targetStatuses = await get(config.target, '/rest/api/2/status');
      const targetStatusNames = new Set(targetStatuses.map(s => s.name.toLowerCase()));

      for (const m of mappings) {
        if (m.target_status && !targetStatusNames.has(m.target_status.toLowerCase())) {
          errors.push(`Target status "${m.target_status}" does not exist on target instance`);
        }
      }
      console.log(`  ${targetStatuses.length} statuses found on target`);
    } catch (err) {
      warnings.push(`Could not validate target statuses: ${err.message}`);
    }
  }

  // Report
  console.log(`\n=== Status Mapping Validation ===`);
  console.log(`  Mappings processed:     ${mappings.length}`);
  console.log(`  Statuses with issues:   ${statusesWithIssues.size}`);
  console.log(`  Covered by mapping:     ${[...statusesWithIssues].filter(s => mappingBySource.has(s)).length}`);
  console.log(`  Errors:                 ${errors.length}`);
  console.log(`  Warnings:               ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n  ERRORS (must fix):');
    for (const e of errors) console.log(`    ${e}`);
  }
  if (warnings.length > 0) {
    console.log('\n  WARNINGS (review):');
    for (const w of warnings) console.log(`    ${w}`);
  }

  if (errors.length > 0) {
    console.error('\nStatus mapping has errors. Fix the CSV and re-run.');
    process.exit(1);
  }

  writeOutput(config, statusMap, 'transform', 'status-map.json');
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
