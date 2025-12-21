/**
 * Test GSP error handling with edge cases
 */

import { disaggregatePower } from './gspDisaggregator.js';

console.log('Testing GSP edge cases...\n');

// Test case 1: Small dataset with few events
const smallData = Array.from({ length: 100 }, (_, i) => ({
  timestamp: new Date(Date.now() + i * 60000).toISOString(),
  power: 200 + Math.random() * 50 + (i % 10 === 0 ? 100 : 0)
}));

console.log('1. Testing with small dataset (100 points)...');
try {
  const result1 = disaggregatePower(smallData, {
    sigma: 20,
    ri: 0.7,
    T_Positive: 15,
    T_Negative: -15,
    alpha: 0.5,
    beta: 0.5,
    instancelimit: 2
  });
  console.log(`   ✓ Success: ${result1.numAppliances} appliances\n`);
} catch (e) {
  console.log(`   ✗ Error: ${e.message}\n`);
}

// Test case 2: Dataset with all positive changes
const positiveOnlyData = Array.from({ length: 50 }, (_, i) => ({
  timestamp: new Date(Date.now() + i * 60000).toISOString(),
  power: 200 + i * 10
}));

console.log('2. Testing with only positive changes...');
try {
  const result2 = disaggregatePower(positiveOnlyData, {
    sigma: 20,
    ri: 0.7,
    T_Positive: 15,
    T_Negative: -15,
    alpha: 0.5,
    beta: 0.5,
    instancelimit: 2
  });
  console.log(`   ✓ Success: ${result2.numAppliances} appliances`);
  console.log(`   Message: ${result2.message}\n`);
} catch (e) {
  console.log(`   ✗ Error: ${e.message}\n`);
}

// Test case 3: Very few events (high instancelimit)
console.log('3. Testing with high instancelimit (10)...');
try {
  const result3 = disaggregatePower(smallData, {
    sigma: 20,
    ri: 0.7,
    T_Positive: 15,
    T_Negative: -15,
    alpha: 0.5,
    beta: 0.5,
    instancelimit: 10 // Very high
  });
  console.log(`   ✓ Success: ${result3.numAppliances} appliances`);
  console.log(`   Message: ${result3.message}\n`);
} catch (e) {
  console.log(`   ✗ Error: ${e.message}\n`);
}

console.log('✅ All edge case tests completed!');
