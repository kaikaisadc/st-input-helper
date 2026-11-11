# 输入助手修复报告

## 基线

- 上游仓库：<https://github.com/Mooooooon/st-input-helper>
- 上游分支：`master`
- 上游 commit：`4a859773ebb3f7e8eceb48d45a9d56ec4a71027b`（2025-04-19，作者 Mooooooon）
- 任务 fork：<https://github.com/kaikaisadc/st-input-helper>（GitHub 已确认为真正的 fork，parent 为 `Mooooooon/st-input-helper`）
- 本地 `origin`：`https://github.com/kaikaisadc/st-input-helper.git`
- 本地 `upstream`：`https://github.com/Mooooooon/st-input-helper.git`
- 上游作者与全部历史提交保留；当前修复提交只在本地，尚未 push。
- 未启动、未修改用户已安装的 SillyTavern；仅操作本任务目录与目标 fork。

## 官方 SillyTavern 选择器核实

参考官方 `SillyTavern/SillyTavern` 的 `release` 分支 commit
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`（只读获取到任务目录 `reference/`，未启动酒馆）：

- 底部输入框：`public/index.html` 中 `#send_form` 内为 `textarea#send_textarea`。
- 消息编辑器：`public/script.js` 的 `messageEdit()` 动态创建：

```js
editTextArea.id = 'curEditTextarea';
editTextArea.className = 'edit_textarea mdHotkeys';
messageText.append(editTextArea);
```

即 `#chat .mes .mes_text > textarea#curEditTextarea.edit_textarea`。

- 生命周期：`messageEditDone()`、`messageEditCancel()` 会清空 `.mes_text` 并重新渲染消息；
  `deleteMessage()` 会移除 `.mes`。编辑器元素因此会从 DOM 移除。
- `#prompt_textarea` 是旧版底部输入框兼容选择器；当前 release 中不再存在，仍保留在
  `#send_form` 安全限定内。
- 旧版 `getMessageInput()` 只返回 `#send_textarea, #prompt_textarea` 的 first，且所有
  插入函数重复 `val()` + `setTimeout` focus，没有消息编辑框目标，这是本次问题的根因。

## 变更明细

### 1. 新模块 `input-helper-core.js`

- 严格目标选择：
  - `#send_form #send_textarea` / `#send_form #prompt_textarea`
  - `#chat .mes .mes_text > textarea#curEditTextarea.edit_textarea`
- 校验 `isConnected`、`disabled`、`readOnly`、`hidden`、`[inert]`、计算样式、
  `getClientRects()`，只读/禁用/隐藏/离线的框不会被写入。
- `createTargetTracker(document)`：
  - 监听 `focusin` / `focusout` / `keyup` / `mouseup` / `touchend` / `select` / `input` /
    `compositionend`，记住最近操作的合法聊天框和选区；
  - 按钮导致失焦后仍使用该记忆；
  - 每次插入前重新校验；编辑器保存/取消/删除后记忆自动失效；
  - 没有合法目标时返回 `null`，安全退出。
- 统一插入：
  - `insertByKey()` 覆盖成对符号、换行、用户/角色标签、自定义符号；
  - 同步 `value` + `setSelectionRange` + 冒泡 `input` 事件，不再 `setTimeout` 重新解析；
  - 保留原“选区替换”语义，不改成包裹选区；
  - 保存并恢复 textarea 的 `scrollTop`/`scrollLeft`，保护长消息滚动位置。
- 工具栏绑定：
  - 单个委托 `click` 作为唯一插入入口；
  - `mousedown` 阻止焦点丢失；触摸端不阻止默认行为以保留横向滚动；
  - pointer 拖动超过 10px 时抑制后续 click；
  - 动态增删自定义按钮无需重新绑定，桌面/移动端不再按 UA 分支。
- 快捷键：
  - 只使用 `resolveActiveTarget()`，焦点必须在合法聊天框；
  - `isComposing` / `keyCode 229` / `key === "Process"` 时跳过；
  - 与工具栏共用 `performInsertion()` 路径。
- 自定义按钮元素通过 `textContent` / `title` / `data-*` 创建，不拼接 HTML。

### 2. `index.js` 重构

- 删除 `getMessageInput()`、9 个重复插入函数、`setTimeout` focus、UA 分支、
  `touchstart`/`click` 双路径和 `rebindMobileEventListeners()`。
- 所有按钮/快捷键统一走 `performInsertion(key, snapshot)`。
- 快捷键设置改为一次委托绑定，避免自定义符号增删时重复绑定。
- 自定义符号按钮/设置行/编辑对话框的名称、显示、符号全部使用 text/val/attr 写入；
  自定义符号仍按字面量插入。
- 删除自定义符号时同步重排 `custom_*` 的按钮显示、快捷键和排序索引，并清理遗留
  自定义按钮，避免动态增删后索引错位。
- 移除重复的 `#enable_input_helper` 监听。
- 保留 `extensionName = "st-input-helper"`、设置结构、UI 与存储格式。

### 3. 工具栏、样式、manifest、README

- `toolbar.html`：按钮增加 `type="button"` 和 `data-insert-action`，保留原 ID、标题、
  字面显示符号。
- `style.css`：`#input_helper_toolbar` 单行横向滚动，按钮不收缩；不改变原主题布局。
- `manifest.json`：`version` 1.3.1 → 1.4.0，`homePage` 改为 fork URL，作者保留
  `AI助手和Mooooooon`，`extensionName`/目录名仍为 `st-input-helper`。
- `README.md`：中文说明 fork 安装 URL、修复行为、继承上游设置、不得同装原版和 fork、
  切换前备份、选区替换语义、不自动保存/提交、测试命令与测试局限。
- 没有新增或伪造 `LICENSE` 文件。

## 自动化测试

测试文件：

- `tests/fixture.html`：SillyTavern 宿主 stub，模拟 `#send_form`、`#chat .mes`、
  动态 `#curEditTextarea` 及保存/取消/删除生命周期；不启动 SillyTavern。
- `tests/test_input_helper.py`：Python Playwright + 已有 Chromium，通过 HTTP 加载
  **真实** `input-helper-core.js`，不是复制实现。

运行命令与结果：

```bash
cd /root/termux/st-input-helper-fix-20261111/st-input-helper
python3 tests/test_input_helper.py
# Ran 25 tests in 6.641s
# OK
```

覆盖点：

- 主输入栏插入、成对符号、换行、`{{User}}`、`{{Char}}`、全部内置按钮；
- 动态消息编辑框、编辑框内快捷键；
- 按钮失焦后点击仍写编辑框、桌面鼠标按钮保持焦点；
- 移动端真实 `touchscreen.tap` 只插入一次；
- 快捷键仅在合法框生效、设置 textarea 聚焦时不触发；
- 中文 IME composition 不触发、composition 结束后可正常触发；
- 自定义符号、literal 符号、自定义光标位置、动态添加按钮；
- 自定义名称/显示文本含 HTML 时不生成元素、不执行脚本；
- 编辑器保存/取消/移除后不修改旧 DOM，回退主输入栏；
- 编辑框与主输入框来回切换；
- 选区替换语义、长文本滚动位置、冒泡 `input` 事件；
- 无合法目标安全退出；隐藏/只读/禁用主输入框不作为目标；
- 设置/世界书 textarea 不被劫持；先操作聊天再聚焦设置时仍写最近聊天目标；
- 工具栏横向滚动后仍可点击插入。

其他校验命令与结果：

```bash
node --check index.js                     # OK
node --check input-helper-core.js         # OK
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"  # manifest OK
git diff --check                          # OK（无空白错误）
```

## 测试局限

- 这是宿主 stub 级回归测试，**不是 SillyTavern 端到端测试**；完整聊天渲染、真实主题
  和 ST 内部的自动保存/事件处理未在真实酒馆中运行。
- Chromium 已覆盖；iOS Safari/Android WebView 的真实键盘焦点行为仍需人工冒烟。
- 移动端测试用 Playwright 触摸事件模拟，不代表所有输入法/软键盘实现。
- 未对真实用户已安装酒馆做任何启动或修改；发布前建议在副本环境人工验证。

## 剩余优化建议（未扩大本次范围）

1. 发布后在一份可回滚的 SillyTavern 副本中做桌面 + 手机人工冒烟，重点验证软键盘
   保持、编辑长消息、保存/取消后再次点击。
2. `loadSettings()` 目前浅拷贝 `defaultSettings` 的嵌套对象；这是上游遗留，多个
   默认设置对象可能共享引用，建议后续改为深拷贝/逐字段默认值。
3. 旧版 `#prompt_textarea` 兼容可以保留一个发布周期；未来确认无旧版用户后可删除。
4. 自定义符号对话框可增加重名、空显示、光标位置越界的前端提示（当前已有基本校验）。
5. 上游 README 标注 MIT 但仓库没有 `LICENSE` 文件；本 fork 按要求未伪造许可证，
   若上游后续补充 LICENSE，可同步引入。

## 提交与发布状态

- 本地分支：`main`（由 `master` 重命名，历史与作者保留）
- 基线：`4a859773ebb3f7e8eceb48d45a9d56ec4a71027b`
- 按用户最新要求直接提交并推送到 `origin/main`；不等待验收、不额外扩大测试。
- 发布地址：<https://github.com/kaikaisadc/st-input-helper/tree/main>

## 用户要求直接发布

用户随后要求停止后续测试、直接提交并推送，由用户进行实机测试。已停止 dsh 后续工作，不再扩大测试；以上测试记录为此前执行者报告的结果，Codex 未追加复跑或完成完整入口集成验证。本节取代上面的等待验收状态，本次作为待实机验证的 1.4.0 发布。

