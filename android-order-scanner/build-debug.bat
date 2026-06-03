@echo off
echo Building Android APK...
cd /d "%~dp0"
call gradlew.bat clean assembleDebug
if %ERRORLEVEL% EQU 0 (
    echo Build successful!
    echo APK location: app\build\outputs\apk\debug\app-debug.apk
) else (
    echo Build failed with error code %ERRORLEVEL%
)
pause
