**English** | [简体中文](README.zh-CN.md)

# File Explorer Depth Controls

An Obsidian plugin that adds a row of depth buttons above the file explorer, so one click collapses the folder tree to a chosen number of levels. Built for vaults where folders nest five levels deep and you only want to see the top two.

## The problem you know too well

Your folders go four or five levels deep. You want a temporary view of just two levels, so you start clicking fold arrows one by one. Ten clicks later the tree is clean — but next time you need something deep, you expand it all back by hand.

I built this plugin because I hit that loop every day. Collapsing should not be manual labor.

## How it solves it

It adds a row of buttons above the file explorer: L1 through L6, plus "All". Click L2 and the whole tree shows two levels. Click L3 to go deeper, or "All" to expand everything.

I did not rebuild the file tree or touch sorting. Obsidian's native explorer is already good — what it lacks is a "collapse by level" action, so the plugin adds exactly that one action. Every fold is a native fold state, identical to folding by hand.

## Features

- **Depth button group** — L1–L6 plus "All" buttons above the file explorer; one click folds the whole tree to that level. When to use: folders nest deep and you want to see only the top levels.
- **Step commands** — "Deeper" and "Shallower" commands; going past the deepest level lands on "All", collapsing from "All" returns to the deepest numbered level. When to use: keyboard-first workflow, no mouse needed.
- **Direct depth commands** — jump straight to any level or "All" from the command palette. When to use: bind a hotkey to the level you use most.
- **Restore on startup** — reapplies your last depth after reopening Obsidian; on desktop it retries a few times until the tree is ready, on mobile it waits for the explorer to render. When to use: you don't want to re-click after every launch.
- **Keep active file visible** — auto-expands the ancestors of the currently open note after collapsing, so it never gets hidden. When to use: you're editing a deep note and don't want it buried.
- **Interface language** — follows Obsidian's language for Chinese or English, or set it manually. When to use: Obsidian's UI language differs from the language you want.

## What it does not do

- Does not take over the file explorer: sorting, search, and file creation stay native.
- Does not modify any note: it only changes folder fold states.
- No tags, colors, or custom filters.
- No network access.

## Installation

**Community plugins**: in Obsidian, go to Settings → Community plugins → Browse, search for `File Explorer Depth Controls`, install and enable.

**Manual install**:
1. Download `main.js`, `manifest.json`, and `styles.css` from [Releases](https://github.com/xxy910/file-explorer-depth-controls/releases).
2. Put them into `.obsidian/plugins/file-explorer-depth-controls/` in your vault.
3. Restart Obsidian and enable the plugin under Community plugins.

## First three steps

1. After enabling, a row of depth buttons appears above the file explorer.
2. Click L2 and watch the tree collapse to two levels.
3. Click "All" to restore the full tree.

## Settings

- **Language** — default `auto`, follows Obsidian. Change to 中文 or English if the interface language is wrong.
- **Restore on startup** — default on. Turn off to start from the default depth every launch.
- **Current depth** — default L3. This is the current state; changing it here works like clicking a button.
- **Max depth** — default L4, options L2–L6. Controls how many buttons you get: at 4, you see L1–L4 plus "All".
- **Show "All" button** — default on. Turn off to keep only numbered levels.
- **Keep active file visible** — default on. Don't turn it off if you often edit deep notes.
- **Show toolbar** — default on. Turn it off if you only use commands.
- **Show notices** — default off. When on, switching levels pops a notice.

## FAQ

- **Does it touch my notes or files?** No. It only changes folder fold states; note content is never modified.
- **Does it use the network?** Never. There are no network requests at all.
- **What happens on a new device?** The depth state lives in each device's vault config and doesn't sync. Click once on the new device, or rely on the startup default.
- **Why only up to L6?** Obsidian stores fold states per level, and 6 covers most vaults. For deeper cases use "All".
- **Does it work on mobile?** Yes. Mobile renders the explorer at a different time, and the plugin handles that explicitly.

## Compatibility & privacy

- Requires Obsidian 1.8.7 or later.
- Works on desktop and mobile.
- No network requests, no data collection.

## Development

Requires Node.js 22.13+.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Tests run on Node's built-in test runner against `tests/`. After touching explorer logic, click through every depth button in a real Obsidian vault as visual acceptance.

## License

[MIT](LICENSE)
