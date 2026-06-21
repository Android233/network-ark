# ===== 人脉方舟 APK 构建环境配置 =====
# 请根据你的实际路径修改以下变量

# JDK 21 路径
$env:JAVA_HOME = "D:\JDK21"

# Android SDK 路径
$env:ANDROID_HOME = "D:\AndroidSDK"
$env:ANDROID_SDK_ROOT = "D:\AndroidSDK"

# 将 JDK、Android SDK、Node 加入 PATH
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\emulator;D:\node-v24.11.1-win-x64;$env:PATH"

Write-Host "✅ 环境变量已设置:" -ForegroundColor Green
Write-Host "  JAVA_HOME = $env:JAVA_HOME"
Write-Host "  ANDROID_HOME = $env:ANDROID_HOME"
Write-Host ""
