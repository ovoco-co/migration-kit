#!/usr/bin/env node
/**
 * field-mapper.js - Validate field mapping CSV and produce field ID translation table.
 *
 * Reads the field mapping CSV (user-maintained) and the extracted field inventories.
 * Validates that every source field with data has a mapping and types are compatible.
 *
 * Usage:
 *   node tools/transform/field-mapper.js [--mapping path/to/field-mapping.csv]
 *
 * Input:
 *   output/extract/fields-crossref.json
 *   templates/field-mapping.csv (or --mapping override)
 *
 * Output:
 *   output/transform/field-id-map.json
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, writeOutput, parseFlags } = require('../lib/client');

const USAGE = `
Usage: node tools/transform/field-mapper.js [options]

Options:
  --mapping <path>   Path to field mapping CSV (default: templates/field-mapping.csv)
  --help             Show this help
`.trim();

const { parseCSV } = require('../lib/csv');

// Type compatibility matrix (simplified)
const COMPATIBLE_TYPES = {
  string: ['string', 'textarea', 'url', 'readonlyfield'],
  number: ['number', 'float'],
  date: ['date', 'datetime'],
  option: ['option', 'select', 'radio'],
  'array:option': ['array:option', 'multiselect', 'multicheckboxes'],
  user: ['user'],
  'array:user': ['array:user'],
};

function typesCompatible(sourceType, targetType) {
  if (!sourceType || !targetType) return true; // Cannot check
  const s = sourceType.toLowerCase();
  const t = targetType.toLowerCase();
  if (s === t) return true;
  for (const group of Object.values(COMPATIBLE_TYPES)) {
    if (group.includes(s) && group.includes(t)) return true;
  }
  return false;
}

async function main() {
  const { flags } = parseFlags(process.argv);
  if (flags.help) { console.log(USAGE); return; }

  const config = loadConfig();
  const mappingPath = flags.mapping || path.resolve('templates', 'field-mapping.csv');

  // Load cross-reference
  const crossrefPath = path.resolve(config.outputDir || './output', 'extract', 'fields-crossref.json');
  if (!fs.existsSync(crossrefPath)) {
    console.error(`Missing ${crossrefPath}. Run field-inventory.js first.`);
    process.exit(1);
  }
  const crossref = JSON.parse(fs.readFileSync(crossrefPath, 'utf8'));

  // Load mapping CSV
  if (!fs.existsSync(mappingPath)) {
    console.error(`Missing ${mappingPath}. Copy from templates/field-mapping.csv and fill in.`);
    process.exit(1);
  }
  const mappingText = fs.readFileSync(mappingPath, 'utf8');
  const mappings = parseCSV(mappingText);

  if (mappings.length === 0) {
    console.error('Field mapping CSV is empty. Fill in the mapping before running this script.');
    process.exit(1);
  }

  console.log(`\nValidating ${mappings.length} field mappings...\n`);

  const errors = [];
  const warnings = [];
  const idMap = {};

  // Build mapping lookup by source field name (lowercased)
  const mappingByName = new Map();
  for (const m of mappings) {
    mappingByName.set(m.source_field_name.toLowerCase(), m);
  }

  // Check every source-only field has a mapping
  for (const sf of crossref.sourceOnly) {
    const key = sf.name.toLowerCase();
    const mapping = mappingByName.get(key);
    if (!mapping) {
      warnings.push(`Source field "${sf.name}" (${sf.id}) has no mapping in CSV`);
    }
  }

  // Validate each mapping
  for (const m of mappings) {
    const action = m.action.toLowerCase();

    if (action === 'skip') continue;

    if (action === 'map' || action === 'rename') {
      if (!m.source_field_id) {
        errors.push(`Mapping for "${m.source_field_name}" missing source_field_id`);
        continue;
      }
      if (!m.target_field_id && !m.target_field_name) {
        errors.push(`Mapping for "${m.source_field_name}" missing target_field_id and target_field_name`);
        continue;
      }

      // Type compatibility check
      if (m.source_field_type && m.target_field_type) {
        if (!typesCompatible(m.source_field_type, m.target_field_type)) {
          warnings.push(`Type mismatch: "${m.source_field_name}" source=${m.source_field_type} target=${m.target_field_type}`);
        }
      }

      // Check for cascading selects and Assets fields (require manual review)
      const sType = (m.source_field_type || '').toLowerCase();
      if (sType.includes('cascading')) {
        warnings.push(`Cascading select "${m.source_field_name}" requires manual option mapping`);
      }
      if (sType.includes('asset') || sType.includes('insight')) {
        warnings.push(`Assets field "${m.source_field_name}" requires AQL filter review`);
      }

      idMap[m.source_field_id] = {
        sourceId: m.source_field_id,
        sourceName: m.source_field_name,
        sourceType: m.source_field_type,
        targetId: m.target_field_id,
        targetName: m.target_field_name,
        targetType: m.target_field_type,
        action,
        notes: m.notes,
      };
    }

    if (action === 'create') {
      // Field will be created on target; no ID mapping yet
      warnings.push(`Field "${m.source_field_name}" marked as 'create' -- will need target_field_id after creation`);
    }
  }

  // Check for duplicate target mappings (two source fields mapping to same target)
  const targetIdCounts = {};
  for (const entry of Object.values(idMap)) {
    if (entry.targetId) {
      targetIdCounts[entry.targetId] = (targetIdCounts[entry.targetId] || 0) + 1;
    }
  }
  for (const [targetId, count] of Object.entries(targetIdCounts)) {
    if (count > 1) {
      warnings.push(`Target field ${targetId} is mapped from ${count} source fields (intentional merge?)`);
    }
  }

  // Report
  console.log(`=== Field Mapping Validation ===`);
  console.log(`  Mappings processed:  ${mappings.length}`);
  console.log(`  ID translations:     ${Object.keys(idMap).length}`);
  console.log(`  Errors:              ${errors.length}`);
  console.log(`  Warnings:            ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n  ERRORS (must fix):');
    for (const e of errors) console.log(`    ${e}`);
  }
  if (warnings.length > 0) {
    console.log('\n  WARNINGS (review):');
    for (const w of warnings) console.log(`    ${w}`);
  }

  if (errors.length > 0) {
    console.error('\nField mapping has errors. Fix the CSV and re-run.');
    process.exit(1);
  }

  writeOutput(config, idMap, 'transform', 'field-id-map.json');
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
