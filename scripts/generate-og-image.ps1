Add-Type -AssemblyName System.Drawing

$width = 1200
$height = 630
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g.Clear([System.Drawing.Color]::FromArgb(14, 21, 18))

$root = Split-Path -Parent $PSScriptRoot
$logoPath = Join-Path $root "public\logo-icon.png"
$logo = [System.Drawing.Image]::FromFile($logoPath)
$logoSize = 150
$logoX = 90
$logoY = [int](($height - $logoSize) / 2)
$g.DrawImage($logo, $logoX, $logoY, $logoSize, $logoSize)
$logo.Dispose()

$titleFont = New-Object System.Drawing.Font("Segoe UI", 58, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font("Segoe UI", 30, [System.Drawing.FontStyle]::Regular)
$smallFont = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Regular)

$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 243, 234))
$gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(232, 185, 100))
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 175, 165))

$textX = 280
$g.DrawString("XcrowHub", $titleFont, $white, $textX, 195)

$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(47, 111, 94), 5)
$g.DrawLine($pen, $textX, 275, $textX + 220, 275)

$g.DrawString("Protected deals for crypto P2P", $subFont, $gold, $textX, 295)
$g.DrawString("Money stays locked in escrow until delivery is confirmed.", $smallFont, $muted, $textX, 365)
$g.DrawString("Zero fees. Private deals and marketplace listings.", $smallFont, $muted, $textX, 405)

$out = Join-Path $root "public\og-image.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

$pen.Dispose()
$white.Dispose()
$gold.Dispose()
$muted.Dispose()
$titleFont.Dispose()
$subFont.Dispose()
$smallFont.Dispose()
$g.Dispose()
$bmp.Dispose()

Write-Output "Created $out"