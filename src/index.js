#!/usr/bin/env node
import { createInterface } from "node:readline";

import { clean, takesBack } from "disfluency";

import { act, describe, launchAside, snapshot } from "./act.js";
import { browse, evaluate, openTab, pageShot, read, tabs } from "./page.js";
import { actSaid, fronted, missingSaid, readAct, reflex } from "./reflex.js";
import { DESK, elements, list, ps, shot, use, waitIdle, windows } from "./win.js";

const VERSION = "1.2.0";

const INSTRUCTIONS = `Handsfree is the person's own computer: their windows, apps, keyboard, mouse and their own signed-in browser.
- Know the PC first: pc lists the open windows with their ids, the one in front first; deep adds installed apps and browser profiles. Use an open window before launching an app.
- Plain requests ("open YouTube in Chrome full screen", "snap Spotify to the right", "new tab in Brave and go to github.com", "press ctrl+shift+t"): call do with their words; it runs native steps in about a second. When do has no quick path, use act.
- Fastest first: act runs a whole run of steps in one call (focus, launch, window, go, find, tab, keys, type, wait, split) and answers with the window in front as proof.
- Desktop apps: elements (the accessibility tree, numbered) before screenshot; click by element number, or at pixels of the last screenshot. Prefer an app's own shortcuts and command palette to hunting with the mouse.
- Web pages: tabs, open, read, browse act in the person's own browser with their sign-ins, in the background, without their keyboard or screen. For a new page, open with no tab opens a window of your own; never navigate the tab they are using unless they asked. Each browser tool answers with the page's elements by ref, so never read it again first. A whole form is one browse call: fill every field, then click submit last.
- To act on every item in a list, click the control that names the whole action (Delete all, Mark all as read, Empty folder) rather than select-all; answer a confirm dialog already on screen first. Never one item at a time.
- Before you buy, book, reserve or send, check the item you picked against every condition they gave on its own page: a price limit means at or below it.
- After any action that changes something, look again before you say it worked. Never change an app's settings or config files to get something done. Save no file they did not ask for.
- Real keyboard and mouse steps wait until the person has paused for about a second, so you never fight them.
- Your own desktop work stays off their screen, on the ${DESK} desktop (a Windows virtual desktop): desk launch starts an app there, open puts browser pages there, and use drives a window there through accessibility (press, set or type text, toggle, select, expand) with no real keyboard or mouse. Real keys and clicks never go to a window on that desktop; when an app truly needs them, desk visit shows that desktop and desk leave hands the screen back. desk bring moves a window to their desktop when they ask to see it.`;

const text = (value) => ({ content: [{ type: "text", text: value }] });
const image = (data, note) => ({ content: [{ type: "image", data, mimeType: "image/jpeg" }, { type: "text", text: note }] });

const STEP = { type: "object", description: "One of: {focus: windowId|name}, {launch: app, url?}, {window: full|max|min|restore|close|left|right|new}, {go: address}, {find: words}, {tab: new|close|next|prev|reopen}, {keys: \"ctrl+shift+t\"}, {type: text}, {wait: \"title words\", ms?}, {split: [windowId, windowId, ...]}" };
const TAB = { type: "string", description: "Tab id from tabs (first characters are enough). Defaults to the most recent tab." };

const TOOLS = [
	{ name: "pc", description: "The person's PC now: open windows with ids (the one in front first), and with deep true the installed apps, browser profiles and home folder.", inputSchema: { type: "object", properties: { deep: { type: "boolean" } } } },
	{ name: "do", description: "Do a plain-words request on the PC with native steps, no planning: open, bring up, close, minimise, maximise, full screen, snap or split apps and windows; open sites and searches in a browser; tabs; press keys; type text. A request holding a self-repair (\"open Chrome, no wait, Edge\") is cleaned to what they finally meant first. Answers what it did, or that it has no quick path.", inputSchema: { type: "object", properties: { said: { type: "string", description: "The request in plain words, as they said it." }, repaired: { type: "boolean", description: "True when said is already only what they finally meant." }, before: { type: "string", description: "The previous request, for follow-ups like \"open the first result\"." } }, required: ["said"] } },
	{ name: "act", description: "Run native steps in order on the PC in one call, each checked as it runs; answers with the window in front. Steps after focus or launch act on that window.", inputSchema: { type: "object", properties: { steps: { type: "array", items: STEP, maxItems: 12 } }, required: ["steps"] } },
	{ name: "screenshot", description: "A picture of the whole screen, or one window. Slow: prefer elements to find what to click.", inputSchema: { type: "object", properties: { window: { type: "number", description: "Window id from pc." } } } },
	{ name: "elements", description: "A desktop window's buttons, fields, menus and text from its accessibility tree, numbered for click. Defaults to the window in front.", inputSchema: { type: "object", properties: { window: { type: "number" } } } },
	{ name: "use", description: `Act on an element from the last elements call through accessibility, with no real keyboard or mouse, so it works on windows in the background or on the ${DESK} desktop. press invokes, toggles, selects or expands it; set replaces its text; type adds text at the end. Answers with the window's elements after.`, inputSchema: { type: "object", properties: { element: { type: "number" }, action: { type: "string", enum: ["press", "set", "type", "toggle", "select", "expand", "collapse", "scroll"] }, value: { type: "string" } }, required: ["element", "action"] } },
	{ name: "desk", description: `The ${DESK} desktop, a Windows virtual desktop of your own, so your work stays off the person's screen. status: the desktops and your windows there. launch: start an app there (app, url). quit: close one of your windows (a save prompt shows in its elements). move: send a window there. bring: move a window to the person's desktop. visit: show that desktop to use the real keyboard and mouse; leave: give the screen back. close: remove it once your windows there are closed.`, inputSchema: { type: "object", properties: { action: { type: "string", enum: ["status", "launch", "quit", "move", "bring", "visit", "leave", "close"] }, app: { type: "string" }, url: { type: "string" }, window: { type: "number" } }, required: ["action"] } },
	{ name: "click", description: "Click with the real mouse: an element number from elements, or x and y in the last screenshot's pixels. scroll moves the wheel there instead (positive is down).", inputSchema: { type: "object", properties: { element: { type: "number" }, x: { type: "number" }, y: { type: "number" }, button: { type: "string", enum: ["left", "right", "middle"] }, double: { type: "boolean" }, scroll: { type: "number" } } } },
	{ name: "tabs", description: "Every tab of the person's own browser (Chrome, Edge, Brave and other Chromium browsers), marking the one on screen.", inputSchema: { type: "object", properties: {} } },
	{ name: "open", description: "Open an address in the person's browser with their sign-ins. With no tab it opens a window of your own, on the agent desktop on Windows (show true keeps it on the person's screen); with tab it navigates that tab. Answers with the page's elements.", inputSchema: { type: "object", properties: { url: { type: "string" }, tab: TAB, show: { type: "boolean" } }, required: ["url"] } },
	{ name: "read", description: "A tab's title, address and interactive elements by ref; text true adds the page's words.", inputSchema: { type: "object", properties: { tab: TAB, text: { type: "boolean" } } } },
	{ name: "browse", description: "Run actions in a tab in one call, in the background: {click: ref}, {fill: ref, value} (text box, dropdown, checkbox true/false), {type: text}, {press: \"Enter\" | \"ctrl+a\"}, {scroll: pixels}, {go: address}, {wait: ms}. Answers what ran and the page's elements after.", inputSchema: { type: "object", properties: { tab: TAB, actions: { type: "array", items: { type: "object" }, maxItems: 40 } }, required: ["actions"] } },
	{ name: "page_screenshot", description: "A picture of a tab.", inputSchema: { type: "object", properties: { tab: TAB } } },
	{ name: "page_eval", description: "Run JavaScript in a tab and answer its value.", inputSchema: { type: "object", properties: { tab: TAB, js: { type: "string" } }, required: ["js"] } },
];

let lastShot = null;
let lastElements = [];
let apps = { at: 0, pc: null };

async function knownPc() {
	if (Date.now() - apps.at > 300000) apps = { at: Date.now(), pc: await snapshot(true) };
	return { ...apps.pc, windows: (await snapshot(false)).windows };
}

const listed = (rows) => (rows.length ? rows.map((e, at) => `[${at + 1}] ${e.type} "${e.name}"${e.value && e.value !== e.name ? ` = "${e.value}"` : ""}${e.off ? " (disabled)" : ""}`).join("\n") : "This window exposes no elements; use screenshot.");

const frontLine = (front) => (front ? `In front: [${front.id}] ${front.app}: ${front.title}` : "");

const CALLS = {
	pc: async ({ deep }) => text(describe(deep ? await knownPc() : await snapshot(false))),
	do: async ({ said, before, repaired }) => {
		let words = said;
		if (!repaired && takesBack(said)) {
			const cleaned = await clean(said);
			if (cleaned.outcome === "cancelled") return text("They took the request back, so nothing was done.");
			if (cleaned.outcome !== "cleaned") return text(`"${said}" may hold a self-repair (no, wait, actually, instead, scratch that). Call do again with only what they finally meant, and repaired true.`);
			words = cleaned.text;
		}
		const pc = await knownPc();
		const plan = reflex(words, pc, before);
		if (plan?.missing) return text(missingSaid(plan.missing, plan.open));
		if (!plan?.steps.length) return text("No quick path for that. Use pc, act, elements, click or the browser tools.");
		const steps = fronted(plan.steps, words, pc);
		const result = await act(steps);
		return text([words !== said ? `Heard as: ${words}` : "", result.ok ? actSaid(steps, result) : `Stopped: ${result.error}`, `Steps: ${JSON.stringify(steps)}`, frontLine(result.front)].filter(Boolean).join("\n"));
	},
	act: async ({ steps }) => {
		const list = readAct(steps);
		if (!list.length) throw new Error("Those steps are not valid. Each step is one of the listed shapes.");
		const result = await act(list);
		return text([result.ok ? `Done in ${result.ms} ms.` : `Stopped: ${result.error}`, ...result.steps.map((s) => `${s.ok ? "ok" : "failed"} ${JSON.stringify(s.step)} ${s.ms} ms`), frontLine(result.front)].join("\n"));
	},
	screenshot: async ({ window }) => {
		lastShot = await shot(window);
		return image(lastShot.data, `${lastShot.width}x${lastShot.height}. click takes x and y in this picture's pixels.`);
	},
	elements: async ({ window }) => {
		lastElements = await elements(window);
		return text(listed(lastElements));
	},
	use: async ({ element, action, value }) => {
		const said = await use(element, action, value);
		await new Promise((done) => setTimeout(done, 300));
		lastElements = await elements(lastElements[0]?.window);
		return text(`${said}\n\n${listed(lastElements)}`);
	},
	desk: async ({ action, app, url, window }) => {
		if (action === "status") {
			const desks = list(await ps("[Desk]::Desktops()"));
			const mine = (await windows()).filter((w) => w.desk === DESK);
			const rows = desks.map((d) => `- ${d.name}${d.current ? " (on screen)" : ""}${d.agent ? " (yours)" : ""}`);
			return text(`Desktops:\n${rows.join("\n")}\n${mine.length ? `Your windows there:\n${mine.map((w) => `- [${w.id}] ${w.app}: ${w.title}`).join("\n")}` : `No windows on the ${DESK} desktop.`}`);
		}
		if (action === "launch") {
			if (!app) throw new Error("Name the app to launch.");
			await ps("[void][Desk]::Ensure()");
			const id = await launchAside(app, url);
			return text(`Started ${app} on the ${DESK} desktop as window [${id}]. Read it with elements (window ${id}) and drive it with use.`);
		}
		if (action === "quit") {
			if (!window) throw new Error("Give the window id.");
			const gone = await ps(`[void][Hf]::Shape(${window}, 'close', $false); -not [Hf]::Row(${window}).title`);
			return text(gone ? `Closed [${window}].` : `[${window}] is still open, most likely asking to save: read it with elements and answer with use.`);
		}
		if (action === "move" || action === "bring") {
			if (!window) throw new Error("Give the window id.");
			await ps(action === "move" ? `[Desk]::Send(${window})` : `[Desk]::Bring(${window})`);
			return text(action === "move" ? `Moved [${window}] to the ${DESK} desktop.` : `Moved [${window}] to the person's desktop.`);
		}
		if (action === "visit") {
			await ps("[Desk]::Visit()");
			return text(`The ${DESK} desktop is on screen now, so real keys and clicks work there. Call desk leave when done.`);
		}
		if (action === "leave") {
			await ps("[Desk]::Leave()");
			return text("The person's desktop is back on screen.");
		}
		if (action === "close") {
			const left = (await windows()).filter((w) => w.desk === DESK);
			if (left.length) throw new Error(`Your windows are still there: ${left.map((w) => `[${w.id}] ${w.title}`).join(", ")}. quit them (or bring them) first.`);
		}
		if (action === "close") return text((await ps("[Desk]::Remove()")) ? `Removed the ${DESK} desktop; its windows moved to the person's desktop.` : `There is no ${DESK} desktop.`);
		throw new Error("Unknown action.");
	},
	click: async ({ element, x, y, button = "left", double, scroll }) => {
		let at;
		const owner = element != null ? lastElements[element - 1]?.window : lastShot?.window;
		if (owner) {
			const error = await ps(`[Hf]::Guard(${owner})`);
			if (error) throw new Error(error);
		}
		if (element != null) {
			const e = lastElements[element - 1];
			if (!e) throw new Error("No such element. Call elements first.");
			at = [e.x, e.y];
		} else {
			if (x == null || y == null) throw new Error("Give an element number, or x and y.");
			if (!lastShot) throw new Error("Take a screenshot first, so x and y have a picture to refer to.");
			at = [Math.round(lastShot.x + x / lastShot.scale), Math.round(lastShot.y + y / lastShot.scale)];
		}
		if (!(await ps(`[Hf]::OnScreen(${at[0]}, ${at[1]})`))) throw new Error("That point is off the screen, so nothing was clicked.");
		await waitIdle();
		await ps(scroll ? `[Hf]::Scroll(${at[0]}, ${at[1]}, ${Math.round(scroll)})` : `[Hf]::Click(${at[0]}, ${at[1]}, '${button}', ${double ? 2 : 1})`);
		await new Promise((done) => setTimeout(done, 250));
		return text(`${scroll ? "Scrolled" : "Clicked"} at ${at[0]},${at[1]}.\n${frontLine(await ps("[Hf]::Row([Hf]::Front())"))}`);
	},
	tabs: async () => text(await tabs(process.platform === "win32" ? await ps("[Hf]::Title([Hf]::Front())").catch(() => "") : "")),
	open: async ({ url, tab, show }) => text(await openTab(url, tab, show)),
	read: async ({ tab, text: words }) => text(await read(tab, words)),
	browse: async ({ tab, actions }) => text(await browse(tab, actions)),
	page_screenshot: async ({ tab }) => image(await pageShot(tab), "The tab as it looks now."),
	page_eval: async ({ tab, js }) => text(await evaluate(tab, js)),
};

const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

async function handle(message) {
	const { id, method, params } = message;
	if (id === undefined) return;
	if (method === "initialize") return write({ jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "handsfree", version: VERSION }, instructions: INSTRUCTIONS } });
	if (method === "ping") return write({ jsonrpc: "2.0", id, result: {} });
	if (method === "tools/list") return write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
	if (method === "tools/call") {
		const call = CALLS[params?.name];
		if (!call) return write({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
		try {
			return write({ jsonrpc: "2.0", id, result: await call(params.arguments ?? {}) });
		} catch (error) {
			return write({ jsonrpc: "2.0", id, result: { ...text(error.message), isError: true } });
		}
	}
	write({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } });
}

createInterface({ input: process.stdin }).on("line", (line) => {
	if (!line.trim()) return;
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
	}
	handle(message);
}).on("close", () => process.exit(0));

if (process.platform === "win32") ps("1").catch(() => undefined);
