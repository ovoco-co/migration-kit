#!/usr/bin/env node
/**
 * link-integrity.js - Verify issue links survived migration.
 *
 * Usage:
 *   node tools/validate/link-integrity.js [--project KEY1,KEY2] [--sample N]
 *
 * Output:
 *   output/validate/link-integrity.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, get, post, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/validate/link-integrity.js [options]

Compares issue links between source and target for a sample of issues.

Options:
  --project KEY1,KEY2   Only check these projects
  --sample N            Number of issues to check (default: 100)
  --help                Show this help
`.trim();

function extractLinks(issue) {
  const links = [];
  if (!issue.fields || !issue.fields.issuelinks) return links;

  for (const link of issue.fields.issuelinks) {
    if (link.outwardIssue) {
      links.push({
        type: link.type.name,
        direction: 'outward',
        linkedKey: link.outwardIssue.key,
      });
    }
    if (link.inwardIssue) {
      links.push({
        type: link.type.name,
        direction: 'inward',
        linkedKey: link.inwardIssue.key,
      });
    }
  }

  return links.sort((a, b) => `${a.type}:${a.linkedKey}`.localeCompare(`${b.type}:${b.linkedKey}`));
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const sampleSize = parseInt(flags.sample || '100', 10);
  const projectFilter = flags.project ? flags.project.split(',').map(k => k.trim()) : null;

  console.log(`\nChecking issue link integrity (sample: ${sampleSize})...\n`);

  // Get issues with links from source
  const jql = projectFilter
    ? `project in (${projectFilter.map(k => `"${k}"`).join(',')}) AND issueFunction in hasLinks() ORDER BY key ASC`
    : 'issueFunction in hasLinks() ORDER BY key ASC';

  // Fallback JQL if issueFunction is not available (no ScriptRunner)
  let issueKeys = [];
  try {
    const searchResult = await post(config.source, '/rest/api/2/search', {
      jql,
      maxResults: sampleSize,
      fields: ['key', 'issuelinks'],
    });
    issueKeys = searchResult.issues.map(i => i.key);
  } catch {
    // Fallback: just get issues and hope they have links
    const fallbackJql = projectFilter
      ? `project in (${projectFilter.map(k => `"${k}"`).join(',')}) ORDER BY key ASC`
      : 'ORDER BY key ASC';
    const searchResult = await post(config.source, '/rest/api/2/search', {
      jql: fallbackJql,
      maxResults: sampleSize * 2, // Fetch more since some won't have links
      fields: ['key', 'issuelinks'],
    });
    issueKeys = searchResult.issues
      .filter(i => i.fields.issuelinks && i.fields.issuelinks.length > 0)
      .slice(0, sampleSize)
      .map(i => i.key);
  }

  console.log(`  Found ${issueKeys.length} issues with links to check`);

  const results = {
    timestamp: new Date().toISOString(),
    issuesChecked: 0,
    issuesPassed: 0,
    issuesFailed: 0,
    linksChecked: 0,
    linksMissing: 0,
    linksExtra: 0,
    issues: [],
  };

  for (const key of issueKeys) {
    process.stdout.write(`  ${key}...`);

    // Fetch from source
    let sourceIssue;
    try {
      sourceIssue = await get(config.source, `/rest/api/2/issue/${key}?fields=issuelinks`);
    } catch {
      console.log(` source fetch failed`);
      continue;
    }

    // Fetch from target
    let targetIssue;
    try {
      targetIssue = await get(config.target, `/rest/api/2/issue/${key}?fields=issuelinks`);
    } catch {
      console.log(` not found on target`);
      results.issuesFailed++;
      results.issues.push({ key, pass: false, error: 'Not found on target' });
      continue;
    }

    results.issuesChecked++;

    const sourceLinks = extractLinks(sourceIssue);
    const targetLinks = extractLinks(targetIssue);

    // Compare
    const sourceLinkSet = new Set(sourceLinks.map(l => `${l.type}:${l.direction}:${l.linkedKey}`));
    const targetLinkSet = new Set(targetLinks.map(l => `${l.type}:${l.direction}:${l.linkedKey}`));

    const missing = sourceLinks.filter(l => !targetLinkSet.has(`${l.type}:${l.direction}:${l.linkedKey}`));
    const extra = targetLinks.filter(l => !sourceLinkSet.has(`${l.type}:${l.direction}:${l.linkedKey}`));

    const pass = missing.length === 0;
    results.linksChecked += sourceLinks.length;
    results.linksMissing += missing.length;
    results.linksExtra += extra.length;

    if (pass) {
      results.issuesPassed++;
      console.log(` PASS (${sourceLinks.length} links)`);
    } else {
      results.issuesFailed++;
      console.log(` FAIL (${missing.length} missing, ${extra.length} extra)`);
    }

    results.issues.push({
      key,
      pass,
      sourceLinks: sourceLinks.length,
      targetLinks: targetLinks.length,
      missing,
      extra,
    });
  }

  // Summary
  console.log(`\n=== Link Integrity Summary ===`);
  console.log(`  Issues checked:   ${results.issuesChecked}`);
  console.log(`  Issues passed:    ${results.issuesPassed}`);
  console.log(`  Issues failed:    ${results.issuesFailed}`);
  console.log(`  Links checked:    ${results.linksChecked}`);
  console.log(`  Links missing:    ${results.linksMissing}`);
  console.log(`  Links extra:      ${results.linksExtra}`);

  if (results.linksMissing > 0) {
    const missRate = ((results.linksMissing / results.linksChecked) * 100).toFixed(1);
    console.log(`  Missing rate:     ${missRate}%`);
  }

  writeOutput(config, results, 'validate', 'link-integrity.json');

  if (results.issuesFailed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
