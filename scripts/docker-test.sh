#!/bin/bash
# Test Docker build and run locally on Mac
# Uses Lambda Runtime Interface Emulator (RIE) for local testing

set -e

# Get script directory and change to parent (app root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_ROOT"

IMAGE_NAME="pdf-service-test"
CONTAINER_NAME="pdf-service-test-container"
RIE_VERSION="2.0"

echo "🐳 Testing PDF Service Docker Build and Run"
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

# Build the Docker image
echo "📦 Building Docker image..."
docker build -t $IMAGE_NAME .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Docker build failed"
    exit 1
fi

echo ""

# Download Lambda Runtime Interface Emulator if not present
if [ ! -f "$APP_ROOT/aws-lambda-rie" ]; then
    echo "📥 Downloading Lambda Runtime Interface Emulator..."
    curl -Lo "$APP_ROOT/aws-lambda-rie" https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie
    chmod +x "$APP_ROOT/aws-lambda-rie"
    echo "✅ RIE downloaded"
    echo ""
fi

# Stop and remove existing container if it exists
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Run the container with RIE
echo "🚀 Starting container with Lambda Runtime Interface Emulator..."
echo ""
echo "Container will be available at: http://localhost:9000"
echo "Press Ctrl+C to stop"
echo ""

docker run -d \
  --name $CONTAINER_NAME \
  -p 9000:8080 \
  -v "$APP_ROOT/aws-lambda-rie:/aws-lambda-rie" \
  --entrypoint /aws-lambda-rie \
  $IMAGE_NAME \
  /lambda-entrypoint.sh dist/index.handler

if [ $? -eq 0 ]; then
    echo "✅ Container started"
    echo ""
    echo "Testing health endpoint..."
    sleep 2
    curl -s http://localhost:9000/2015-03-31/functions/function/invocations -d '{"path":"/health","httpMethod":"GET"}' | jq '.' || echo "Health check response received"
    echo ""
    echo "Container logs:"
    docker logs $CONTAINER_NAME
    echo ""
    echo "To stop the container:"
    echo "  docker stop $CONTAINER_NAME"
    echo ""
    echo "To view logs:"
    echo "  docker logs -f $CONTAINER_NAME"
else
    echo "❌ Failed to start container"
    exit 1
fi








