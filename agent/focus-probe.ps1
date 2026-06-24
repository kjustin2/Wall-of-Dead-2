# Logs the foreground (active) window whenever it changes, for a fixed duration.
# Used to detect whether the headless test harness steals window focus.
param([int]$Seconds = 14, [int]$IntervalMs = 20)

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@

$deadline = (Get-Date).AddSeconds($Seconds)
$last = ""
"[probe] watching foreground window for $Seconds s"
while ((Get-Date) -lt $deadline) {
  $h = [Fg]::GetForegroundWindow()
  $pid2 = 0
  [void][Fg]::GetWindowThreadProcessId($h, [ref]$pid2)
  $sb = New-Object System.Text.StringBuilder 512
  [void][Fg]::GetWindowText($h, $sb, 512)
  $name = try { (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch { "?" }
  $key = "$pid2|$name"
  if ($key -ne $last) {
    $last = $key
    "{0:HH:mm:ss.fff}  FOREGROUND -> {1} (pid {2})  title='{3}'" -f (Get-Date), $name, $pid2, $sb.ToString()
  }
  Start-Sleep -Milliseconds $IntervalMs
}
"[probe] done"
