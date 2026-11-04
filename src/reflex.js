export const SITES = {
	amazon: "www.amazon.com",
	chatgpt: "chatgpt.com",
	claude: "claude.ai",
	discord: "discord.com/app",
	facebook: "www.facebook.com",
	github: "github.com",
	gmail: "mail.google.com/mail/u/0/",
	google: "www.google.com",
	"google docs": "docs.google.com",
	"google drive": "drive.google.com",
	"google maps": "www.google.com/maps",
	"hacker news": "news.ycombinator.com",
	instagram: "www.instagram.com",
	linkedin: "www.linkedin.com/feed/",
	netflix: "www.netflix.com",
	outlook: "outlook.live.com",
	reddit: "www.reddit.com",
	spotify: "open.spotify.com",
	twitch: "twitch.tv",
	twitter: "x.com",
	wikipedia: "www.wikipedia.org",
	x: "x.com",
	youtube: "www.youtube.com",
};

export const BROWSERS = { brave: "brave", chrome: "chrome", "google chrome": "chrome", edge: "msedge", "microsoft edge": "msedge", firefox: "firefox", vivaldi: "vivaldi", thorium: "thorium", opera: "opera", zen: "zen", arc: "arc" };

export const APP_NAMES = { calculator: "calculator", calc: "calculator", notepad: "notepad", "file explorer": "file explorer", explorer: "file explorer", "files": "file explorer", "vs code": "visual studio code", vscode: "visual studio code", code: "visual studio code", terminal: "terminal", settings: "settings", "task manager": "task manager", paint: "paint" };

export const FAMOUS = /^(?:excel|word|powerpoint|outlook|onenote|slack|zoom|teams|microsoft teams|whatsapp|telegram|signal|skype|photoshop|illustrator|premiere|lightroom|figma|blender|steam|spotify|discord|notion|obsidian|evernote|todoist|postman|docker|vlc|itunes|safari|zed|cursor|windsurf|sublime text|android studio|intellij|pycharm|xcode|unity|gimp|audacity|obs|canva|trello|jira|1password|bitwarden|dropbox|onedrive)$/;

export const famous = (name) => FAMOUS.test(name.replace(/^(?:up\s+)?(?:the|my)\s+/, "").replace(/\s+(?:app|application)$/, ""));

export const KEY = /^(?:ctrl|alt|shift|win|windows|enter|return|escape|esc|tab|space|backspace|delete|del|insert|home|end|up|down|left|right|pageup|pagedown|f\d{1,2}|[a-z0-9])$/;

export const FILLER = /\b(?:please|pls|can you|could you|would you|will you|i want you to|i'd like you to|i need you to|i was wondering if you could|would you mind|do you mind|if you could|maybe|go ahead and|hey|okay|ok|alright|all right|um+|uh+|just|real quick|for me|now|quickly|right away|thanks|thank you|it'?s on (?:my|the) screen(?: right now)?|right now|look(?!\s+(?:up|for|at|into)))\b/g;

export const SEARCHES = { amazon: "www.amazon.com/s?k=", github: "github.com/search?q=", google: "www.google.com/search?q=", reddit: "www.reddit.com/search/?q=", wikipedia: "en.wikipedia.org/w/index.php?search=", youtube: "www.youtube.com/results?search_query=" };

const SHAPES = ["full", "max", "min", "restore", "close", "left", "right", "new"];

const TABS = ["new", "close", "next", "prev", "reopen"];

export const MAX_STEPS = 12;

export function readAct(raw) {
	const list = Array.isArray(raw) ? raw : [];
	const steps = [];
	for (const entry of list.slice(0, MAX_STEPS)) {
		const step = entry;
		const word = (key) => (typeof step?.[key] === "string" ? (step[key]).trim() : "");
		if (typeof step?.focus === "number" || word("focus")) steps.push({ focus: typeof step.focus === "number" ? step.focus : word("focus") });
		else if (word("launch")) steps.push(word("url") ? { launch: word("launch"), url: word("url") } : { launch: word("launch") });
		else if (SHAPES.includes(word("window"))) steps.push({ window: word("window") });
		else if (word("go")) steps.push({ go: word("go") });
		else if (word("find")) steps.push({ find: word("find") });
		else if (TABS.includes(word("tab"))) steps.push({ tab: word("tab") });
		else if (word("keys")) steps.push({ keys: word("keys") });
		else if (typeof step?.type === "string" && step.type) steps.push({ type: step.type });
		else if (word("wait")) steps.push({ wait: word("wait") });
		else if (Array.isArray(step?.split) && step.split.length > 1 && step.split.every((id) => typeof id === "number")) steps.push({ split: (step.split).slice(0, 6) });
		else return [];
	}
	return steps;
}

const plain = (text) =>
	text
		.toLowerCase()
		.replace(/[’']/g, "'")
		.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "")
		.replace(/[.,]?\s*\n+\s*(?:\d+[.)]|[-*•])?\s*/g, ", ")
		.replace(/(\w)\.(?=\s|$)/g, "$1")
		.replace(/[!?;"“”]/g, " ")
		.replace(FILLER, " ")
		.replace(/\s+/g, " ")
		.trim();

function distance(a, b) {
	const row = Array.from({ length: b.length + 1 }, (_, at) => at);
	for (let i = 1; i <= a.length; i++) {
		let last = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const keep = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
			last = keep;
		}
	}
	return row[b.length];
}

const near = (said, name) => said === name || (said.length >= 4 && distance(said, name) <= (said.length >= 7 ? 2 : 1));

const words = (name) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

class Missing extends Error {
	constructor(name, open = false) {
		super(name);
		this.name = name;
		this.open = open;
	}
}

function resolve(said, pc, fresh = false) {
	const name = said.replace(/^(?:the|my|a|an|this|that)\s+/, "").replace(/^new\s+/, "").replace(/\s+(?:browser|app|application|window|program)$/, "").trim();
	if (!name) return null;
	const windows = fresh ? [] : (pc?.windows ?? []);
	const folder = /\s+(?:app|application)$/.test(said) ? null : /^(downloads|documents|desktop|pictures|music|videos)(?:\s+folder)?$/.exec(name)?.[1];
	if (folder && pc?.home) return { app: "explorer", kind: "app", name: `${folder} folder`, path: `${pc.home}\\${titled(folder)}` };
	const inApp = /^(.+?)\s+(?:project\s+|window\s+|folder\s+)?in\s+([a-z]+)$/.exec(name);
	if (inApp) {
		const title = inApp[1].replace(/\s+(?:project|window|folder)$/, "");
		const row = (pc?.windows ?? []).find((entry) => near(inApp[2], entry.app.toLowerCase()) && (entry.title.toLowerCase() === title || entry.title.toLowerCase().startsWith(`${title} `)));
		return row ? { app: row.app, kind: "app", name: row.title, window: row.id } : null;
	}
	const browserKey = Object.keys(BROWSERS).find((key) => near(name, key));
	if (browserKey) {
		const exe = BROWSERS[browserKey];
		const open = windows.find((row) => row.app.toLowerCase() === exe);
		const installed = (pc?.apps ?? []).find((app) => (browserKey === "edge" ? /^microsoft edge$/i.test(app) : words(app).includes(browserKey) && !/private|search with/i.test(app)));
		if (open) return { app: exe, kind: "browser", launch: installed, name: browserKey, window: open.id };
		if (installed || !pc?.apps || fresh) return { app: exe, kind: "browser", launch: installed, name: browserKey };
		throw new Missing(browserKey);
	}
	if (name === "browser" || name === "web browser") {
		const open = windows.find((row) => Object.values(BROWSERS).includes(row.app.toLowerCase()));
		if (open) return { app: open.app, kind: "browser", name: open.app, window: open.id };
		const installed = installedBrowser(pc);
		return installed ? { app: BROWSERS[installed.toLowerCase()], kind: "browser", launch: installed, name: installed.toLowerCase() } : { app: "chrome", kind: "browser", name: "chrome" };
	}
	const compact = name.replace(/\s+/g, "");
	const known = APP_NAMES[name] ?? APP_NAMES[compact] ?? name;
	const open = windows.find((row) => near(name, row.app.toLowerCase()) || near(compact, row.app.toLowerCase()) || row.title.toLowerCase() === name);
	if (open) return { app: open.app, kind: "app", name: known, window: open.id };
	const app = (pc?.apps ?? []).find((entry) => near(known, entry.toLowerCase())) ?? (pc?.apps ?? []).find((entry) => !SITES[known] && (entry.toLowerCase().startsWith(`${known} `) || (famous(known) && entry.toLowerCase().endsWith(` ${known}`))));
	if (app) return { app, kind: "app", name: app };
	if (APP_NAMES[name] ?? APP_NAMES[compact]) return { app: known, kind: "app", name: known };
	return null;
}

const site = (said) => {
	const name = said.replace(/^(?:the|my)\s+/, "").replace(/\s+(?:website|web site|site|page|home ?page|front page|feed|inbox|account|dot com)$/, "").trim();
	if (SITES[name]) return SITES[name];
	const spoken = name.replace(/\s+dot\s+/g, ".").replace(/\s+slash\s+/g, "/");
	return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/.test(spoken) ? spoken : null;
};

const ALONE = /^(?:it|this|that|the window|this window|the app)$/;

const LOCAL = /\b(?:files?|folders?|downloads?|documents?|e-?mails?|messages?|terminals?|windows?|tabs?|profiles?|which|how many|where|newest|latest|my|our|this|these|that|those)\b|\?/;

const THEIRS = /^(?:find|open|go to|show me|pull up|take me to|get me to|bring up|look up|visit)\s+(?:(?:their|his|her|its|the)\s+)?(?:(.+?)'s?\s+)?(linkedin|twitter|github|youtube channel|youtube|instagram|facebook|tiktok|website|site|home ?page|docs|documentation|pricing page|pricing|careers page|careers|blog)(?:\s+(?:page|account|profile|webpage|web page|channel))?(?:\s+(?:for|of|from)\s+(.+))?$/;

function onScreen(pc) {
	const row = (pc?.windows ?? []).find((entry) => entry.front && Object.values(BROWSERS).includes(entry.app.toLowerCase()));
	const title = row ? page(row.title) : "";
	const query = / - Google Search$/.exec(title) ? title.replace(/ - Google Search$/, "") : title.split(/\s+[|\-–—:·]\s+/)[0];
	return query && query.split(" ").length <= 6 ? query.toLowerCase() : "";
}

function prior(before, pc) {
	const go = before ? reflex(before, pc)?.steps.find((step) => "go" in step && step.go.startsWith(SEARCHES.google)) : undefined;
	return go ? decodeURIComponent(go.go.slice(SEARCHES.google.length).replace(/\+/g, " ")) : "";
}

export function reflex(text, pc, before) {
	const typed = /\b(?:type|write|enter)\s+(?:out\s+)?(?!(?:a|an|the|me|some|him|her|them|back|to|down|in|into|my|your|our|his|their|it|this|that|what|whatever|something|anything|nothing)\b)(.+?)[.]?\s*$/is.exec(text.trim());
	const head = typed ? text.trim().slice(0, typed.index).replace(/[,\s]*(?:and|then|and then)?\s*$/i, "") : text;
	const said = plain(head).replace(/^(?:so|well|and|handsfree)\s+/, "");
	if ((!said && !typed) || said.length > 160) return null;
	const clauses = said.split(/\s*(?:,\s*)?\b(?:and then|then|and also|and|after that|also)\b\s*|,\s*/).map((part) => part.trim()).filter(Boolean).flatMap((part) => /^((?:open|go to|launch|start|pull up|bring up|take me to|visit)\s+.+?)\s+(?:in\s+|on\s+)?full ?screen$/.exec(part)?.slice(1).concat("full screen") ?? [part]);
	const went = (from) => (from?.steps ?? []).some((step) => "go" in step);
	let snapped = false;
	const used = (pc?.windows ?? []).find((row) => Object.values(BROWSERS).includes(row.app.toLowerCase()) && before && reflex(before, pc)?.steps.some((step) => "focus" in step && step.focus === row.id));
	const usual = () => (used ? { app: used.app, kind: "browser", name: used.app.toLowerCase(), window: used.id } : resolve("browser", pc));
	const steps = [];
	let browser = null;
	let front = null;
	const bring = (target, fresh = false) => {
		if (!fresh && front && front.name === target.name) return;
		steps.push(target.path ? { launch: target.path } : target.window && !fresh ? { focus: target.window } : { launch: target.launch ?? (target.kind === "browser" ? target.name : (target.app ?? target.name)) });
		front = target;
		if (target.kind === "browser") browser = target;
	};
	const browse = (url, where) => {
		if (!where && front?.kind === "app") throw new Missing("");
		const chosen = where ?? browser ?? (front?.kind === "browser" ? front : null);
		const results = url.startsWith(SEARCHES.google) || url.startsWith("find:") ? (pc?.windows ?? []).find((row) => / - Google Search\b/.test(row.title)) : undefined;
		bring((chosen ?? (results ? { app: results.app, kind: "browser", name: results.app.toLowerCase(), window: results.id } : usual())));
		const last = steps.at(-1);
		if (last && "launch" in last && !last.url && !url.startsWith("find:")) {
			last.url = url;
			return;
		}
		const showing = (pc?.windows ?? []).find((row) => "focus" in (last ?? {}) && row.id === (last).focus)?.title ?? "";
		if (!chosen && last && !("launch" in last) && !("tab" in last) && !/ - Google Search\b/.test(showing)) steps.push({ tab: "new" });
		steps.push(url.startsWith("find:") ? { find: url.slice(5) } : { go: url });
	};
	const google = (query) => `${SEARCHES.google}${encodeURIComponent(query).replace(/%20/g, "+")}`;
	const owned = (rest, shape, room) => {
		if (!rest || ALONE.test(rest)) return room;
		const target = resolve(rest, pc);
		if (target && !target.window && (shape === "close" || shape === "min")) throw new Missing(target.name, true);
		if (target && !target.window && shape === "restore") return null;
		if (!target && famous(rest) && pc?.apps) throw new Missing(rest.replace(/^(?:the|my)\s+/, ""));
		return target;
	};
	try {
		for (const clause of clauses) {
			let match;
			const inside = /^(.*?)\s*\b(?:in|on|with|using)\s+(?:the\s+|my\s+)?([a-z]+?)(?:\s+browser)?$/.exec(clause);
			const lead = /^(?:in|on|using)\s+(?:the\s+|my\s+)?(\w+)\s+(.+)$/.exec(clause);
			const first = lead ? resolve(lead[1], pc) : null;
			let where = first?.kind === "browser" ? first : inside ? resolve(inside[2], pc) : null;
			const room = where?.kind === "browser" ? where : null;
			const stated = first?.kind === "browser" ? lead [2] : room ? inside [1] : clause;
			const body = snapped && /^[a-z][\w]*?\s+(?:to|on)\s+(?:the\s+)?(?:left|right)(?:\s+(?:side|half))?$/.test(stated) ? `snap ${stated}` : stated;
			const last = steps.at(-1);
			snapped = false;
			if ((match = /^(?:make\s+|put\s+|go\s+|set\s+)?(?:(?:it|this|the window)\s+)?(?:full ?screen|full-screen)(?:\s+(?:mode\s+)?(?:on\s+)?(.+?))?(?:\s+(?:full ?screen|in full ?screen))?$/.exec(body)) || (match = /^(?:make|put|set)\s+(.+?)\s+(?:full ?screen|in full ?screen|full-screen)$/.exec(body))) {
				const target = owned(match[1] ?? "", "full", room);
				if (match[1] && !ALONE.test(match[1]) && !target) return null;
				if (target) bring(target);
				steps.push({ window: "full" });
			} else if ((match = /^(maximi[sz]e|minimi[sz]e|restore|close|quit|exit|hide)\s*(.*)$/.exec(body))) {
				const shape = { maximize: "max", maximise: "max", minimize: "min", minimise: "min", restore: "restore", close: "close", quit: "close", exit: "close", hide: "min" }[match[1]];
				if (!match[2] && shape === "close") return null;
				if (/^(?:the |this |that |current)?tab$/.test(match[2])) {
					steps.push({ tab: "close" });
					continue;
				}
				const target = owned(match[2], shape, room);
				if (match[2] && !ALONE.test(match[2]) && !target) return null;
				if (target) bring(target);
				steps.push({ window: shape });
			} else if ((match = /^(?:snap|move|put|dock)\s+(.+?)\s+(?:to\s+|on\s+)?(?:the\s+)?(left|right)(?:\s+(?:side|half))?(?:\s+of the screen)?$/.exec(body))) {
				const target = owned(match[1], "left", room);
				if (!ALONE.test(match[1]) && !target) return null;
				if (target) bring(target);
				steps.push({ window: match[2] });
				snapped = true;
			} else if (/^(?:open|start|create)\s+(?:a\s+)?new\s+tab$|^new tab$/.test(body)) {
				bring((room ?? browser ?? (front?.kind === "browser" ? front : null) ?? resolve("browser", pc)));
				steps.push({ tab: "new" });
			} else if ((match = /^(?:open|start|create)\s+(?:a\s+)?new\s+tab\s+(?:with|to|on|for|and go to)\s+(.+)$/.exec(body)) && site(match[1])) {
				bring((room ?? browser ?? (front?.kind === "browser" ? front : null) ?? usual()));
				steps.push({ tab: "new" }, { go: site(match[1]) });
			} else if ((match = /^(?:go to|switch to|jump to|open)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|1st|2nd|3rd|4th|5th|6th|7th|8th)\s+tab$/.exec(body))) {
				if (room) bring(room);
				steps.push({ keys: `ctrl+${["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"].indexOf(match[1]) + 1 || Number.parseInt(match[1], 10)}` });
			} else if ((match = /^bring\s+(.+?)\s+(?:back\s+up|back|up)$/.exec(body))) {
				const target = resolve(match[1], pc);
				if (!target?.window) return null;
				bring(target);
			} else if ((match = /^(?:open|start|create)\s+(?:a\s+)?new\s+(.+?)\s+window$/.exec(body))) {
				const target = resolve(match[1], pc);
				if (target?.kind !== "browser") return null;
				bring(target, true);
			} else if (/^(?:go\s+)?(?:to\s+)?(?:the\s+)?next tab$/.test(body)) steps.push({ tab: "next" });
			else if (/^(?:go\s+)?(?:back\s+)?(?:to\s+)?(?:the\s+)?(?:previous|last) tab$/.test(body)) steps.push({ tab: "prev" });
			else if (/^(?:reopen|restore|bring back)\s+(?:the\s+)?(?:last\s+)?closed tab$|^reopen (?:it|that|that tab|the tab)$/.test(body)) steps.push({ tab: "reopen" });
			else if ((match = /^(?:search|look up)\s+(?:on\s+)?(youtube|google|amazon|github|reddit|wikipedia)\s+for\s+(.+)$/.exec(body)) || (match = /^(?:search|look up|google)\s+(?:for\s+)?(.+?)(?:\s+on\s+(youtube|google|amazon|github|reddit|wikipedia))?$/.exec(body))) {
				const page = [...steps].reverse().find((step) => "go" in step);
				const shown = Object.keys(SEARCHES).find((key) => page?.go === SITES[key]);
				const [engine, query] = SEARCHES[match[1]] ? [match[1], match[2]] : [match[2] ?? shown ?? "google", match[1]];
				if (shown === engine && page === last) steps.pop();
				if (!query || /^(?:it|this|that)$|^(?:my|our)\b|\b(?:in|on)\s+(?:my\s+)?(?:outlook|gmail|e-?mail|mail|inbox|drive|slack|discord|teams|notion|google \w+)$/.test(query)) return null;
				browse(`${SEARCHES[engine]}${encodeURIComponent(query).replace(/%20/g, "+")}`, room);
			} else if ((match = THEIRS.exec(body)) && (match[1] || match[3] || /\b(?:their|his|her|its)\b/.test(body))) {
				const subject = match[1] ?? match[3] ?? (onScreen(pc) || prior(before, pc));
				if (!subject) return null;
				const shown = (pc?.windows ?? []).find((entry) => entry.front && Object.values(BROWSERS).includes(entry.app.toLowerCase()));
				browse(`find:${subject} ${match[2]}`, room ?? (shown ? { app: shown.app, kind: "browser", name: shown.app.toLowerCase(), window: shown.id } : null));
			} else if (/^(?:go to|open|click|show me|pull up)\s+(?:on\s+)?(?:the\s+)?(?:page|first (?:result|link|one)|top (?:result|link)|it|that|that one|that page)$/.test(body) && prior(before, pc)) {
				browse(`find:${prior(before, pc)}`, room);
			} else if ((match = /^(?:open up|pull up|go to|open|navigate to|visit|pull up|load|bring up|take me to|get me to|bring me to|head to|show me|switch to|launch|start|run|focus|jump to|go back to|back to)\s+(.+)$/.exec(body))) {
				const what = match[1];
				const fresh = /^(?:a\s+)?new\s+/.test(what);
				const url = fresh ? null : site(what);
				const app = resolve(what, pc, fresh);
				if ((room && app?.kind === "app" && !url) || (/^show me\b/.test(body) && /\bdesktop\b/.test(what))) return null;
				if (app && (app.kind !== "app" || !url || (!room && front?.kind !== "browser"))) bring(app, fresh);
				else if (url) browse(url, room);
				else if (!room && /^(?:open|launch|start|run|switch to|focus)\b/.test(body) && famous(what) && pc?.apps) throw new Missing(what.replace(/^(?:the|my)\s+/, ""));
				else return null;
			} else if ((match = /^(?:press|hit)\s+(.+)$/.exec(body))) {
				const keys = match[1].replace(/page (up|down)/g, "page$1").replace(/\s*(?:plus|\+)\s*|\s+/g, "+").replace(/control/g, "ctrl");
				if (!keys.split("+").every((key) => KEY.test(key))) return null;
				steps.push({ keys });
			} else if ((match = /^(?:in|on|using)\s+(.+)$/.exec(body)) && (where = resolve(match[1], pc))) bring(where);
			else if (room && !body) bring(room);
			else if (site(body) && (went({ steps: last ? [last] : [] }) || (clauses.length === 1 && before && !prior(before, pc) && went(reflex(before, pc))))) {
				if (last && "go" in last) steps.push({ tab: "new" }, { go: site(body) });
				else browse(site(body), room);
			}
			else if ((match = /^(?:find|find me|look for|shop for|search the web for|search online for)\s+(.+)$/.exec(body)) && !LOCAL.test(match[1])) browse(google(match[1]), room);
			else if ((match = /^(?!(?:what|when|who|why|how|is|are|do|does|did|can|could|would|should|will|tell|read|count|check|close|open|stop|cancel|yes|no|ok|okay|thanks|thank|go|make|put|type|press|show)\b)(?:(on|about|by|from|for|with|under|in)\s+)?(.{2,80})$/.exec(body)) && clauses.length === 1 && !typed && prior(before, pc) && !LOCAL.test(body)) browse(google(match[1] || !words(body).some((word) => word.length > 3 && words(prior(before, pc)).includes(word)) ? `${prior(before, pc)} ${body}` : body), room);
			else return null;
		}
	} catch (error) {
		if (error instanceof Missing) return error.name ? { missing: error.name, open: error.open, steps: [] } : null;
		throw error;
	}
	if (typed) steps.push({ type: typed[1].trim() });
	for (let at = 0; at + 1 < steps.length; at++) {
		const [one, two] = [steps[at], steps[at + 1]];
		if ("window" in one && one.window === "full" && "go" in two) [steps[at], steps[at + 1]] = [two, one];
	}
	return steps.length ? { steps } : null;
}

const titled = (name) => name.replace(/\b\w/g, (letter) => letter.toUpperCase());

const page = (title) => title.replace(/\s+[-–—]\s+(?:Google Chrome|Brave|Microsoft​? Edge|Mozilla Firefox|Vivaldi|Thorium|Opera|Zen)$/i, "").replace(/^\(\d+\)\s*/, "").trim();

export function actSaid(steps, result) {
	const parts = [];
	for (const step of steps) {
		if ("focus" in step) parts.push(`brought up ${typeof step.focus === "string" ? titled(step.focus) : (result.front?.app ?? "it")}`);
		else if ("launch" in step) parts.push(`opened ${titled(step.launch)}`);
		else if ("window" in step) parts.push({ close: "closed it", full: "made it full screen", left: "snapped it left", max: "maximised it", min: "minimised it", new: "opened a new window", restore: "restored it", right: "snapped it right" }[step.window]);
		else if ("find" in step) parts.push(`opened ${result.front?.title ? page(result.front.title) : `the top result for "${step.find}"`}`);
		else if ("go" in step && step.go.startsWith(SEARCHES.google)) parts.push(`searched Google for "${decodeURIComponent(step.go.slice(SEARCHES.google.length).replace(/\+/g, " "))}"`);
		else if ("go" in step) parts.push(`opened ${result.front?.title ? page(result.front.title) : step.go}`);
		else if ("tab" in step) parts.push({ close: "closed the tab", new: "opened a new tab", next: "went to the next tab", prev: "went to the previous tab", reopen: "reopened the closed tab" }[step.tab]);
		else if ("keys" in step) parts.push(`pressed ${step.keys}`);
		else if ("type" in step) parts.push(`typed "${step.type.slice(0, 60)}"`);
		else if ("split" in step) parts.push(`put ${step.split.length} windows side by side`);
	}
	const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "done");
	return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

export function installedBrowser(pc) {
	return (pc?.apps ?? []).find((app) => app.toLowerCase() in BROWSERS);
}

export function asks(text) {
	return /\?|\b(?:what|what's|how|which|who|whose|when|where|why|tell me|reply with|let me know|count|check|read|find out|is there|are there|does|do i|did|total|answer|summari[sz]e|compare|list|price|cost)\b/i.test(text);
}

export function fronted(steps, said, pc) {
	const first = steps[0];
	if (!first || "focus" in first || "launch" in first) return steps;
	const named = words(said);
	const row = (pc?.windows ?? []).find((entry) => named.includes(entry.app.toLowerCase()) || Object.entries(BROWSERS).some(([name, exe]) => exe === entry.app.toLowerCase() && named.includes(name)));
	return row && !row.front ? [{ focus: row.id }, ...steps] : steps;
}

export function missingSaid(name, open = false) {
	return open ? `${titled(name)} isn't open, so there was nothing to do.` : `I couldn't find ${titled(name)} on this PC: it isn't installed or open.`;
}
