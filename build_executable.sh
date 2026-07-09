#!/bin/bash

# Exit on any error
set -e

echo "========================================================"
echo "Building Microservice Manager Single Executable"
echo "========================================================"

echo ""
echo "[1/3] Building Frontend..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "[2/3] Copying Frontend files to Backend static directory..."
# Clear existing static files completely
rm -rf backend/src/main/resources/static
mkdir -p backend/src/main/resources/static

# Copy new built files
cp -R frontend/dist/* backend/src/main/resources/static/

echo ""
echo "[3/3] Building Backend Executable (Fat JAR)..."
cd backend
mvn clean package -DskipTests
cd ..

# Find the built JAR file dynamically
JAR_FILE=$(find backend/target -maxdepth 1 -name "manager-*.jar" ! -name "*.original" | head -n 1)

echo ""
echo "========================================================"
echo "Build Complete!"
if [ -n "$JAR_FILE" ]; then
    echo "You can run the application by running the following command:"
    echo "java -jar $JAR_FILE"
else
    echo "Warning: Built JAR file not found in backend/target!"
fi
echo "========================================================"
