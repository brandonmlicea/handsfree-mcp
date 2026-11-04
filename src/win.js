import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LOOP = String.raw`[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
while ($true) {
	$line = [Console]::In.ReadLine()
	if ($null -eq $line) { break }
	$id, $b64 = $line.Split(' ', 2)
	try {
		$r = Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)))
		$j = if ($null -eq $r) { 'null' } else { ConvertTo-Json -InputObject $r -Depth 6 -Compress }
		[Console]::Out.WriteLine("$id 1 $j")
	} catch {
		[Console]::Out.WriteLine("$id 0 " + (ConvertTo-Json -InputObject "$($_.Exception.Message)" -Compress))
	}
}`;

export const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

let host = null;
let ready = null;
let seq = 0;
const pending = new Map();

function boot() {
	host = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(LOOP, "utf16le").toString("base64")], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
	let buffer = "";
	host.stdout.setEncoding("utf8");
	host.stdout.on("data", (chunk) => {
		buffer += chunk;
		let at;
		while ((at = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, at).replace(/\r$/, "");
			buffer = buffer.slice(at + 1);
			const [id, ok, ...rest] = line.split(" ");
			const job = pending.get(id);
			if (!job) continue;
			pending.delete(id);
			let value = null;
			try {
				value = JSON.parse(rest.join(" "));
			} catch {
				value = rest.join(" ");
			}
			ok === "1" ? job.done(value) : job.fail(new Error(String(value)));
		}
	});
	host.on("exit", () => {
		for (const job of pending.values()) job.fail(new Error("The Windows helper stopped."));
		pending.clear();
		host = null;
		ready = null;
	});
	const files = ["native.cs", "desk.cs"].map((name) => fileURLToPath(new URL(name, import.meta.url)));
	const hash = createHash("sha256");
	for (const file of files) hash.update(readFileSync(file));
	const dll = join(tmpdir(), `handsfree-${hash.digest("hex").slice(0, 12)}.dll`);
	ready = send(`Add-Type -AssemblyName System.Drawing, UIAutomationClient, UIAutomationTypes
if (-not (Test-Path -LiteralPath ${q(dll)})) { Add-Type -Path @(${files.map(q).join(", ")}) -ReferencedAssemblies System.Drawing, UIAutomationClient, UIAutomationTypes, WindowsBase -OutputAssembly ${q(dll)} -OutputType Library }
Add-Type -Path ${q(dll)}
[Desk]::Name = ${q(DESK)}
[Hf]::Init()`);
}

export const DESK = process.env.HANDSFREE_DESKTOP_NAME || "Claude Code";

function send(code) {
	const id = String(++seq);
	return new Promise((done, fail) => {
		pending.set(id, { done, fail });
		host.stdin.write(`${id} ${Buffer.from(code, "utf8").toString("base64")}\n`);
	});
}

export async function ps(code) {
	if (process.platform !== "win32") throw new Error("The desktop tools work on Windows only; the browser tools work everywhere.");
	if (!host) boot();
	await ready;
	return send(code);
}

export const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

export const windows = async () => list(await ps("@([Hf]::Windows($true) | ForEach-Object { if ($_.cloaked) { try { $_.desk = [Desk]::Where($_.id) } catch { } }; if (-not $_.cloaked -or $_.desk) { $_ } })"));

export async function waitIdle() {
	const started = Date.now();
	while (Date.now() - started < 6000 && (await ps("[Hf]::Idle()")) < 900) await new Promise((done) => setTimeout(done, 200));
}

export async function shot(id) {
	return ps(`$h = ${Number(id) || 0}
if ($h) { $w = [Hf]::Row($h); $r = @($w.x, $w.y, $w.width, $w.height); $bmp = [Desk]::Capture($h) }
else { $r = [Hf]::Screen(); $bmp = New-Object Drawing.Bitmap $r[2], $r[3]; $g = [Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($r[0], $r[1], 0, 0, $bmp.Size); $g.Dispose() }
$scale = [Math]::Min(1.0, 1568.0 / [Math]::Max($bmp.Width, $bmp.Height))
$out = New-Object Drawing.Bitmap $bmp, ([int]($bmp.Width * $scale)), ([int]($bmp.Height * $scale))
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$p = New-Object Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 75L
$ms = New-Object IO.MemoryStream
$out.Save($ms, $codec, $p)
$size = @($out.Width, $out.Height)
$bmp.Dispose(); $out.Dispose()
@{ data = [Convert]::ToBase64String($ms.ToArray()); x = $r[0]; y = $r[1]; scale = $scale; width = $size[0]; height = $size[1]; window = $h }`);
}

export async function elements(id) {
	return list(await ps(`$h = ${Number(id) || 0}; if (-not $h) { $h = [Hf]::Front() }
$A = [Windows.Automation.AutomationElement]
$V = [Windows.Automation.ValuePattern]::ValueProperty
$cr = New-Object Windows.Automation.CacheRequest
foreach ($p in @($A::NameProperty, $A::ControlTypeProperty, $A::BoundingRectangleProperty, $A::IsOffscreenProperty, $A::IsEnabledProperty, $V)) { $cr.Add($p) }
$cr.TreeScope = [Windows.Automation.TreeScope]::Subtree
$cr.TreeFilter = [Windows.Automation.Automation]::ControlViewCondition
$here = [Hf]::Here($h)
$root = $null
if (-not $here) { $keep = [Desk]::Borrow($h) }
try {
$act = $cr.Activate(); try { $root = $A::FromHandle([IntPtr][long]$h).GetUpdatedCache($cr) } finally { $act.Dispose() }
$global:HfEls = New-Object Collections.ArrayList
$global:HfWin = $h
$out = New-Object Collections.ArrayList
$stack = New-Object Collections.Stack
$stack.Push($root)
while ($stack.Count -and $out.Count -lt 400) {
	$e = $stack.Pop(); $c = $e.Cached
	$kids = @($e.CachedChildren); for ($i = $kids.Count - 1; $i -ge 0; $i--) { $stack.Push($kids[$i]) }
	if (($here -and $c.IsOffscreen) -or $c.BoundingRectangle.IsEmpty) { continue }
	$type = $c.ControlType.ProgrammaticName -replace '^ControlType[.]', ''
	$name = ("$($c.Name)".Trim() -split '[\r\n\t ]+') -join ' '
	$value = $e.GetCachedPropertyValue($V)
	$value = $(if ($value -is [string] -and $value) { (($value -split '[\r\n\t ]+') -join ' ') } else { '' })
	if (-not $name -and -not $value -and $type -notmatch 'Edit|Document|Button|CheckBox|ComboBox|MenuItem|TabItem|ListItem|Hyperlink') { continue }
	if ($type -match '^(Pane|Group|Custom|Window|TitleBar)$' -and -not $name) { continue }
	$b = $c.BoundingRectangle
	[void]$global:HfEls.Add($e)
	[void]$out.Add(@{ type = $type; name = $(if ($name.Length -gt 100) { $name.Substring(0, 100) } else { $name }); value = $(if ($value.Length -gt 200) { $value.Substring(0, 200) } else { $value }); x = [int]($b.X + $b.Width / 2); y = [int]($b.Y + $b.Height / 2); off = -not $c.IsEnabled; window = $h })
}
$out
} finally { if (-not $here) { [Desk]::Return($h, $keep) } }`));
}

export async function use(element, action, value = "") {
	if (!Number.isInteger(element) || element < 1) throw new Error("Give the element's number from elements.");
	return ps(`$e = $global:HfEls[${element - 1}]
if (-not $e) { throw 'No such element. Call elements first.' }
$h = [long]$global:HfWin; $here = [Hf]::Here($h)
if (-not $here) { $keep = [Desk]::Borrow($h) }
try {
$kind = $e.Current.ControlType.ProgrammaticName
$pat = { param($p) $o = $null; if ($e.TryGetCurrentPattern($p, [ref]$o)) { $o } else { $null } }
$P = [Windows.Automation.InvokePattern]::Pattern; $T = [Windows.Automation.TogglePattern]::Pattern; $S = [Windows.Automation.SelectionItemPattern]::Pattern
$X = [Windows.Automation.ExpandCollapsePattern]::Pattern; $VP = [Windows.Automation.ValuePattern]::Pattern; $SI = [Windows.Automation.ScrollItemPattern]::Pattern
$v = ${q(value)}; $hwnd = $(if ($kind -match 'Edit|Document' -and $e.Current.NativeWindowHandle -ne $h) { $e.Current.NativeWindowHandle } else { 0 })
switch (${q(action)}) {
	'press' {
		if ($o = & $pat $P) { $o.Invoke(); 'Pressed it.' }
		elseif ($o = & $pat $T) { $o.Toggle(); 'Toggled it.' }
		elseif ($o = & $pat $S) { $o.Select(); 'Selected it.' }
		elseif ($o = & $pat $X) { if ($o.Current.ExpandCollapseState -eq 'Collapsed') { $o.Expand(); 'Expanded it.' } else { $o.Collapse(); 'Collapsed it.' } }
		else { throw 'It has no accessibility action; it needs the real mouse (desk visit first if it is on the agent desktop).' }
	}
	'toggle' { if ($o = & $pat $T) { $o.Toggle(); 'Toggled it.' } else { throw 'It cannot be toggled.' } }
	'select' { if ($o = & $pat $S) { $o.Select(); 'Selected it.' } else { throw 'It cannot be selected.' } }
	'expand' { if ($o = & $pat $X) { $o.Expand(); 'Expanded it.' } else { throw 'It cannot be expanded.' } }
	'collapse' { if ($o = & $pat $X) { $o.Collapse(); 'Collapsed it.' } else { throw 'It cannot be collapsed.' } }
	'scroll' { if ($o = & $pat $SI) { $o.ScrollIntoView(); 'Scrolled to it.' } else { throw 'It cannot be scrolled to.' } }
	'set' {
		$o = & $pat $VP
		if ($o -and -not $o.Current.IsReadOnly) { $o.SetValue($v); 'Set its text.' }
		elseif ($hwnd) { [Desk]::SetText($hwnd, $v); 'Set its text.' }
		else { throw 'Its text cannot be set without the real keyboard.' }
	}
	'type' {
		$o = & $pat $VP
		if ($o -and -not $o.Current.IsReadOnly) { $o.SetValue($o.Current.Value + $v); 'Added it at the end.' }
		elseif ($hwnd) { [Desk]::Insert($hwnd, $v); 'Typed it at the caret.' }
		else { throw 'It cannot be typed into without the real keyboard.' }
	}
	default { throw 'Unknown action.' }
}
} finally { if (-not $here) { [Desk]::Return($h, $keep) } }`);
}

