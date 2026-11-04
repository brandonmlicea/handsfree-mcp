import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { BROWSERS, SITES } from "./reflex.js";
import { list, ps, q, waitIdle, windows } from "./win.js";

const ENGINES = new Set([...Object.values(BROWSERS), "chromium", "msedge"]);

const ALIASES = { calculator: "calc", "file explorer": "explorer", explorer: "explorer", settings: "ms-settings:", "task manager": "taskmgr", terminal: "wt", "command prompt": "cmd", paint: "mspaint", notepad: "notepad" };

const TABS = { new: "ctrl+t", close: "ctrl+w", next: "ctrl+tab", prev: "ctrl+shift+tab", reopen: "ctrl+shift+t" };

const isBrowser = (row) => ENGINES.has(String(row?.app ?? "").toLowerCase());

const web = (url) => (/^[a-z]+:/i.test(url) ? url : `https://${url}`);

const lucky = async (words) => {
	const known = SITES[words.toLowerCase()];
	if (known) return web(known);
	const search = `https://www.google.com/search?q=${encodeURIComponent(words)}`;
	try {
		const answer = await fetch(`${search}&btnI=1`, { headers: { cookie: "CONSENT=YES+cb; SOCS=CAI", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36" }, redirect: "manual", signal: AbortSignal.timeout(2000) });
		const location = answer.headers.get("location") ?? "";
		const target = /[?&]q=([^&]+)/.exec(location)?.[1];
		const url = target ? decodeURIComponent(target) : location;
		return url.startsWith("http") && !url.includes("google.com/search") ? url : search;
	} catch {
		return search;
	}
};

const hint = (name, exe) => {
	const alias = ALIASES[name.toLowerCase()];
	if (/[\/]/.test(name)) return "explorer";
	if (exe) return exe;
	return alias && !alias.includes(":") ? (alias === "calc" ? "calculator" : alias === "mspaint" ? "paint" : alias === "wt" ? "windowsterminal" : alias) : name.toLowerCase();
};

const front = async () => ps("[Hf]::Row([Hf]::Front())");

let target = 0;

async function launch(name, url) {
	const lowered = name.toLowerCase();
	const exe = BROWSERS[lowered] ?? (ENGINES.has(lowered) ? lowered : null);
	const open = exe ? (await windows()).find((row) => row.app.toLowerCase() === exe) : null;
	if (open && url) {
		await ps(`[void][Hf]::Focus(${open.id}); $t = [Hf]::Title(${open.id}); $p = @(Get-Process -Id ([Hf]::Row(${open.id})).pid)[0].Path; Start-Process -FilePath $p -ArgumentList ${q(`"${web(url)}"`)}; [void][Hf]::WaitTitle(${open.id}, $t, 4000)`);
		target = open.id;
		return;
	}
	if (open) {
		if (!(await ps(`[Hf]::Focus(${open.id})`))) throw new Error(`${name} would not come to the front.`);
		target = open.id;
		return;
	}
	const flag = /firefox|zen/.test(lowered) ? "-new-window" : "--new-window";
	const started = await ps(`$before = [long[]]@([Hf]::Windows() | ForEach-Object { $_.id })
$n = ${q(name)}; $alias = ${q(ALIASES[lowered] ?? "")}; $exe = ${q(exe ?? "")}; $url = ${q(url ? web(url) : "")}
$ok = $true
function Run-Hf($what, $more) { $exe = @(Get-Command $what -CommandType Application -ErrorAction SilentlyContinue | Where-Object { $_.Path -match '[.](exe|com|msc)$' })[0]; $file = $(if ($exe) { $exe.Path } else { foreach ($hive in 'HKCU:', 'HKLM:') { $reg = (Get-ItemProperty -LiteralPath "$hive\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$what.exe" -ErrorAction SilentlyContinue).'(default)'; if ($reg) { $reg.Trim('"'); break } } }); if (-not $file) { if ($what -match ':$') { $file = $what } else { throw "$what not found" } }; if ($more) { Start-Process -FilePath $file -ArgumentList $more } else { Start-Process -FilePath $file } }
if ($alias) { Run-Hf $alias $null }
elseif (Test-Path -LiteralPath $n) { Start-Process -FilePath $n }
else {
	$done = $false
	if ($exe -and $url) { try { Run-Hf $exe @(${q(flag)}, ('"' + $url + '"')); $done = $true; $url = '' } catch { } }
	if (-not $done) {
		$apps = @(Get-StartApps)
		$app = @($apps | Where-Object { $_.Name -eq $n }) + @($apps | Where-Object { $_.Name -like "$n*" }) + @($apps | Where-Object { $_.Name -like "*$n*" }) | Select-Object -First 1
		if ($app) { Start-Process ('shell:AppsFolder\\' + $app.AppID) } else { try { Run-Hf $n $null } catch { $ok = $false } }
	}
}
@{ ok = $ok; window = $(if ($ok) { [Hf]::WaitNew($before, ${q(hint(name, exe))}, 9000) } else { 0 }); url = $url }`);
	if (!started.ok) throw new Error(`${name} is neither installed nor open.`);
	if (!started.window) throw new Error(`${name} started, but no window of it came up.`);
	if (started.window < 0) throw new Error(`${name} is open but would not come to the front.`);
	target = started.window;
	if (started.url) await go(started.url);
}

async function go(url) {
	let row = await front();
	if (!isBrowser(row)) {
		row = (await windows()).find(isBrowser);
		if (!row) throw new Error("No browser is open.");
		if (!(await ps(`[Hf]::Focus(${row.id})`))) throw new Error("The browser would not come to the front.");
	}
	target = row.id;
	await waitIdle();
	const moved = await ps(`$t = [Hf]::Title(${row.id}); $e = [Hf]::PressTo(${row.id}, 'esc'); if (-not $e) { $e = [Hf]::PressTo(${row.id}, 'ctrl+l') }; if (-not $e) { $e = [Hf]::PressTo(${row.id}, 'ctrl+a') }; if (-not $e) { $e = [Hf]::TypeTo(${row.id}, ${q(url)}) }; if (-not $e) { $e = [Hf]::PressTo(${row.id}, 'enter') }; if ($e) { $e } elseif ([Hf]::WaitTitle(${row.id}, $t, 5000)) { $null } else { 'The browser did not open the page.' }`);
	if (moved) throw new Error(moved);
}

async function step(entry) {
	if (typeof entry.focus === "number") {
		if (!(await ps(`[Hf]::Focus(${entry.focus})`))) throw new Error("That window would not come to the front.");
		target = entry.focus;
		return;
	}
	if (typeof entry.focus === "string") {
		const want = entry.focus.toLowerCase();
		const all = await windows();
		const row = all.find((w) => w.app.toLowerCase() === want) ?? all.find((w) => w.title.toLowerCase() === want) ?? all.find((w) => w.app.toLowerCase().includes(want)) ?? all.find((w) => w.title.toLowerCase().includes(want));
		if (!row || !(await ps(`[Hf]::Focus(${row.id})`))) throw new Error(`No ${entry.focus} window is open.`);
		target = row.id;
		return;
	}
	if (entry.launch) return launch(entry.launch, entry.url);
	if (entry.split) {
		const error = await ps(`[Hf]::Split([long[]]@(${entry.split.map(Number).join(",")}))`);
		if (error) throw new Error(error);
		return;
	}
	if (entry.go) return go(web(entry.go));
	if (entry.find) return go(await lucky(entry.find));
	const row = target ? await ps(`[Hf]::Row(${target})`) : await front();
	const sent = async (code) => {
		await waitIdle();
		const error = await ps(code);
		if (error) throw new Error(error);
	};
	if (entry.window) {
		if (entry.window === "new") {
			await sent(`[Hf]::PressTo(${row.id}, 'ctrl+n')`);
			await new Promise((done) => setTimeout(done, 800));
			target = (await front()).id;
			return;
		}
		if (row.id !== (await front()).id && !(await ps(`[Hf]::Focus(${row.id})`))) throw new Error("The window it was working in would not come back to the front.");
		const error = await ps(`[Hf]::Shape(${row.id}, ${q(entry.window)}, $${isBrowser(row)})`);
		if (error) throw new Error(error);
		if (entry.window === "close") target = 0;
		return;
	}
	if (entry.tab) {
		if (!isBrowser(row)) throw new Error("The window it is working in is not a browser.");
		return sent(`[Hf]::PressTo(${row.id}, ${q(TABS[entry.tab])}); Start-Sleep -Milliseconds 120`);
	}
	if (entry.keys) return sent(`[Hf]::PressTo(${row.id}, ${q(entry.keys)})`);
	if (typeof entry.type === "string") return sent(`[Hf]::TypeTo(${row.id}, ${q(entry.type)})`);
	if (entry.wait) {
		const ok = await ps(`[Hf]::WaitFront(@(${entry.wait.toLowerCase().split("|").map(q).join(",")}), ${Math.min(Number(entry.ms) || 4000, 15000)})`);
		if (!ok) throw new Error(`The window in front never showed ${entry.wait}.`);
		return;
	}
	throw new Error(`${JSON.stringify(entry)} is not a step this can run.`);
}

export async function act(steps) {
	const started = Date.now();
	target = (await front()).id;
	const ran = [];
	let error = null;
	for (const entry of steps) {
		const at = Date.now();
		try {
			await step(entry);
			ran.push({ ok: true, ms: Date.now() - at, step: entry });
		} catch (cause) {
			error = cause.message;
			ran.push({ ok: false, ms: Date.now() - at, step: entry });
			break;
		}
	}
	return { ok: !error, error, front: await front().catch(() => null), ms: Date.now() - started, steps: ran };
}

function profiles() {
	const roots = [process.env.LOCALAPPDATA, process.env.APPDATA].filter(Boolean);
	const found = [];
	for (const root of roots) {
		for (const vendor of safe(() => readdirSync(root))) {
			for (const dir of [join(root, vendor, "User Data"), ...safe(() => readdirSync(join(root, vendor))).map((sub) => join(root, vendor, sub, "User Data")), join(root, vendor, "Opera Stable")]) {
				const state = safe(() => JSON.parse(readFileSync(join(dir, "Local State"), "utf8")), null);
				for (const [key, info] of Object.entries(state?.profile?.info_cache ?? {})) found.push({ browser: dir.slice(root.length + 1).replace(/[\\/]User Data$/, ""), dir: key, name: info.name, account: info.user_name ?? "" });
			}
		}
	}
	return found;
}

function safe(read, fallback = []) {
	try {
		return read();
	} catch {
		return fallback;
	}
}

export async function snapshot(deep) {
	const pc = { windows: await windows(), home: homedir() };
	if (deep) {
		pc.apps = list(await ps("@(Get-StartApps | ForEach-Object Name | Where-Object { $_ -notmatch '(?i)uninstall|readme|help|documentation|release notes|website' } | Sort-Object -Unique)"));
		pc.profiles = profiles();
	}
	return pc;
}

export function describe(pc) {
	const lines = ["Open windows, the one in front first:"];
	for (const row of pc.windows.slice(0, 40)) lines.push(`- [${row.id}] ${row.app}: ${row.title.slice(0, 90)}${row.front ? " (in front)" : ""}${row.minimized ? " (minimised)" : ""}${row.full ? " (full screen)" : ""} at ${row.x},${row.y} ${row.width}x${row.height}`);
	if (pc.profiles?.length) {
		lines.push("Browser profiles:");
		for (const p of pc.profiles) lines.push(`- ${p.browser} profile ${p.dir} "${p.name}"${p.account ? `, signed in as ${p.account}` : ""}`);
	}
	if (pc.apps?.length) lines.push(`Installed apps: ${pc.apps.slice(0, 300).join(", ")}.`);
	lines.push(`Home folder: ${pc.home}.`);
	return lines.join("\n");
}
