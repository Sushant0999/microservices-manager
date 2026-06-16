@echo off
echo Starting Microservice Manager...
java -XX:+UseSerialGC -Xms32m -Xmx128m -jar backend\target\manager-0.0.1-SNAPSHOT.jar
pause
