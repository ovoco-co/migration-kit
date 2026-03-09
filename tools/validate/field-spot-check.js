#!/usr/bin/env node
/**
 * field-spot-check.js - Sample issues and compare field values between source and target.
 *
 * Usage:
 *   node tools/validate/field-spot-check.js --sample 50 [--project KEY1,KEY2]
 *
 * Input:
 *   output/transform/field-id-map.json
 *
 * Output:
 *   output/validate/spot-check.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, get, post, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/validate/field-spot-check.js [options]

Samples random issues from source, fetches same on target, compares field values.

Options:
  --sample N            Number of issues to sample (default: 50)
  --project KEY1,KEY2   Only sample from these projects
  --help                Show this help
`.trim();

function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    // Handle Jira field objects (e.g., { name: "Open", id: "1" })
    if (val.name) return val.name;
    if (val.value) return val.value;
    if (val.displayName) return val.displayName;
    if (val.emailAddress) return val.emailAddress;
    if (Array.isArray(val)) return val.map(normalizeValue).sort();
    return JSON.stringify(val);
  }
  return String(val).trim();
}

function valuesMatch(sourceVal, targetVal) {
  const s = normalizeValue(sourceVal);
  const t = normalizeValue(targetVal);

  if (s === null && t === null) return true;
  if (s === null || t === null) return false;

  if (Array.isArray(s) && Array.isArray(t)) {
    if (s.length !== t.length) return false;
    return s.every((v, i) => v === t[i]);
  }

  return s === t;
}

async function getRandomIssueKeys(instance, sampleSize, projectFilter) {
  // Get total count
  const jql = projectFilter
    ? `project in (${projectFilter.map(k => `"${k}"`).join(',')}) ORDER BY key ASC`
    : 'ORDER BY key ASC';

  const countResult = await post(instance, '/rest/api/2/search', {
    jql,
    maxResults: 0,
    fields: [],
  });

  const total = countResult.total;
  if (total === 0) return [];

  // Pick random offsets
  const offsets = new Set();
  const actualSample = Math.min(sampleSize, total);
  while (offsets.size < actualSample) {
    offsets.add(Math.floor(Math.random() * total));
  }

  // Fetch issue keys at those offsets
  const keys = [];
  for (const offset of offsets) {
    const result = await post(instance, '/rest/api/2/search', {
      jql,
      startAt: offset,
      maxResults: 1,
      fields: ['key'],
    });
    if (result.issues && result.issues.length > 0) {
      keys.push(result.issues[0].key);
    }
  }

  return keys;
}

async function getIssue(instance, key) {
  return get(instance, `/rest/api/2/issue/${key}`);
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const sampleSize = parseInt(flags.sample || '50', 10);
  const projectFilter = flags.project ? flags.project.split(',').map(k => k.trim()) : null;

  // Load field ID map
  const fieldMapPath = path.resolve(config.outputDir || './output', 'transform', 'field-id-map.json');
  let fieldIdMap = {};
  if (fs.existsSync(fieldMapPath)) {
    fieldIdMap = JSON.parse(fs.readFileSync(fieldMapPath, 'utf8'));
    console.log(`Loaded field ID map with ${Object.keys(fieldIdMap).length} mappings`);
  } else {
    console.log('Warning: No field ID map found. Will compare fields by same ID.');
  }

  console.log(`\nSampling ${sampleSize} issues from source (${config.source.baseUrl})...\n`);

  // Get random issue keys
  const issueKeys = await getRandomIssueKeys(config.source, sampleSize, projectFilter);
  console.log(`  Selected ${issueKeys.length} issues to check`);

  const results = {
    timestamp: new Date().toISOString(),
    sampleSize: issueKeys.length,
    issues: [],
    summary: {
      issuesChecked: 0,
      issuesPassed: 0,
      issuesFailed: 0,
      issuesNotFound: 0,
      fieldsChecked: 0,
      fieldsPassed: 0,
      fieldsFailed: 0,
    },
  };

  for (const key of issueKeys) {
    process.stdout.write(`  ${key}...`);

    const issueResult = {
      key,
      pass: true,
      fields: [],
    };

    // Fetch from source
    let sourceIssue;
    try {
      sourceIssue = await getIssue(config.source, key);
    } catch {
      console.log(` source fetch failed`);
      issueResult.pass = false;
      issueResult.error = 'Source fetch failed';
      results.issues.push(issueResult);
      results.summary.issuesFailed++;
      continue;
    }

    // Fetch from target
    let targetIssue;
    try {
      targetIssue = await getIssue(config.target, key);
    } catch {
      console.log(` not found on target`);
      issueResult.pass = false;
      issueResult.error = 'Not found on target';
      results.issues.push(issueResult);
      results.summary.issuesNotFound++;
      continue;
    }

    results.summary.issuesChecked++;

    // Compare system fields
    const systemFields = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter'];
    for (const fieldName of systemFields) {
      const sourceVal = sourceIssue.fields[fieldName];
      const targetVal = targetIssue.fields[fieldName];
      const match = valuesMatch(sourceVal, targetVal);

      issueResult.fields.push({
        field: fieldName,
        sourceValue: normalizeValue(sourceVal),
        targetValue: normalizeValue(targetVal),
        pass: match,
      });
      results.summary.fieldsChecked++;
      if (match) { results.summary.fieldsPassed++; } else { results.summary.fieldsFailed++; }
      if (!match) issueResult.pass = false;
    }

    // Compare mapped custom fields
    for (const [sourceFieldId, mapping] of Object.entries(fieldIdMap)) {
      if (mapping.action === 'skip') continue;

      const sourceVal = sourceIssue.fields[sourceFieldId];
      const targetFieldId = mapping.targetId || sourceFieldId;
      const targetVal = targetIssue.fields[targetFieldId];

      // Skip if both are null (field not populated on this issue)
      if (sourceVal === null && targetVal === null) continue;
      if (sourceVal === undefined && targetVal === undefined) continue;

      const match = valuesMatch(sourceVal, targetVal);

      issueResult.fields.push({
        field: mapping.sourceName || sourceFieldId,
        sourceFieldId,
        targetFieldId,
        sourceValue: normalizeValue(sourceVal),
        targetValue: normalizeValue(targetVal),
        pass: match,
      });
      results.summary.fieldsChecked++;
      if (match) { results.summary.fieldsPassed++; } else { results.summary.fieldsFailed++; }
      if (!match) issueResult.pass = false;
    }

    const label = issueResult.pass ? 'PASS' : 'FAIL';
    const failedFields = issueResult.fields.filter(f => !f.pass);
    const failStr = failedFields.length > 0
      ? ` (${failedFields.length} field mismatches: ${failedFields.map(f => f.field).join(', ')})`
      : '';
    console.log(` ${label}${failStr}`);

    if (issueResult.pass) {
      results.summary.issuesPassed++;
    } else {
      results.summary.issuesFailed++;
    }

    results.issues.push(issueResult);
  }

  // Summary
  console.log(`\n=== Field Spot-Check Summary ===`);
  console.log(`  Issues sampled:     ${results.sampleSize}`);
  console.log(`  Issues checked:     ${results.summary.issuesChecked}`);
  console.log(`  Issues passed:      ${results.summary.issuesPassed}`);
  console.log(`  Issues failed:      ${results.summary.issuesFailed}`);
  console.log(`  Issues not found:   ${results.summary.issuesNotFound}`);
  console.log(`  Fields checked:     ${results.summary.fieldsChecked}`);
  console.log(`  Fields passed:      ${results.summary.fieldsPassed}`);
  console.log(`  Fields failed:      ${results.summary.fieldsFailed}`);

  if (results.summary.fieldsFailed > 0) {
    const failRate = ((results.summary.fieldsFailed / results.summary.fieldsChecked) * 100).toFixed(1);
    console.log(`  Failure rate:       ${failRate}%`);
  }

  writeOutput(config, results, 'validate', 'spot-check.json');

  if (results.summary.issuesFailed > 0 || results.summary.issuesNotFound > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
