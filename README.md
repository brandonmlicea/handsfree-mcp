# Handsfree

Give Claude Code access to your computer via MCP.

Handsfree is a local MCP server that lets Claude Code (or any MCP client) use your own PC: your windows, apps, keyboard and mouse, and your own browser with the sign-ins you already have. Nothing leaves your machine, there is no account, and it has zero dependencies.

## Install

One command:

```sh
claude mcp add handsfree -- npx -y github:brandonmlicea/handsfree-mcp
```

Any other MCP client (Claude Desktop, Cursor, Codex...):

```json
{
  "mcpServers": {
    "handsfree": { "command": "npx", "args": ["-y", "github:brandonmlicea/handsfree-mcp"] }
  }
}
```

Needs Node.js 22.4 or newer. The desktop tools need Windows 10 or 11; the browser tools work on Windows, macOS and Linux.

### Your own browser

To let Claude work in your real browser, with your logins:

1. Open `chrome://inspect/#remote-debugging` (`edge://inspect/#remote-debugging` in Edge, `brave://inspect/#remote-debugging` in Brave).
2. Turn on **Allow remote debugging for this browser instance**.
3. The first time Claude connects, the browser asks to allow it: click **Allow**.

Handsfree finds the browser by itself. To use a browser started with `--remote-debugging-port=9222` instead, set `HANDSFREE_CDP=9222`.

## Tools

| Tool | What it does |
| --- | --- |
| `pc` | Open windows with ids, the one in front first; `deep` adds installed apps, browser profiles and the home folder |
| `do` | A plain-words request run as native steps, in about a second: "open YouTube in Chrome full screen", "snap Spotify to the right", "new tab in Brave and go to github.com", "press ctrl+shift+t" |
| `act` | Several native steps in one call: `focus`, `launch`, `window` (full, max, min, restore, close, left, right, new), `go`, `find`, `tab`, `keys`, `type`, `wait`, `split` |
| `elements` | A window's buttons, fields and text from its accessibility tree, numbered |
| `click` | The real mouse, on an element number or on a point in the last screenshot; `scroll` too |
| `screenshot` | The screen or one window |
| `tabs` | Your browser's tabs, marking the one on screen |
| `open` | A page in a background window of your browser, so your own tab stays where it is |
| `read` | A tab's elements by ref, and its text |
| `browse` | Many actions in a tab in one call: `click`, `fill` (text, dropdowns, checkboxes), `type`, `press`, `scroll`, `go`, `wait` |
| `page_screenshot`, `page_eval` | A picture of a tab; JavaScript in a tab |

## How it stays out of your way

- Keys and typing go only to the window the step is working in. If another window comes to the front, it stops instead of typing into it.
- Real keyboard and mouse steps wait until you have paused for about a second.
- Browser work happens in the background through the browser's debugging connection, so it never needs your keyboard or your screen, and new pages open in a window of their own.
- `do` understands what is open and installed: "the browser" is the one you have open, a misheard name ("crome") is the closest app, and it tells you when an app is not installed.

## Try it

Ask Claude Code things like:

- "Put Chrome and VS Code side by side."
- "Open my Gmail and tell me the subject of the newest email."
- "Fill in the signup form on this page with my details."
- "What does the error dialog in front say?"

## License

MIT
