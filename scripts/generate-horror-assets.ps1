param(
  [string]$OutDir = "public/assets/generated"
)

Add-Type -AssemblyName System.Drawing

$fullOut = Resolve-Path -LiteralPath $OutDir -ErrorAction SilentlyContinue
if (-not $fullOut) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $fullOut = Resolve-Path -LiteralPath $OutDir
}

function New-Bitmap($name, $paint) {
  $bmp = New-Object System.Drawing.Bitmap 1024, 1024
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  try {
    & $paint $gfx
    $path = Join-Path $fullOut $name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "wrote $path"
  } finally {
    $gfx.Dispose()
    $bmp.Dispose()
  }
}

function Brush($hex) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Pen($hex, $w) {
  return New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($hex)), $w
}

$rng = New-Object System.Random 7219

New-Bitmap "wod2-intake-signage-atlas.png" {
  param($g)
  $g.Clear([System.Drawing.Color]::FromArgb(28, 22, 18))
  $paper = Brush "#b7a77c"
  $red = Brush "#531818"
  $dark = Brush "#19110f"
  $rustPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 75, 21, 12)), 8
  $fontBig = New-Object System.Drawing.Font "Arial", 70, ([System.Drawing.FontStyle]::Bold)
  $fontMid = New-Object System.Drawing.Font "Arial", 36, ([System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  foreach ($cell in 0..3) {
    $x = ($cell % 2) * 512
    $y = [Math]::Floor($cell / 2) * 512
    $g.FillRectangle($paper, $x + 34, $y + 34, 444, 444)
    $g.FillRectangle($red, $x + 52, $y + 58, 408, 96)
    $g.DrawString(@("INTAKE", "TRIAGE", "RAIL", "GATE")[$cell], $fontBig, [System.Drawing.Brushes]::AntiqueWhite, [System.Drawing.RectangleF]::new($x + 52, $y + 72, 408, 90), $sf)
    $g.DrawString(@("WALK BETWEEN LIGHTS", "RED TAGS BELOW", "SERVICE ONLY", "DO NOT STOP")[$cell], $fontMid, $dark, [System.Drawing.RectangleF]::new($x + 70, $y + 210, 372, 120), $sf)
    $g.DrawLine($rustPen, $x + 76, $y + 396, $x + 438, $y + 338)
  }
  for ($i = 0; $i -lt 260; $i++) {
    $a = 28 + $rng.Next(90)
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, 0, 0, 0))
    $g.FillRectangle($b, $rng.Next(1024), $rng.Next(1024), 5 + $rng.Next(58), 2 + $rng.Next(18))
    $b.Dispose()
  }
}

New-Bitmap "wod2-triage-prop-atlas.png" {
  param($g)
  $g.Clear([System.Drawing.Color]::FromArgb(42, 42, 36))
  $cloth = Brush "#6f705f"
  $sheet = Brush "#a79b7d"
  $wet = Brush "#2a1412"
  for ($cell = 0; $cell -lt 4; $cell++) {
    $x = ($cell % 2) * 512
    $y = [Math]::Floor($cell / 2) * 512
    $g.FillRectangle(@($cloth, $sheet, $wet, $cloth)[$cell], $x, $y, 512, 512)
    for ($i = 0; $i -lt 34; $i++) {
      $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45 + $rng.Next(65), 12, 8, 7)), (1 + $rng.Next(7))
      $g.DrawBezier($pen, $x + $rng.Next(512), $y + $rng.Next(512), $x + $rng.Next(512), $y + $rng.Next(512), $x + $rng.Next(512), $y + $rng.Next(512), $x + $rng.Next(512), $y + $rng.Next(512))
      $pen.Dispose()
    }
  }
}

New-Bitmap "wod2-enemy-skin-atlas.png" {
  param($g)
  $g.Clear([System.Drawing.Color]::FromArgb(18, 13, 12))
  for ($cell = 0; $cell -lt 4; $cell++) {
    $x = ($cell % 2) * 512
    $y = [Math]::Floor($cell / 2) * 512
    $base = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 44 + $cell * 12, 22, 18))
    $g.FillRectangle($base, $x, $y, 512, 512)
    $base.Dispose()
    for ($i = 0; $i -lt 90; $i++) {
      $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45 + $rng.Next(115), 176, 150, 104)), (1 + $rng.Next(6))
      $g.DrawLine($pen, $x + $rng.Next(512), $y + $rng.Next(512), $x + $rng.Next(512), $y + $rng.Next(512))
      $pen.Dispose()
    }
    for ($i = 0; $i -lt 28; $i++) {
      $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70 + $rng.Next(90), 8, 3, 2))
      $g.FillEllipse($b, $x + $rng.Next(512), $y + $rng.Next(512), 14 + $rng.Next(80), 4 + $rng.Next(34))
      $b.Dispose()
    }
  }
}
