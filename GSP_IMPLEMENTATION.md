# GSP Energy Disaggregation - Implementation Details

## Overview

GSP (Graph Signal Processing) energy disaggregation is a training-less Non-Intrusive Load Monitoring (NILM) method that uses graph signal processing to identify individual appliance power consumption from aggregate household power data.

## Architecture

```
Power Data (Aggregate)
         ↓
   Event Detection
         ↓
   Multi-Scale Clustering (GSP)
         ↓
   Cluster Refinement
         ↓
   Positive/Negative Pairing
         ↓
   Feature Matching
         ↓
   Power Series Generation
         ↓
Individual Appliance Profiles
```

## Core Components

### 1. Event Detection

Identifies significant power changes that indicate appliance state transitions.

**Algorithm:**
```python
delta_p = [power[i+1] - power[i] for i in range(len(power)-1)]
events = [i for i in range(len(delta_p)) 
          if delta_p[i] > T_Positive or delta_p[i] < T_Negative]
```

**Parameters:**
- `T_Positive`: Minimum power increase to detect ON event (default: 20W)
- `T_Negative`: Minimum power decrease to detect OFF event (default: -20W)

### 2. GSP Clustering

Uses graph signal processing to cluster similar power events.

**Key Concepts:**
- **Graph Construction**: Events are nodes, edges weighted by power similarity
- **Laplacian Matrix**: Encodes graph structure for signal processing
- **Signal Smoothness**: Similar events should have similar signal values
- **Multi-Scale**: Hierarchical clustering at different resolutions

**Algorithm:**
```python
# Gaussian kernel for similarity
A[i,j] = exp(-((delta_p[i] - delta_p[j])/sigma)^2)

# Degree matrix
D[i,i] = sum(A[:,i])

# Graph Laplacian
L = D - A

# Solve for smooth signal
S* = pinv(L) * (-S[0] * L[0,:])

# Cluster events where S* > threshold
cluster = [events[i] for i in range(len(S*)) if S*[i] > 0.98]
```

**Parameters:**
- `sigma`: Controls clustering sensitivity (default: 20)
  - Larger σ → More lenient clustering (fewer clusters)
  - Smaller σ → Stricter clustering (more clusters)

### 3. Multi-Scale Refinement

Applies clustering at multiple scales to handle varying appliance signatures.

**Scales:** σ, σ/2, σ/4, σ/8, σ/14, σ/32, σ/64

**Process:**
1. Cluster at coarse scale (large σ)
2. Evaluate cluster quality using coefficient of variation: CV = |std/mean|
3. Keep good clusters (CV ≤ ri)
4. Re-cluster poor clusters at finer scale
5. Repeat until finest scale

**Parameters:**
- `ri`: Coefficient of variation threshold (default: 0.15)
  - Lower ri → Stricter cluster quality requirement

### 4. Cluster Pairing

Matches positive (ON) and negative (OFF) events to identify complete appliance cycles.

**Algorithm:**
1. Separate clusters into positive and negative groups
2. Ensure equal number of positive and negative clusters (merge if needed)
3. Pair each positive cluster with its best-matching negative cluster
4. Best match = smallest |power_positive + power_negative|

**Parameters:**
- `instancelimit`: Minimum activations for valid appliance (default: 3)

### 5. Feature Matching

Matches individual ON events with corresponding OFF events within each appliance.

**For each positive event:**
1. Find candidate negative events (occurring after, before next ON)
2. If single candidate → pair them
3. If multiple candidates → use GSP to find best match

**GSP Matching:**
- Constructs two graphs: magnitude similarity and temporal similarity
- Combines using weights: `result = α * magnitude + β * temporal`
- Selects candidate with minimum combined score

**Parameters:**
- `alpha`: Weight for magnitude matching (default: 0.5)
- `beta`: Weight for temporal matching (default: 0.5)

### 6. Power Series Generation

Reconstructs individual appliance power time series from ON/OFF pairs.

**For each appliance:**
1. For each (ON, OFF) pair:
   - Create power signature: [ON_power, interpolated_values, OFF_power]
   - Align with timestamps
2. Combine all activations into full time series
3. Fill gaps with zeros (appliance OFF)

## File Structure

```
server/ml/
├── gspSupport.js           # Core GSP algorithms
├── gspDisaggregator.js     # Main disaggregation logic
├── gsp-test.js             # Testing script
└── test_results/
    └── gsp_test_results.json
```

### gspSupport.js Functions

| Function | Purpose |
|----------|---------|
| `gspclustering_event2()` | GSP clustering for a set of events |
| `johntable()` | Filters clusters by quality |
| `find_new_events()` | Finds events needing re-clustering |
| `refined_clustering_block()` | Multi-scale clustering pipeline |
| `find_closest_pair()` | Merges similar clusters |
| `pair_clusters_appliance_wise()` | Pairs ON/OFF clusters |
| `feature_matching_module()` | Matches individual ON/OFF events |
| `generate_appliance_powerseries()` | Creates appliance time series |
| `interpolate_values()` | Linear interpolation |
| `create_appliance_timeseries()` | Adds timestamps |

### gspDisaggregator.js

Main entry point that:
1. Accepts power data array as function parameter
2. Processes data with JavaScript arrays
3. Runs complete GSP pipeline
4. Returns JavaScript object with results

## API Integration

### Server Endpoints

**POST /api/gsp/analyze-day**
- Runs GSP disaggregation on day's power data
- Executes pure JavaScript implementation
- Returns identified appliances with time series

**GET /api/gsp/config**
- Returns GSP configuration parameters
- Includes parameter descriptions and ranges

### Data Flow

```
Frontend (PowerDetector.vue)
    ↓ HTTP POST
Server (index.js)
    ↓ Function Call
JavaScript (gspDisaggregator.js)
    ↓ Process Data
GSP Processing (gspSupport.js)
    ↓ Return Object
Server (index.js)
    ↓ HTTP Response
Frontend (PowerDetector.vue)
    ↓ Display Results
```

## Testing

### Unit Tests (gsp-test.js)

```bash
cd server/ml
node gsp-test.js
```

Tests:
1. Sample data loading
2. GSP disaggregation execution
3. Results validation and saving
4. Performance measurement

### Expected Output

```
🧪 Testing GSP Energy Disaggregation (Pure JavaScript)

1️⃣ Loading sample power data...
✅ Loaded 1440 power readings

3️⃣ Running GSP disaggregation...
✅ Disaggregation completed in 2500ms

📊 Results:
   Found 3 appliances

   1. Appliance 1
      Average Power: 850.5 W
      Max Power: 1200.0 W
      Activations: 5
      Time Series Points: 450

   2. Appliance 2
      Average Power: 350.2 W
      Max Power: 400.0 W
      Activations: 8
      Time Series Points: 380
   ...
```

## Performance Characteristics

### Time Complexity

- Event Detection: O(n) where n = number of power readings
- GSP Clustering: O(m³) where m = number of events per window
- Multi-Scale: O(k * m³) where k = number of scales
- Overall: **O(n + k*m³)** typically a few seconds for a day

### Space Complexity

- O(n) for power data storage
- O(m²) for adjacency matrices during clustering
- Minimal memory footprint overall

### Accuracy

Depends on:
- **Data quality**: Higher sampling rate → Better accuracy
- **Appliance distinctiveness**: Unique signatures → Better separation
- **Usage patterns**: Clear ON/OFF cycles → Better matching
- **Parameter tuning**: Optimized for your home → Better results

## Limitations

1. **Similar Appliances**: Struggles with appliances having similar power signatures
2. **Variable Power**: Appliances with highly variable power may not cluster well
3. **Standby Power**: Low standby consumption may be missed
4. **Simultaneous Events**: Multiple appliances turning on/off simultaneously can confuse pairing
5. **Continuous Appliances**: Always-on devices (fridge) may not be detected as discrete events

## Optimization Strategies

### For Better Accuracy

1. **Tune Event Thresholds**: Match your appliance power ranges
2. **Adjust Clustering Sensitivity**: Experiment with sigma values
3. **Filter Noise**: Increase instancelimit to remove spurious detections
4. **Use Sufficient Data**: Full days with varied usage work best

### For Better Performance

1. **Window-Based Processing**: Process in chunks for very long periods
2. **Parallel Processing**: Run multiple days in parallel
3. **Caching**: Store results to avoid re-processing

## Comparison with Other Methods

### vs. Seq2Point

| Aspect | GSP | Seq2Point |
|--------|-----|-----------|
| Training | ❌ Not required | ✅ Required |
| Supervised | ❌ Unsupervised | ✅ Supervised |
| Per-Appliance Models | ❌ No | ✅ Yes |
| Appliance Names | ❌ Auto-numbered | ✅ Labeled |
| Accuracy | 70-80% | 85-95% |
| Setup Time | Instant | Hours/Days |
| Adaptability | ✅ Adapts to changes | ❌ Fixed after training |

### Best Use Cases

**Use GSP when:**
- Starting fresh (no training data)
- Exploring your home's appliances
- Quick one-time analysis needed
- Appliances change frequently

**Use Seq2Point when:**
- High accuracy required
- Known appliances to monitor
- Training data available
- Long-term monitoring

**Use Both:**
1. GSP for initial appliance discovery
2. Seq2Point for accurate long-term monitoring

## Future Enhancements

Potential improvements:
1. **Appliance Labeling**: Use power signature database for automatic naming
2. **Online Learning**: Update clusters as new data arrives
3. **Hybrid Approach**: Combine GSP clustering with ML classification
4. **Optimization**: GPU acceleration for larger datasets
5. **UI Integration**: Real-time GSP parameters tuning interface

## References

**Original Paper:**
"On a training-less solution for non-intrusive appliance load monitoring using graph signal processing"

**Repository:**
https://github.com/loneharoon/GSP_energy_disaggregator

**Graph Signal Processing:**
- Shuman et al., "The Emerging Field of Signal Processing on Graphs"
- Sandryhaila and Moura, "Discrete Signal Processing on Graphs"

## Contributing

To contribute improvements:
1. Test with your own data
2. Experiment with parameters
3. Report issues or suggest enhancements
4. Share parameter configurations that work well

---

For quick start guide, see [GSP_QUICKSTART.md](GSP_QUICKSTART.md)
