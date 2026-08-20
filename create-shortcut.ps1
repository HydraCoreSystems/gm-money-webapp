$desktopPaths = @(
    [Environment]::GetFolderPath('Desktop'),
    "C:\Users\pwach\Desktop",
    "C:\Users\pwach\OneDrive\Desktop"
) | Select-Object -Unique

$projectDir = "C:\Users\pwach\.gemini\antigravity\scratch\gathering-moss-financial-center"
$vbsPath = "$projectDir\start-app.vbs"

$wsh = New-Object -ComObject WScript.Shell

foreach ($d in $desktopPaths) {
    if (Test-Path $d) {
        $shortcutPath = Join-Path $d "Gathering Moss Financial Center.lnk"
        $shortcut = $wsh.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "wscript.exe"
        $shortcut.Arguments = "`"$vbsPath`""
        $shortcut.WorkingDirectory = $projectDir
        $shortcut.Description = "Launch Gathering Moss Financial Center"
        $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
        $shortcut.Save()
        Write-Host "Created shortcut: $shortcutPath"
    }
}
