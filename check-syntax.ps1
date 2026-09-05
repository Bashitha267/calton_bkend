$files = @(
  "src/index.js",
  "src/config/db.js",
  "src/middleware/auth.js",
  "src/middleware/upload.js",
  "src/middleware/cache.js",
  "src/routes/auth.js",
  "src/routes/products.js",
  "src/routes/orders.js",
  "src/routes/categories.js",
  "src/routes/reviews.js",
  "src/routes/dashboard.js"
)

$allOk = $true
foreach ($f in $files) {
  $result = node --check $f 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "SYNTAX ERROR in $f`: $result" -ForegroundColor Red
    $allOk = $false
  } else {
    Write-Host "OK: $f" -ForegroundColor Green
  }
}

if ($allOk) { Write-Host "`nALL FILES SYNTAX OK" -ForegroundColor Cyan }
