/**
 * 输入助手共享核心：目标解析、选区记忆与文本插入。
 *
 * 本模块不依赖 SillyTavern 或 jQuery，方便在宿主 stub 中加载真实代码做回归测试。
 * 目标只允许两类：
 *   1. 聊天底部输入框：#send_form 内的 #send_textarea / 兼容旧版 #prompt_textarea
 *   2. SillyTavern 消息编辑器：#chat .mes .mes_text 内动态创建的
 *      textarea#curEditTextarea.edit_textarea
 * 设置、世界书、角色卡等任意其他 textarea 永远不会被当作目标。
 */

export const CHAT_MAIN_SELECTOR = '#send_form #send_textarea, #send_form #prompt_textarea';
export const MESSAGE_EDITOR_SELECTOR = '#chat .mes .mes_text > textarea#curEditTextarea.edit_textarea';

/**
 * 内置按钮的插入描述。cursorOffset 相对于插入文本的起点，长度 2 的成对符号为 1。
 */
export const PRESET_INSERTIONS = Object.freeze({
    asterisk: Object.freeze({ kind: 'text', text: '**', cursorOffset: 1 }),
    quotes: Object.freeze({ kind: 'text', text: '""', cursorOffset: 1 }),
    parentheses: Object.freeze({ kind: 'text', text: '()', cursorOffset: 1 }),
    bookQuotes1: Object.freeze({ kind: 'text', text: '「」', cursorOffset: 1 }),
    bookQuotes2: Object.freeze({ kind: 'text', text: '『』', cursorOffset: 1 }),
    bookQuotes3: Object.freeze({ kind: 'text', text: '《》', cursorOffset: 1 }),
    newline: Object.freeze({ kind: 'line-break' }),
    user: Object.freeze({ kind: 'text', text: '{{User}}', cursorOffset: 8 }),
    char: Object.freeze({ kind: 'text', text: '{{Char}}', cursorOffset: 8 }),
});

const BUTTON_ID_TO_KEY = Object.freeze({
    input_asterisk_btn: 'asterisk',
    input_quotes_btn: 'quotes',
    input_parentheses_btn: 'parentheses',
    input_book_quotes1_btn: 'bookQuotes1',
    input_book_quotes2_btn: 'bookQuotes2',
    input_book_quotes3_btn: 'bookQuotes3',
    input_newline_btn: 'newline',
    input_user_btn: 'user',
    input_char_btn: 'char',
});

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function getDocument(root) {
    if (root?.nodeType === 9) return root;
    if (root?.ownerDocument) return root.ownerDocument;
    return document;
}

/**
 * 框是否可用：必须连接在文档中，非禁用、非只读、非隐藏，并且实际渲染。
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
export function isUsableTextarea(element) {
    if (!element || element.tagName !== 'TEXTAREA') return false;
    if (!element.isConnected || element.disabled || element.readOnly) return false;
    if (element.hidden) return false;
    if (element.closest('[inert]')) return false;

    const view = element.ownerDocument?.defaultView;
    if (!view) return false;
    const style = view.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (style.opacity === '0') return false;
    if (element.getClientRects().length === 0) return false;
    return true;
}

/** @param {Element|null|undefined} element */
export function isChatMainInput(element) {
    if (!isUsableTextarea(element)) return false;
    return element.matches(CHAT_MAIN_SELECTOR) && Boolean(element.closest('#send_form'));
}

/** @param {Element|null|undefined} element */
export function isMessageEditor(element) {
    if (!isUsableTextarea(element)) return false;
    return element.matches(MESSAGE_EDITOR_SELECTOR) && Boolean(element.closest('#chat .mes'));
}

/** @param {Element|null|undefined} element */
export function isValidChatTarget(element) {
    return isChatMainInput(element) || isMessageEditor(element);
}

/** @param {ParentNode} [root] */
export function findVisibleMessageEditor(root = document) {
    for (const element of root.querySelectorAll('textarea#curEditTextarea.edit_textarea')) {
        if (isMessageEditor(element)) return element;
    }
    return null;
}

/** @param {ParentNode} [root] */
export function findChatMainInput(root = document) {
    for (const element of root.querySelectorAll(CHAT_MAIN_SELECTOR)) {
        if (isChatMainInput(element)) return element;
    }
    return null;
}

/**
 * 记录当前文本控件的值与选区。
 * @param {HTMLTextAreaElement} element
 * @returns {{element: HTMLTextAreaElement, start: number, end: number, direction: string}|null}
 */
export function createTargetSnapshot(element) {
    if (!isValidChatTarget(element)) return null;
    const length = element.value.length;
    const start = clamp(Number(element.selectionStart), 0, length);
    const end = clamp(Number(element.selectionEnd), 0, length);
    const direction = element.selectionDirection || 'none';
    return {
        element,
        start: Math.min(start, end),
        end: Math.max(start, end),
        direction,
    };
}

/**
 * 跟踪最近一个合法聊天输入框及其选区。点击工具栏导致失焦后仍可恢复。
 * 非聊天 textarea 的焦点/输入事件不会改变已记住的目标。
 * @param {Document} [root]
 */
export function createTargetTracker(root = document) {
    const doc = getDocument(root);
    /** @type {{element: HTMLTextAreaElement, start: number, end: number, direction: string}|null} */
    let remembered = null;

    const capture = (event) => {
        const target = event.target;
        if (!isValidChatTarget(target)) return;
        const snapshot = createTargetSnapshot(target);
        if (snapshot) remembered = snapshot;
    };

    const trackedEvents = ['focusin', 'focusout', 'keyup', 'mouseup', 'touchend', 'select', 'input', 'compositionend'];
    for (const eventName of trackedEvents) {
        doc.addEventListener(eventName, capture, true);
    }

    const remember = (element) => {
        const snapshot = createTargetSnapshot(element);
        if (snapshot) remembered = snapshot;
        return snapshot;
    };

    const forget = (element) => {
        if (!element || remembered?.element === element) remembered = null;
    };

    const getRemembered = () => {
        if (!remembered) return null;
        if (!isValidChatTarget(remembered.element)) {
            remembered = null;
            return null;
        }
        const snapshot = createTargetSnapshot(remembered.element);
        remembered = snapshot;
        return snapshot;
    };

    const resolveActive = () => {
        const active = doc.activeElement;
        if (!isValidChatTarget(active)) return null;
        return createTargetSnapshot(active);
    };

    const resolve = () => {
        // 1. 当前焦点在合法框内：永远以当前焦点和实时选区为准。
        const active = resolveActive();
        if (active) return active;

        // 2. 最近一次操作过的合法框（按钮按下后失焦仍可写入）。
        // 只有仍连接、可见、可编辑时才会返回；编辑框被保存/取消/删除后自动失效。
        const last = getRemembered();
        if (last) return last;

        // 3. 兜底：当前可见的聊天消息编辑器。
        const editor = findVisibleMessageEditor(doc);
        if (editor) return createTargetSnapshot(editor);

        // 4. 兜底：聊天底部输入框。
        const main = findChatMainInput(doc);
        if (main) return createTargetSnapshot(main);

        // 没有合法目标时安全退出。
        return null;
    };

    return {
        resolve,
        resolveActive,
        remember,
        forget,
        getRemembered,
        destroy() {
            for (const eventName of trackedEvents) {
                doc.removeEventListener(eventName, capture, true);
            }
            remembered = null;
        },
    };
}

function focusElement(element) {
    const doc = element.ownerDocument;
    if (doc.activeElement === element) return;
    try {
        element.focus({ preventScroll: true });
    } catch {
        element.focus();
    }
}

function setSelection(element, start, end, direction = 'none') {
    try {
        element.setSelectionRange(start, end, direction);
    } catch {
        // textarea 理论上不会抛错；失败时保持浏览器默认选区。
    }
}

function dispatchInputEvent(element, text, inputType) {
    const view = element.ownerDocument?.defaultView;
    let event;
    if (view?.InputEvent) {
        event = new view.InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType,
            data: text,
        });
    } else {
        event = new view.Event('input', { bubbles: true, composed: true });
    }
    element.dispatchEvent(event);
}

/**
 * 在记录的快照位置插入文本，替换快照中的选区（保留原插件“选区替换”语义）。
 * 同步完成：不重新异步解析目标，因此不会在编辑消息时跳回主输入框。
 * @param {{element: HTMLTextAreaElement, start: number, end: number, direction?: string}} snapshot
 * @param {string} text
 * @param {number} [cursorOffset] 相对插入文本起点的光标偏移，默认文本末尾
 * @returns {boolean}
 */
export function insertTextAtTarget(snapshot, text, cursorOffset = text.length) {
    const element = snapshot?.element;
    if (!isValidChatTarget(element) || typeof text !== 'string' || text.length === 0) return false;

    const value = element.value;
    const start = clamp(Number(snapshot.start), 0, value.length);
    const end = clamp(Number(snapshot.end), 0, value.length);
    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const direction = snapshot.direction || 'none';

    const scrollTop = element.scrollTop;
    const scrollLeft = element.scrollLeft;

    focusElement(element);

    element.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    const nextCursor = clamp(selectionStart + Number(cursorOffset), 0, element.value.length);
    setSelection(element, nextCursor, nextCursor, direction);

    // 恢复长文本的滚动位置，避免插入后跳回顶部/末尾。
    element.scrollTop = scrollTop;
    element.scrollLeft = scrollLeft;

    // 使用冒泡 input 事件通知 SillyTavern（jQuery 委托处理器可收到）。
    dispatchInputEvent(element, text, 'insertText');
    return true;
}

/**
 * 移动到当前行末尾并插入换行（沿用原插件语义）。
 * @param {{element: HTMLTextAreaElement, start: number, end: number}} snapshot
 */
export function insertLineBreakAtTarget(snapshot) {
    const element = snapshot?.element;
    if (!isValidChatTarget(element)) return false;
    const value = element.value;
    const cursor = clamp(Number(snapshot.start), 0, value.length);
    let lineEnd = value.indexOf('\n', cursor);
    if (lineEnd === -1) lineEnd = value.length;
    return insertTextAtTarget({ ...snapshot, start: lineEnd, end: lineEnd }, '\n', 1);
}

/**
 * 自定义符号光标位置。保留 start / middle / end / 数字 四种设置。
 * @param {unknown} cursorPos
 * @param {number} length
 */
export function customCursorOffset(cursorPos, length) {
    if (cursorPos === 'start') return 0;
    if (cursorPos === 'middle') return Math.floor(length / 2);
    if (cursorPos === 'end') return length;
    const numeric = Number.parseInt(String(cursorPos), 10);
    return Number.isFinite(numeric) ? clamp(numeric, 0, length) : 0;
}

/** @param {{symbol?: unknown, cursorPos?: unknown}|null|undefined} symbol */
export function customSymbolOperation(symbol) {
    if (!symbol || typeof symbol.symbol !== 'string' || symbol.symbol.length === 0) return null;
    return {
        kind: 'text',
        text: symbol.symbol,
        cursorOffset: customCursorOffset(symbol.cursorPos, symbol.symbol.length),
        symbol,
    };
}

/**
 * 根据设置键取插入描述。custom_N 从当前自定义符号数组读取，避免按钮重排后失效。
 * @param {string} key
 * @param {Array<{symbol?: string, cursorPos?: unknown}>} [customSymbols]
 */
export function getInsertionForKey(key, customSymbols = []) {
    if (typeof key !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(PRESET_INSERTIONS, key)) {
        return PRESET_INSERTIONS[key];
    }
    const match = /^custom_(\d+)$/.exec(key);
    if (!match) return null;
    return customSymbolOperation(customSymbols[Number(match[1])]);
}

/** @param {object} snapshot @param {object} operation */
export function applyInsertion(snapshot, operation) {
    if (!operation) return false;
    if (operation.kind === 'line-break') return insertLineBreakAtTarget(snapshot);
    if (operation.kind === 'text') {
        return insertTextAtTarget(snapshot, operation.text, operation.cursorOffset);
    }
    return false;
}

/**
 * 统一入口：工具栏与快捷键都通过它插入。
 * @param {object} snapshot
 * @param {string} key
 * @param {Array<object>} [customSymbols]
 */
export function insertByKey(snapshot, key, customSymbols = []) {
    return applyInsertion(snapshot, getInsertionForKey(key, customSymbols));
}

/**
 * 从工具栏按钮解析动作键。优先 data-insert-action，兼容旧按钮 id。
 * @param {Element|null|undefined} button
 */
export function getToolbarActionKey(button) {
    if (!button || button.tagName !== 'BUTTON') return null;
    const explicit = button.getAttribute('data-insert-action');
    if (explicit) return explicit;
    if (BUTTON_ID_TO_KEY[button.id]) return BUTTON_ID_TO_KEY[button.id];
    const custom = /^input_custom_(\d+)_btn$/.exec(button.id);
    return custom ? `custom_${custom[1]}` : null;
}

/**
 * 动态创建自定义符号按钮。名称/显示文本全部通过 textContent/title 写入，不拼 HTML。
 * @param {{name?: unknown, display?: unknown, symbol?: unknown}} symbol
 * @param {number} index
 */
export function createCustomSymbolButtonElement(symbol, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `input_custom_${index}_btn`;
    button.className = 'qr--button menu_button interactable';
    button.setAttribute('data-norefocus', 'true');
    button.setAttribute('data-insert-action', `custom_${index}`);
    button.setAttribute('data-index', String(index));
    button.title = String(symbol?.name ?? '');
    button.textContent = String(symbol?.display ?? symbol?.symbol ?? '');
    return button;
}

/**
 * 工具栏只绑定一次委托事件，动态增删自定义按钮无需重新绑定。
 * 只使用 click 作为唯一插入入口，触摸端不会因 touchstart + click 重复插入。
 * mousedown 阻止默认行为以尽量保持输入框焦点；触摸端不阻止默认行为，保留横向滚动。
 * @param {HTMLElement} toolbar
 * @param {{onActivate: (key: string, button: HTMLButtonElement, event: Event) => unknown, onError?: (error: unknown) => void}} options
 */
export function attachToolbarHandlers(toolbar, { onActivate, onError } = {}) {
    if (!toolbar || typeof onActivate !== 'function') return () => {};

    let gesture = null;

    const findButton = (event) => {
        const button = event.target?.closest?.('button');
        return button && toolbar.contains(button) ? button : null;
    };

    const onPointerDown = (event) => {
        const button = findButton(event);
        if (!button) return;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    };

    const onPointerMove = (event) => {
        if (!gesture || event.pointerId !== gesture.id) return;
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) {
            gesture.moved = true;
        }
    };

    const onPointerUp = (event) => {
        if (!gesture || event.pointerId !== gesture.id) return;
        // 保留 gesture 供紧随其后的 click 判断是否为横向拖动；不在这里插入。
        gesture.endedAt = Date.now();
    };

    const onPointerCancel = () => {
        gesture = null;
    };

    const onMouseDown = (event) => {
        // 桌面端按下按钮时不让按钮抢走 textarea 焦点；不影响 click。
        if (event.button !== 0) return;
        if (findButton(event)) event.preventDefault();
    };

    const onClick = (event) => {
        const button = findButton(event);
        if (!button || button.disabled) return;

        const currentGesture = gesture;
        gesture = null;
        const isRecentDrag = currentGesture?.moved
            && (!currentGesture.endedAt || Date.now() - currentGesture.endedAt < 750);
        if (isRecentDrag) {
            // 横向拖动工具栏后不插入。
            event.preventDefault();
            return;
        }

        const key = getToolbarActionKey(button);
        if (!key) return;
        event.preventDefault();
        try {
            onActivate(key, button, event);
        } catch (error) {
            console.error('[输入助手] 插入失败', error);
            onError?.(error);
        }
    };

    toolbar.addEventListener('pointerdown', onPointerDown);
    toolbar.addEventListener('pointermove', onPointerMove);
    toolbar.addEventListener('pointerup', onPointerUp);
    toolbar.addEventListener('pointercancel', onPointerCancel);
    toolbar.addEventListener('mousedown', onMouseDown);
    toolbar.addEventListener('click', onClick);

    return () => {
        toolbar.removeEventListener('pointerdown', onPointerDown);
        toolbar.removeEventListener('pointermove', onPointerMove);
        toolbar.removeEventListener('pointerup', onPointerUp);
        toolbar.removeEventListener('pointercancel', onPointerCancel);
        toolbar.removeEventListener('mousedown', onMouseDown);
        toolbar.removeEventListener('click', onClick);
    };
}

/**
 * 由键盘事件生成与设置一致的组合字符串。
 * 例如 Ctrl+Alt+Q；只有修饰键或单键返回 null。
 * @param {KeyboardEvent} event
 */
export function getShortcutCombination(event) {
    const keys = [];
    if (event.ctrlKey) keys.push('Ctrl');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');

    const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
    if (!modifierKeys.includes(event.key)) {
        const keyName = typeof event.key === 'string' && event.key.length === 1
            ? event.key.toUpperCase()
            : (event.key || 'Unknown');
        keys.push(keyName);
    }

    if (keys.length <= 1 || keys.every(key => ['Ctrl', 'Alt', 'Shift'].includes(key))) {
        return null;
    }
    return keys.join('+');
}

/**
 * 快捷键只在合法聊天框聚焦时触发；输入法 composition 中不触发。
 * @param {Document} doc
 * @param {{
 *   isEnabled: () => boolean,
 *   getShortcuts: () => Record<string, string>,
 *   resolveActiveTarget: () => object|null,
 *   onActivate: (key: string, snapshot: object, event: KeyboardEvent) => unknown,
 * }} options
 */
export function attachShortcutHandler(doc, { isEnabled, getShortcuts, resolveActiveTarget, onActivate }) {
    if (!doc || typeof onActivate !== 'function') return () => {};

    const onKeyDown = (event) => {
        if (event.defaultPrevented) return;
        if (event.isComposing || event.keyCode === 229 || event.key === 'Process') return;
        if (typeof isEnabled === 'function' && !isEnabled()) return;

        // 必须先确认焦点位于合法的聊天底部输入框或消息编辑框。
        const snapshot = resolveActiveTarget?.();
        if (!snapshot) return;

        const combination = getShortcutCombination(event);
        if (!combination) return;

        const shortcuts = getShortcuts?.() || {};
        const key = Object.keys(shortcuts).find(candidate => shortcuts[candidate] === combination);
        if (!key) return;

        event.preventDefault();
        try {
            onActivate(key, snapshot, event);
        } catch (error) {
            console.error('[输入助手] 快捷键插入失败', error);
        }
    };

    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
}
