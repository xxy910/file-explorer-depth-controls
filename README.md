# File Explorer Depth Controls

Show folders up to a selected depth or expand all folders in the native file explorer. Supports Obsidian 1.8.7 or later on desktop, iOS, and Android. The controls follow the app language by default, with a setting to use English or Simplified Chinese.

## Use the controls

- Select **L1** to collapse all top-level folders to the vault root. Select a deeper level to show more of the folder tree. Select **All** to expand every folder.
- When **Keep the active file visible** is on, the current file’s parent folders stay expanded when you apply a depth.
- Use the command palette or assign hotkeys. Direct commands cover L1–L6. A command above the configured maximum also raises the toolbar limit. At the deepest configured level, stepping deeper selects **All**. Stepping shallower from **All** returns to the maximum numbered level. Stepping past **L1** or deeper than **All** keeps the current selection.
- The settings tab lets you choose the current depth, set the toolbar limit between L2 and L6, restore your last depth at startup, hide the toolbar or **All** button, and enable success notices. Commands work even when the toolbar is hidden.
- On mobile, open the left sidebar and select **Files**. The toolbar wraps on narrow screens and uses larger tap targets. If startup restore is still pending when the file explorer appears, the plugin attempts to apply your saved depth then. A manual depth command or a settings change cancels pending startup restore.

The plugin uses internal file explorer interfaces to change and save native folder folds, and stores its own preferences through the plugin settings API. It makes no network requests and does not edit vault notes.

## Install manually

Download `main.js`, `manifest.json`, and `styles.css` from the same release. Place them in `.obsidian/plugins/file-explorer-depth-controls` in your vault, then enable **File Explorer Depth Controls** under **Community plugins**.

## Develop

Use Node.js 22.13 or later. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`. The production bundle is `main.js` at the repository root.

## 简体中文说明

在桌面端、iOS 和 Android 的原生文件目录顶部添加层级按钮，适用于 Obsidian 1.8.7 或更高版本。**L1** 折叠顶层文件夹，只显示库根目录的内容。更深的层级会展开更多文件夹。**全部** 展开所有文件夹。默认保留当前文件的各级父文件夹，方便在收展后继续定位当前文件。

可通过命令面板直达 **L1–L6**、展开全部或逐层收展，也可以为这些命令绑定快捷键。直达高于工具栏上限的层级时，上限会随之提高。从最大数字层级继续加深会进入 **全部**，从 **全部** 浅收会回到最大数字层级。

设置页可调整语言、当前层级、工具栏上限、启动恢复、按钮显示、当前文件路径保留和成功提示。关闭工具栏后，命令和快捷键仍可用。插件不发送网络请求，也不修改笔记内容。

移动端从左侧抽屉打开文件目录。按钮的触控区域更大，窄屏下会折行。如果启动时文件抽屉尚未就绪，待目录挂载或进入可见区域后会继续尝试恢复。手动切换层级或修改设置会取消待执行的启动恢复。

手动安装时，把同一版本的 `main.js`、`manifest.json` 和 `styles.css` 放在库内的 `.obsidian/plugins/file-explorer-depth-controls` 文件夹，再在第三方插件设置中启用。
