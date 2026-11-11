#!/usr/bin/env python3
"""
输入助手回归测试。

使用 Debian 环境已有的 Python Playwright + Chromium，在 HTTP 上加载真实
`input-helper-core.js` 和宿主 stub fixture。不是 SillyTavern 端到端测试：
fixture 只模拟 ST 的输入框/消息编辑器生命周期。
"""

from __future__ import annotations

import functools
import http.server
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FIXTURE_URL = "/tests/fixture.html"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - match base signature
        pass


class InputHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        self.context = self.browser.new_context(
            viewport={"width": 900, "height": 800},
        )
        self.page = self.context.new_page()
        self.goto_fixture(self.page)

    def tearDown(self):
        self.context.close()

    def goto_fixture(self, page):
        page.goto(f"http://127.0.0.1:{self.port}{FIXTURE_URL}")
        page.wait_for_function("window.__ready === true")

    # ---------- helpers ----------

    def value(self, element_id):
        return self.page.eval_on_selector(f"#{element_id}", "el => el.value")

    def state(self, element_id):
        return self.page.eval_on_selector(
            f"#{element_id}",
            "el => ({value: el.value, start: el.selectionStart, end: el.selectionEnd, "
            "active: document.activeElement?.id || '', "
            "scrollTop: el.scrollTop, connected: el.isConnected})",
        )

    def active_id(self):
        return self.page.evaluate("document.activeElement?.id || ''")

    def events(self):
        return self.page.evaluate("window.inputEvents")

    def set_main(self, value, start=0, end=None):
        if end is None:
            end = start
        self.page.evaluate(
            "([value, start, end]) => {"
            "  const el = document.getElementById('send_textarea');"
            "  el.value = value;"
            "  el.focus();"
            "  el.setSelectionRange(start, end);"
            "}",
            [value, start, end],
        )

    def open_editor(self, text, mesid=0, start=None, end=None):
        self.page.evaluate(
            "([mesid, text]) => window.st.openEditor(mesid, text)",
            [mesid, text],
        )
        if start is None:
            start = len(text)
        if end is None:
            end = start
        self.page.evaluate(
            "([start, end]) => document.getElementById('curEditTextarea').setSelectionRange(start, end)",
            [start, end],
        )

    def editor(self, text, start, end):
        self.open_editor(text)
        self.page.evaluate(
            "([start, end]) => document.getElementById('curEditTextarea').setSelectionRange(start, end)",
            [start, end],
        )

    def click_toolbar(self, selector):
        self.page.locator(selector).click()

    # ---------- target resolution / insertion ----------

    def test_main_input_inserts_pair_and_keeps_cursor(self):
        self.set_main("abcdef", 2, 2)
        self.click_toolbar("#input_asterisk_btn")
        state = self.state("send_textarea")
        self.assertEqual(state["value"], "ab**cdef")
        self.assertEqual((state["start"], state["end"]), (3, 3))
        self.assertEqual(state["active"], "send_textarea")
        events = self.events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["id"], "send_textarea")
        self.assertTrue(events[0]["bubbles"])

    def test_dynamic_message_editor_is_target_while_editing(self):
        self.editor("hello", 1, 3)
        self.click_toolbar("#input_quotes_btn")
        editor = self.state("curEditTextarea")
        self.assertEqual(editor["value"], 'h""lo')
        self.assertEqual((editor["start"], editor["end"]), (2, 2))
        self.assertEqual(editor["active"], "curEditTextarea")
        self.assertEqual(self.value("send_textarea"), "")
        self.assertEqual([e["id"] for e in self.events()], ["curEditTextarea"])

    def test_blurred_editor_remembers_target_and_selection(self):
        self.open_editor("hello world", start=6, end=11)
        self.page.evaluate("document.getElementById('curEditTextarea').blur()")
        self.assertNotEqual(self.active_id(), "curEditTextarea")
        self.click_toolbar("#input_quotes_btn")
        editor = self.state("curEditTextarea")
        self.assertEqual(editor["value"], 'hello ""')
        self.assertEqual((editor["start"], editor["end"]), (7, 7))
        self.assertEqual(self.value("send_textarea"), "")

    def test_mouse_button_keeps_editor_focus(self):
        self.editor("abc", 1, 1)
        self.click_toolbar("#input_asterisk_btn")
        self.assertEqual(self.value("curEditTextarea"), "a**bc")
        self.assertEqual(self.active_id(), "curEditTextarea")

    def test_mobile_real_tap_inserts_exactly_once(self):
        context = self.browser.new_context(
            viewport={"width": 800, "height": 600},
            has_touch=True,
            is_mobile=True,
        )
        page = context.new_page()
        try:
            self.goto_fixture(page)
            page.evaluate("window.st.openEditor(0, 'tap target')")
            page.evaluate(
                "document.getElementById('curEditTextarea').setSelectionRange(4, 10)"
            )
            box = page.locator("#input_quotes_btn").bounding_box()
            page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.wait_for_timeout(100)
            self.assertEqual(page.eval_on_selector("#curEditTextarea", "el => el.value"), 'tap ""')
            self.assertEqual(len(page.evaluate("window.inputEvents")), 1)
            self.assertEqual(page.eval_on_selector("#send_textarea", "el => el.value"), "")
        finally:
            context.close()

    def test_shortcut_only_in_legal_chat_input(self):
        self.set_main("abc", 1, 1)
        self.page.keyboard.press("Control+Alt+Q")
        self.assertEqual(self.value("send_textarea"), 'a""bc')

        self.page.evaluate(
            "(() => { const el = document.getElementById('settings_textarea');"
            "  el.value = 'settings'; el.focus(); el.setSelectionRange(0, 0); })()"
        )
        self.page.keyboard.press("Control+Alt+Q")
        self.assertEqual(self.value("settings_textarea"), "settings")
        self.assertEqual(self.value("send_textarea"), 'a""bc')

    def test_shortcut_works_in_message_editor(self):
        self.editor("hello", 5, 5)
        self.page.keyboard.press("Control+Alt+Q")
        editor = self.state("curEditTextarea")
        self.assertEqual(editor["value"], 'hello""')
        self.assertEqual(editor["active"], "curEditTextarea")
        self.assertEqual(self.value("send_textarea"), "")

    def test_chinese_ime_composition_does_not_trigger_shortcut(self):
        self.set_main("abc", 1, 1)
        composing = self.page.evaluate(
            "(() => {"
            "  const el = document.getElementById('send_textarea');"
            "  const event = new KeyboardEvent('keydown', {"
            "    key: 'q', code: 'KeyQ', ctrlKey: true, altKey: true,"
            "    bubbles: true, cancelable: true, isComposing: true,"
            "  });"
            "  Object.defineProperty(event, 'keyCode', { value: 229 });"
            "  el.dispatchEvent(event);"
            "  return el.value;"
            "})()"
        )
        self.assertEqual(composing, "abc")

        self.page.evaluate(
            "(() => {"
            "  const el = document.getElementById('send_textarea');"
            "  const event = new KeyboardEvent('keydown', {"
            "    key: 'q', code: 'KeyQ', ctrlKey: true, altKey: true,"
            "    bubbles: true, cancelable: true,"
            "  });"
            "  el.dispatchEvent(event);"
            "})()"
        )
        self.assertEqual(self.value("send_textarea"), 'a""bc')
        self.assertEqual(len(self.events()), 1)

    # ---------- editor lifecycle ----------

    def _assert_old_editor_is_not_modified_after(self, finish_js):
        self.open_editor("abc", start=1, end=1)
        self.click_toolbar("#input_asterisk_btn")
        self.assertEqual(self.value("curEditTextarea"), "a**bc")
        self.page.evaluate(finish_js)
        stale_value = self.page.evaluate("window.lastEditor.value")
        self.assertFalse(self.page.evaluate("window.lastEditor.isConnected"))

        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.page.evaluate("window.lastEditor.value"), stale_value)
        self.assertEqual(self.value("send_textarea"), '""')

    def test_editor_save_then_toolbar_writes_main_not_stale_editor(self):
        self._assert_old_editor_is_not_modified_after("window.st.saveEditor(0)")

    def test_editor_cancel_then_toolbar_writes_main_not_stale_editor(self):
        self._assert_old_editor_is_not_modified_after("window.st.cancelEditor(0)")

    def test_editor_message_removed_then_toolbar_writes_main(self):
        self._assert_old_editor_is_not_modified_after("window.st.removeMessage(0)")

    def test_switch_between_editor_and_main(self):
        self.open_editor("edit text", start=9, end=9)
        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.value("curEditTextarea"), 'edit text""')

        self.set_main("main", 4, 4)
        self.click_toolbar("#input_asterisk_btn")
        self.assertEqual(self.value("send_textarea"), "main**")
        self.assertEqual(self.value("curEditTextarea"), 'edit text""')

        self.page.locator("#curEditTextarea").focus()
        self.page.evaluate(
            "document.getElementById('curEditTextarea').setSelectionRange(0, 0)"
        )
        self.click_toolbar("#input_parentheses_btn")
        self.assertEqual(self.value("curEditTextarea"), '()edit text""')
        self.assertEqual(self.value("send_textarea"), "main**")

    # ---------- custom symbols / rendering ----------

    def test_custom_symbol_inserts_literal_and_renders_safely(self):
        self.page.evaluate(
            "window.customSymbols = [{"
            "  name: '<img src=x onerror=\"window.__xss=1\">',"
            "  display: '<b>BAD</b>',"
            "  symbol: '[]',"
            "  cursorPos: 'middle'"
            "}]"
        )
        self.page.evaluate(
            "(() => {"
            "  const b = window.core.createCustomSymbolButtonElement(window.customSymbols[0], 0);"
            "  document.getElementById('input_helper_toolbar').append(b);"
            "})()"
        )
        button = self.page.locator("#input_custom_0_btn")
        self.assertEqual(button.text_content(), "<b>BAD</b>")
        self.assertEqual(
            button.get_attribute("title"),
            '<img src=x onerror="window.__xss=1">',
        )
        self.assertEqual(self.page.locator("#input_custom_0_btn img").count(), 0)
        self.assertIsNone(self.page.evaluate("window.__xss"))

        self.set_main("ab", 1, 1)
        button.click()
        self.assertEqual(self.value("send_textarea"), "a[]b")
        self.assertEqual(self.state("send_textarea")["start"], 2)

    def test_custom_button_added_after_binding_works(self):
        self.page.evaluate(
            "window.customSymbols = [{name: 'paren', display: '(c)', symbol: '()', cursorPos: 'end'}]"
        )
        self.page.evaluate(
            "(() => {"
            "  const b = window.core.createCustomSymbolButtonElement(window.customSymbols[0], 0);"
            "  document.getElementById('input_helper_toolbar').append(b);"
            "})()"
        )
        self.set_main("x", 1, 1)
        self.page.locator("#input_custom_0_btn").click()
        self.assertEqual(self.value("send_textarea"), "x()")
        self.assertEqual(self.state("send_textarea")["start"], 3)

    # ---------- selection / long text / scrolling ----------

    def test_selection_is_replaced_not_wrapped(self):
        self.set_main("abcdef", 2, 4)
        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.value("send_textarea"), 'ab""ef')
        state = self.state("send_textarea")
        self.assertEqual((state["start"], state["end"]), (3, 3))

    def test_long_text_preserves_scroll_and_selection(self):
        value = "\n".join(f"line {i}" for i in range(300))
        self.set_main(value, 1800, 1800)
        before = self.page.evaluate(
            "(() => { const el = document.getElementById('send_textarea');"
            "  el.focus(); el.setSelectionRange(1800, 1800); el.scrollTop = 600;"
            "  return {scrollTop: el.scrollTop, length: el.value.length}; })()"
        )
        self.assertGreater(before["scrollTop"], 0)
        self.click_toolbar("#input_asterisk_btn")
        after = self.state("send_textarea")
        self.assertEqual(len(after["value"]), before["length"] + 2)
        self.assertEqual(after["scrollTop"], before["scrollTop"])
        self.assertEqual(after["start"], 1801)

    def test_toolbar_horizontal_scroll_click_still_inserts(self):
        self.page.evaluate(
            "(() => { const bar = document.getElementById('input_helper_toolbar');"
            "  bar.style.width = '120px'; bar.scrollLeft = 100; })()"
        )
        sizes = self.page.eval_on_selector(
            "#input_helper_toolbar", "el => ({client: el.clientWidth, scroll: el.scrollWidth})"
        )
        self.assertGreater(sizes["scroll"], sizes["client"])
        self.set_main("x", 1, 1)
        self.click_toolbar("#input_char_btn")
        self.assertEqual(self.value("send_textarea"), "x{{Char}}")

    # ---------- invalid targets ----------

    def test_no_valid_target_does_nothing(self):
        self.page.evaluate(
            "document.getElementById('send_textarea').style.display = 'none'"
        )
        self.click_toolbar("#input_asterisk_btn")
        self.assertEqual(self.value("send_textarea"), "")
        self.assertEqual(self.events(), [])

    def test_hidden_readonly_disabled_targets_are_not_used(self):
        # 隐藏主输入框 + 无编辑器 => 安全退出
        self.page.evaluate(
            "document.getElementById('send_textarea').style.display = 'none'"
        )
        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.events(), [])

        # 恢复后只读 => 不作为目标
        self.page.evaluate(
            "document.getElementById('send_textarea').style.display = '';"
            "document.getElementById('send_textarea').readOnly = true;"
        )
        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.value("send_textarea"), "")
        self.assertEqual(self.events(), [])

        # 禁用 => 不作为目标
        self.page.evaluate(
            "document.getElementById('send_textarea').readOnly = false;"
            "document.getElementById('send_textarea').disabled = true;"
        )
        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.value("send_textarea"), "")
        self.assertEqual(self.events(), [])

    def test_settings_and_world_info_textareas_are_not_hijacked(self):
        self.page.evaluate(
            "(() => { const el = document.getElementById('settings_textarea');"
            "  el.value = 'settings'; el.focus(); el.setSelectionRange(0, 0); })()"
        )
        self.page.evaluate("document.getElementById('send_textarea').style.display = 'none'")
        self.click_toolbar("#input_asterisk_btn")
        self.assertEqual(self.value("settings_textarea"), "settings")
        self.assertEqual(self.value("world_textarea"), "")
        self.assertEqual(self.events(), [])

    def test_remembered_chat_target_wins_over_focused_settings_textarea(self):
        self.set_main("chat", 4, 4)
        self.page.evaluate(
            "(() => { const el = document.getElementById('settings_textarea');"
            "  el.value = 'settings'; el.focus(); el.setSelectionRange(2, 2); })()"
        )
        self.click_toolbar("#input_quotes_btn")
        self.assertEqual(self.value("settings_textarea"), "settings")
        self.assertEqual(self.value("send_textarea"), 'chat""')

    def test_disabled_editor_falls_back_to_main(self):
        self.page.evaluate("window.st.openEditor(0, 'edit')")
        self.page.evaluate("document.getElementById('curEditTextarea').disabled = true")
        self.set_main("main", 4, 4)
        self.click_toolbar("#input_asterisk_btn")
        self.assertEqual(self.value("curEditTextarea"), "edit")
        self.assertEqual(self.value("send_textarea"), "main**")

    def test_all_builtin_presets(self):
        cases = [
            ("#input_asterisk_btn", "**", 1),
            ("#input_quotes_btn", '""', 1),
            ("#input_parentheses_btn", "()", 1),
            ("#input_book_quotes1_btn", "「」", 1),
            ("#input_book_quotes2_btn", "『』", 1),
            ("#input_book_quotes3_btn", "《》", 1),
            ("#input_user_btn", "{{User}}", 8),
            ("#input_char_btn", "{{Char}}", 8),
        ]
        for selector, text, offset in cases:
            with self.subTest(selector=selector):
                self.set_main("xy", 1, 1)
                self.click_toolbar(selector)
                self.assertEqual(self.value("send_textarea"), f"x{text}y")
                self.assertEqual(self.state("send_textarea")["start"], 1 + offset)

    def test_custom_symbol_custom_cursor_position(self):
        self.page.evaluate(
            "window.customSymbols = [{name: 'braces', display: '{}', symbol: '{}', cursorPos: '2'}]"
        )
        self.page.evaluate(
            "(() => {"
            "  const b = window.core.createCustomSymbolButtonElement(window.customSymbols[0], 0);"
            "  document.getElementById('input_helper_toolbar').append(b);"
            "})()"
        )
        self.set_main("xy", 1, 1)
        self.page.locator("#input_custom_0_btn").click()
        self.assertEqual(self.value("send_textarea"), "x{}y")
        self.assertEqual(self.state("send_textarea")["start"], 3)

    def test_newline_goes_to_current_line_end(self):
        self.set_main("first line\nsecond line\nthird", 3, 3)
        self.click_toolbar("#input_newline_btn")
        self.assertEqual(self.value("send_textarea"), "first line\n\nsecond line\nthird")
        self.assertEqual(self.state("send_textarea")["start"], 11)


if __name__ == "__main__":
    unittest.main(verbosity=2)
