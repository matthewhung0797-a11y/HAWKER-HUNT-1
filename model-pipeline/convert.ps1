# Hawker Hunt 3D 模型轉換管線
# 用法: .\convert.ps1 -Input raw\my-model.obj -Name laksa-warrior [-Ratio 0.008]
#
# 步驟: OBJ/FBX/GLB → GLB → 減面 → 512 WebP 貼圖 + Draco 壓縮 → public/models/{name}.glb
# 目標: < 500KB
#
# 注意:
# - OBJ 嘅 .mtl 同貼圖檔名必須係 ASCII（中文檔名會令 obj2gltf 讀唔到貼圖）
# - Ratio 係保留三角面比例: 200 萬面模型用 0.008 ≈ 16k 面; 高模面數越多 ratio 越細

param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [Parameter(Mandatory = $true)][string]$Name,
    [double]$Ratio = 0.008,
    [double]$SimplifyError = 0.5
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $PSScriptRoot "$Name-tmp.glb"
$simplified = Join-Path $PSScriptRoot "$Name-simplified.glb"
$out = Join-Path $root "public\models\$Name.glb"

New-Item -ItemType Directory -Force -Path (Join-Path $root "public\models") | Out-Null

# 1. 轉 GLB（如果輸入唔係 glb）
if ($InputFile -match "\.obj$") {
    Write-Host "[1/3] OBJ -> GLB..."
    npx obj2gltf -i $InputFile -o $tmp
} else {
    Copy-Item $InputFile $tmp -Force
}

# 2. 減面
Write-Host "[2/3] Simplify (ratio=$Ratio)..."
npx gltf-transform simplify $tmp $simplified --ratio $Ratio --error $SimplifyError

# 3. Draco + WebP 512
Write-Host "[3/3] Draco + WebP 512..."
npx gltf-transform optimize $simplified $out --compress draco --texture-compress webp --texture-size 512 --no-simplify

Remove-Item $tmp, $simplified -Force
$size = (Get-Item $out).Length / 1KB
Write-Host ("Done: {0} ({1:N0} KB)" -f $out, $size)
if ($size -gt 500) {
    Write-Warning "超過 500KB 預算！試細啲嘅 -Ratio 或檢查貼圖數量。"
}
