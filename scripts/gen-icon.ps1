# Generate the heimajizhang app icon (dark rounded square, white "HeiMa", amber yen badge)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gen-icon.ps1
# Note: all coordinates are precomputed literals (PowerShell mangles inline arithmetic in New-Object args)
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bgColor = [System.Drawing.Color]::FromArgb(255, 38, 43, 58)
$amber = [System.Drawing.Color]::FromArgb(255, 245, 197, 24)

# Rounded-corner background (corner radius 96)
$gpath = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpath.AddArc(0, 0, 96, 96, 180, 90)
$gpath.AddArc(416, 0, 96, 96, 270, 90)
$gpath.AddArc(416, 416, 96, 96, 0, 90)
$gpath.AddArc(0, 416, 96, 96, 90, 90)
$gpath.CloseFigure()
$bgBrush = New-Object System.Drawing.SolidBrush($bgColor)
$g.FillPath($bgBrush, $gpath)

# Main text "HeiMa" (U+9ED1 U+9A6C), centered, slightly raised for optical balance
$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center
$center.LineAlignment = [System.Drawing.StringAlignment]::Center
$text = -join ([char]0x9ED1, [char]0x9A6C)
$fontMain = New-Object System.Drawing.Font('Microsoft YaHei', 185, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$mainRect = New-Object System.Drawing.RectangleF -ArgumentList @(0, -24, 512, 512)
$g.DrawString($text, $fontMain, $whiteBrush, $mainRect, $center)

# Amber yen badge at top-right corner (circle center 420,92; radius 54)
$amberBrush = New-Object System.Drawing.SolidBrush($amber)
$g.FillEllipse($amberBrush, 366, 38, 108, 108)
$fontYen = New-Object System.Drawing.Font('Microsoft YaHei', 58, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$darkBrush = New-Object System.Drawing.SolidBrush($bgColor)
$yenRect = New-Object System.Drawing.RectangleF -ArgumentList @(366, 34, 108, 108)
$g.DrawString([string][char]0x00A5, $fontYen, $darkBrush, $yenRect, $center)

$root = Split-Path $PSScriptRoot -Parent
$out1 = Join-Path $root 'resources\icon.png'
$out2 = Join-Path $root 'build\icon.png'
$bmp.Save($out1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($out2, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Host "Icon generated OK: resources/icon.png and build/icon.png"
