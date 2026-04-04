#!/usr/bin/env node
/**
 * user-mapper.js - Validate user mapping and produce account ID translation table.
 *
 * Reads user inventories and optionally a user mapping CSV.
 * Produces a username-to-account-ID mapping for import tools.
 *
 * Usage:
 *   node tools/transform/user-mapper.js [--mapping path/to/user-mapping.csv]
 *
 * Input:
 *   output/extract/users-crossref.json
 *   templates/user-mapping.csv (optional -- auto-generates from crossref if not provided)
 *
 * Output:
 *   output/transform/user-map.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/transform/user-mapper.js [options]

Options:
  --mapping <path>   Path to user mapping CSV (optional, auto-generates from crossref)
  --help             Show this help
`.trim();

const { parseCSV } = require('../lib/csv');

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const mappingPath = flags.mapping;

  // Load cross-reference
  const crossrefPath = path.resolve(config.outputDir || './output', 'extract', 'users-crossref.json');
  if (!fs.existsSync(crossrefPath)) {
    console.error(`Missing ${crossrefPath}. Run user-inventory.js first.`);
    process.exit(1);
  }
  const crossref = JSON.parse(fs.readFileSync(crossrefPath, 'utf8'));

  const errors = [];
  const warnings = [];
  const userMap = {};

  // If a CSV is provided, use it; otherwise auto-generate from crossref
  if (mappingPath && fs.existsSync(mappingPath)) {
    console.log(`Loading user mapping from ${mappingPath}...`);
    const mappingText = fs.readFileSync(mappingPath, 'utf8');
    const mappings = parseCSV(mappingText);

    for (const m of mappings) {
      const action = (m.action || 'map').toLowerCase();
      if (action === 'skip') continue;

      if (!m.source_username && !m.source_email) {
        errors.push(`Mapping row missing both source_username and source_email`);
        continue;
      }

      if (action === 'map' && !m.target_account_id && !m.target_email) {
        errors.push(`Mapping for "${m.source_username || m.source_email}" missing target_account_id and target_email`);
        continue;
      }

      const key = m.source_username || m.source_email;
      userMap[key] = {
        sourceUsername: m.source_username,
        sourceEmail: m.source_email,
        sourceDisplayName: m.source_display_name,
        targetAccountId: m.target_account_id,
        targetEmail: m.target_email,
        targetDisplayName: m.target_display_name,
        action,
        notes: m.notes,
      };
    }

    console.log(`  Loaded ${Object.keys(userMap).length} mappings from CSV`);
  } else {
    console.log('No user mapping CSV provided. Auto-generating from cross-reference...\n');

    // Auto-map matched users
    for (const entry of crossref.matched) {
      const key = entry.source.username || entry.source.email;
      userMap[key] = {
        sourceUsername: entry.source.username || '',
        sourceEmail: entry.source.email,
        sourceDisplayName: entry.source.displayName,
        targetAccountId: entry.target.accountId || '',
        targetEmail: entry.target.email,
        targetDisplayName: entry.target.displayName,
        action: 'map',
        autoMatched: true,
      };
    }

    // Flag source-only users
    for (const su of crossref.sourceOnly) {
      const key = su.username || su.email;
      userMap[key] = {
        sourceUsername: su.username || '',
        sourceEmail: su.email,
        sourceDisplayName: su.displayName,
        targetAccountId: '',
        targetEmail: '',
        targetDisplayName: '',
        action: 'create',
        autoMatched: false,
      };
      warnings.push(`Source user "${su.displayName}" (${su.email || su.username}) has no target account -- marked for creation`);
    }

    // Flag service accounts
    for (const sa of crossref.serviceAccounts) {
      const key = sa.username || sa.accountId;
      userMap[key] = {
        sourceUsername: sa.username || '',
        sourceEmail: '',
        sourceDisplayName: sa.displayName,
        targetAccountId: '',
        targetEmail: '',
        targetDisplayName: '',
        action: 'review',
        autoMatched: false,
        isServiceAccount: true,
      };
      warnings.push(`Service account "${sa.displayName}" (${sa.username}) has no email -- cannot create Atlassian account`);
    }
  }

  // Validation
  const mapped = Object.values(userMap).filter(u => u.action === 'map' && (u.targetAccountId || u.targetEmail));
  const unmapped = Object.values(userMap).filter(u => u.action !== 'map' && u.action !== 'skip');
  const serviceAccounts = Object.values(userMap).filter(u => u.isServiceAccount);

  console.log(`\n=== User Mapping Summary ===`);
  console.log(`  Total entries:          ${Object.keys(userMap).length}`);
  console.log(`  Mapped:                 ${mapped.length}`);
  console.log(`  Unmapped (need action): ${unmapped.length}`);
  console.log(`  Service accounts:       ${serviceAccounts.length}`);
  console.log(`  Errors:                 ${errors.length}`);
  console.log(`  Warnings:               ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n  ERRORS (must fix):');
    for (const e of errors) console.log(`    ${e}`);
  }
  if (warnings.length > 0 && warnings.length <= 20) {
    console.log('\n  WARNINGS (review):');
    for (const w of warnings) console.log(`    ${w}`);
  } else if (warnings.length > 20) {
    console.log(`\n  WARNINGS: ${warnings.length} total (showing first 20):`);
    for (const w of warnings.slice(0, 20)) console.log(`    ${w}`);
    console.log(`    ... and ${warnings.length - 20} more`);
  }

  if (errors.length > 0) {
    console.error('\nUser mapping has errors. Fix the CSV and re-run.');
    process.exit(1);
  }

  writeOutput(config, userMap, 'transform', 'user-map.json');
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
