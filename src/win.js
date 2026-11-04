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
	const file = fileURLToPath(new URL("native.cs", import.meta.url));
	const source = readFileSync(file, "utf8");
	const dll = join(tmpdir(), `handsfree-${createHash("sha256").update(source).digest("hex").slice(0, 12)}.dll`);
	ready = send(`Add-Type -AssemblyName System.Drawing, UIAutomationClient, UIAutomationTypes
if (-not (Test-Path -LiteralPath ${q(dll)})) { Add-Type -TypeDefinition ([IO.File]::ReadAllText(${q(new URL("native.cs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))})) -OutputAssembly ${q(dll)} -OutputType Library }
Add-Type -Path ${q(dll)}
[Hf]::Init()`);
}

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

export const windows = async () => list(await ps("[Hf]::Windows()"));

export async function waitIdle() {
	const started = Date.now();
	while (Date.now() - started < 6000 && (await ps("[Hf]::Idle()")) < 900) await new Promise((done) => setTimeout(done, 200));
}

export async function shot(id) {
	return ps(`$r = if (${id ? 1 : 0}) { $w = [Hf]::Row(${Number(id) || 0}); @($w.x, $w.y, $w.width, $w.height) } else { [Hf]::Screen() }
$bmp = New-Object Drawing.Bitmap $r[2], $r[3]
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r[0], $r[1], 0, 0, $bmp.Size)
$scale = [Math]::Min(1.0, 1568.0 / [Math]::Max($r[2], $r[3]))
$out = New-Object Drawing.Bitmap $bmp, ([int]($r[2] * $scale)), ([int]($r[3] * $scale))
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$p = New-Object Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 75L
$ms = New-Object IO.MemoryStream
$out.Save($ms, $codec, $p)
$size = @($out.Width, $out.Height)
$g.Dispose(); $bmp.Dispose(); $out.Dispose()
@{ data = [Convert]::ToBase64String($ms.ToArray()); x = $r[0]; y = $r[1]; scale = $scale; width = $size[0]; height = $size[1] }`);
}

export async function elements(id) {
	return list(await ps(`$h = ${Number(id) || 0}; if (-not $h) { $h = [Hf]::Front() }
$A = [Windows.Automation.AutomationElement]
$cr = New-Object Windows.Automation.CacheRequest
foreach ($p in @($A::NameProperty, $A::ControlTypeProperty, $A::BoundingRectangleProperty, $A::IsOffscreenProperty, $A::IsEnabledProperty)) { $cr.Add($p) }
$cr.TreeScope = [Windows.Automation.TreeScope]::Subtree
$cr.TreeFilter = [Windows.Automation.Automation]::ControlViewCondition
$root = $null
$act = $cr.Activate(); try { $root = $A::FromHandle([IntPtr][long]$h).GetUpdatedCache($cr) } finally { $act.Dispose() }
$out = New-Object Collections.ArrayList
$stack = New-Object Collections.Stack
$stack.Push($root)
while ($stack.Count -and $out.Count -lt 400) {
	$e = $stack.Pop(); $c = $e.Cached
	$kids = @($e.CachedChildren); for ($i = $kids.Count - 1; $i -ge 0; $i--) { $stack.Push($kids[$i]) }
	if ($c.IsOffscreen -or $c.BoundingRectangle.IsEmpty) { continue }
	$type = $c.ControlType.ProgrammaticName -replace '^ControlType[.]', ''
	$name = ("$($c.Name)".Trim() -split '[\r\n\t ]+') -join ' '
	if (-not $name -and $type -notmatch 'Edit|Button|CheckBox|ComboBox|MenuItem|TabItem|ListItem|Hyperlink') { continue }
	if ($type -match '^(Pane|Group|Custom|Window|TitleBar)$' -and -not $name) { continue }
	$b = $c.BoundingRectangle
	[void]$out.Add(@{ type = $type; name = $(if ($name.Length -gt 100) { $name.Substring(0, 100) } else { $name }); x = [int]($b.X + $b.Width / 2); y = [int]($b.Y + $b.Height / 2); off = -not $c.IsEnabled })
}
$out`));
}
