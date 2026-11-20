// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";

//You'll likely need to import some other functions from the main script
import { saveSettingsDebounced } from "../../../../script.js";
import {
    attachShortcutHandler,
    attachToolbarHandlers,
    createCustomSymbolButtonElement,
    createTargetTracker,
    insertByKey,
} from "./input-helper-core.js";

// 设置插件名称和路径
const extensionName = "st-input-helper";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    buttons: {
        asterisk: true,
        quotes: true,
        parentheses: true,
        bookQuotes1: true,
        bookQuotes2: true,
        bookQuotes3: true, // 新增《》按钮设置
        newline: true,
        user: true,
        char: true
    },
    shortcuts: {
        asterisk: "",
        quotes: "",
        parentheses: "",
        bookQuotes1: "",
        bookQuotes2: "",
        bookQuotes3: "",
        newline: "",
        user: "",
        char: ""
    },
    // 添加默认的按钮顺序
    buttonOrder: [
        'asterisk',
        'quotes',
        'parentheses',
        'bookQuotes1',
        'bookQuotes2',
        'bookQuotes3',
        'newline',
        'user',
        'char'
    ],
    // 添加自定义符号设置
    customSymbols: []
};

// 最近一次操作的合法聊天输入框/消息编辑框及其选区。
// 按钮导致焦点丢失时仍能写入正确目标；编辑器被保存、取消或删除后会自动失效。
const targetTracker = createTargetTracker(document);

/**
 * 工具栏和快捷键的统一插入入口。
 * @param {string} key 内置动作键或 custom_N
 * @param {object|null} [snapshot] 快捷键触发时的实时目标快照
 */
function performInsertion(key, snapshot = targetTracker.resolve()) {
    if (!extension_settings[extensionName]?.enabled) return false;
    if (!snapshot) return false;
    return insertByKey(
        snapshot,
        key,
        extension_settings[extensionName].customSymbols || [],
    );
}


// 加载插件设置
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // 兼容旧版本设置
    if (!extension_settings[extensionName].buttons) {
        extension_settings[extensionName].buttons = defaultSettings.buttons;
    }

    // 兼容旧版本设置 - 快捷键
    if (!extension_settings[extensionName].shortcuts) {
        extension_settings[extensionName].shortcuts = defaultSettings.shortcuts;
    }

    // 兼容旧版本设置 - 按钮顺序
    if (!extension_settings[extensionName].buttonOrder) {
        extension_settings[extensionName].buttonOrder = defaultSettings.buttonOrder;
    }

    // 兼容旧版本设置 - 自定义符号
    if (!extension_settings[extensionName].customSymbols) {
        extension_settings[extensionName].customSymbols = [];
    }

    // 更新UI中的设置
    $("#enable_input_helper").prop("checked", extension_settings[extensionName].enabled);

    // 更新按钮显示设置
    const buttons = extension_settings[extensionName].buttons;
    $("#enable_asterisk_btn").prop("checked", buttons.asterisk !== false);
    $("#enable_quotes_btn").prop("checked", buttons.quotes !== false);
    $("#enable_parentheses_btn").prop("checked", buttons.parentheses !== false);
    $("#enable_book_quotes1_btn").prop("checked", buttons.bookQuotes1 !== false);
    $("#enable_book_quotes2_btn").prop("checked", buttons.bookQuotes2 !== false);
    $("#enable_book_quotes3_btn").prop("checked", buttons.bookQuotes3 !== false); // 新增书名号按钮设置
    $("#enable_newline_btn").prop("checked", buttons.newline !== false);
    $("#enable_user_btn").prop("checked", buttons.user !== false);
    $("#enable_char_btn").prop("checked", buttons.char !== false);

    // 更新快捷键设置
    const shortcuts = extension_settings[extensionName].shortcuts;
    for (const key in shortcuts) {
        $(`#shortcut_${key}`).val(shortcuts[key] || "");
    }

    // 更新按钮顺序
    updateButtonsOrder();

    updateButtonVisibility();

    // 加载自定义符号按钮
    loadCustomSymbolButtons();
}

// 更新设置面板中的按钮顺序
function updateButtonsOrder() {
    const buttonOrder = extension_settings[extensionName].buttonOrder;
    if (!buttonOrder || buttonOrder.length === 0) return;

    // 根据保存的顺序重新排列设置面板中的按钮
    const container = $("#integrated_button_settings");

    buttonOrder.forEach(key => {
        const buttonRow = $(`.integrated-button-row[data-button-key="${key}"]`);
        if (buttonRow.length) {
            container.append(buttonRow);
        }
    });
}

// 初始化按钮排序
function initSortable() {
    try {
        if ($("#integrated_button_settings").sortable) {
            $("#integrated_button_settings").sortable({
                handle: ".drag-handle",
                axis: "y",
                delay: 150,
                stop: function() {
                    // 获取新的排序
                    const newOrder = [];
                    $("#integrated_button_settings .integrated-button-row").each(function() {
                        const buttonKey = $(this).attr("data-button-key");
                        newOrder.push(buttonKey);
                    });

                    // 保存新排序到设置
                    extension_settings[extensionName].buttonOrder = newOrder;
                    saveSettingsDebounced();

                    // 更新工具栏按钮顺序
                    updateToolbarButtonOrder();
                }
            });
        } else {
            console.warn("jQuery UI Sortable 不可用，无法启用拖拽排序功能");
        }
    } catch (error) {
        console.error("初始化按钮排序功能失败:", error);
    }
}

// 更新工具栏按钮顺序
function updateToolbarButtonOrder() {
    const buttonOrder = extension_settings[extensionName].buttonOrder || [];
    if (buttonOrder.length === 0) return;

    const toolbar = $("#input_helper_toolbar");
    if (toolbar.length === 0) return;

    // 按照保存的顺序重新排列工具栏按钮
    buttonOrder.forEach(key => {
        // 防止空按钮ID
        const buttonId = getButtonIdFromKey(key);
        if (!buttonId) return;

        const button = $(`#${buttonId}`);
        if (button.length && extension_settings[extensionName].buttons[key] !== false) {
            toolbar.append(button);
        }
    });
}

// 从按钮键名获取按钮ID
function getButtonIdFromKey(key) {
    // 检查是否是自定义按钮
    if (key.startsWith('custom_')) {
        // 直接返回自定义按钮的ID
        const index = key.replace('custom_', '');
        return `input_custom_${index}_btn`;
    }

    // 预定义按钮的映射
    const keyToId = {
        'asterisk': 'input_asterisk_btn',
        'quotes': 'input_quotes_btn',
        'parentheses': 'input_parentheses_btn',
        'bookQuotes1': 'input_book_quotes1_btn',
        'bookQuotes2': 'input_book_quotes2_btn',
        'bookQuotes3': 'input_book_quotes3_btn',
        'newline': 'input_newline_btn',
        'user': 'input_user_btn',
        'char': 'input_char_btn'
    };

    return keyToId[key] || '';
}

// 更新按钮可见性
function updateButtonVisibility() {
    const buttons = extension_settings[extensionName].buttons;

    // 根据设置显示/隐藏按钮
    $("#input_asterisk_btn").toggle(buttons.asterisk !== false);
    $("#input_quotes_btn").toggle(buttons.quotes !== false);
    $("#input_parentheses_btn").toggle(buttons.parentheses !== false);
    $("#input_book_quotes1_btn").toggle(buttons.bookQuotes1 !== false);
    $("#input_book_quotes2_btn").toggle(buttons.bookQuotes2 !== false);
    $("#input_book_quotes3_btn").toggle(buttons.bookQuotes3 !== false); // 新增书名号按钮
    $("#input_newline_btn").toggle(buttons.newline !== false);
    $("#input_user_btn").toggle(buttons.user !== false);
    $("#input_char_btn").toggle(buttons.char !== false);

    // 更新自定义按钮的显示/隐藏
    const customSymbols = extension_settings[extensionName].customSymbols || [];
    customSymbols.forEach((symbol, index) => {
        const buttonKey = `custom_${index}`;
        $(`#input_custom_${index}_btn`).toggle(buttons[buttonKey] !== false);
    });

    // 检查所有按钮是否都被隐藏，如果是则隐藏整个工具栏
    const allHidden = Object.values(buttons).every(v => v === false);
    if (allHidden) {
        $("#input_helper_toolbar").hide();
    } else if (extension_settings[extensionName].enabled) {
        $("#input_helper_toolbar").show();

        // 更新按钮顺序
        updateToolbarButtonOrder();
    }
}

// 开关设置变更响应
function onEnableInputChange() {
    const value = $("#enable_input_helper").prop("checked");
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();

    // 根据复选框状态显示或隐藏工具栏
    if (value) {
        updateButtonVisibility();
    } else {
        $("#input_helper_toolbar").hide();
    }
}

// 按钮显示设置变更响应
function onButtonVisibilityChange(buttonKey) {
    return function() {
        const checked = $(this).prop("checked");
        extension_settings[extensionName].buttons[buttonKey] = checked;
        saveSettingsDebounced();
        updateButtonVisibility();
    };
}

// 处理快捷键设置（委托绑定一次，自定义符号动态增删不会重复绑定）
function setupShortcutInputs() {
    // 处理快捷键输入
    $(document).on("keydown", ".shortcut-input", function(e) {
        e.preventDefault();

        // 获取按键组合
        let keys = [];
        if (e.ctrlKey) keys.push("Ctrl");
        if (e.altKey) keys.push("Alt");
        if (e.shiftKey) keys.push("Shift");

        // 添加主键（如果不是修饰键）
        if (
            e.key !== "Control" &&
            e.key !== "Alt" &&
            e.key !== "Shift" &&
            e.key !== "Meta" &&
            e.key !== "Escape"
        ) {
            const keyName = e.key && typeof e.key === 'string' && e.key.length === 1
                ? e.key.toUpperCase()
                : (e.key || "Unknown");
            keys.push(keyName);
        }

        // 如果只按了Escape键，清除快捷键
        if (e.key === "Escape") {
            $(this).val("");
            const shortcutKey = $(this).attr("id").replace("shortcut_", "");
            extension_settings[extensionName].shortcuts[shortcutKey] = "";
            saveSettingsDebounced();
            return;
        }

        // 如果没有按键组合或只有修饰键，不设置
        if (keys.length === 0 || (keys.length === 1 && ["Ctrl", "Alt", "Shift"].includes(keys[0]))) {
            return;
        }

        // 设置快捷键
        const shortcutString = keys.join("+");
        $(this).val(shortcutString);

        // 保存到设置
        const shortcutKey = $(this).attr("id").replace("shortcut_", "");
        extension_settings[extensionName].shortcuts[shortcutKey] = shortcutString;
        saveSettingsDebounced();
    });

    // 处理清除按钮
    $(document).on("click", ".shortcut-clear-btn", function() {
        const targetId = $(this).data("target");
        $(`#${targetId}`).val("");

        // 保存到设置
        const shortcutKey = targetId.replace("shortcut_", "");
        extension_settings[extensionName].shortcuts[shortcutKey] = "";
        saveSettingsDebounced();
    });
}

// 注册全局快捷键：只在合法聊天框聚焦且非输入法组合状态时触发
function setupGlobalShortcuts() {
    attachShortcutHandler(document, {
        isEnabled: () => extension_settings[extensionName]?.enabled === true,
        getShortcuts: () => extension_settings[extensionName]?.shortcuts || {},
        resolveActiveTarget: () => targetTracker.resolveActive(),
        onActivate: (key, snapshot) => performInsertion(key, snapshot),
    });
}


// 加载自定义符号按钮
function loadCustomSymbolButtons() {
    const customSymbols = extension_settings[extensionName].customSymbols || [];

    // 清除现有的自定义按钮（包括删除导致索引变化后遗留的旧按钮）
    $("#input_helper_toolbar button[id^='input_custom_']").remove();
    $(".integrated-button-row[data-custom='true']").remove();

    // 为每个自定义符号创建按钮和设置项
    customSymbols.forEach((symbol, index) => {
        const buttonKey = `custom_${index}`;

        // 为工具栏创建按钮
        createCustomSymbolButton(symbol, index);

        // 为设置面板创建行
        createCustomSymbolSetting(symbol, index);

        // 更新按钮顺序
        if (!extension_settings[extensionName].buttonOrder.includes(buttonKey)) {
            extension_settings[extensionName].buttonOrder.push(buttonKey);
        }

        // 确保该按钮有显示设置
        if (extension_settings[extensionName].buttons[buttonKey] === undefined) {
            extension_settings[extensionName].buttons[buttonKey] = true;
        }

        // 确保该按钮有快捷键设置
        if (extension_settings[extensionName].shortcuts[buttonKey] === undefined) {
            extension_settings[extensionName].shortcuts[buttonKey] = "";
        }
    });

    // 更新按钮顺序。工具栏事件是委托绑定，新增按钮无需再次绑定。
    updateButtonsOrder();
    updateToolbarButtonOrder();
}

// 创建自定义符号按钮（名称/显示文本通过 DOM 属性写入，避免 HTML 注入）
function createCustomSymbolButton(symbol, index) {
    const buttonId = `input_custom_${index}_btn`;

    // 先检查是否已存在，如果存在则移除
    $(`#${buttonId}`).remove();

    const button = createCustomSymbolButtonElement(symbol, index);
    $("#input_helper_toolbar").append(button);
}


// 创建自定义符号设置项（全部使用 text/val/attr，避免名称或符号破坏 HTML）
function createCustomSymbolSetting(symbol, index) {
    const buttonKey = `custom_${index}`;

    // 先检查是否已存在，如果存在则移除
    $(`.integrated-button-row[data-button-key="${buttonKey}"]`).remove();

    const row = $("<div>", {
        class: "integrated-button-row",
        "data-button-key": buttonKey,
        "data-custom": "true",
        "data-index": String(index),
    });

    row.append($("<span>", { class: "drag-handle menu-handle" }).html("&#9776;"));

    const checkboxId = `enable_${buttonKey}_btn`;
    row.append(
        $("<input>", { id: checkboxId, type: "checkbox" })
            .prop("checked", extension_settings[extensionName].buttons[buttonKey] !== false),
    );

    row.append(
        $("<div>", { class: "button-preview" })
            .text(String(symbol.display ?? symbol.symbol ?? "")),
    );
    row.append($("<label>", { for: checkboxId }).text(String(symbol.name ?? "")));

    row.append(
        $("<button>", {
            class: "custom-edit-btn",
            type: "button",
            title: "编辑",
            "data-index": String(index),
        }).text("✏️"),
    );
    row.append(
        $("<button>", {
            class: "custom-delete-btn",
            type: "button",
            title: "删除",
            "data-index": String(index),
        }).text("🗑️"),
    );

    row.append(
        $("<input>", {
            id: `shortcut_${buttonKey}`,
            class: "shortcut-input",
            type: "text",
            placeholder: "无快捷键",
            readonly: true,
        }).val(extension_settings[extensionName].shortcuts[buttonKey] || ""),
    );
    row.append(
        $("<button>", {
            class: "shortcut-clear-btn",
            type: "button",
            "data-target": `shortcut_${buttonKey}`,
        }).text("×"),
    );

    // 添加到设置面板
    $("#integrated_button_settings").append(row);

    // 添加事件监听
    row.find(`#${checkboxId}`).on("input", onButtonVisibilityChange(buttonKey));
    row.find(".custom-edit-btn").on("click", function() {
        editCustomSymbol($(this).data("index"));
    });
    row.find(".custom-delete-btn").on("click", function() {
        deleteCustomSymbol($(this).data("index"));
    });
}


// 编辑自定义符号
function editCustomSymbol(index) {
    const symbols = extension_settings[extensionName].customSymbols;
    const symbol = symbols[index];

    // 显示编辑对话框
    showCustomSymbolDialog(symbol, index);
}

// 删除自定义符号
function deleteCustomSymbol(index) {
    if (confirm("确定要删除这个自定义符号吗？")) {
        const settings = extension_settings[extensionName];
        const symbols = settings.customSymbols;
        const oldLength = symbols.length;

        // 从设置中删除
        symbols.splice(index, 1);

        // 后面的自定义键整体前移一位，避免按钮/快捷键/排序索引错位。
        for (let i = index + 1; i < oldLength; i++) {
            const fromKey = `custom_${i}`;
            const toKey = `custom_${i - 1}`;
            for (const store of [settings.buttons, settings.shortcuts]) {
                if (Object.prototype.hasOwnProperty.call(store, fromKey)) {
                    store[toKey] = store[fromKey];
                    delete store[fromKey];
                } else {
                    delete store[toKey];
                }
            }
        }
        delete settings.buttons[`custom_${index}`];
        delete settings.shortcuts[`custom_${index}`];

        // 从按钮顺序中删除并同步后续索引，同时去掉历史遗留的重复项。
        const seenKeys = new Set();
        settings.buttonOrder = settings.buttonOrder
            .map(key => {
                const match = /^custom_(\d+)$/.exec(key);
                if (!match) return key;
                const customIndex = Number(match[1]);
                if (customIndex === index) return null;
                return customIndex > index ? `custom_${customIndex - 1}` : key;
            })
            .filter(key => {
                if (!key || seenKeys.has(key)) return false;
                seenKeys.add(key);
                return true;
            });

        // 从工具栏中删除
        $(`#input_custom_${index}_btn`).remove();

        // 保存设置
        saveSettingsDebounced();

        // 重新加载自定义按钮 - 这会导致索引重排。工具栏使用委托事件，无需重新绑定。
        loadCustomSymbolButtons();

        // 更新工具栏
        updateButtonVisibility();
    }
}



// 显示自定义符号对话框
function showCustomSymbolDialog(existingSymbol = null, editIndex = -1) {
    // 创建对话框 - 修改样式以正确应用主题颜色
    // 动态值在插入 DOM 后通过 .val()/.text() 写入，避免自定义名称/符号破坏 HTML。
    const dialog = $(`
        <div id="custom_symbol_dialog" class="custom-symbol-dialog">
            <div class="custom-symbol-dialog-content">
                <h3></h3>
                <div class="custom-symbol-form">
                    <div class="form-group">
                        <label for="custom_symbol_name">名称：</label>
                        <input type="text" id="custom_symbol_name" placeholder="如：方括号">
                    </div>
                    <div class="form-group">
                        <label for="custom_symbol_symbol">符号：</label>
                        <input type="text" id="custom_symbol_symbol" placeholder="如：[]">
                    </div>
                    <div class="form-group">
                        <label for="custom_symbol_display">显示文本：</label>
                        <input type="text" id="custom_symbol_display" placeholder="如：[]">
                    </div>
                    <div class="form-group">
                        <label for="custom_symbol_cursor">光标位置：</label>
                        <select id="custom_symbol_cursor">
                            <option value="start">开始</option>
                            <option value="middle">中间</option>
                            <option value="end">结尾</option>
                            <option value="custom">自定义</option>
                        </select>
                        <input type="number" id="custom_symbol_cursor_pos" min="0" style="display: none; width: 60px;">
                    </div>
                </div>
                <div class="custom-symbol-buttons">
                    <button id="custom_symbol_cancel" type="button">取消</button>
                    <button id="custom_symbol_save" type="button">保存</button>
                </div>
            </div>
        </div>
    `);

    // 添加到页面
    $("body").append(dialog);

    // 写入编辑值（不是 HTML 拼接）
    const cursorPos = existingSymbol?.cursorPos;
    const isPresetCursor = ['start', 'middle', 'end'].includes(cursorPos);
    const cursorChoice = existingSymbol
        ? (isPresetCursor ? cursorPos : 'custom')
        : 'middle';

    dialog.find("h3").text(existingSymbol ? '编辑符号' : '添加自定义符号');
    $("#custom_symbol_name").val(existingSymbol?.name ?? "");
    $("#custom_symbol_symbol").val(existingSymbol?.symbol ?? "");
    $("#custom_symbol_display").val(existingSymbol?.display ?? "");
    $("#custom_symbol_cursor").val(cursorChoice);
    $("#custom_symbol_cursor_pos").val(
        existingSymbol && !isPresetCursor && cursorPos !== undefined ? String(cursorPos) : "1",
    );
    $("#custom_symbol_cursor_pos").toggle(cursorChoice === "custom");

    // 处理自定义光标位置选择
    $("#custom_symbol_cursor").on("change", function() {
        if ($(this).val() === "custom") {
            $("#custom_symbol_cursor_pos").show();
        } else {
            $("#custom_symbol_cursor_pos").hide();
        }
    });


    // 取消按钮事件
    $("#custom_symbol_cancel").on("click", function() {
        dialog.remove();
    });

    // 保存按钮事件
    $("#custom_symbol_save").on("click", function() {
        const name = $("#custom_symbol_name").val().trim();
        const symbol = $("#custom_symbol_symbol").val();
        const display = $("#custom_symbol_display").val() || symbol;
        let cursorPos = $("#custom_symbol_cursor").val();

        if (cursorPos === "custom") {
            cursorPos = $("#custom_symbol_cursor_pos").val();
        }

        // 验证输入
        if (!name || !symbol) {
            alert("请输入名称和符号！");
            return;
        }

        // 创建符号对象
        const symbolObj = {
            name: name,
            symbol: symbol,
            display: display,
            cursorPos: cursorPos
        };

        // 保存到设置
        if (editIndex >= 0) {
            // 编辑现有符号
            extension_settings[extensionName].customSymbols[editIndex] = symbolObj;
        } else {
            // 添加新符号
            if (!extension_settings[extensionName].customSymbols) {
                extension_settings[extensionName].customSymbols = [];
            }
            extension_settings[extensionName].customSymbols.push(symbolObj);
        }

        // 保存设置
        saveSettingsDebounced();

        // 重新加载自定义按钮
        loadCustomSymbolButtons();

        // 关闭对话框
        dialog.remove();
    });
}

// 初始化插件
jQuery(async () => {
    // 加载HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings2").append(settingsHtml);

    // 加载输入工具栏HTML
    const toolbarHtml = await $.get(`${extensionFolderPath}/toolbar.html`);

    // 将工具栏插入到 #qr--bar 下方，并确保正确的视觉顺序
    const $qrBar = $("#qr--bar");
    if ($qrBar.length == 0) {
        $("#send_form").append(
            '<div class="flex-container flexGap5" id="qr--bar"></div>'
        );
    }
    $("#qr--bar").append(toolbarHtml);

    // 工具栏统一使用委托 click 绑定，桌面/移动端不再按 UA 分支，也不会 touchstart+click 重复插入。
    // 动态增删自定义按钮、横向滚动后都不需要重新绑定。
    attachToolbarHandlers(document.getElementById("input_helper_toolbar"), {
        captureTarget: targetTracker.resolve,
        onActivate: (key, button, event, snapshot) => performInsertion(key, snapshot),
    });

    // 注册设置变更事件监听
    $("#enable_input_helper").on("input", onEnableInputChange);
    $("#enable_asterisk_btn").on("input", onButtonVisibilityChange("asterisk"));
    $("#enable_quotes_btn").on("input", onButtonVisibilityChange("quotes"));
    $("#enable_parentheses_btn").on("input", onButtonVisibilityChange("parentheses"));
    $("#enable_book_quotes1_btn").on("input", onButtonVisibilityChange("bookQuotes1"));
    $("#enable_book_quotes2_btn").on("input", onButtonVisibilityChange("bookQuotes2"));
    $("#enable_book_quotes3_btn").on("input", onButtonVisibilityChange("bookQuotes3"));
    $("#enable_newline_btn").on("input", onButtonVisibilityChange("newline"));
    $("#enable_user_btn").on("input", onButtonVisibilityChange("user"));
    $("#enable_char_btn").on("input", onButtonVisibilityChange("char"));

    // 加载设置
    await loadSettings();

    // 设置快捷键输入框
    setupShortcutInputs();

    // 初始化排序功能
    initSortable();

    // 注册全局快捷键事件（内部只认合法聊天框，且跳过 IME composition）
    setupGlobalShortcuts();

    // 根据初始化设置显示或隐藏工具栏
    if (!extension_settings[extensionName].enabled) {
        $("#input_helper_toolbar").hide();
    }

    // 添加添加自定义符号按钮
    $("#integrated_button_settings").after(`
        <div class="example-extension_block">
            <button id="add_custom_symbol_btn" class="menu_button">添加自定义符号</button>
        </div>
    `);

    // 添加自定义符号按钮事件
    $("#add_custom_symbol_btn").on("click", function() {
        showCustomSymbolDialog();
    });

    // 注册自定义符号对话框键盘事件处理
    $(document).on("keydown", function(e) {
        // 如果对话框正在显示且按下了Escape，关闭对话框
        if ($("#custom_symbol_dialog").length && e.key === "Escape") {
            $("#custom_symbol_dialog").remove();
        }

        // 如果对话框正在显示且按下了Enter，模拟点击保存按钮
        if ($("#custom_symbol_dialog").length && e.key === "Enter" && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            if ($(document.activeElement).is("input") && !$(document.activeElement).is("textarea")) {
                $("#custom_symbol_save").click();
            }
        }
    });

    console.log("输入助手插件已加载");
});
