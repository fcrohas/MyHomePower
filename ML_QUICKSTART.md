# Quick Start: ML Tag Predictor

## 🚀 Getting Started in 5 Minutes

### Step 1: Install Dependencies (1 min)
```bash
cd /home/fcr/projects/ai-power-viewer
npm install
```

### Step 2: Start the Servers (30 sec)

**Terminal 1 - Backend:**
```bash
npm run dev:server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

**Or start both together:**
```bash
npm run dev:all
```

### Step 3: Collect Training Data (ongoing)

1. Open http://localhost:5173
2. Connect to your Home Assistant
3. Tag power consumption patterns for at least 3 days
4. Click "💾 Save Day" button after tagging each day
5. Data will be saved to the `data/` folder

### Step 4: Train the Model (2-5 min)

1. Switch to the "🧠 ML Trainer" tab
2. Click "Start Training"
3. Watch the learning curves in real-time
4. Wait for training to complete

### Step 5: Make Predictions (instant)

1. Load some power data in the main interface
2. Go to ML Trainer tab
3. Click "Predict Tag"
4. See the predicted tag with confidence!

## 📊 What You'll See

### During Training
- Progress bar: "Epoch 15 / 50"
- Live metrics updating every epoch
- Learning curves showing loss and accuracy
- Typical training time: 2-5 minutes

### After Training
- Model status: "Model Trained" badge
- Prediction button enabled
- Learning curves display final performance

### Making Predictions
- Predicted tag: e.g., "climate"
- Confidence: e.g., "87.3%"
- Top 5 probabilities with visualization

## 🎯 Success Metrics

Good model performance:
- ✅ Training accuracy > 80%
- ✅ Validation accuracy > 75%
- ✅ Loss decreasing over epochs
- ✅ Predictions match your intuition

Need more data if:
- ❌ Accuracy < 70%
- ❌ Overfitting (training acc >> validation acc)
- ❌ Predictions seem random

## 🔧 Troubleshooting

### "No training data found"
➡️ Save at least one day using "💾 Save Day" button

### "Need at least 5 windows of data (50 minutes)"
➡️ Load more power data or wait for more history

### Training is slow
➡️ Normal! TensorFlow.js is CPU-based. 2-5 min is expected.

### Low accuracy
➡️ Collect more days of data (aim for 5+ days)
➡️ Ensure consistent tag labeling
➡️ Verify tags accurately represent power patterns

## 📚 Documentation

- **Full ML Documentation**: See `ML_FEATURE.md`
- **Implementation Details**: See `ML_IMPLEMENTATION_SUMMARY.md`
- **General Usage**: See `README.md`

## 🎓 Example Workflow

```
Day 1: Tag power usage → Save day
Day 2: Tag power usage → Save day
Day 3: Tag power usage → Save day
  ↓
Train Model (2-5 min)
  ↓
Make predictions on Day 4!
  ↓
Compare predictions vs reality
  ↓
Add more data → Retrain → Better predictions!
```

## 🧪 Test the System

Try this quick test:

1. **Check data folder exists**
   ```bash
   ls -la data/
   ```
   Should show `power-data-*.json` and `power-tags-*.json` files

2. **Test training endpoint**
   ```bash
   curl -X POST http://localhost:3001/api/ml/train
   ```
   Should see streaming training progress

3. **Check model status**
   ```bash
   curl http://localhost:3001/api/ml/status
   ```
   Should return JSON with model info

4. **View saved model**
   ```bash
   ls -la server/ml/saved_model/
   ```
   Should show `model.json`, `weights.bin`, `metadata.json`

## 💡 Pro Tips

1. **Consistent Labels**: Use the same label names every time
   - ✅ "climate" (always)
   - ❌ "climate", "AC", "air conditioning" (inconsistent)

2. **Quality > Quantity**: Better to have 3 days of accurate tags than 10 days of messy tags

3. **Diverse Patterns**: Tag different times of day and different appliances

4. **Regular Retraining**: Retrain the model when you add significant new data

5. **Check Learning Curves**: If validation loss increases while training loss decreases, you may be overfitting (need more data)

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| Backend won't start | Check port 3001 is free: `lsof -i :3001` |
| Frontend won't start | Check port 5173 is free: `lsof -i :5173` |
| Can't connect to HA | Verify HA URL and token are correct |
| Training fails | Check browser console and terminal for errors |
| No predictions | Ensure model is trained first |

## 🎉 You're Ready!

Everything is set up and ready to use. Start collecting data and training your model!

Need help? Check the full documentation in `ML_FEATURE.md`.
