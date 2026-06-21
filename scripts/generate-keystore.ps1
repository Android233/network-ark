# ===== 生成 Release 签名密钥 =====
# 用法: .\scripts\generate-keystore.ps1
# 生成后需要在 android/app/build.gradle 中配置签名

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  生成 Release 签名密钥" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$env:JAVA_HOME = "D:\JDK21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$keystorePath = "$PSScriptRoot\..\android\app\release.keystore"
$alias = "network-ark"
$validity = 36500  # 100 年

if (Test-Path $keystorePath) {
    Write-Host "⚠️  密钥文件已存在: $keystorePath" -ForegroundColor Yellow
    $overwrite = Read-Host "是否覆盖? (y/N)"
    if ($overwrite -ne 'y') {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $keystorePath
}

Write-Host "请输入密钥信息（建议记录下来）:" -ForegroundColor Yellow
Write-Host ""

$storePassword = Read-Host "请输入 keystore 密码 (至少 6 位)" -AsSecureString
$storePasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePassword)
)

$keyPassword = Read-Host "请输入 key 密码 (可与上面相同)" -AsSecureString
$keyPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPassword)
)

$cn = Read-Host "姓名/组织名 (如 NetworkArk)"
$ou = Read-Host "部门 (如 Dev)"
$o = Read-Host "组织 (如 NetworkArk)"
$l = Read-Host "城市 (如 Beijing)"
$st = Read-Host "省份 (如 Beijing)"
$c = Read-Host "国家代码 (如 CN)"

$dname = "CN=$cn, OU=$ou, O=$o, L=$l, ST=$st, C=$c"

Write-Host ""
Write-Host "正在生成密钥..." -ForegroundColor Yellow

& keytool -genkeypair `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity $validity `
    -keystore $keystorePath `
    -storepass $storePasswordPlain `
    -keypass $keyPasswordPlain `
    -dname $dname

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 密钥生成成功!" -ForegroundColor Green
    Write-Host "   文件: $keystorePath" -ForegroundColor White
    Write-Host "   别名: $alias" -ForegroundColor White
    Write-Host ""
    Write-Host "请将以下配置添加到 android/app/build.gradle 的 android {} 块中:" -ForegroundColor Yellow
    Write-Host @"
signingConfigs {
    release {
        storeFile file('release.keystore')
        storePassword '$storePasswordPlain'
        keyAlias '$alias'
        keyPassword '$keyPasswordPlain'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
    }
}
"@ -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  请妥善保管密钥文件和密码，丢失后无法更新应用!" -ForegroundColor Red
} else {
    Write-Host "❌ 密钥生成失败" -ForegroundColor Red
}
