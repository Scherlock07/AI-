#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""教师端学情分析 E2E 测试（在服务器本机运行，直连 127.0.0.1）"""
import json
import urllib.request
import urllib.error
import sys

BASE = "http://127.0.0.1"
PASS = 0
FAIL = 0


def call(path, token=None, method="GET", body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"_err": str(e)}


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {name} {extra}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} {extra}")


print("=" * 66)
print("教师端学情分析 E2E 测试")
print("=" * 66)

# ---- 1. 登录 ----
print("\n[1] 教师登录")
st, res = call("/api/auth/login", method="POST",
               body={"username": "teacher", "password": "123456"})
tok = res.get("access_token") or res.get("token")
check("教师登录成功", st == 200 and bool(tok), f"status={st}")

print("\n[2] 学生登录")
st2, res2 = call("/api/auth/login", method="POST",
                 body={"username": "student", "password": "123456"})
stok = res2.get("access_token") or res2.get("token")
check("学生登录成功", st2 == 200 and bool(stok), f"status={st2}")

if not tok:
    print("\n>>> 教师登录失败，终止")
    sys.exit(1)

# ---- 3. 班级列表 ----
print("\n[3] 班级列表与选择")
st, res = call("/api/teacher/classes", token=tok)
classes = res if isinstance(res, list) else res.get("classes", [])
check("班级列表可读", st == 200 and isinstance(classes, list), f"共 {len(classes)} 个班")

if not classes:
    print("\n>>> 无班级，创建测试班级")
    st, res = call("/api/teacher/classes", token=tok, method="POST",
                   body={"name": "学情测试班", "description": "E2E 测试"})
    cid = res.get("id") or (res.get("class") or {}).get("id")
    classes = [{"id": cid, "name": "学情测试班"}]

cid = classes[0]["id"]
cname = classes[0].get("name", "?")
print(f"     使用班级：{cname} ({cid})")

# ---- 4. 学情概览 ----
print("\n[4] GET /classes/{id}/overview")
st, ov = call(f"/api/teacher/classes/{cid}/overview?days=30", token=tok)
check("概览接口 200", st == 200, f"status={st}")
check("含 summary", isinstance(ov.get("summary"), dict), f"summary={ov.get('summary')}")
check("含 module_scores", isinstance(ov.get("module_scores"), list),
      f"{len(ov.get('module_scores') or [])} 个模块")
check("含 score_bands", isinstance(ov.get("score_bands"), list),
      f"{len(ov.get('score_bands') or [])} 个分段")
check("含 students", isinstance(ov.get("students"), list),
      f"{len(ov.get('students') or [])} 名学生")

# days 钳制
st_hi, _ = call(f"/api/teacher/classes/{cid}/overview?days=999", token=tok)
st_lo, _ = call(f"/api/teacher/classes/{cid}/overview?days=1", token=tok)
check("days 越界不报错（钳制）", st_hi == 200 and st_lo == 200,
      f"999→{st_hi}, 1→{st_lo}")

# ---- 5. 归属校验 ----
print("\n[5] 归属校验")
st404, _ = call("/api/teacher/classes/nonexistent-id-xyz/overview", token=tok)
check("不存在的班级 → 404", st404 == 404, f"status={st404}")
st_anon, _ = call(f"/api/teacher/classes/{cid}/overview")
check("无 token → 401/403", st_anon in (401, 403), f"status={st_anon}")
if stok:
    st_cross, _ = call(f"/api/teacher/classes/{cid}/overview", token=stok)
    check("学生访问教师接口 → 403", st_cross in (401, 403), f"status={st_cross}")

# ---- 6. 学生画像 ----
print("\n[6] GET /students/{id}/profile")
students = ov.get("students") or []
if students:
    sid = students[0].get("id") or students[0].get("student_id")
    st, prof = call(f"/api/teacher/students/{sid}/profile?class_id={cid}&days=30", token=tok)
    check("学生画像 200", st == 200, f"status={st}")
    check("含 module_stats", isinstance(prof.get("module_stats"), list),
          f"{len(prof.get('module_stats') or [])} 模块")
    check("含 weak/strong", "weak_modules" in prof and "strong_modules" in prof)
else:
    print("     （班级暂无学生，跳过画像断言）")
    st, prof = call(f"/api/teacher/students/fake-id/profile?class_id={cid}", token=tok)
    check("不存在的学生 → 404", st == 404, f"status={st}")

# ---- 7. AI 分析报告 ----
print("\n[7] POST /classes/{id}/analysis-report")
st, rep = call(f"/api/teacher/classes/{cid}/analysis-report",
               token=tok, method="POST", body={"days": 30, "focus": ""})
check("报告接口 200", st == 200, f"status={st}")
check("含 data_summary", isinstance(rep.get("data_summary"), dict))
report = rep.get("report") or {}
check("含 overall_diagnosis", bool(report.get("overall_diagnosis")))
check("含 module_analysis", isinstance(report.get("module_analysis"), list),
      f"{len(report.get('module_analysis') or [])} 项")
check("含 student_layering", isinstance(report.get("student_layering"), dict),
      f"层={list((report.get('student_layering') or {}).keys())}")
check("含 teaching_suggestions", isinstance(report.get("teaching_suggestions"), list),
      f"{len(report.get('teaching_suggestions') or [])} 条建议")
check("含 follow_up_metrics", "follow_up_metrics" in report)
check("含 data_notes", "data_notes" in report)

# 带 focus 再次生成
st, rep2 = call(f"/api/teacher/classes/{cid}/analysis-report",
                token=tok, method="POST", body={"days": 7, "focus": "重点关注口语与写作"})
check("带 focus 生成成功", st == 200, f"status={st}")

# ---- 8. 报告数据可信性：抽查建议结构 ----
print("\n[8] 报告结构完整性")
sugs = report.get("teaching_suggestions") or []
if sugs:
    s0 = sugs[0]
    check("建议含 title/problem/action",
          all(k in s0 for k in ("title", "problem", "action")),
          f"keys={list(s0.keys())}")
lay = report.get("student_layering") or {}
for layer in ("attention", "improving", "excellent"):
    if layer in lay:
        check(f"分层 {layer} 结构正确", isinstance(lay[layer], dict))
else:
    print("     （无学生，跳过建议结构断言）")

print("\n" + "=" * 66)
print(f"结果：PASS={PASS}  FAIL={FAIL}")
print("=" * 66)
sys.exit(0 if FAIL == 0 else 2)
