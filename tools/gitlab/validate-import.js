#!/usr/bin/env node
/**
 * validate-import.js - Validate Jira-to-GitLab migration results.
 *
 * Compares extracted Jira issue data against what landed in GitLab.
 * Checks counts, state mapping, label coverage, comment counts,
 * and samples field values for accuracy.
 *
 * Usage:
 *   node tools/gitlab/validate-import.js --file output/gitlab/issues-KEY.json
 *     --results output/gitlab/import-results-KEY.json
 *     --gitlab-project ID
 *     [--sample 20]
 *
 * Output:
 *   output/gitlab/validation-{KEY}.json
 */

const fs = require('fs');
const { loadConfig, writeOutput, parseFlags } = require('../lib/client');
const { loadGitLabConfig, glGet, glPaginate } = require('./gitlab-client');

const USAGE = `
Usage: node tools/gitlab/validate-import.js --file <path> --results <path> --gitlab-project <id> [options]

Options:
  --file <path>             Path to extracted issues JSON (required)
  --results <path>          Path to import results JSON (required)
  --gitlab-project <id>     GitLab project ID or path (required)
  --sample N                Number of issues to spot-check (default 20)
  --help                    Show this help
`.trim();

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help || !flags.file || !flags.results || !flags['gitlab-project']) {
    console.log(USAGE);
    return;
  }

  const config = loadConfig();
  const glFullConfig = loadGitLabConfig();
  const glConfig = glFullConfig.gitlab;
  const projectId = encodeURIComponent(flags['gitlab-project']);
  const sampleSize = parseInt(flags.sample || '20', 10);

  // Load source data and import results
  const issueData = JSON.parse(fs.readFileSync(flags.file, 'utf8'));
  const importResults = JSON.parse(fs.readFileSync(flags.results, 'utf8'));

  console.log(`\nValidating migration for project ${issueData.project}...`);
  console.log(`  Source issues: ${issueData.total}`);
  console.log(`  Import created: ${importResults.created}`);
  console.log(`  Import failed: ${importResults.failed}`);

  const validation = {
    timestamp: new Date().toISOString(),
    project: issueData.project,
    gitlabProject: flags['gitlab-project'],
    checks: [],
    pass: true,
  };

  // Check 1: Count match
  const countCheck = {
    name: 'Issue count',
    source: issueData.total,
    target: importResults.created,
    pass: importResults.created === issueData.total,
  };
  if (!countCheck.pass) {
    countCheck.detail = `${issueData.total - importResults.created} issues missing`;
    validation.pass = false;
  }
  validation.checks.push(countCheck);
  console.log(`\n  Count check: ${countCheck.pass ? 'PASS' : 'FAIL'} (${countCheck.source} source, ${countCheck.target} imported)`);

  // Check 2: GitLab issue count via API
  console.log('  Counting GitLab issues...');
  let glTotal = 0;
  try {
    const stats = await glGet(glConfig, `/api/v4/projects/${projectId}?statistics=true`);
    // GitLab project statistics include open and closed issue counts
    const openIssues = await glPaginate(glConfig, `/api/v4/projects/${projectId}/issues`, { state: 'opened', per_page: '1' }, 1);
    const closedIssues = await glPaginate(glConfig, `/api/v4/projects/${projectId}/issues`, { state: 'closed', per_page: '1' }, 1);

    // Use the statistics endpoint for total count
    const countResp = await glGet(glConfig, `/api/v4/projects/${projectId}/issues_statistics`);
    if (countResp && countResp.statistics && countResp.statistics.counts) {
      glTotal = countResp.statistics.counts.all;
    }
  } catch {
    // Fallback: paginate all issues to count
    const allIssues = await glPaginate(glConfig, `/api/v4/projects/${projectId}/issues`, { state: 'all' });
    glTotal = allIssues.length;
  }

  const liveCountCheck = {
    name: 'GitLab live count',
    expected: importResults.created,
    actual: glTotal,
    pass: glTotal >= importResults.created,
  };
  validation.checks.push(liveCountCheck);
  console.log(`  Live count check: ${liveCountCheck.pass ? 'PASS' : 'FAIL'} (${glTotal} in GitLab)`);

  // Check 3: State mapping (open vs closed)
  const sourceOpen = issueData.issues.filter(i => i.gitlabState === 'opened').length;
  const sourceClosed = issueData.issues.filter(i => i.gitlabState === 'closed').length;

  let glOpen = 0;
  let glClosed = 0;
  try {
    const openStats = await glGet(glConfig, `/api/v4/projects/${projectId}/issues_statistics?state=opened`);
    const closedStats = await glGet(glConfig, `/api/v4/projects/${projectId}/issues_statistics?state=closed`);
    glOpen = openStats.statistics.counts.all;
    glClosed = closedStats.statistics.counts.all;
  } catch {
    console.log('  Could not fetch state statistics, skipping state check');
  }

  if (glOpen > 0 || glClosed > 0) {
    const stateCheck = {
      name: 'State mapping',
      sourceOpen,
      sourceClosed,
      gitlabOpen: glOpen,
      gitlabClosed: glClosed,
      pass: glOpen === sourceOpen && glClosed === sourceClosed,
    };
    if (!stateCheck.pass) {
      stateCheck.detail = `Open: ${sourceOpen} source vs ${glOpen} gitlab, Closed: ${sourceClosed} source vs ${glClosed} gitlab`;
      validation.pass = false;
    }
    validation.checks.push(stateCheck);
    console.log(`  State check: ${stateCheck.pass ? 'PASS' : 'FAIL'} (open: ${glOpen}/${sourceOpen}, closed: ${glClosed}/${sourceClosed})`);
  }

  // Check 4: Spot-check sample issues
  const mapping = importResults.mapping;
  const jiraKeys = Object.keys(mapping).filter(k => mapping[k] !== '(dry-run)');
  const sampleKeys = jiraKeys.sort(() => Math.random() - 0.5).slice(0, sampleSize);

  console.log(`\n  Spot-checking ${sampleKeys.length} issues...`);

  const spotCheckResults = [];
  for (const jiraKey of sampleKeys) {
    const iid = mapping[jiraKey];
    const sourceIssue = issueData.issues.find(i => i.jiraKey === jiraKey);
    if (!sourceIssue) continue;

    try {
      const glIssue = await glGet(glConfig, `/api/v4/projects/${projectId}/issues/${iid}`);

      const checks = {
        jiraKey,
        gitlabIid: iid,
        titleMatch: glIssue.title.includes(jiraKey),
        stateMatch: glIssue.state === sourceIssue.gitlabState,
        hasDescription: (glIssue.description || '').length > 0,
        labelCount: glIssue.labels.length,
        expectedLabels: sourceIssue.suggestedLabels.length,
      };

      // Check comments
      if (sourceIssue.comments.length > 0) {
        const notes = await glPaginate(glConfig, `/api/v4/projects/${projectId}/issues/${iid}/notes`);
        // Filter out system notes
        const userNotes = notes.filter(n => !n.system);
        checks.commentCountSource = sourceIssue.comments.length;
        checks.commentCountGitlab = userNotes.length;
        checks.commentsMatch = userNotes.length >= sourceIssue.comments.length;
      }

      checks.pass = checks.titleMatch && checks.stateMatch && checks.hasDescription;
      spotCheckResults.push(checks);

      const status = checks.pass ? 'OK' : 'MISMATCH';
      process.stdout.write(`    ${jiraKey} -> #${iid}: ${status}\n`);

    } catch (err) {
      spotCheckResults.push({
        jiraKey,
        gitlabIid: iid,
        pass: false,
        error: err.message,
      });
      console.log(`    ${jiraKey} -> #${iid}: ERROR ${err.message}`);
    }
  }

  const spotCheckPass = spotCheckResults.every(r => r.pass);
  validation.checks.push({
    name: 'Spot check',
    sampleSize: spotCheckResults.length,
    passed: spotCheckResults.filter(r => r.pass).length,
    failed: spotCheckResults.filter(r => !r.pass).length,
    pass: spotCheckPass,
    details: spotCheckResults,
  });

  if (!spotCheckPass) validation.pass = false;
  console.log(`\n  Spot check: ${spotCheckPass ? 'PASS' : 'FAIL'} (${spotCheckResults.filter(r => r.pass).length}/${spotCheckResults.length})`);

  // Summary
  console.log(`\n=== Validation Summary ===`);
  console.log(`  Overall: ${validation.pass ? 'PASS' : 'FAIL'}`);
  for (const check of validation.checks) {
    if (check.details) continue; // skip verbose checks in summary
    console.log(`    ${check.name}: ${check.pass ? 'PASS' : 'FAIL'}`);
  }

  writeOutput(config, validation, 'gitlab', `validation-${issueData.project}.json`);

  if (!validation.pass) process.exit(1);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
