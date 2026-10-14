#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
静态校验：analytics_service.py 中引用的所有模型字段是否真实存在。
在服务器容器内运行（有完整依赖）。
"""
import ast
import sys
import importlib

sys.path.insert(0, "/app/backend")

# 模型类名 -> 模块路径
MODEL_MODULES = {
    "LearningStats": "app.models.community",
    "WritingSubmission": "app.models.writing",
    "SpeakingRecord": "app.models.speaking",
    "ReadingExercise": "app.models.reading",
    "ClassMember": "app.models.teacher",
    "Class": "app.models.teacher",
    "Assignment": "app.models.teacher",
    "ClassroomSpeakingScore": "app.models.teacher",
    "User": "app.models.user",
}

# 加载真实模型类
models = {}
for name, modpath in MODEL_MODULES.items():
    try:
        mod = importlib.import_module(modpath)
        cls = getattr(mod, name, None)
        if cls is not None:
            models[name] = cls
    except Exception as e:
        print(f"  ! 无法导入 {name} ({modpath}): {e}")

print(f"已加载模型：{sorted(models.keys())}\n")

# 解析 analytics_service.py 中的  类名.属性  引用
SRC = "/app/backend/app/services/analytics_service.py"
tree = ast.parse(open(SRC, encoding="utf-8").read())

refs = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        if node.value.id in MODEL_MODULES:
            refs.add((node.value.id, node.attr))

print(f"发现 {len(refs)} 处模型字段引用，逐一校验：\n")
bad = []
for cls_name, attr in sorted(refs):
    cls = models.get(cls_name)
    if cls is None:
        continue
    # SQLAlchemy 列在 __table__.columns 或类属性
    ok = hasattr(cls, attr) or attr in {"__table__", "id"}
    if not ok:
        bad.append((cls_name, attr))
        print(f"  [BAD ] {cls_name}.{attr}  <-- 不存在")
    else:
        print(f"  [OK  ] {cls_name}.{attr}")

print()
if bad:
    print(f">>> 发现 {len(bad)} 个无效字段引用：")
    for c, a in bad:
        print(f"    {c}.{a}")
    sys.exit(2)
else:
    print(">>> 全部字段引用有效 ✅")
    sys.exit(0)
