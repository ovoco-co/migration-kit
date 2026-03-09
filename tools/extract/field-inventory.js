#!/usr/bin/env node
/**
 * field-inventory.js - Extract custom fields from source and/or target, cross-reference.
 *
 * Usage:
 *   node tools/extract/field-inventory.js [--source-only] [--target-only]
 *
 * Output:
 *   output/extract/fields-source.json
 *   output/extract/fields-target.json
 *   output/extract/fields-crossref.json
 */

const { loadConfig, get, paginate, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/extract/field-inventory.js [options]

Options:
  --source-only   Only extract from source instance
  --target-only   Only extract from target instance
  --help          Show this help
`.trim();

async function fetchFields(instance, label) {
  console.log(`\nFetching fields from ${label} (${instance.baseUrl})...`);

  // /rest/api/2/field returns all fields (system + custom)
  const allFields = await get(instance, '/rest/api/2/field');
  const custom = allFields.filter(f => f.custom);

  console.log(`  Found ${allFields.length} total fields, ${custom.length} custom`);

  const fields = [];
  for (const f of custom) {
    const field = {
      id: f.id,
      name: f.name,
      type: f.schema ? f.schema.type : 'unknown',
      customType: f.schema ? f.schema.custom : null,
      description: f.description || '',
      searchable: f.searchable,
      orderable: f.orderable,
    };
    fields.push(field);
  }

  // Try to get contexts for each field (DC: /rest/api/2/field/{id}/context)
  // This endpoint may not exist on all versions
  for (const field of fields) {
    try {
      const contexts = await paginate(
        instance,
        `/rest/api/2/field/${field.id}/context`,
        {},
        'values',
        50
      );
      field.contexts = contexts.map(c => ({
        id: c.id,
        name: c.name,
        isGlobal: c.isGlobalContext || false,
        projectIds: c.projectIds || [],
      }));
    } catch {
      // Context endpoint not available or no permissions
      field.contexts = [];
    }
  }

  // Try to get options for select-type fields
  for (const field of fields) {
    if (!field.customType) continue;
    const isSelect = /select|radio|checkbox|cascading/i.test(field.customType);
    if (!isSelect) continue;

    try {
      // Cloud: /rest/api/2/field/{id}/option  or  /rest/api/3/field/{id}/context/{ctxId}/option
      // DC: /rest/api/2/customFieldOption/{id} (different pattern)
      // Try the Cloud pattern first
      const options = await paginate(
        instance,
        `/rest/api/2/field/${field.id}/option`,
        {},
        'values',
        100
      );
      field.options = options.map(o => ({
        id: o.id,
        value: o.value,
        disabled: o.disabled || false,
      }));
    } catch {
      field.options = null; // Could not retrieve options
    }
  }

  return fields;
}

function crossReference(sourceFields, targetFields) {
  const crossref = {
    matched: [],        // Same name + same type on both sides
    typeMismatch: [],   // Same name, different type
    sourceOnly: [],     // Exists only on source
    targetOnly: [],     // Exists only on target
    sourceDuplicates: [], // Multiple fields with same name+type on source
    targetDuplicates: [], // Multiple fields with same name+type on target
  };

  // Build lookup maps
  const targetByName = new Map();
  for (const f of targetFields) {
    const key = f.name.toLowerCase();
    if (!targetByName.has(key)) targetByName.set(key, []);
    targetByName.get(key).push(f);
  }

  const sourceByName = new Map();
  for (const f of sourceFields) {
    const key = f.name.toLowerCase();
    if (!sourceByName.has(key)) sourceByName.set(key, []);
    sourceByName.get(key).push(f);
  }

  // Check for duplicates within each instance
  for (const [name, fields] of sourceByName) {
    const byType = new Map();
    for (const f of fields) {
      const t = f.customType || f.type;
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(f);
    }
    for (const [type, group] of byType) {
      if (group.length > 1) {
        crossref.sourceDuplicates.push({
          name: fields[0].name,
          type,
          count: group.length,
          ids: group.map(f => f.id),
        });
      }
    }
  }

  for (const [name, fields] of targetByName) {
    const byType = new Map();
    for (const f of fields) {
      const t = f.customType || f.type;
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(f);
    }
    for (const [type, group] of byType) {
      if (group.length > 1) {
        crossref.targetDuplicates.push({
          name: fields[0].name,
          type,
          count: group.length,
          ids: group.map(f => f.id),
        });
      }
    }
  }

  // Cross-reference source against target
  const matchedTargetIds = new Set();

  for (const sf of sourceFields) {
    const key = sf.name.toLowerCase();
    const targets = targetByName.get(key);

    if (!targets || targets.length === 0) {
      crossref.sourceOnly.push(sf);
      continue;
    }

    // Find type match
    const sType = sf.customType || sf.type;
    const typeMatch = targets.find(t => (t.customType || t.type) === sType);

    if (typeMatch) {
      crossref.matched.push({
        source: sf,
        target: typeMatch,
      });
      matchedTargetIds.add(typeMatch.id);
    } else {
      crossref.typeMismatch.push({
        source: sf,
        targetCandidates: targets,
      });
      targets.forEach(t => matchedTargetIds.add(t.id));
    }
  }

  // Target-only: fields not matched to any source field
  for (const tf of targetFields) {
    if (!matchedTargetIds.has(tf.id)) {
      const key = tf.name.toLowerCase();
      if (!sourceByName.has(key)) {
        crossref.targetOnly.push(tf);
      }
    }
  }

  return crossref;
}

function printSummary(crossref) {
  console.log('\n=== Cross-Reference Summary ===');
  console.log(`  Matched (same name + type):     ${crossref.matched.length}`);
  console.log(`  Type mismatch (same name):       ${crossref.typeMismatch.length}`);
  console.log(`  Source-only:                     ${crossref.sourceOnly.length}`);
  console.log(`  Target-only:                     ${crossref.targetOnly.length}`);
  console.log(`  Source duplicates:               ${crossref.sourceDuplicates.length}`);
  console.log(`  Target duplicates:               ${crossref.targetDuplicates.length}`);

  if (crossref.typeMismatch.length > 0) {
    console.log('\n  Type mismatches (require manual review):');
    for (const m of crossref.typeMismatch) {
      console.log(`    "${m.source.name}" -- source: ${m.source.customType || m.source.type}, target: ${m.targetCandidates.map(t => t.customType || t.type).join(', ')}`);
    }
  }

  if (crossref.sourceDuplicates.length > 0) {
    console.log('\n  Source duplicates (ambiguous, must resolve before migration):');
    for (const d of crossref.sourceDuplicates) {
      console.log(`    "${d.name}" (${d.type}) x${d.count}: ${d.ids.join(', ')}`);
    }
  }

  if (crossref.targetDuplicates.length > 0) {
    console.log('\n  Target duplicates:');
    for (const d of crossref.targetDuplicates) {
      console.log(`    "${d.name}" (${d.type}) x${d.count}: ${d.ids.join(', ')}`);
    }
  }
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const sourceOnly = flags['source-only'];
  const targetOnly = flags['target-only'];

  let sourceFields = null;
  let targetFields = null;

  if (!targetOnly) {
    sourceFields = await fetchFields(config.source, 'source');
    writeOutput(config, sourceFields, 'extract', 'fields-source.json');
  }

  if (!sourceOnly) {
    targetFields = await fetchFields(config.target, 'target');
    writeOutput(config, targetFields, 'extract', 'fields-target.json');
  }

  if (sourceFields && targetFields) {
    const crossref = crossReference(sourceFields, targetFields);
    writeOutput(config, crossref, 'extract', 'fields-crossref.json');
    printSummary(crossref);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
