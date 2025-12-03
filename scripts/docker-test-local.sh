#!/bin/bash
# Test Docker build and run locally on Mac (simplified local version)
# Uses a local Dockerfile that runs as a regular Node.js app

set -e

# Get script directory and change to parent (app root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_ROOT"

IMAGE_NAME="pdf-service-local"
CONTAINER_NAME="pdf-service-local-container"

echo "🐳 Testing PDF Service Docker Build (Local Version)"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo ""
    echo "Install Docker Desktop for Mac:"
    echo "  https://www.docker.com/products/docker-desktop/"
    echo ""
    echo "Or install via Homebrew:"
    echo "  brew install --cask docker"
    exit 1
fi

echo "✅ Docker found: $(docker --version)"
echo ""

# Build the Docker image using local Dockerfile
echo "📦 Building Docker image (local version)..."
docker build -f Dockerfile.local -t $IMAGE_NAME .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Docker build failed"
    exit 1
fi

echo ""

# Stop and remove existing container if it exists
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Check if .env file exists
if [ ! -f "$APP_ROOT/.env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "   Create .env file with Salesforce credentials for full testing"
    echo ""
fi

# Run the container
echo "🚀 Starting container..."
echo ""
echo "Container will be available at: http://localhost:3000"
echo "Health check: http://localhost:3000/health"
echo "Press Ctrl+C to stop"
echo ""

docker run -d \
  --name $CONTAINER_NAME \
  -p 3000:3000 \
  --env-file "$APP_ROOT/.env" \
  $IMAGE_NAME

if [ $? -eq 0 ]; then
    echo "✅ Container started"
    echo ""
    echo "Waiting for service to start..."
    sleep 3
    
    echo ""
    echo "Testing health endpoint..."
    curl -s http://localhost:3000/health | jq '.' || echo "Health check response received"
    echo ""
    
    echo "Container logs:"
    docker logs $CONTAINER_NAME
    echo ""
    echo "To stop the container:"
    echo "  docker stop $CONTAINER_NAME"
    echo ""
    echo "To view logs:"
    echo "  docker logs -f $CONTAINER_NAME"
    echo ""
    echo "To test webhook endpoint:"
    echo "  curl -X POST http://localhost:3000/webhook/salesforce -H 'Content-Type: application/json' -d '{\"applicationId\":\"YOUR_APP_ID\"}'"
else
    echo "❌ Failed to start container"
    exit 1
fi








