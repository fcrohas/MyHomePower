/**
 * GSP Parameter Tuning Script
 * Tests different parameter combinations to find optimal settings
 */

import fs from 'fs/promises';
import { disaggregatePower } from './gspDisaggregator.js';

// Load sample data
const dataPath = './data/power-data-2025-11-08.json';
const rawData = await fs.readFile(dataPath, 'utf8');
const jsonData = JSON.parse(rawData);
const data = jsonData.data || jsonData;

console.log('🔧 GSP Parameter Tuning');
console.log('='.repeat(60));
console.log(`Data points: ${data.length}`);
console.log();

// Define parameter ranges to test
const parameterGrid = {
  sigma: [10, 20, 30, 50, 100],
  ri: [0.3, 0.5, 0.7, 1.0],
  T_Positive: [15, 25, 50, 100],
  T_Negative: [-15, -25, -50, -100],
  instancelimit: [2, 3, 5, 10],
  alpha: [0.5],  // Keep these constant for now
  beta: [0.5]
};

// Test a subset of combinations (grid search would be too large)
const testConfigs = [
  // Default from paper
  { sigma: 30, ri: 0.5, T_Positive: 25, T_Negative: -25, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  
  // Lower thresholds (more sensitive)
  { sigma: 30, ri: 0.5, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  { sigma: 20, ri: 0.5, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  
  // Higher ri (allow more variation in clusters)
  { sigma: 30, ri: 1.0, T_Positive: 25, T_Negative: -25, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  { sigma: 30, ri: 0.7, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  
  // Larger sigma (smoother clustering)
  { sigma: 50, ri: 0.5, T_Positive: 25, T_Negative: -25, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  { sigma: 100, ri: 0.7, T_Positive: 25, T_Negative: -25, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  
  // Smaller sigma (finer clustering)
  { sigma: 10, ri: 0.5, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  { sigma: 20, ri: 0.7, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 2 },
  
  // Lower instance limit
  { sigma: 30, ri: 0.5, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 3 },
  { sigma: 20, ri: 0.7, T_Positive: 15, T_Negative: -15, alpha: 0.5, beta: 0.5, instancelimit: 3 },
];

const results = [];

console.log(`Testing ${testConfigs.length} parameter combinations...\n`);

for (let i = 0; i < testConfigs.length; i++) {
  const config = testConfigs[i];
  
  console.log(`Test ${i + 1}/${testConfigs.length}:`);
  console.log(`  σ=${config.sigma}, ri=${config.ri}, T+=${config.T_Positive}, T-=${config.T_Negative}, limit=${config.instancelimit}`);
  
  try {
    const startTime = Date.now();
    const result = disaggregatePower(data, config);
    const duration = Date.now() - startTime;
    
    console.log(`  ✓ ${result.numAppliances} appliances, ${(duration/1000).toFixed(1)}s`);
    
    results.push({
      config,
      numAppliances: result.numAppliances,
      appliances: result.appliances.map(a => ({
        power: a.estimatedPower?.toFixed(1),
        events: a.events?.length,
        duration: a.avgDuration?.toFixed(0)
      })),
      duration,
      message: result.message
    });
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    results.push({
      config,
      error: e.message,
      numAppliances: 0
    });
  }
  
  console.log();
}

// Sort by number of appliances found (descending)
results.sort((a, b) => b.numAppliances - a.numAppliances);

console.log('='.repeat(60));
console.log('📊 RESULTS SUMMARY (sorted by appliances found)');
console.log('='.repeat(60));
console.log();

results.forEach((r, i) => {
  const c = r.config;
  console.log(`${i + 1}. ${r.numAppliances} appliances | σ=${c.sigma} ri=${c.ri} T+=${c.T_Positive} T-=${c.T_Negative} limit=${c.instancelimit}`);
  
  if (r.appliances && r.appliances.length > 0) {
    r.appliances.forEach((app, j) => {
      console.log(`   App ${j + 1}: ${app.power}W, ${app.events} events, ${app.duration}s avg`);
    });
  } else if (r.message) {
    console.log(`   ${r.message}`);
  } else if (r.error) {
    console.log(`   Error: ${r.error}`);
  }
  
  console.log();
});

// Find best configuration
const best = results[0];
if (best.numAppliances > 0) {
  console.log('='.repeat(60));
  console.log('🏆 BEST CONFIGURATION');
  console.log('='.repeat(60));
  console.log(JSON.stringify(best.config, null, 2));
  console.log();
  console.log(`Found ${best.numAppliances} appliances in ${(best.duration/1000).toFixed(1)}s`);
} else {
  console.log('='.repeat(60));
  console.log('⚠️  NO CONFIGURATION FOUND APPLIANCES');
  console.log('='.repeat(60));
  console.log();
  console.log('Suggestions:');
  console.log('1. Check if data has clear appliance ON/OFF events');
  console.log('2. Try even lower thresholds (T_Positive < 15)');
  console.log('3. Increase ri to allow more cluster variation');
  console.log('4. Inspect clustering output with detailed logs');
}

// Save results to file
await fs.writeFile(
  './server/ml/test_results/tuning_results.json',
  JSON.stringify(results, null, 2)
);

console.log();
console.log('💾 Results saved to: server/ml/test_results/tuning_results.json');
