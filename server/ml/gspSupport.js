/**
 * GSP (Graph Signal Processing) Energy Disaggregation - Support Functions
 * Pure JavaScript implementation - no Python dependencies required
 * 
 * Adapted from: https://github.com/loneharoon/GSP_energy_disaggregator
 * 
 * This module includes all supporting functions for GSP energy disaggregation.
 * The GSP method is a training-less solution for non-intrusive appliance load monitoring.
 */

import * as math from 'mathjs';
import { Matrix, QrDecomposition } from 'ml-matrix';

/**
 * Performs GSP clustering on events using Graph Signal Processing
 * This is the core algorithm from the paper - NOT simplified
 * Uses Gaussian kernel, Graph Laplacian, and smoothing to cluster events
 * @param {number[]} event - Array of event indices
 * @param {number[]} delta_p - Power delta values
 * @param {number} sigma - Gaussian kernel parameter
 * @returns {number[]} - Single cluster array of events where smoothed signal > 0.98
 */
function gspclustering_event2(event, delta_p, sigma) {
  const winL = 1000; // Window length as in original Python implementation
  const Smstar = new Array(event.length).fill(0);
  
  // Process events in windows of winL
  for (let k = 0; k < Math.floor(event.length / winL); k++) {
    const r = [];
    const event_1 = event.slice(k * winL, (k + 1) * winL);
    
    // Build feature vector r
    r.push(delta_p[event[0]]);
    event_1.forEach(i => r.push(delta_p[i]));
    
    const templen = winL + 1;
    const Sm = new Array(templen).fill(0);
    Sm[0] = 1;
    
    // Build adjacency matrix Am with Gaussian kernel weighting
    const Am_data = [];
    for (let i = 0; i < templen; i++) {
      const row = [];
      for (let j = 0; j < templen; j++) {
        row.push(Math.exp(-Math.pow((r[i] - r[j]) / sigma, 2)));
      }
      Am_data.push(row);
    }
    const Am = new Matrix(Am_data);
    
    // Build degree matrix Dm
    const Dm = Matrix.zeros(templen, templen);
    for (let i = 0; i < templen; i++) {
      const sum = Am.getColumn(i).reduce((a, b) => a + b, 0);
      Dm.set(i, i, sum);
    }
    
    // Compute Graph Laplacian Lm = Dm - Am
    const Lm = Matrix.sub(Dm, Am);
    
    // Solve for smooth signal: Smstar = pinv(Lm[1:,1:]) * (-Sm[0] * Lm[0,1:])
    try {
      // Extract submatrix Lm[1:templen, 1:templen]
      const Lm_sub = Lm.subMatrix(1, templen - 1, 1, templen - 1);
      // Extract Lm[0, 1:templen]
      const Lm_0_row = [];
      for (let i = 1; i < templen; i++) {
        Lm_0_row.push(Lm.get(0, i));
      }
      
      // Use QR decomposition to solve Lm_sub * x = b
      // This matches Python's behavior and is fast
      const b = Matrix.columnVector(Lm_0_row.map(v => -Sm[0] * v));
      const qr = new QrDecomposition(Lm_sub);
      const result = qr.solve(b);
      
      for (let i = 0; i < winL; i++) {
        Smstar[k * winL + i] = result.get(i, 0);
      }
    } catch (e) {
      // If matrix inversion fails, leave as zeros
      console.warn(`GSP clustering: matrix inversion failed for window ${k+1}: ${e.message}`);
    }
  }
  
  // Process remaining elements (if event.length % winL > 0)
  if (event.length % winL > 0) {
    const r = [];
    const event_1 = event.slice(Math.floor(event.length / winL) * winL);
    const newlen = event_1.length + 1;
    
    r.push(delta_p[event[0]]);
    event_1.forEach(i => r.push(delta_p[i]));
    
    const Sm = new Array(newlen).fill(0);
    Sm[0] = 1;
    
    const Am_data = [];
    for (let i = 0; i < newlen; i++) {
      const row = [];
      for (let j = 0; j < newlen; j++) {
        row.push(Math.exp(-Math.pow((r[i] - r[j]) / sigma, 2)));
      }
      Am_data.push(row);
    }
    const Am = new Matrix(Am_data);
    
    const Dm = Matrix.zeros(newlen, newlen);
    for (let i = 0; i < newlen; i++) {
      const sum = Am.getColumn(i).reduce((a, b) => a + b, 0);
      Dm.set(i, i, sum);
    }
    
    const Lm = Matrix.sub(Dm, Am);
    
    try {
      const Lm_sub = Lm.subMatrix(1, newlen - 1, 1, newlen - 1);
      const Lm_0_row = [];
      for (let i = 1; i < newlen; i++) {
        Lm_0_row.push(Lm.get(0, i));
      }
      
      // Use QR decomposition for remainder
      const b = Matrix.columnVector(Lm_0_row.map(v => -Sm[0] * v));
      const qr = new QrDecomposition(Lm_sub);
      const result = qr.solve(b);
      
      for (let i = 0; i < event_1.length; i++) {
        Smstar[Math.floor(event.length / winL) * winL + i] = result.get(i, 0);
      }
    } catch (e) {
      console.warn(`GSP clustering: matrix inversion failed for remainder: ${e.message}`);
    }
  }
  
  // Threshold at 0.98 (empirically determined value from paper)
  // Returns events where smoothed signal indicates they belong together
  const cluster = [];
  for (let i = 0; i < Smstar.length; i++) {
    if (Smstar[i] > 0.98) {
      cluster.push(event[i]);
    }
  }
  
  return cluster;
}

/**
 * Filters clusters based on coefficient of variation threshold
 */
function johntable(clusters, precluster, delta_p, ri) {
  let kept = 0;
  let discarded = 0;
  
  for (let h = 0; h < clusters.length; h++) {
    const values = clusters[h].map(i => delta_p[i]);
    const stds = math.std(values, 'unbiased');
    const means = math.mean(values);
    const cv = Math.abs(stds / means);
    
    if (cv <= ri) {
      precluster.push([...clusters[h]]);
      kept++;
    } else {
      discarded++;
    }
  }
  
  return precluster;
}

/**
 * Finds events that don't meet the clustering criteria
 */
function findNewEvents(clusters, delta_p, ri) {
  const newevents = [];
  
  for (let h = 0; h < clusters.length; h++) {
    const values = clusters[h].map(i => delta_p[i]);
    const stds = math.std(values, 'unbiased');
    const means = math.mean(values);
    
    if (Math.abs(stds / means) > ri) {
      newevents.push(...clusters[h]);
    }
  }
  
  return newevents;
}

/**
 * Identifies and merges the closest clusters based on mean values
 */
function findClosestPair(cluster_means, cluster_group) {
  const distances = [];
  
  for (let i = 0; i < cluster_means.length - 1; i++) {
    for (let j = i + 1; j < cluster_means.length; j++) {
      const distance = Math.abs(cluster_means[i] - cluster_means[j]);
      distances.push({ i, j, distance });
    }
  }
  
  // If no distances (only 0 or 1 clusters), return as is
  if (distances.length === 0) {
    return cluster_group;
  }
  
  const merge_pair = distances.reduce((min, curr) => 
    curr.distance < min.distance ? curr : min
  );
  
  const cluster_dict = {};
  cluster_group.forEach((group, idx) => {
    cluster_dict[idx] = group;
  });
  
  const tempcluster = [];
  tempcluster.push([...cluster_dict[merge_pair.i], ...cluster_dict[merge_pair.j]]);
  delete cluster_dict[merge_pair.i];
  delete cluster_dict[merge_pair.j];
  
  Object.values(cluster_dict).forEach(v => tempcluster.push(v));
  
  return tempcluster;
}

/**
 * Performs multi-scale clustering as explained in the GSP paper
 * Uses multiple sigma values to cluster at different scales
 */
function refinedClusteringBlock(event, delta_p, sigma, ri) {
  const sigmas = [sigma, sigma/2, sigma/4, sigma/8, sigma/14, sigma/32, sigma/64];
  let Finalcluster = [];
  let currentEvent = [...event];
  
  console.log(`Starting multi-scale GSP clustering with ${event.length} events...`);
  
  for (let k = 0; k < sigmas.length; k++) {
    const clusters = [];
    currentEvent = currentEvent.filter(e => !clusters.flat().includes(e)).sort((a, b) => a - b);
    
    console.log(`  Scale ${k+1}/${sigmas.length} (σ=${sigmas[k].toFixed(2)}): ${currentEvent.length} events remaining`);
    
    // Process all remaining events at this sigma level
    while (currentEvent.length > 0) {
      const clus = gspclustering_event2(currentEvent, delta_p, sigmas[k]);
      
      if (clus.length === 0) {
        break;
      }
      
      clusters.push(clus);
      currentEvent = currentEvent.filter(e => !clus.includes(e)).sort((a, b) => a - b);
    }
    
    console.log(`    → Found ${clusters.length} clusters at this scale`);
    
    // At the last sigma level, just concatenate all clusters
    if (k === sigmas.length - 1) {
      Finalcluster = Finalcluster.concat(clusters);
    } else {
      // For intermediate levels, filter by coefficient of variation
      const jt = johntable(clusters, Finalcluster, delta_p, ri);
      Finalcluster = jt;
      const events_updated = findNewEvents(clusters, delta_p, ri);
      currentEvent = events_updated.sort((a, b) => a - b);
    }
  }
  
  // Add any remaining events as a final cluster
  if (currentEvent.length > 0) {
    Finalcluster.push(currentEvent);
  }
  
  return Finalcluster;
}

/**
 * Gaussian PDF for normal distribution
 */
function normalPdf(x, mean, std) {
  const variance = std * std;
  const denom = Math.sqrt(2 * Math.PI * variance);
  const num = Math.exp(-Math.pow(x - mean, 2) / (2 * variance));
  return num / denom;
}

/**
 * Pairs positive and negative clusters to identify individual appliances
 */
function pairClustersApplianceWise(Finalcluster, data_vec, delta_p, instancelimit) {
  // Calculate statistics for each cluster
  const Table_1 = [];
  for (let i = 0; i < Finalcluster.length; i++) {
    const values = Finalcluster[i].map(j => delta_p[j]);
    const count = Finalcluster[i].length;
    const mean = math.mean(values);
    const std = math.std(values, 'unbiased');
    const cv = Math.abs(std / mean);
    Table_1.push([count, mean, std, cv]);
  }
  
  // Sort by mean in decreasing order
  const sortIndices = Table_1
    .map((row, idx) => ({ idx, mean: row[1] }))
    .sort((a, b) => b.mean - a.mean)
    .map(item => item.idx);
  
  const sorted_cluster = sortIndices.map(idx => Finalcluster[idx]);
  const FinalTable = sortIndices.map(idx => Table_1[idx]);
  
  // Keep clusters with sufficient instances
  const DelP = [];
  for (let i = 0; i < data_vec.length - 1; i++) {
    DelP.push(Math.round((data_vec[i + 1] - data_vec[i]) * 100) / 100);
  }
  
  const Newcluster_1 = [];
  const Newtable = [];
  
  for (let i = 0; i < FinalTable.length; i++) {
    if (FinalTable[i][0] >= instancelimit) {
      Newcluster_1.push(sorted_cluster[i]);
      Newtable.push(FinalTable[i]);
    }
  }
  
  const Newcluster = Newcluster_1.map(c => [...c]);
  
  // If no clusters meet the instance limit, keep all clusters
  if (Newcluster.length === 0) {
    console.log('No clusters meet instancelimit, keeping all clusters');
    return { 
      clusters: sorted_cluster.map(c => [...c]), 
      pairs: [] 
    };
  }
  
  // Merge small clusters into larger ones
  for (let i = 0; i < FinalTable.length; i++) {
    if (FinalTable[i][0] < instancelimit) {
      for (let j = 0; j < sorted_cluster[i].length; j++) {
        const count = [];
        
        for (let k = 0; k < Newcluster.length; k++) {
          count.push(normalPdf(DelP[sorted_cluster[i][j]], Newtable[k][1], Newtable[k][2]));
        }
        
        const maxCount = Math.max(...count);
        const maxIndices = count.map((c, idx) => c === maxCount ? idx : -1).filter(idx => idx !== -1);
        
        let johnIndex;
        if (maxIndices.length === 1) {
          johnIndex = maxIndices[0];
        } else if (DelP[sorted_cluster[i][j]] > 0) {
          const tablemeans = Newtable.map(r => r[1]);
          const validMeans = tablemeans.filter(m => m < DelP[sorted_cluster[i][j]]);
          if (validMeans.length > 0) {
            const tempelem = validMeans[0];
            johnIndex = tablemeans.indexOf(tempelem);
          } else {
            johnIndex = 0;
          }
        } else {
          const tablemeans = Newtable.map(r => r[1]);
          const validMeans = tablemeans.filter(m => m > DelP[sorted_cluster[i][j]]);
          if (validMeans.length > 0) {
            const tempelem = validMeans[validMeans.length - 1];
            johnIndex = tablemeans.indexOf(tempelem);
          } else {
            johnIndex = Newtable.length - 1;
          }
        }
        
        Newcluster[johnIndex].push(sorted_cluster[i][j]);
      }
    }
  }
  
  // Update table with new cluster statistics
  const Table_2 = [];
  for (let i = 0; i < Newcluster.length; i++) {
    const values = Newcluster[i].map(j => delta_p[j]);
    const count = Newcluster[i].length;
    const mean = math.mean(values);
    const std = math.std(values, 'unbiased');
    const cv = Math.abs(std / mean);
    Table_2.push([count, mean, std, cv]);
  }
  
  // Balance positive and negative clusters
  let pos_clusters = Table_2.filter(row => row[1] > 0).length;
  let neg_clusters = Table_2.filter(row => row[1] < 0).length;
  
  let Newcluster_cp = JSON.parse(JSON.stringify(Newcluster));
  
  let balanceIterations = 0;
  const maxBalanceIterations = 100; // Prevent infinite loop
  
  while (pos_clusters !== neg_clusters && balanceIterations < maxBalanceIterations) {
    balanceIterations++;
    
    const power_cluster = Newcluster_cp.map(cluster => 
      cluster.map(idx => delta_p[idx])
    );
    
    const clustermeans = power_cluster.map(values => math.mean(values));
    
    const positive_cluster_chunk = [];
    const negative_cluster_chunk = [];
    const positive_cluster_means = [];
    const negative_cluster_means = [];
    
    pos_clusters = 0;
    neg_clusters = 0;
    
    for (let j = 0; j < clustermeans.length; j++) {
      if (clustermeans[j] > 0) {
        pos_clusters++;
        positive_cluster_chunk.push(Newcluster_cp[j]);
        positive_cluster_means.push(clustermeans[j]);
      } else {
        neg_clusters++;
        negative_cluster_chunk.push(Newcluster_cp[j]);
        negative_cluster_means.push(clustermeans[j]);
      }
    }
    
    // If we can't balance further (only 1 cluster on one side), break
    if ((pos_clusters > neg_clusters && positive_cluster_chunk.length <= 1) ||
        (neg_clusters > pos_clusters && negative_cluster_chunk.length <= 1)) {
      break;
    }
    
    if (pos_clusters > neg_clusters) {
      const merged = findClosestPair(positive_cluster_means, positive_cluster_chunk);
      Newcluster_cp = [...merged, ...negative_cluster_chunk];
    } else if (neg_clusters > pos_clusters) {
      const merged = findClosestPair(negative_cluster_means, negative_cluster_chunk);
      Newcluster_cp = [...positive_cluster_chunk, ...merged];
    }
  }
  
  // Pair positive and negative clusters
  const clus_means = Newcluster_cp.map(cluster => {
    const values = cluster.map(idx => delta_p[idx]);
    return math.mean(values);
  });
  
  // Check if we have both positive and negative clusters
  const hasPositive = clus_means.some(m => m > 0);
  const hasNegative = clus_means.some(m => m < 0);
  
  if (!hasPositive || !hasNegative) {
    console.log('Cannot pair clusters: missing positive or negative clusters');
    return { clusters: Newcluster_cp, pairs: [] };
  }
  
  const pairs = [];
  for (let i = 0; i < clus_means.length; i++) {
    if (clus_means[i] > 0) {
      const neg_edges = [];
      for (let j = i + 1; j < clus_means.length; j++) {
        if (clus_means[j] < 0) {
          neg_edges.push({ 
            mag: Math.abs(clus_means[i] + clus_means[j]), 
            j 
          });
        }
      }
      
      if (neg_edges.length > 0) {
        const best = neg_edges.reduce((min, curr) => curr.mag < min.mag ? curr : min);
        pairs.push([i, best.j]);
      }
    }
  }
  
  // Resolve multiple pairings
  const dic_def = {};
  pairs.forEach(([pos, neg]) => {
    if (!dic_def[neg]) dic_def[neg] = [];
    dic_def[neg].push(pos);
  });
  
  const updated_pairs = [];
  Object.keys(dic_def).forEach(neg_edge_str => {
    const neg_edge = parseInt(neg_edge_str);
    const pos_edges = dic_def[neg_edge];
    
    if (pos_edges.length > 1) {
      const candidates = pos_edges.map(edge => 
        Math.abs(clus_means[edge] + clus_means[neg_edge])
      );
      const minIdx = candidates.indexOf(Math.min(...candidates));
      updated_pairs.push([pos_edges[minIdx], neg_edge]);
    } else {
      updated_pairs.push([pos_edges[0], neg_edge]);
    }
  });
  
  return { clusters: Newcluster_cp, pairs: updated_pairs };
}

/**
 * Matches positive and negative edges (ON/OFF events) for each appliance
 */
function featureMatchingModule(pairs, DelP, Newcluster, alpha, beta) {
  const appliance_pairs = {};
  
  for (let i = 0; i < pairs.length; i++) {
    const pos_cluster = [...Newcluster[pairs[i][0]]].sort((a, b) => a - b);
    const neg_cluster = [...Newcluster[pairs[i][1]]].sort((a, b) => a - b);
    let flag = 0;
    const state_pairs = [];
    
    for (let j = 0; j < pos_cluster.length; j++) {
      if (j === pos_cluster.length - 1) {
        flag = 1;
      }
      
      const start_pos = pos_cluster[j];
      let neg_set;
      
      if (flag) {
        neg_set = neg_cluster.filter(h => h > start_pos);
      } else {
        const next_pos = pos_cluster[j + 1];
        if (next_pos - start_pos === 1) {
          continue;
        }
        neg_set = neg_cluster.filter(h => h > start_pos && h < next_pos);
      }
      
      if (neg_set.length === 1) {
        state_pairs.push([start_pos, neg_set[0]]);
      } else if (neg_set.length === 0) {
        continue;
      } else {
        // Multiple negative edges - use GSP to find best match
        const phi_m = neg_set.map(h => DelP[h] + DelP[start_pos]);
        const phi_t = neg_set.map(h => h - start_pos);
        const newlen = neg_set.length;
        const sigma = 1;
        
        // Magnitude similarity
        const Am = math.zeros(newlen, newlen);
        for (let k = 0; k < newlen; k++) {
          for (let p = 0; p < newlen; p++) {
            Am.set([k, p], Math.exp(-Math.pow((phi_m[k] - phi_m[p]) / sigma, 2)));
          }
        }
        
        // Temporal similarity
        const At = math.zeros(newlen, newlen);
        for (let k = 0; k < newlen; k++) {
          for (let p = 0; p < newlen; p++) {
            At.set([k, p], Math.exp(-Math.pow((phi_t[k] - phi_t[p]) / sigma, 2)));
          }
        }
        
        // Magnitude processing
        const Dm = math.zeros(newlen, newlen);
        for (let z = 0; z < newlen; z++) {
          const sum = math.sum(math.column(Am, z));
          Dm.set([z, z], sum);
        }
        
        const Lm = math.subtract(Dm, Am);
        const Sm = new Array(newlen).fill(0);
        Sm[0] = math.mean(phi_m);
        
        let Smstar;
        try {
          const Lm_inv = math.pinv(Lm);
          const Lm_0 = math.row(Lm, 0);
          const Lm_0_scaled = math.multiply(-Sm[0], Lm_0);
          Smstar = math.multiply(Lm_inv, math.transpose([Lm_0_scaled.toArray()]));
        } catch (e) {
          Smstar = math.zeros(newlen, 1);
        }
        
        // Temporal processing
        const Dt = math.zeros(newlen, newlen);
        for (let z = 0; z < newlen; z++) {
          const sum = math.sum(math.column(At, z));
          Dt.set([z, z], sum);
        }
        
        const Lt = math.subtract(Dt, At);
        const St = new Array(newlen).fill(0);
        St[0] = math.median(phi_t);
        
        let Ststar;
        try {
          const Lt_inv = math.pinv(Lt);
          const Lt_0 = math.row(Lt, 0);
          const Lt_0_scaled = math.multiply(-St[0], Lt_0);
          Ststar = math.multiply(Lt_inv, math.transpose([Lt_0_scaled.toArray()]));
        } catch (e) {
          Ststar = math.zeros(newlen, 1);
        }
        
        // Combine results
        const result_vec = [];
        for (let f = 0; f < newlen; f++) {
          const sm = Smstar.size()[0] > f ? Smstar.get([f, 0]) : 0;
          const st = Ststar.size()[0] > f ? Ststar.get([f, 0]) : 0;
          result_vec.push(alpha * sm + beta * st);
        }
        
        const minVal = Math.min(...result_vec);
        const best_pos = result_vec.indexOf(minVal);
        state_pairs.push([start_pos, neg_set[best_pos]]);
      }
    }
    
    appliance_pairs[i] = state_pairs;
  }
  
  return appliance_pairs;
}

/**
 * Linear interpolation for filling values between events
 */
function interpolateValues(A) {
  const arr = [...A];
  const indices = arr.map((val, idx) => ({ val, idx }));
  const valid = indices.filter(item => !isNaN(item.val) && isFinite(item.val));
  const invalid = indices.filter(item => isNaN(item.val) || !isFinite(item.val));
  
  if (valid.length < 2) return arr;
  
  invalid.forEach(item => {
    const idx = item.idx;
    
    // Find nearest valid points
    const before = valid.filter(v => v.idx < idx);
    const after = valid.filter(v => v.idx > idx);
    
    if (before.length > 0 && after.length > 0) {
      const x0 = before[before.length - 1];
      const x1 = after[0];
      
      // Linear interpolation
      const slope = (x1.val - x0.val) / (x1.idx - x0.idx);
      arr[idx] = x0.val + slope * (idx - x0.idx);
    }
  });
  
  return arr.map(v => Math.round(v));
}

/**
 * Generates full power time series for each detected appliance
 */
function generateAppliancePowerseries(appliance_pairs, DelP) {
  const power_series = {};
  const appliance_signatures = {};
  
  Object.keys(appliance_pairs).forEach(appId => {
    const events = appliance_pairs[appId];
    const timeseq = [];
    const powerseq = [];
    
    events.forEach(event => {
      const start = event[0];
      const end = event[1];
      const duration = end - start;
      
      const instance = [];
      instance.push(DelP[start]);
      for (let i = 0; i < duration - 1; i++) {
        instance.push(NaN);
      }
      instance.push(Math.abs(DelP[end]));
      
      const powerval = interpolateValues(instance);
      const timeval = [];
      for (let i = start; i <= end; i++) {
        timeval.push(i);
      }
      
      timeseq.push(...timeval);
      powerseq.push(...powerval);
    });
    
    power_series[appId] = { timestamp: timeseq, power: powerseq };
    appliance_signatures[appId] = powerseq;
  });
  
  return { power_series, appliance_signatures };
}

/**
 * Converts indexed power series into time-indexed power series
 */
function createApplianceTimeseries(power_series, main_ind) {
  const result = {};
  
  Object.keys(power_series).forEach(appId => {
    const series = power_series[appId];
    if (series.timestamp.length < 1) return;
    
    const timeseries = [];
    for (let i = 0; i < series.timestamp.length; i++) {
      const idx = series.timestamp[i];
      if (idx >= 0 && idx < main_ind.length) {
        timeseries.push({
          timestamp: main_ind[idx],
          power: series.power[i]
        });
      }
    }
    
    result[appId] = timeseries;
  });
  
  return result;
}

export {
  gspclustering_event2,
  johntable,
  findNewEvents,
  refinedClusteringBlock,
  findClosestPair,
  pairClustersApplianceWise,
  featureMatchingModule,
  generateAppliancePowerseries,
  createApplianceTimeseries,
  interpolateValues
};
