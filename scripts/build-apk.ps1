# ===== 人脉方舟 APK 构建脚本 =====
# 用法: .\scripts\build-apk.ps1 [debug|release]
# 默认构建 debug 版本

param(
    [ValidateSet('debug', 'release')]
    [string]$BuildType = 'debug'
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  人脉方舟 APK 构建 ($BuildType)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ===== 1. 设置环境变量 =====
Write-Host "[1/5] 设置环境变量..." -ForegroundColor Yellow
$env:JAVA_HOME = "D:\JDK21"
$env:ANDROID_HOME = "D:\AndroidSDK"
$env:ANDROID_SDK_ROOT = "D:\AndroidSDK"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;D:\node-v24.11.1-win-x64;$env:PATH"

# 验证 JDK
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    Write-Host "❌ 错误: 找不到 JDK，请检查 JAVA_HOME = $env:JAVA_HOME" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ JDK: $env:JAVA_HOME"

# 验证 Android SDK
if (-not (Test-Path "$env:ANDROID_HOME")) {
    Write-Host "❌ 错误: 找不到 Android SDK，请检查 ANDROID_HOME = $env:ANDROID_HOME" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Android SDK: $env:ANDROID_HOME"

# ===== 2. 构建 Web 应用 =====
Write-Host ""
Write-Host "[2/5] 构建 Web 应用 (Vite)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\.."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Web 构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Web 构建完成"

# ===== 3. 同步到 Android 项目 =====
Write-Host ""
Write-Host "[3/5] 同步到 Capacitor Android..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Capacitor 同步失败" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ 同步完成"

# ===== 4. 构建 APK =====
Write-Host ""
Write-Host "[4/5] 构建 APK ($BuildType)..." -ForegroundColor Yellow
Set-Location "android"

if ($BuildType -eq 'debug') {
    # Debug 版本（无需签名）
    .\gradlew.bat assembleDebug
    $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
} else {
    # Release 版本（需要签名配置，见 scripts/generate-keystore.ps1）
    .\gradlew.bat assembleRelease
    $apkPath = "app\build\outputs\apk\release\app-release-unsigned.apk"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ APK 构建失败" -ForegroundColor Red
    Write-Host "   提示: 如果缺少 SDK 组件，请运行:" -ForegroundColor Yellow
    Write-Host "   $env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat 'platforms;android-34' 'build-tools;34.0.0'" -ForegroundColor Yellow
    exit 1
}

Set-Location ".."

# ===== 5. 输出结果 =====
Write-Host ""
Write-Host "[5/5] 构建完成!" -ForegroundColor Green
$fullApkPath = Resolve-Path "android\$apkPath" -ErrorAction SilentlyContinue
if ($fullApkPath) {
    Write-Host ""
    Write-Host "📦 APK 文件位置:" -ForegroundColor Green
    Write-Host "   $fullApkPath" -ForegroundColor White
    $apkSize = [math]::Round((Get-Item $fullApkPath).Length / 1MB, 2)
    Write-Host "   大小: $apkSize MB" -ForegroundColor White
} else {
    Write-Host "⚠️  APK 路径未找到: android\$apkPath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  构建成功! 🎉" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "安装到设备:" -ForegroundColor Yellow
Write-Host "  adb install `"$fullApkPath`"" -ForegroundColor White
Write-Host ""
