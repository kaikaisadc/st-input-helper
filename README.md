# SillyTavern 输入助手（kaikaisadc fork）

这是一个用于提高 SillyTavern 文本输入效率的插件。本仓库是
[Mooooooon/st-input-helper](https://github.com/Mooooooon/st-input-helper) 的 fork，
重点修复“编辑聊天消息时点击输入助手，文字仍写入底部输入栏”的问题。

- Fork 仓库：<https://github.com/kaikaisadc/st-input-helper>
- 上游仓库：<https://github.com/Mooooooon/st-input-helper>
- 当前版本：1.4.0

## 这个 fork 修复了什么

- **消息编辑框优先**：正在编辑某条聊天消息时，点击工具栏或按快捷键会把符号插入
  SillyTavern 的 `#curEditTextarea` 消息编辑框，而不是底部输入栏。
- **动态编辑框**：ST 的消息编辑器是点击编辑后动态创建的；插件每次操作都会重新校验
  当前编辑框是否仍连接、可见、可编辑，不依赖固定页面加载时的元素。
- **失焦后仍记得目标和选区**：点击按钮会使输入框暂时失焦，插件会记住最近一次在
  合法聊天输入框/消息编辑框中的选区，按钮 `click` 时同步写入该目标。
- **不会写入已离线/错误消息**：消息保存、取消或删除后，旧编辑框会从 DOM 移除；
  插件校验失败时自动回退到底部输入栏或安全退出，不会继续修改旧 DOM。
- **主输入栏切换**：编辑消息期间如果用户点击底部输入栏，之后操作会写入底部输入栏；
  再回到消息编辑框则写回编辑框。
- **统一插入逻辑**：成对符号、换行、`{{User}}`/`{{Char}}`、自定义符号都走
  `input-helper-core.js` 的同一套插入函数，插入后派发冒泡 `input` 事件。
- **光标与滚动稳定**：同步设置选区，不再用 `setTimeout` 异步重新解析目标；长文本
  插入会保留 textarea 的滚动位置。
- **按钮/快捷键一致**：工具栏使用一次委托 `click` 绑定，快捷键和按钮共用目标解析；
  移动端触摸 tap 只插入一次，不再出现 `touchstart` + `click` 双路径重复插入。
- **输入法保护**：中文等 IME composition 期间不触发快捷键。
- **不劫持其他文本框**：设置、世界书、角色卡等任意 `textarea` 不会被当作目标；
  只读、禁用、隐藏的输入框也会被排除。
- **自定义符号安全渲染**：名称、显示文本、符号使用 `textContent`/`title`/`value`
  写入，不拼接 HTML；符号按字面量插入。

### 选区语义

沿用原插件行为：**有选区时用插入内容替换选中文本，不会自动包裹选区**。例如选中
`cd` 后点击双引号，`abcdef` 会变成 `ab""ef`，而不是 `ab"cd"ef`。如果需要包裹选区，
请自行选中后先插入左符号，或等待后续功能。

### 不会自动保存或提交

插件只修改 textarea 的值并派发 `input` 事件，不会自动保存消息、不会触发发送按钮，
也不会提交聊天。消息编辑仍需按 ST 的确认/保存按钮完成。

## 安装

推荐用 SillyTavern 扩展安装器安装本 fork：

1. 打开 SillyTavern，进入“设置” → “扩展”。
2. 在扩展安装器中输入本 fork 地址：
   `https://github.com/kaikaisadc/st-input-helper`
3. 安装后刷新页面，在扩展设置中找到“输入助手”。

也可以手动把仓库目录放到 `data/default-user/extensions/st-input-helper`（目录名保持
`st-input-helper`），再重启/刷新 SillyTavern。

### 不要同时安装原版和 fork

本 fork 与上游使用相同的扩展名 `st-input-helper`，目录名也保持 `st-input-helper`，
以便继承上游设置。**不要同时安装原版和 fork**，否则两个副本会争用同一个设置键、
重复注入工具栏和事件监听器。

### 切换前备份

切换或升级前建议备份：

- 原扩展目录（通常为 `data/default-user/extensions/st-input-helper`）；
- `data/default-user/settings.json`（其中 `extension_settings["st-input-helper"]`
  保存了按钮显示、快捷键、排序和自定义符号）。

确认新版本工作正常后再删除旧备份。如果安装器把旧目录覆盖，可从备份恢复设置。

### 继承上游设置

本 fork 保留 `extensionName = "st-input-helper"` 和原有设置结构，因此上游已有的
`extension_settings["st-input-helper"]` 设置（按钮显示、快捷键、顺序、自定义符号）
会在首次加载时继续读取；旧版本缺失的字段会自动补默认值。自定义符号的名称、显示
文本和字面符号会原样保留。

## 使用

1. 在扩展设置中勾选“启用输入助手”。
2. 勾选需要显示的按钮，拖动排序图标调整顺序。
3. 为功能设置快捷键：点击对应输入框后按下组合键，例如 `Ctrl+Alt+Q`。
4. 点击“添加自定义符号”填写名称、符号、显示文本和光标位置。
5. 编辑聊天消息时直接点击工具栏按钮，插入目标就是当前消息编辑框。

工具栏在窄屏或自定义按钮较多时可以横向滚动。

## 功能列表

- 插入双星号 `**`：光标置于中间
- 插入双引号 `""`：光标置于中间
- 插入圆括号 `()`：光标置于中间
- 插入直角引号 `「」`、`『』`：光标置于中间
- 插入书名号 `《》`：光标置于中间
- 插入换行 `⏎`：移动到当前行末尾并插入换行符
- 插入用户标记：插入 `{{User}}`
- 插入角色标记：插入 `{{Char}}`
- 自定义符号：用户自行添加的符号和光标位置

## 快捷键

快捷键仅在合法的聊天底部输入框或聊天消息编辑框聚焦时生效；焦点在设置、世界书等
文本框时不会触发。中文输入法 composition 过程中不会触发。快捷键组合沿用原插件
的 `Ctrl`/`Alt`/`Shift` + 主键格式。

## 兼容性

- 目标选择器依据官方 SillyTavern `release` 分支核实：
  - 底部输入框：`#send_form #send_textarea`（兼容旧版 `#prompt_textarea`）
  - 消息编辑框：`#chat .mes .mes_text > textarea#curEditTextarea.edit_textarea`
- 需要 SillyTavern v1.9.0 或更高版本；建议使用较新的官方 release。
- 若未来 ST 改变编辑器 DOM，需同步更新 `input-helper-core.js` 中的选择器和测试。

## 测试

仓库带有基于 Debian 已有 Python Playwright + Chromium 的回归测试。测试加载真实的
`input-helper-core.js` 和宿主 stub fixture，不启动 SillyTavern，因此**不是 ST
端到端测试**：

```bash
cd st-input-helper
python3 tests/test_input_helper.py
```

测试覆盖主输入栏、动态消息编辑框、按钮失焦、真实触摸 tap、快捷键、自定义符号、
编辑保存/取消/删除、双目标切换、选区替换、长文本滚动、`input` 冒泡事件、无目标、
中文 IME、安全的非聊天 textarea 和防重复插入。宿主 stub 只模拟必要的 DOM 与编辑器
生命周期，真实 SillyTavern 的完整聊天流程仍需人工冒烟验证。

## 已知限制 / 后续建议

- 测试在 Chromium 上运行；iOS Safari/Android WebView 的键盘焦点行为可能略有差异，
  发布前建议在目标设备人工点按验证。
- 插件不保存/提交聊天，这是有意设计；自动保存由 SillyTavern 自身设置决定。
- 工具栏横向滚动和自定义按钮动态增删已覆盖，但极旧主题若覆盖 `qr--buttons` 的
  `overflow` 样式，可能需要主题侧配合。

## 支持和贡献

问题、建议和 Pull Request 请提交到 fork 仓库：
<https://github.com/kaikaisadc/st-input-helper>。

上游作者与历史提交均保留；修复细节和测试结果见 [REPORT.md](REPORT.md)。

## 许可证

上游项目 README 标注 MIT License。本 fork 未新增或伪造 `LICENSE` 文件；代码版权与
授权归属上游作者及贡献者，使用前请遵循上游仓库的授权说明。
