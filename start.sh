#!/bin/bash

# Power Viewer Startup Script
# This script starts both the backend and frontend servers

echo "🚀 Starting Power Consumption Viewer..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

# Start backend server
echo "🔧 Starting backend server on port 3001..."
npm run dev:server &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start frontend server
echo "🎨 Starting frontend server on port 5173..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers are running!"
echo ""
echo "📊 Frontend: http://localhost:5173"
echo "🔌 Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes
wait
