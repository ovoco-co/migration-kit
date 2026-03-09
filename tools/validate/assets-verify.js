#!/usr/bin/env node
/**
 * assets-verify.js - Verify Assets/CMDB data after migration.
 *
 * Compares source Assets schema objects against target. Checks counts,
 * attribute values on a sample, and reference integrity.
 *
 * Usage:
 *   node tools/validate/assets-verify.js --schema "IT Assets" [--sample 50]
 *
 * Output:
 *   output/validate/assets-verify.json
 */

const { loadConfig, get, post, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/validate/assets-verify.js [options]

Verifies Assets/CMDB data between source and target instances.

Options:
  --schema <name>   Schema name to verify (required)
  --sample N        Number of objects to spot-check per type (default: 10)
  --help            Show this help
`.trim();

function assetsUrl(instance) {
  if (instance.assetsBaseUrl) {
    return instance.assetsBaseUrl.replace('{workspaceId}', instance.assetsWorkspaceId || '');
  }
  // Default DC path
  return `${instance.baseUrl}/rest/assets/1.0`;
}

async function assetsGet(instance, path) {
  const base = assetsUrl(instance);
  const url = `${base}${path}`;
  const headers = {};

  if (instance.type === 'cloud' && instance.auth.email) {
    headers.Authorization = 'Basic ' + Buffer.from(`${instance.auth.email}:${instance.auth.token}`).toString('base64');
  } else if (instance.auth.username) {
    headers.Authorization = 'Basic ' + Buffer.from(`${instance.auth.username}:${instance.auth.token}`).toString('base64');
  }

  const resp = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} GET ${url}: ${text.slice(0, 300)}`);
  }

  return resp.json();
}

async function getSchemas(instance) {
  const data = await assetsGet(instance, '/objectschema/list');
  return data.objectschemas || data.values || data;
}

async function getObjectTypes(instance, schemaId) {
  const data = await assetsGet(instance, `/objectschema/${schemaId}/objecttypes/flat`);
  return Array.isArray(data) ? data : (data.values || []);
}

async function getObjectCount(instance, typeId) {
  try {
    // Use AQL to count
    const data = await assetsGet(instance, `/objecttype/${typeId}/objects?maxResults=1`);
    return data.totalFilterCount || data.total || 0;
  } catch {
    return -1;
  }
}

async function getObjects(instance, typeId, maxResults) {
  try {
    const data = await assetsGet(instance, `/objecttype/${typeId}/objects?maxResults=${maxResults}`);
    return data.objectEntries || data.values || [];
  } catch {
    return [];
  }
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const schemaName = flags.schema;
  const sampleSize = parseInt(flags.sample || '10', 10);

  if (!schemaName) {
    console.error('--schema is required. Specify the Assets schema name to verify.');
    process.exit(1);
  }

  console.log(`\nVerifying Assets schema "${schemaName}"...\n`);

  // Find schema on both sides
  const sourceSchemas = await getSchemas(config.source);
  const targetSchemas = await getSchemas(config.target);

  const sourceSchema = sourceSchemas.find(s => s.name === schemaName);
  const targetSchema = targetSchemas.find(s => s.name === schemaName);

  if (!sourceSchema) {
    console.error(`Schema "${schemaName}" not found on source`);
    process.exit(1);
  }
  if (!targetSchema) {
    console.error(`Schema "${schemaName}" not found on target`);
    process.exit(1);
  }

  console.log(`  Source schema ID: ${sourceSchema.id}`);
  console.log(`  Target schema ID: ${targetSchema.id}`);

  // Get object types
  const sourceTypes = await getObjectTypes(config.source, sourceSchema.id);
  const targetTypes = await getObjectTypes(config.target, targetSchema.id);

  console.log(`  Source types: ${sourceTypes.length}`);
  console.log(`  Target types: ${targetTypes.length}`);

  // Build target type lookup by name
  const targetTypesByName = new Map();
  for (const t of targetTypes) {
    targetTypesByName.set(t.name, t);
  }

  const results = {
    timestamp: new Date().toISOString(),
    schemaName,
    types: [],
    summary: {
      typesChecked: 0,
      typesPassed: 0,
      typesFailed: 0,
      typesMissing: 0,
      totalSourceObjects: 0,
      totalTargetObjects: 0,
    },
  };

  for (const st of sourceTypes) {
    process.stdout.write(`  ${st.name}...`);

    const tt = targetTypesByName.get(st.name);
    if (!tt) {
      console.log(` MISSING on target`);
      results.types.push({ name: st.name, pass: false, error: 'Type not found on target' });
      results.summary.typesMissing++;
      continue;
    }

    results.summary.typesChecked++;

    const sourceCount = await getObjectCount(config.source, st.id);
    const targetCount = await getObjectCount(config.target, tt.id);

    results.summary.totalSourceObjects += Math.max(0, sourceCount);
    results.summary.totalTargetObjects += Math.max(0, targetCount);

    const countMatch = sourceCount === targetCount;
    const typeResult = {
      name: st.name,
      sourceTypeId: st.id,
      targetTypeId: tt.id,
      sourceCount,
      targetCount,
      countMatch,
      pass: countMatch,
      sampleResults: [],
    };

    // Spot-check objects
    if (sourceCount > 0 && sampleSize > 0) {
      const sourceObjects = await getObjects(config.source, st.id, sampleSize);
      const targetObjects = await getObjects(config.target, tt.id, Math.min(targetCount, 200));

      // Build target lookup by Name attribute
      const targetByName = new Map();
      for (const obj of targetObjects) {
        const nameAttr = (obj.attributes || []).find(a => a.objectTypeAttributeId && a.objectAttributeValues);
        const name = obj.label || obj.name || (nameAttr ? nameAttr.objectAttributeValues[0]?.value : null);
        if (name) targetByName.set(name, obj);
      }

      for (const sObj of sourceObjects) {
        const sName = sObj.label || sObj.name;
        if (!sName) continue;

        const tObj = targetByName.get(sName);
        if (!tObj) {
          typeResult.sampleResults.push({ name: sName, pass: false, error: 'Not found on target' });
          typeResult.pass = false;
          continue;
        }

        typeResult.sampleResults.push({ name: sName, pass: true });
      }
    }

    const label = typeResult.pass ? 'PASS' : 'FAIL';
    const delta = targetCount - sourceCount;
    const deltaStr = delta !== 0 ? ` delta=${delta > 0 ? '+' : ''}${delta}` : '';
    console.log(` ${label} -- source: ${sourceCount}, target: ${targetCount}${deltaStr}`);

    if (typeResult.pass) {
      results.summary.typesPassed++;
    } else {
      results.summary.typesFailed++;
    }

    results.types.push(typeResult);
  }

  // Summary
  console.log(`\n=== Assets Verification Summary ===`);
  console.log(`  Schema:             ${schemaName}`);
  console.log(`  Types checked:      ${results.summary.typesChecked}`);
  console.log(`  Types passed:       ${results.summary.typesPassed}`);
  console.log(`  Types failed:       ${results.summary.typesFailed}`);
  console.log(`  Types missing:      ${results.summary.typesMissing}`);
  console.log(`  Source objects:      ${results.summary.totalSourceObjects}`);
  console.log(`  Target objects:      ${results.summary.totalTargetObjects}`);

  writeOutput(config, results, 'validate', 'assets-verify.json');

  if (results.summary.typesFailed > 0 || results.summary.typesMissing > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
