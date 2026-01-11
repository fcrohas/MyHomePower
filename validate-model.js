#!/usr/bin/env node

/**
 * Model Validator
 * Validates appliance model JSON files before importing
 * 
 * Usage:
 *   node validate-model.js path/to/model.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateModel(modelPath) {
  log('\n🔍 Validating Model File...', 'cyan');
  log(`File: ${modelPath}\n`, 'blue');

  // Check file exists
  if (!fs.existsSync(modelPath)) {
    log('❌ Error: File not found', 'red');
    return false;
  }

  // Read file
  let data;
  try {
    const fileContent = fs.readFileSync(modelPath, 'utf-8');
    data = JSON.parse(fileContent);
  } catch (error) {
    log('❌ Error: Invalid JSON format', 'red');
    log(`   ${error.message}`, 'red');
    return false;
  }

  // Extract model (handle both direct model and export format)
  let model = data;
  if (data.model) {
    log('ℹ️  Detected export format', 'blue');
    model = data.model;
  }

  let isValid = true;
  const warnings = [];
  const errors = [];

  // Validate required fields
  log('📋 Checking Required Fields:', 'yellow');

  if (!model.name || typeof model.name !== 'string' || model.name.trim() === '') {
    errors.push('name is required and must be a non-empty string');
    log('   ❌ name', 'red');
  } else {
    log(`   ✅ name: "${model.name}"`, 'green');
  }

  if (!model.properties) {
    errors.push('properties object is required');
    log('   ❌ properties', 'red');
  } else {
    log('   ✅ properties', 'green');

    // Validate power properties
    if (typeof model.properties.powerMin !== 'number') {
      errors.push('properties.powerMin must be a number');
      log('      ❌ powerMin', 'red');
    } else if (model.properties.powerMin < 0) {
      errors.push('properties.powerMin must be >= 0');
      log(`      ❌ powerMin: ${model.properties.powerMin} (must be >= 0)`, 'red');
    } else {
      log(`      ✅ powerMin: ${model.properties.powerMin} W`, 'green');
    }

    if (typeof model.properties.powerMax !== 'number') {
      errors.push('properties.powerMax must be a number');
      log('      ❌ powerMax', 'red');
    } else if (model.properties.powerMax < 0) {
      errors.push('properties.powerMax must be >= 0');
      log(`      ❌ powerMax: ${model.properties.powerMax} (must be >= 0)`, 'red');
    } else {
      log(`      ✅ powerMax: ${model.properties.powerMax} W`, 'green');
    }

    // Check logical consistency
    if (typeof model.properties.powerMin === 'number' && 
        typeof model.properties.powerMax === 'number' &&
        model.properties.powerMin > model.properties.powerMax) {
      errors.push('powerMin cannot be greater than powerMax');
      log('      ❌ powerMin > powerMax (invalid)', 'red');
    }

    // Check optional properties
    if (model.properties.hasOnOff !== undefined) {
      if (typeof model.properties.hasOnOff !== 'boolean') {
        warnings.push('properties.hasOnOff should be a boolean');
        log(`      ⚠️  hasOnOff: ${model.properties.hasOnOff} (should be true/false)`, 'yellow');
      } else {
        log(`      ✅ hasOnOff: ${model.properties.hasOnOff}`, 'green');
      }
    }

    if (model.properties.annualPowerWh !== undefined) {
      if (typeof model.properties.annualPowerWh !== 'number') {
        warnings.push('properties.annualPowerWh should be a number');
        log(`      ⚠️  annualPowerWh: ${model.properties.annualPowerWh} (should be number)`, 'yellow');
      } else if (model.properties.annualPowerWh < 0) {
        errors.push('properties.annualPowerWh must be >= 0');
        log(`      ❌ annualPowerWh: ${model.properties.annualPowerWh} (must be >= 0)`, 'red');
      } else {
        const kWh = (model.properties.annualPowerWh / 1000).toFixed(2);
        log(`      ✅ annualPowerWh: ${model.properties.annualPowerWh} Wh (${kWh} kWh/year)`, 'green');
      }
    }
  }

  // Check optional fields
  log('\n📝 Checking Optional Fields:', 'yellow');

  if (model.description) {
    log(`   ✅ description: "${model.description.substring(0, 50)}..."`, 'green');
  } else {
    log('   ℹ️  description: not provided', 'blue');
  }

  const validDeviceTypes = [
    'washing_machine', 'dishwasher', 'refrigerator', 'dryer',
    'oven', 'microwave', 'air_conditioner', 'water_heater', 'other'
  ];

  if (model.deviceType) {
    if (validDeviceTypes.includes(model.deviceType)) {
      log(`   ✅ deviceType: ${model.deviceType}`, 'green');
    } else {
      warnings.push(`deviceType "${model.deviceType}" is not a standard type`);
      log(`   ⚠️  deviceType: ${model.deviceType} (non-standard)`, 'yellow');
    }
  } else {
    log('   ℹ️  deviceType: not provided', 'blue');
  }

  if (model.manufacturer) {
    log(`   ✅ manufacturer: ${model.manufacturer}`, 'green');
  } else {
    log('   ℹ️  manufacturer: not provided', 'blue');
  }

  if (model.modelNumber) {
    log(`   ✅ modelNumber: ${model.modelNumber}`, 'green');
  } else {
    log('   ℹ️  modelNumber: not provided', 'blue');
  }

  // Display warnings
  if (warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    warnings.forEach(warning => {
      log(`   • ${warning}`, 'yellow');
    });
  }

  // Display errors
  if (errors.length > 0) {
    log('\n❌ Errors:', 'red');
    errors.forEach(error => {
      log(`   • ${error}`, 'red');
    });
    isValid = false;
  }

  // Final result
  log('\n' + '='.repeat(50), 'cyan');
  if (isValid) {
    log('✅ Validation Passed!', 'green');
    log('   This model file is ready to import.', 'green');
  } else {
    log('❌ Validation Failed!', 'red');
    log('   Fix the errors above before importing.', 'red');
  }
  log('='.repeat(50) + '\n', 'cyan');

  return isValid;
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  log('Usage: node validate-model.js <path-to-model.json>', 'yellow');
  log('\nExample:', 'cyan');
  log('  node validate-model.js ./my-washing-machine.json', 'blue');
  process.exit(1);
}

const modelPath = path.resolve(args[0]);
const isValid = validateModel(modelPath);

process.exit(isValid ? 0 : 1);

