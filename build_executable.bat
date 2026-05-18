@echo off
echo ========================================================
echo Building Microservice Manager Single Executable
echo ========================================================

echo.
echo [1/3] Building Frontend...
cd frontend
call npm install
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Frontend build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Copying Frontend files to Backend static directory...
cd ..
rem Clear existing static files completely
if exist backend\src\main\resources\static rmdir /s /q backend\src\main\resources\static
mkdir backend\src\main\resources\static

rem Copy new built files
xcopy /s /y /i frontend\dist\* backend\src\main\resources\static\

echo.
echo [3/3] Building Backend Executable (Fat JAR)...
cd backend
call mvn clean package -DskipTests
if %ERRORLEVEL% neq 0 (
    echo Backend build failed!
    exit /b %ERRORLEVEL%
)
cd ..

echo.
echo ========================================================
echo Build Complete!
echo You can run the application by double clicking the JAR file 
echo or running the following command:
echo java -jar backend\target\manager-0.0.1-SNAPSHOT.jar
echo ========================================================
pause
