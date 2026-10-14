"""LLM 输出解析容错性验证。

背景：线上 `/api/speaking/evaluate` 曾返回 500，堆栈指向
`llm_service.call_llm_json` 的 `raw.index("```", start)` ——
只要模型返回内容里的围栏数量是奇数（最常见的是被 max_tokens 截断、
只有开围栏没有闭围栏），`index` 就抛 ValueError，整个接口挂掉。
"""

import sys

sys.path.insert(0, "/app/backend")
from app.services.llm_service import _parse_llm_json  # noqa: E402

CASES = [
    ("纯 JSON", '{"a": 1}', {"a": 1}),
    ("json 围栏", '```json\n{"a": 1}\n```', {"a": 1}),
    ("无语言围栏", '```\n{"a": 1}\n```', {"a": 1}),
    ("围栏前有说明", '好的，结果如下：\n```json\n{"a": 1}\n```\n希望有帮助', {"a": 1}),
    ("裸 JSON 夹在文字中", '结果 {"a": 1} 完毕', {"a": 1}),
    ("数组", '[{"a": 1}, {"b": 2}]', [{"a": 1}, {"b": 2}]),
    ("数组围栏", '```json\n[1, 2, 3]\n```', [1, 2, 3]),
    ("【旧崩溃场景】只有开围栏、无闭围栏", '```json\n{"a": 1}\n', {"a": 1}),
    ("【旧崩溃场景】单个 ``` 后跟 JSON", '```{"a": 1}', {"a": 1}),
    ("多个围栏块", '```json\n{"a": 1}\n```\n\n```json\n{"b": 2}\n```', {"a": 1}),
    ("围栏内含换行 JSON", '```json\n{\n  "a": 1,\n  "b": [1, 2]\n}\n```', {"a": 1, "b": [1, 2]}),
    ("中文与转义字符", '```json\n{"评价": "不错\\n继续加油"}\n```', {"评价": "不错\n继续加油"}),
]

FAIL_HARD = [
    ("纯文字无 JSON", "这道题我不太确定，请你再想想。"),
    ("围栏内是残缺 JSON", '```json\n{"a": 1,'),
]

results = []

for name, raw, expect in CASES:
    try:
        got = _parse_llm_json(raw)
        ok = got == expect
        results.append((name, ok, f"got={got!r}"))
    except Exception as e:
        results.append((name, False, f"抛异常 {type(e).__name__}: {e}"))

for name, raw in FAIL_HARD:
    try:
        got = _parse_llm_json(raw)
        # 无法解析时应抛 ValueError，由 safe_json_call 捕获后降级为示例结果
        results.append((name, False, f"应抛异常却返回了 {got!r}"))
    except ValueError:
        results.append((name, True, "按预期抛出 ValueError（会被降级处理）"))
    except Exception as e:
        results.append((name, False, f"抛了非预期异常 {type(e).__name__}: {e}"))

print("=" * 72)
print("LLM 输出解析容错性")
print("=" * 72)
for name, ok, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name} — {detail}")
passed = sum(1 for _, ok, _ in results if ok)
print("=" * 72)
print(f"结果：{passed}/{len(results)} 项通过")
sys.exit(0 if passed == len(results) else 1)
