#!/bin/bash
# Model Comparison Test Script
# This script helps you quickly switch between models and compare their performance

echo "🔧 AI Power Viewer - Model Switching Tool"
echo "=========================================="
echo ""

# Check if server is running
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Server is running on port 3001. Please stop it first with Ctrl+C"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to exit..."
fi

echo "Select a model to use:"
echo ""
echo "1) PowerTagPredictor (Default - Conv2D seq2point)"
echo "2) MSDCPredictor - S2P_on (Conv1D dual-branch: power + on/off)"
echo "3) MSDCPredictor - S2P_State (Conv1D dual-branch: power + multi-state)"
echo "4) MSDCPredictor - S2P_State2 (Conv1D multi-scale inception)"
echo "5) Show current configuration"
echo "6) Test both models (comparison mode)"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo ""
        echo "✅ Starting with PowerTagPredictor..."
        export MODEL_TYPE=PowerTagPredictor
        npm run dev
        ;;
    2)
        echo ""
        echo "✅ Starting with MSDCPredictor (S2P_on)..."
        export MODEL_TYPE=MSDCPredictor
        export MSDC_ARCHITECTURE=S2P_on
        npm run dev
        ;;
    3)
        echo ""
        echo "✅ Starting with MSDCPredictor (S2P_State)..."
        export MODEL_TYPE=MSDCPredictor
        export MSDC_ARCHITECTURE=S2P_State
        npm run dev
        ;;
    4)
        echo ""
        echo "✅ Starting with MSDCPredictor (S2P_State2)..."
        export MODEL_TYPE=MSDCPredictor
        export MSDC_ARCHITECTURE=S2P_State2
        npm run dev
        ;;
    5)
        echo ""
        echo "📋 Current Configuration:"
        echo "  MODEL_TYPE: ${MODEL_TYPE:-PowerTagPredictor (default)}"
        echo "  MSDC_ARCHITECTURE: ${MSDC_ARCHITECTURE:-S2P_on (default)}"
        echo ""
        
        # Check if server is running
        if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
            echo "🌐 Server is running. Fetching live model info..."
            curl -s http://localhost:3001/api/model/info | jq '.' 2>/dev/null || echo "Install jq for pretty JSON output"
        else
            echo "⚠️  Server is not running on port 3001"
        fi
        ;;
    6)
        echo ""
        echo "🔬 Comparison Mode - Training both models"
        echo "=========================================="
        echo ""
        echo "Step 1: Training PowerTagPredictor..."
        read -p "Press Enter to start..."
        
        export MODEL_TYPE=PowerTagPredictor
        echo "📊 Start training in the UI, then stop the server when done"
        npm run dev &
        SERVER_PID=$!
        
        read -p "Press Enter when PowerTagPredictor training is complete (Ctrl+C in other terminal)..."
        
        echo ""
        echo "Step 2: Training MSDCPredictor..."
        read -p "Press Enter to start..."
        
        export MODEL_TYPE=MSDCPredictor
        export MSDC_ARCHITECTURE=S2P_on
        echo "📊 Start training the same appliance with MSDC model"
        npm run dev
        ;;
    *)
        echo ""
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac
