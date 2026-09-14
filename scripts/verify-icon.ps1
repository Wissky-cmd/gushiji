# Quick pixel-level sanity check of the generated icon
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('E:\黑马记账APP\resources\icon.png')
Write-Host ("Size: " + $img.Width + "x" + $img.Height)
$bmp = New-Object System.Drawing.Bitmap($img)
$corner = $bmp.GetPixel(8, 8)
Write-Host ("Corner alpha (expect 0): " + $corner.A)

# Count white-ish pixels (main text) in the center band
$whiteCount = 0
for ($y = 120; $y -le 340; $y += 4) {
  for ($x = 100; $x -le 412; $x += 4) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.R -gt 200 -and $p.G -gt 200 -and $p.B -gt 200) { $whiteCount++ }
  }
}
Write-Host ("White text pixels found (expect > 50): " + $whiteCount)

# Count amber-ish pixels (yen badge) in the top-right region
$amberCount = 0
for ($y = 40; $y -le 144; $y += 2) {
  for ($x = 368; $x -le 472; $x += 2) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.R -gt 230 -and $p.G -gt 160 -and $p.G -lt 220 -and $p.B -lt 80) { $amberCount++ }
  }
}
Write-Host ("Amber badge pixels found (expect > 100): " + $amberCount)

$bmp.Dispose()
$img.Dispose()
