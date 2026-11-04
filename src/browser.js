import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOW = "No browser is connected. In Chrome, Edge or Brave open chrome://inspect/#remote-debugging (edge://inspect, brave://inspect), turn on \"Allow remote debugging for this browser instance\", then call this again and click Allow in the browser. Or start a browser with --remote-debugging-port=9222 and set HANDSFREE_CDP=9222.";

function dataDirs() {
	const home = homedir();
	const local = process.env.LOCALAPPDATA ?? "";
	const dirs = [];
	const scan = (root, depth) => {
		for (const name of safe(() => readdirSync(root))) {
			dirs.push(join(root, name, "User Data"));
			if (depth) for (const sub of safe(() => readdirSync(join(root, name)))) dirs.push(join(root, name, sub, "User Data"));
		}
	};
	if (local) scan(local, true);
	if (process.env.APPDATA) dirs.push(join(process.env.APPDATA, "Opera Software", "Opera Stable"));
	const mac = join(home, "Library", "Application Support");
	for (const name of ["Google/Chrome", "Google/Chrome Beta", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Chromium", "Vivaldi", "Thorium"]) dirs.push(join(mac, name));
	for (const name of ["google-chrome", "google-chrome-beta", "chromium", "microsoft-edge", "BraveSoftware/Brave-Browser", "vivaldi", "thorium"]) dirs.push(join(home, ".config", name));
	return dirs;
}

function safe(read, fallback = []) {
	try {
		return read();
	} catch {
		return fallback;
	}
}

async function sockets() {
	const env = process.env.HANDSFREE_CDP;
	if (env) {
		if (env.startsWith("ws")) return [{ url: env, name: "HANDSFREE_CDP" }];
		const info = await fetch(`http://127.0.0.1:${env}/json/version`).then((r) => r.json());
		return [{ url: info.webSocketDebuggerUrl, name: info.Browser }];
	}
	const found = [];
	for (const dir of dataDirs()) {
		const [port, path] = safe(() => readFileSync(join(dir, "DevToolsActivePort"), "utf8"), "").split(/\r?\n/).map((line) => line.trim());
		if (Number(port) && path) found.push({ url: `ws://127.0.0.1:${port}${path}`, name: dir });
	}
	return found;
}

let conn = null;

function open(url) {
	return new Promise((done, fail) => {
		const ws = new WebSocket(url);
		const calls = new Map();
		let seq = 0;
		const timer = setTimeout(() => {
			ws.close();
			fail(new Error("The browser did not answer. If it asks \"Allow remote debugging?\", click Allow, then try again."));
		}, 60000);
		const link = {
			ws,
			sessions: new Map(),
			send(method, params = {}, sessionId, ms = 30000) {
				const id = ++seq;
				ws.send(JSON.stringify({ id, method, params, sessionId }));
				return new Promise((ok, no) => {
					const late = setTimeout(() => {
						calls.delete(id);
						no(new Error(`${method} timed out.`));
					}, ms);
					calls.set(id, { ok, no, late });
				});
			},
		};
		ws.onopen = () => {
			clearTimeout(timer);
			done(link);
		};
		ws.onerror = () => {
			clearTimeout(timer);
			fail(new Error(`Could not reach ${url}.`));
		};
		ws.onclose = () => {
			if (conn === link) conn = null;
			for (const call of calls.values()) call.no(new Error("The browser connection closed."));
		};
		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			const call = calls.get(message.id);
			if (!call) {
				if (message.method === "Target.detachedFromTarget") for (const [key, value] of link.sessions) if (value === message.params.sessionId) link.sessions.delete(key);
				return;
			}
			calls.delete(message.id);
			clearTimeout(call.late);
			message.error ? call.no(new Error(message.error.message)) : call.ok(message.result);
		};
	});
}

export async function browser() {
	if (conn) return conn;
	const list = await sockets();
	let last = null;
	for (const one of list) {
		try {
			conn = await open(one.url);
			return conn;
		} catch (error) {
			last = error;
		}
	}
	throw new Error(last && !/Could not reach/.test(last.message) ? last.message : HOW);
}

export async function pages() {
	const link = await browser();
	const { targetInfos } = await link.send("Target.getTargets");
	return targetInfos.filter((t) => t.type === "page" && !t.url.startsWith("devtools://"));
}

export async function session(targetId) {
	const link = await browser();
	if (!link.sessions.has(targetId)) {
		const { sessionId } = await link.send("Target.attachToTarget", { targetId, flatten: true });
		link.sessions.set(targetId, sessionId);
	}
	const sessionId = link.sessions.get(targetId);
	return (method, params, ms) => link.send(method, params, sessionId, ms);
}
