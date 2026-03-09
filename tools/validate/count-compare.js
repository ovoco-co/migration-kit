#!/usr/bin/env node
/**
 * count-compare.js - Compare issue counts between source extraction and live target.
 *
 * Usage:
 *   node tools/validate/count-compare.js [--project KEY1,KEY2]
 *
 * Input:
 *   output/extract/issue-counts-source.json
 *
 * Output:
 *   output/validate/count-compare.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, post, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/validate/count-compare.js [options]

Compares source issue counts (from extraction) against live target instance.

Options:
  --project KEY1,KEY2   Only compare these projects
  --help                Show this help
`.trim();

async function countByJql(instance, jql) {
  const data = await post(instance, '/rest/api/2/search', {
    jql,
    maxResults: 0,
    fields: [],
  });
  return data.total || 0;
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const projectFilter = flags.project ? flags.project.split(',').map(k => k.trim()) : null;

  // Load source counts
  const countsPath = path.resolve(config.outputDir || './output', 'extract', 'issue-counts-source.json');
  if (!fs.existsSync(countsPath)) {
    console.error(`Missing ${countsPath}. Run issue-counts.js first.`);
    process.exit(1);
  }
  const sourceCounts = JSON.parse(fs.readFileSync(countsPath, 'utf8'));

  // Load status mapping if available (to translate status names)
  const statusMapPath = path.resolve(config.outputDir || './output', 'transform', 'status-map.json');
  let statusMap = {};
  if (fs.existsSync(statusMapPath)) {
    statusMap = JSON.parse(fs.readFileSync(statusMapPath, 'utf8'));
  }

  console.log(`\nComparing counts against target (${config.target.baseUrl})...\n`);

  let projects = sourceCounts.projects;
  if (projectFilter) {
    projects = projects.filter(p => projectFilter.includes(p.key));
  }

  const results = {
    timestamp: new Date().toISOString(),
    sourceTimestamp: sourceCounts.timestamp,
    projects: [],
    summary: { pass: 0, fail: 0, totalDelta: 0 },
  };

  for (const sp of projects) {
    process.stdout.write(`  ${sp.key}...`);

    const comparison = {
      project: sp.key,
      sourceTotal: sp.total,
      targetTotal: 0,
      delta: 0,
      pass: true,
      byType: [],
      byStatus: [],
    };

    // Total count on target
    try {
      comparison.targetTotal = await countByJql(config.target, `project = "${sp.key}"`);
    } catch {
      comparison.targetTotal = -1;
      comparison.pass = false;
      comparison.error = 'Could not query target (project may not exist)';
      console.log(` ERROR (project not found on target)`);
      results.projects.push(comparison);
      results.summary.fail++;
      continue;
    }

    comparison.delta = comparison.targetTotal - comparison.sourceTotal;

    // By type
    for (const st of sp.byType) {
      const targetCount = await countByJql(
        config.target,
        `project = "${sp.key}" AND issuetype = "${st.type}"`
      );
      const delta = targetCount - st.count;
      comparison.byType.push({
        type: st.type,
        sourceCount: st.count,
        targetCount,
        delta,
        pass: delta === 0,
      });
      if (delta !== 0) comparison.pass = false;
    }

    // By status (use mapping if available)
    for (const ss of sp.byStatus) {
      const mapping = statusMap[ss.status];
      const targetStatusName = mapping ? mapping.targetStatus : ss.status;

      let targetCount;
      try {
        targetCount = await countByJql(
          config.target,
          `project = "${sp.key}" AND status = "${targetStatusName}"`
        );
      } catch {
        targetCount = -1;
      }

      const delta = targetCount >= 0 ? targetCount - ss.count : null;
      comparison.byStatus.push({
        sourceStatus: ss.status,
        targetStatus: targetStatusName,
        sourceCount: ss.count,
        targetCount,
        delta,
        pass: delta === 0,
      });
      if (delta !== 0) comparison.pass = false;
    }

    const label = comparison.pass ? 'PASS' : 'FAIL';
    const deltaStr = comparison.delta !== 0 ? ` (delta: ${comparison.delta > 0 ? '+' : ''}${comparison.delta})` : '';
    console.log(` ${label} -- source: ${comparison.sourceTotal}, target: ${comparison.targetTotal}${deltaStr}`);

    if (comparison.pass) {
      results.summary.pass++;
    } else {
      results.summary.fail++;
      results.summary.totalDelta += Math.abs(comparison.delta);
    }

    results.projects.push(comparison);
  }

  // Summary
  console.log(`\n=== Count Comparison Summary ===`);
  console.log(`  Projects compared:  ${results.projects.length}`);
  console.log(`  Pass:               ${results.summary.pass}`);
  console.log(`  Fail:               ${results.summary.fail}`);
  if (results.summary.fail > 0) {
    console.log(`  Total delta:        ${results.summary.totalDelta} issues`);
    console.log('\n  Failed projects:');
    for (const p of results.projects.filter(p => !p.pass)) {
      console.log(`    ${p.project}: source=${p.sourceTotal} target=${p.targetTotal} delta=${p.delta}${p.error ? ` (${p.error})` : ''}`);

      // Show type mismatches
      for (const t of p.byType.filter(t => !t.pass)) {
        console.log(`      type "${t.type}": source=${t.sourceCount} target=${t.targetCount} delta=${t.delta}`);
      }

      // Show status mismatches
      for (const s of p.byStatus.filter(s => !s.pass)) {
        const mapped = s.sourceStatus !== s.targetStatus ? ` (mapped to "${s.targetStatus}")` : '';
        console.log(`      status "${s.sourceStatus}"${mapped}: source=${s.sourceCount} target=${s.targetCount} delta=${s.delta}`);
      }
    }
  }

  writeOutput(config, results, 'validate', 'count-compare.json');

  if (results.summary.fail > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
