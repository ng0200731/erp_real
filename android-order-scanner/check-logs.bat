@echo off
echo Checking Android logs for errors...
echo.
echo Press Ctrl+C to stop
echo.
adb logcat -s ProgressHistoryActivity:D AndroidRuntime:E
