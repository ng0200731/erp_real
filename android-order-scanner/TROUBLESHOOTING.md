# Android App Troubleshooting Guide

## The app shows a black screen - How to fix:

### Step 1: Check if the app is actually crashing
Run this command to see crash logs:
```bash
adb logcat -s ProgressHistoryActivity:D AndroidRuntime:E
```

Or double-click `check-logs.bat` in the android folder.

### Step 2: Rebuild and reinstall the app

1. **Uninstall the old version first:**
   ```bash
   adb uninstall com.ebrandid.poscanner
   ```

2. **Build the new APK:**
   ```bash
   cd android
   gradlew.bat clean assembleDebug
   ```

3. **Install the new APK:**
   ```bash
   adb install app\build\outputs\apk\debug\app-debug.apk
   ```

### Step 3: Check server connectivity

Make sure your server is running and accessible from the Android device:

1. Check the server IP in `ApiClient.kt`:
   - File: `android/app/src/main/java/com/ebrandid/poscanner/api/ApiClient.kt`
   - Look for `API_BASE_URL`
   - Should be something like: `http://192.168.1.100:3000/`

2. Test connectivity from your device:
   - Open Chrome on the Android device
   - Navigate to: `http://YOUR_SERVER_IP:3000/api/progress/1308014`
   - You should see JSON data

### Step 4: Common Issues

**Issue: "Restore App Data" button appears**
- This means the app crashed on startup
- Check logs using Step 1 above

**Issue: Black screen but no crash**
- The layout might not be loading
- Try uninstalling and reinstalling (Step 2)

**Issue: Network error**
- Check if server is running: `node server.js`
- Check if device can reach server (Step 3)
- Make sure both device and server are on the same network

### Step 5: Test with a simple PO number

Try searching for a PO that exists in your database:
1. Open the web app
2. Go to "Order Status" and note a PO number
3. Use that PO number in the Android app search

### Debugging Commands

**View all logs:**
```bash
adb logcat
```

**View only errors:**
```bash
adb logcat *:E
```

**Clear logs and start fresh:**
```bash
adb logcat -c
adb logcat
```

**Check if app is installed:**
```bash
adb shell pm list packages | findstr ebrandid
```

**Force stop the app:**
```bash
adb shell am force-stop com.ebrandid.poscanner
```

### If nothing works:

1. Check the `ApiClient.kt` file and verify the BASE_URL
2. Make sure ZXing library is properly added in `build.gradle.kts`
3. Verify all files were created correctly
4. Try building in Android Studio for better error messages

## Files to verify:

1. `android/app/src/main/java/com/ebrandid/poscanner/ProgressHistoryActivity.kt`
2. `android/app/src/main/res/layout/activity_progress_history.xml`
3. `android/app/src/main/AndroidManifest.xml` (check if ProgressHistoryActivity is registered)
4. `android/app/build.gradle.kts` (check if ZXing is added)

## Quick Test:

After rebuilding, test the scanner activity first:
1. Open app
2. Tap "Scan QR Code"
3. If this works, the app is running fine
4. Then try "Search PO"
