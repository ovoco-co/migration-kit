#!/usr/bin/env node
/**
 * user-inventory.js - Extract users and groups from source and/or target.
 *
 * Usage:
 *   node tools/extract/user-inventory.js [--source-only] [--target-only]
 *
 * Output:
 *   output/extract/users-source.json
 *   output/extract/users-target.json
 *   output/extract/users-crossref.json
 */

const { loadConfig, get, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/user-inventory.js [options]

Options:
  --source-only   Only extract from source instance
  --target-only   Only extract from target instance
  --help          Show this help
`.trim();

async function fetchUsers(instance, label) {
  console.log(`\nFetching users from ${label} (${instance.baseUrl})...`);

  const users = [];

  if (instance.type === 'cloud') {
    // Cloud: /rest/api/3/users/search (paginated)
    let startAt = 0;
    const pageSize = 50;
    while (true) {
      const batch = await get(
        instance,
        `/rest/api/3/users/search?startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!batch || batch.length === 0) break;
      for (const u of batch) {
        users.push({
          accountId: u.accountId,
          displayName: u.displayName,
          email: u.emailAddress || '',
          active: u.active,
          accountType: u.accountType, // 'atlassian', 'app', 'customer'
        });
      }
      if (batch.length < pageSize) break;
      startAt += batch.length;
    }
  } else {
    // DC: /rest/api/2/user/search?username=.&maxResults=1000
    // The '.' query returns all users on most DC installations
    let startAt = 0;
    const pageSize = 1000;
    while (true) {
      const batch = await get(
        instance,
        `/rest/api/2/user/search?username=.&startAt=${startAt}&maxResults=${pageSize}&includeInactive=true`
      );
      if (!batch || batch.length === 0) break;
      for (const u of batch) {
        users.push({
          username: u.name || u.key,
          displayName: u.displayName,
          email: u.emailAddress || '',
          active: u.active,
          accountType: 'user',
        });
      }
      if (batch.length < pageSize) break;
      startAt += batch.length;
    }
  }

  console.log(`  Found ${users.length} users`);

  // Fetch groups
  console.log(`  Fetching groups...`);
  const groups = [];
  try {
    const groupList = await paginate(instance, '/rest/api/2/groups/picker', { query: '' }, 'groups', 50);
    for (const g of groupList) {
      groups.push({
        name: g.name,
        // Getting members is expensive; skip for inventory
      });
    }
    console.log(`  Found ${groups.length} groups`);
  } catch {
    console.log(`  Could not fetch groups (may require admin permissions)`);
  }

  return { users, groups };
}

function crossReference(sourceData, targetData, sourceType, targetType) {
  const crossref = {
    matched: [],         // Same email on both sides
    sourceOnly: [],      // No matching target account
    targetOnly: [],      // No matching source account
    conflicts: [],       // Same username/display name, different email
    serviceAccounts: [], // Source accounts with no email (cannot become Atlassian accounts)
    inactive: [],        // Inactive source users being mapped to active target (or vice versa)
  };

  // Build target lookup by email (lowercased)
  const targetByEmail = new Map();
  for (const u of targetData.users) {
    if (u.email) {
      targetByEmail.set(u.email.toLowerCase(), u);
    }
  }

  const matchedTargetEmails = new Set();

  for (const su of sourceData.users) {
    if (!su.email) {
      crossref.serviceAccounts.push(su);
      continue;
    }

    const emailKey = su.email.toLowerCase();
    const tu = targetByEmail.get(emailKey);

    if (tu) {
      const entry = { source: su, target: tu };
      crossref.matched.push(entry);
      matchedTargetEmails.add(emailKey);

      // Flag active/inactive mismatches
      if (su.active !== tu.active) {
        crossref.inactive.push(entry);
      }
    } else {
      crossref.sourceOnly.push(su);
    }
  }

  // Target-only
  for (const tu of targetData.users) {
    if (tu.email && !matchedTargetEmails.has(tu.email.toLowerCase())) {
      crossref.targetOnly.push(tu);
    }
  }

  return crossref;
}

function printSummary(crossref) {
  console.log('\n=== User Cross-Reference Summary ===');
  console.log(`  Matched (same email):           ${crossref.matched.length}`);
  console.log(`  Source-only (need new account):  ${crossref.sourceOnly.length}`);
  console.log(`  Target-only (not affected):      ${crossref.targetOnly.length}`);
  console.log(`  Service accounts (no email):     ${crossref.serviceAccounts.length}`);
  console.log(`  Active/inactive mismatch:        ${crossref.inactive.length}`);

  if (crossref.serviceAccounts.length > 0) {
    console.log('\n  Service accounts (cannot become Atlassian accounts):');
    for (const u of crossref.serviceAccounts.slice(0, 10)) {
      const id = u.username || u.accountId;
      console.log(`    ${id} -- ${u.displayName}`);
    }
    if (crossref.serviceAccounts.length > 10) {
      console.log(`    ... and ${crossref.serviceAccounts.length - 10} more`);
    }
  }

  if (crossref.inactive.length > 0) {
    console.log('\n  Active/inactive mismatches:');
    for (const entry of crossref.inactive.slice(0, 10)) {
      const sid = entry.source.username || entry.source.accountId;
      console.log(`    ${sid} -- source: ${entry.source.active ? 'active' : 'inactive'}, target: ${entry.target.active ? 'active' : 'inactive'}`);
    }
  }
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const sourceOnly = flags['source-only'];
  const targetOnly = flags['target-only'];

  let sourceData = null;
  let targetData = null;

  if (!targetOnly) {
    sourceData = await fetchUsers(config.source, 'source');
    writeOutput(config, sourceData, 'extract', 'users-source.json');
  }

  if (!sourceOnly) {
    targetData = await fetchUsers(config.target, 'target');
    writeOutput(config, targetData, 'extract', 'users-target.json');
  }

  if (sourceData && targetData) {
    const crossref = crossReference(sourceData, targetData, config.source.type, config.target.type);
    writeOutput(config, crossref, 'extract', 'users-crossref.json');
    printSummary(crossref);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
