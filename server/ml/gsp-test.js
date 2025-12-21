/**
 * GSP Energy Disaggregation - Test Script
 * 
 * This script tests the GSP (Graph Signal Processing) disaggregation algorithm
 * with sample power data from the data directory.
 */

import { disaggregatePower } from './gspDisaggregator.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load power data from a JSON file
 * @param {string} filename - Name of the data file
 * @returns {Promise<Array>} - Power data array
 */
async function loadPowerData(filename) {
  const filePath = path.join(__dirname, '..', '..', 'data', filename);
  const content = await fs.readFile(filePath, 'utf8');
  const jsonData = JSON.parse(content);
  
  // Handle both formats: direct array or nested in 'data' property
  const data = Array.isArray(jsonData) ? jsonData : (jsonData.data || []);
  
  // Convert to expected format
  return data.map(item => ({
    timestamp: item.timestamp || item.last_changed || item.last_updated,
    power: parseFloat(item.power || item.value || item.state || 0)
  }));
}

/**
 * Main test function
 */
async function main() {
  console.log('🧪 Testing GSP Energy Disaggregation (Pure JavaScript)\n');
  
  try {
    // Load sample data
    console.log('1️⃣ Loading sample power data...');
    const powerData = await loadPowerData('power-data-2025-12-16.json');
    console.log(`✅ Loaded ${powerData.length} power readings\n`);
    
    // Default GSP configuration
    const config = {
      sigma: 30,              // Gaussian kernel parameter (increased for better clustering)
      ri: 0.5,                // Coefficient of variation threshold (increased to allow more variation)
      T_Positive: 25,         // Positive event threshold (lower to capture more events)
      T_Negative: -25,        // Negative event threshold (lower to capture more events)
      alpha: 0.5,             // Weight for magnitude matching
      beta: 0.5,              // Weight for temporal matching
      instancelimit: 2        // Minimum appliance ON instances (lowered from 3)
    };
    
    console.log('2️⃣ Running GSP disaggregation...');
    console.log('   Configuration:', JSON.stringify(config, null, 2));
    
    const startTime = Date.now();
    const result = disaggregatePower(powerData, config);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Disaggregation completed in ${duration}ms\n`);
    
    // Display results
    console.log('📊 Results:');
    console.log(`   Found ${result.numAppliances} appliances\n`);
    
    if (result.appliances && result.appliances.length > 0) {
      result.appliances.forEach((appliance, idx) => {
        console.log(`   ${idx + 1}. ${appliance.name}`);
        console.log(`      Average Power: ${appliance.avgPower.toFixed(1)} W`);
        console.log(`      Max Power: ${appliance.maxPower.toFixed(1)} W`);
        console.log(`      Activations: ${appliance.activations}`);
        console.log(`      Time Series Points: ${appliance.timeseries.length}\n`);
      });
    } else if (result.message) {
      console.log(`   ℹ️  ${result.message}\n`);
    }
    
    // Save detailed results to file
    const outputPath = path.join(__dirname, 'test_results', 'gsp_test_results.json');
    await fs.mkdir(path.join(__dirname, 'test_results'), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(`💾 Detailed results saved to: ${outputPath}\n`);
    
    console.log('✨ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { loadPowerData };
