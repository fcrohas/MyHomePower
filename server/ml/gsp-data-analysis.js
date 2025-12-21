/**
 * GSP Data Analysis Script
 * Analyzes power data to understand characteristics and recommend parameters
 */

import fs from 'fs/promises';

// Load sample data
const dataPath = './data/power-data-2025-11-08.json';
const rawData = await fs.readFile(dataPath, 'utf8');
const jsonData = JSON.parse(rawData);
const data = jsonData.data || jsonData;

console.log('📊 Power Data Analysis');
console.log('='.repeat(60));
console.log();

// Basic statistics
const powers = data.map(d => d.power);
const min = Math.min(...powers);
const max = Math.max(...powers);
const avg = powers.reduce((a, b) => a + b, 0) / powers.length;
const sorted = [...powers].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];

console.log('Power Statistics:');
console.log(`  Data points: ${data.length}`);
console.log(`  Min: ${min.toFixed(1)}W`);
console.log(`  Max: ${max.toFixed(1)}W`);
console.log(`  Average: ${avg.toFixed(1)}W`);
console.log(`  Median: ${median.toFixed(1)}W`);
console.log();

// Calculate power deltas
const deltas = [];
for (let i = 1; i < data.length; i++) {
  deltas.push(data[i].power - data[i - 1].power);
}

const posDeltas = deltas.filter(d => d > 0);
const negDeltas = deltas.filter(d => d < 0);
const absDeltas = deltas.map(Math.abs);

console.log('Power Changes (Deltas):');
console.log(`  Total changes: ${deltas.length}`);
console.log(`  Positive (ON events): ${posDeltas.length}`);
console.log(`  Negative (OFF events): ${negDeltas.length}`);
console.log(`  Max increase: ${Math.max(...deltas).toFixed(1)}W`);
console.log(`  Max decrease: ${Math.min(...deltas).toFixed(1)}W`);
console.log(`  Avg abs change: ${(absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length).toFixed(1)}W`);
console.log();

// Find significant changes at different thresholds
const thresholds = [5, 10, 15, 20, 25, 50, 100, 200];
console.log('Significant Changes by Threshold:');
thresholds.forEach(t => {
  const pos = deltas.filter(d => d > t).length;
  const neg = deltas.filter(d => d < -t).length;
  console.log(`  T=${t}W: ${pos} positive, ${neg} negative (${pos + neg} total)`);
});
console.log();

// Histogram of significant changes (> 15W)
const significantDeltas = deltas.filter(d => Math.abs(d) > 15);
const bins = 20;
const binSize = (Math.max(...significantDeltas.map(Math.abs)) - 15) / bins;

console.log('Distribution of Significant Changes (>15W):');
const histogram = {};
for (const delta of significantDeltas) {
  const absVal = Math.abs(delta);
  const binIdx = Math.min(Math.floor((absVal - 15) / binSize), bins - 1);
  const binLabel = `${(15 + binIdx * binSize).toFixed(0)}-${(15 + (binIdx + 1) * binSize).toFixed(0)}W`;
  histogram[binLabel] = (histogram[binLabel] || 0) + 1;
}

Object.entries(histogram)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([bin, count]) => {
    const bar = '█'.repeat(Math.ceil(count / 5));
    console.log(`  ${bin.padEnd(12)} ${bar} ${count}`);
  });
console.log();

// Detect potential appliance signatures
console.log('Potential Appliance Signatures:');
console.log('(Looking for repeated power changes within 10% tolerance)');

const tolerance = 0.1; // 10%
const signatures = new Map();

significantDeltas.forEach(delta => {
  const absVal = Math.abs(delta);
  if (absVal < 15) return;
  
  // Find if this matches an existing signature
  let matched = false;
  for (const [sig, count] of signatures.entries()) {
    if (Math.abs(absVal - sig) / sig < tolerance) {
      signatures.set(sig, count + 1);
      matched = true;
      break;
    }
  }
  
  if (!matched) {
    signatures.set(absVal, 1);
  }
});

// Filter signatures with at least 3 occurrences
const commonSignatures = [...signatures.entries()]
  .filter(([_, count]) => count >= 3)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

if (commonSignatures.length > 0) {
  commonSignatures.forEach(([power, count]) => {
    console.log(`  ~${power.toFixed(0)}W: ${count} occurrences`);
  });
} else {
  console.log('  No repeated patterns found (may need lower threshold)');
}
console.log();

// Recommendations
console.log('='.repeat(60));
console.log('💡 PARAMETER RECOMMENDATIONS');
console.log('='.repeat(60));
console.log();

// Find threshold that gives 100-500 events
let recommendedThreshold = 25;
for (const t of thresholds) {
  const pos = deltas.filter(d => d > t).length;
  const neg = deltas.filter(d => d < -t).length;
  const total = pos + neg;
  if (total >= 100 && total <= 2000) {
    recommendedThreshold = t;
    break;
  }
}

const avgSigChange = significantDeltas.length > 0
  ? significantDeltas.reduce((a, b) => a + Math.abs(b), 0) / significantDeltas.length
  : 50;

console.log('Suggested GSP Parameters:');
console.log(`{
  "sigma": ${Math.round(avgSigChange)},          // Based on avg significant change
  "ri": 0.5,             // Standard coefficient of variation threshold
  "T_Positive": ${recommendedThreshold},        // Threshold for ON events
  "T_Negative": ${-recommendedThreshold},       // Threshold for OFF events
  "alpha": 0.5,          // Magnitude weight
  "beta": 0.5,           // Temporal weight
  "instancelimit": 2     // Min occurrences per appliance
}`);
console.log();

console.log('Notes:');
console.log(`  - Lower thresholds capture more events but may include noise`);
console.log(`  - sigma=${Math.round(avgSigChange)} matches typical power change magnitude`);
console.log(`  - Detected ${commonSignatures.length} potential appliance signatures`);
console.log(`  - Try ri=0.7-1.0 if clustering is too strict`);
console.log();
