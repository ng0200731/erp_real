@echo off
echo Building Android APK...
cd /d "%~dp0"
call gradlew.bat assembleDebug
echo.
echo Build complete! APK location:
echo app\build\outputs\apk\debug\app-debug.apk
pause
