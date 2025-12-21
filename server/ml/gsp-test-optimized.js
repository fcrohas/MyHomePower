/**
 * Quick test with optimized parameters from tuning results
 */

import fs from 'fs/promises';
import { disaggregatePower } from './gspDisaggregator.js';

const dataPath = './data/power-data-2025-11-08.json';
const rawData = await fs.readFile(dataPath, 'utf8');
const jsonData = JSON.parse(rawData);
const data = jsonData.data || jsonData;

console.log('🎯 Testing GSP with Optimized Parameters');
console.log('='.repeat(60));
console.log();

// Best configuration from tuning (Test 5)
const optimizedConfig = {
  sigma: 30,
  ri: 0.7,          // Increased to allow more variation in clusters
  T_Positive: 15,   // Lower threshold to capture more events
  T_Negative: -15,
  alpha: 0.5,
  beta: 0.5,
  instancelimit: 2
};

console.log('Configuration:');
console.log(JSON.stringify(optimizedConfig, null, 2));
console.log();

const startTime = Date.now();
const result = disaggregatePower(data, optimizedConfig);
const duration = Date.now() - startTime;

console.log(`\n✅ Completed in ${(duration/1000).toFixed(1)}s\n`);
console.log('='.repeat(60));
console.log(`Found ${result.numAppliances} appliances`);
console.log('='.repeat(60));

if (result.appliances && result.appliances.length > 0) {
  result.appliances.forEach((app, i) => {
    console.log(`\nAppliance ${i + 1}:`);
    console.log(`  Estimated Power: ${app.estimatedPower?.toFixed(1)}W`);
    console.log(`  ON/OFF Events: ${app.events?.length || 0}`);
    console.log(`  Average Duration: ${app.avgDuration?.toFixed(0)}s`);
    console.log(`  Total Energy: ${app.totalEnergy?.toFixed(2)}Wh`);
    
    if (app.events && app.events.length > 0) {
      console.log(`  Sample events:`);
      app.events.slice(0, 3).forEach(evt => {
        const onTime = new Date(evt.startTime).toLocaleTimeString();
        const offTime = new Date(evt.endTime).toLocaleTimeString();
        console.log(`    ${onTime} → ${offTime} (${(evt.duration / 60).toFixed(0)}min)`);
      });
    }
  });
} else {
  console.log(`\n${result.message || 'No appliances detected'}`);
}

console.log();

// Save detailed results
await fs.writeFile(
  './server/ml/test_results/optimized_results.json',
  JSON.stringify(result, null, 2)
);
console.log('💾 Detailed results: server/ml/test_results/optimized_results.json');
