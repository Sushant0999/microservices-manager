#!/bin/bash

echo "Starting Microservice Manager..."

# Find the built JAR file dynamically
JAR_FILE=$(find backend/target -maxdepth 1 -name "manager-*.jar" ! -name "*.original" | head -n 1)

if [ -n "$JAR_FILE" ]; then
    java -XX:+UseSerialGC -Xms32m -Xmx128m -jar "$JAR_FILE"
else
    echo "Error: Executable JAR file not found! Please run build_executable.sh first."
    exit 1
fi
