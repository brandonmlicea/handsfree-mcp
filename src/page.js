import { browser, pages, session } from "./browser.js";

const SNAPSHOT = String.raw`(withText) => {
	const pick = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true]';
	const shown = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
	const clip = (text, n) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	let next = window.__hf || 0;
	const rows = [];
	const all = [...document.querySelectorAll(pick)].filter(shown);
	const near = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight ? 0 : 1; };
	all.sort((a, b) => near(a) - near(b));
	for (const el of all.slice(0, 300)) {
		let ref = el.getAttribute('data-hf');
		if (!ref) { ref = String(++next); el.setAttribute('data-hf', ref); }
		const role = el.getAttribute('role') || (el.tagName === 'INPUT' ? (el.type || 'text') : el.tagName.toLowerCase());
		const name = clip(el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.placeholder || (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? '' : el.innerText) || el.title || el.getAttribute('alt') || el.name || '', 80);
		let extra = '';
		if (el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('aria-checked')) extra = (el.checked || el.getAttribute('aria-checked') === 'true') ? ' (checked)' : ' (unchecked)';
		else if (el.tagName === 'SELECT') extra = ' = "' + clip(el.selectedOptions[0]?.text, 40) + '" options: ' + [...el.options].slice(0, 15).map((o) => clip(o.text, 30)).join(' | ');
		else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value) extra = ' = "' + clip(el.type === 'password' ? '***' : el.value, 60) + '"';
		if (el.tagName === 'A' && el.href) extra += ' -> ' + clip(el.getAttribute('href'), 80);
		if (el.disabled) extra += ' (disabled)';
		rows.push('[' + ref + '] ' + role + ' "' + name + '"' + extra + (near(el) ? ' (below)' : ''));
	}
	window.__hf = next;
	const text = withText ? String(document.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').slice(0, 15000) : '';
	return { title: document.title, url: location.href, rows, text, more: all.length > 300 };
}`;

async function tab(id) {
	const list = await pages();
	if (!list.length) throw new Error("The browser has no open tabs.");
	if (!id) return list[0];
	const found = list.find((t) => t.targetId.toLowerCase().startsWith(String(id).toLowerCase()));
	if (!found) throw new Error(`No tab ${id}. Call tabs to see them.`);
	return found;
}

async function run(send, expression) {
	const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
	if (exceptionDetails) throw new Error(exceptionDetails.exception?.description?.split("\n")[0] ?? exceptionDetails.text);
	return result.value;
}

async function settle(send) {
	const end = Date.now() + 8000;
	await new Promise((done) => setTimeout(done, 250));
	while (Date.now() < end) {
		const state = await run(send, "document.readyState").catch(() => "loading");
		if (state === "complete" || state === "interactive") return;
		await new Promise((done) => setTimeout(done, 150));
	}
}

const short = (t) => t.targetId.slice(0, 6);

export async function tabs(frontTitle) {
	const list = await pages();
	const lines = list.map((t) => `- ${short(t)}: ${t.title.slice(0, 80)} | ${t.url.slice(0, 120)}${frontTitle && frontTitle.startsWith(t.title) && t.title ? " (on screen)" : ""}`);
	return lines.length ? `Tabs (id: title | address):\n${lines.join("\n")}` : "No tabs are open.";
}

export async function read(id, withText) {
	const t = await tab(id);
	const send = await session(t.targetId);
	const snap = await run(send, `(${SNAPSHOT})(${withText ? "true" : "false"})`);
	return `Tab ${short(t)}: ${snap.title}\n${snap.url.slice(0, 200)}\n\nElements by ref:\n${snap.rows.join("\n") || "(none)"}${snap.more ? "\n(more elements below the first 300)" : ""}${snap.text ? `\n\nText:\n${snap.text}` : ""}`;
}

export async function openTab(url, id) {
	const address = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
	if (id) {
		const t = await tab(id);
		const send = await session(t.targetId);
		await send("Page.navigate", { url: address });
		await settle(send);
		return read(short(t), false);
	}
	const link = await browser();
	const { targetId } = await link.send("Target.createTarget", { url: address, newWindow: true, background: true });
	await settle(await session(targetId));
	return read(targetId.slice(0, 6), false);
}

const KEYS = { enter: [13, "Enter", "\r"], tab: [9, "Tab"], escape: [27, "Escape"], esc: [27, "Escape"], backspace: [8, "Backspace"], delete: [46, "Delete"], space: [32, " ", " "], arrowdown: [40, "ArrowDown"], down: [40, "ArrowDown"], arrowup: [38, "ArrowUp"], up: [38, "ArrowUp"], arrowleft: [37, "ArrowLeft"], left: [37, "ArrowLeft"], arrowright: [39, "ArrowRight"], right: [39, "ArrowRight"], pagedown: [34, "PageDown"], pageup: [33, "PageUp"], home: [36, "Home"], end: [35, "End"] };

async function press(send, combo) {
	const parts = combo.split("+").map((p) => p.trim());
	const main = parts.pop();
	const mods = parts.reduce((m, p) => m | ({ alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 }[p.toLowerCase()] ?? 0), 0);
	const known = KEYS[main.toLowerCase()];
	const [code, key, text] = known ?? [main.toUpperCase().charCodeAt(0), main, main];
	const base = { key, code: known ? key : /^[a-z]$/i.test(main) ? `Key${main.toUpperCase()}` : `Digit${main}`, windowsVirtualKeyCode: code, modifiers: mods };
	await send("Input.dispatchKeyEvent", { type: mods & 6 || !text ? "rawKeyDown" : "keyDown", ...base, ...(mods & 6 ? {} : { text }) });
	await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function point(send, ref) {
	const at = await run(send, `(() => { const el = document.querySelector('[data-hf="${String(ref).replace(/\D/g, "")}"]'); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
	if (!at) throw new Error(`No element [${ref}] on the page now. Read the page again.`);
	return at;
}

async function click(send, ref) {
	const { x, y } = await point(send, ref);
	await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
	await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
	await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function fill(send, ref, value) {
	const kind = await run(send, `(() => { const el = document.querySelector('[data-hf="${String(ref).replace(/\D/g, "")}"]'); if (!el) return 'gone'; el.scrollIntoView({ block: 'center' }); el.focus();
		const v = ${JSON.stringify(String(value))};
		if (el.tagName === 'SELECT') { const o = [...el.options].find((o) => o.value === v || o.text.trim() === v) || [...el.options].find((o) => o.text.toLowerCase().includes(v.toLowerCase())); if (!o) return 'no option'; el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'done'; }
		if (el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'switch') { const on = el.checked ?? el.getAttribute('aria-checked') === 'true'; return on === /^(true|on|yes|1|checked)$/i.test(v) ? 'done' : 'toggle'; }
		if (el.isContentEditable) { document.execCommand('selectAll'); return 'type'; }
		if (typeof el.select === 'function') el.select();
		return 'type'; })()`);
	if (kind === "gone") throw new Error(`No element [${ref}] on the page now. Read the page again.`);
	if (kind === "no option") throw new Error(`[${ref}] has no option "${value}".`);
	if (kind === "toggle") return click(send, ref);
	if (kind === "type") {
		await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
		await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
		if (String(value)) await send("Input.insertText", { text: String(value) });
	}
}

export async function browse(id, actions) {
	const t = await tab(id);
	const send = await session(t.targetId);
	const done = [];
	for (const [at, a] of actions.entries()) {
		try {
			if (a.click != null) await click(send, a.click);
			else if (a.fill != null) await fill(send, a.fill, a.value ?? "");
			else if (a.press) await press(send, a.press);
			else if (a.type != null) await send("Input.insertText", { text: String(a.type) });
			else if (a.scroll != null) await run(send, `scrollBy(0, ${Number(a.scroll) || 0})`);
			else if (a.go) await send("Page.navigate", { url: /^[a-z]+:/i.test(a.go) ? a.go : `https://${a.go}` });
			else if (a.wait) await new Promise((r) => setTimeout(r, Math.min(Number(a.wait) || 500, 10000)));
			else throw new Error(`${JSON.stringify(a)} is not an action.`);
			done.push(`ok ${JSON.stringify(a)}`);
			if (a.click != null || a.go || a.press) await settle(send);
		} catch (error) {
			done.push(`failed ${JSON.stringify(a)}: ${error.message}`, ...actions.slice(at + 1).map((rest) => `skipped ${JSON.stringify(rest)}`));
			break;
		}
	}
	return `${done.join("\n")}\n\n${await read(short(t), false)}`;
}

export async function pageShot(id) {
	const t = await tab(id);
	const send = await session(t.targetId);
	const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 }, 20000);
	return data;
}

export async function evaluate(id, js) {
	const t = await tab(id);
	const send = await session(t.targetId);
	const value = await run(send, js);
	return typeof value === "string" ? value : JSON.stringify(value, null, 1) ?? "undefined";
}
