/**
 * GSP (Graph Signal Processing) Energy Disaggregation - Main Module
 * Pure JavaScript implementation
 * 
 * This implements GSP energy disaggregation method proposed in the paper:
 * "On a training-less solution for non-intrusive appliance load monitoring using graph signal processing"
 * 
 * The GSP method is a training-less approach that uses graph signal processing to identify
 * appliance usage patterns from aggregate power consumption data.
 */

import * as gsp from './gspSupport.js';
import * as math from 'mathjs';

/**
 * Main function to disaggregate power data using GSP method
 * @param {Array} powerData - Array of {timestamp, power} objects
 * @param {Object} config - Optional configuration parameters
 * @returns {Object} - Disaggregated appliances and their power series
 */
function disaggregatePower(powerData, config = null) {
  // Default configuration
  const defaultConfig = {
    sigma: 20,              // Gaussian kernel parameter
    ri: 0.15,               // Coefficient of variation threshold
    T_Positive: 20,         // Positive event threshold (Watts)
    T_Negative: -20,        // Negative event threshold (Watts)
    alpha: 0.5,             // Weight for magnitude matching
    beta: 0.5,              // Weight for temporal matching
    instancelimit: 3        // Minimum appliance ON instances
  };
  
  const cfg = { ...defaultConfig, ...config };
  
  // Sort by timestamp
  const sortedData = [...powerData].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );
  
  // Extract power values and timestamps
  const data_vec = sortedData.map(d => d.power);
  const main_ind = sortedData.map(d => d.timestamp);
  
  // Calculate power deltas (changes between consecutive readings)
  const delta_p = [];
  for (let i = 0; i < data_vec.length - 1; i++) {
    delta_p.push(Math.round((data_vec[i + 1] - data_vec[i]) * 100) / 100);
  }
  
  // Detect significant events (power changes above thresholds)
  const event = [];
  const positiveEvents = [];
  const negativeEvents = [];
  
  for (let i = 0; i < delta_p.length; i++) {
    if (delta_p[i] > cfg.T_Positive) {
      event.push(i);
      positiveEvents.push(i);
    } else if (delta_p[i] < cfg.T_Negative) {
      event.push(i);
      negativeEvents.push(i);
    }
  }
  
  if (event.length === 0) {
    return {
      appliances: [],
      numAppliances: 0,
      message: 'No significant power events detected in the data'
    };
  }
  
  // Initial and refined clustering block
  console.log(`Detected ${event.length} power change events (${positiveEvents.length} positive, ${negativeEvents.length} negative)`);
  const clusters = gsp.refinedClusteringBlock(event, delta_p, cfg.sigma, cfg.ri);
  console.log(`Formed ${clusters.length} initial clusters`);
  
  // Feature matching block - pairs clusters appliance-wise
  const { clusters: finalclusters, pairs } = gsp.pairClustersApplianceWise(
    clusters, 
    data_vec, 
    delta_p, 
    cfg.instancelimit
  );
  
  if (pairs.length === 0) {
    return {
      appliances: [],
      numAppliances: 0,
      message: 'Could not identify distinct appliances in the data'
    };
  }
  
  console.log(`Identified ${pairs.length} potential appliances`);
  
  // Match positive and negative edges for each appliance
  const appliance_pairs = gsp.featureMatchingModule(
    pairs, 
    delta_p, 
    finalclusters, 
    cfg.alpha, 
    cfg.beta
  );
  
  // Create appliance-wise disaggregated power series
  const { power_series, appliance_signatures } = gsp.generateAppliancePowerseries(
    appliance_pairs, 
    delta_p
  );
  
  // Attach timestamps to generated series
  const power_timeseries = gsp.createApplianceTimeseries(power_series, main_ind);
  
  // Convert to result format
  const appliances = [];
  
  Object.keys(power_timeseries).forEach((appId, idx) => {
    const timeseries = power_timeseries[appId];
    const signature = appliance_signatures[appId];
    
    // Calculate statistics
    const positiveValues = signature.filter(p => p > 0);
    const avgPower = positiveValues.length > 0 ? math.mean(positiveValues) : 0;
    const maxPower = signature.length > 0 ? Math.max(...signature) : 0;
    const num_activations = appliance_pairs[appId] ? appliance_pairs[appId].length : 0;
    
    appliances.push({
      id: `appliance_${idx + 1}`,
      name: `Appliance ${idx + 1}`,
      avgPower: Math.round(avgPower * 10) / 10,
      maxPower: Math.round(maxPower * 10) / 10,
      activations: num_activations,
      timeseries: timeseries
    });
  });
  
  return {
    appliances,
    numAppliances: appliances.length,
    config: cfg
  };
}

export { disaggregatePower };
