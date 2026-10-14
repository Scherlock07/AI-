#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学情链路端到端验证（在服务器容器内运行）

思路：
1) 通过 HTTP 注册 5 名学生 + 1 名教师
2) 教师建班，学生凭邀请码加入
3) 直接往 learning_stats / writing_submissions / speaking_records 等表
   写入真实练习记录（模拟学生学习行为）
4) 调教师端 /overview 与 /analysis-report，断言返回的统计值
   与实际写入的数据一致（防止聚合错误或报告编造）
"""
import json
import urllib.request
import urllib.error
import random
import string
import datetime

BASE = "http://127.0.0.1"
PASS = 0
FAIL = 0
SUFFIX = "".join(random.choices(string.digits, k=6))


def call(path, token=None, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
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


print("=" * 70)
print("学情链路端到端验证（真实数据 → 聚合 → AI 报告）")
print("=" * 70)

# ---------- 1. 注册教师 ----------
tname = f"qa_tea_{SUFFIX}"
st, r = call("/api/auth/register", method="POST", body={
    "username": tname, "password": "123456",
    "email": f"{tname}@example.com", "display_name": "验证教师", "role": "teacher",
})
ttok = r.get("access_token")
if not ttok:
    # 已存在则登录
    st, r = call("/api/auth/login", method="POST",
                 body={"username": tname, "password": "123456"})
    ttok = r.get("access_token")
check("教师账号就绪", bool(ttok), f"status={st}")

# ---------- 2. 建班 ----------
st, c = call("/api/teacher/classes", token=ttok, method="POST",
             body={"name": f"学情验证班{SUFFIX}", "description": "E2E 自动化验证，可删除"})
cid = c.get("id")
invite = c.get("invite_code")
check("创建班级（JSON body）", bool(cid), f"id={cid} 邀请码={invite}")

# ---------- 3. 创建学生并加入 ----------
student_ids = []
for i in range(5):
    uname = f"qa_stu_{SUFFIX}_{i}"
    st, r = call("/api/auth/register", method="POST", body={
        "username": uname, "password": "123456",
        "email": f"{uname}@example.com",
        "display_name": f"验证学生{i+1}", "role": "student",
    })
    stok = r.get("access_token")
    uid = (r.get("user") or {}).get("id")
    if not stok:
        st, r2 = call("/api/auth/login", method="POST",
                      body={"username": uname, "password": "123456"})
        stok = r2.get("access_token")
        uid = (r2.get("user") or {}).get("id")
    if stok:
        st, jr = call("/api/classroom/join", token=stok, method="POST",
                      body={"invite_code": invite})
        # 严格：加入失败必须暴露（历史上曾有静默失败）
        if st not in (200, 201):
            print(f"     !! 加入班级失败 user={uname} status={st} resp={jr}")
            continue
        if uid:
            student_ids.append(uid)
check("学生注册并加入班级", len(student_ids) == 5, f"{len(student_ids)}/5 人")

if not student_ids or not cid:
    print("\n>>> 前置条件不满足，终止")
    print(f"结果：PASS={PASS} FAIL={FAIL}")
    raise SystemExit(1)

# ---------- 4. 直接写库造学习数据 ----------
print("\n[4] 写入真实学习记录（直接操作数据库）")
import sys
sys.path.insert(0, "/app/backend")
try:
    from app.database import SessionLocal
    from app.models.community import LearningStats
    from app.models.user import User
    db = SessionLocal()
    DB_OK = True
except Exception as e:
    print(f"     无法导入数据库模块：{e}")
    DB_OK = False

EXPECT = {}   # uid -> {"time":.., "cnt":.., "scores":[...]}
if DB_OK:
    modules = ["listening", "speaking", "reading", "writing", "vocabulary", "translation"]
    today = datetime.date.today()
    for idx, uid in enumerate(student_ids):
        exp = {"time": 0, "cnt": 0, "scores": []}
        # 每名学生写入多个模块、多天的记录
        for mi, mod in enumerate(modules):
            for d in range(3):  # 近 3 天
                dt = (today - datetime.timedelta(days=d)).isoformat()
                # 成绩：学生 idx 越大分越低，制造分层
                base = 92 - idx * 8 + random.randint(-4, 4)
                base = max(40, min(100, base))
                tm = random.randint(15, 45)
                cnt = random.randint(1, 4)
                db.add(LearningStats(
                    user_id=uid, date=dt, module=mod,
                    study_time=tm, exercise_count=cnt, avg_score=float(base),
                ))
                exp["time"] += tm
                exp["cnt"] += cnt
                exp["scores"].append(float(base))
        EXPECT[uid] = exp
    db.commit()
    print(f"     写入完成：{len(EXPECT)} 名学生 × 6 模块 × 3 天")
    db.close()

# ---------- 5. 验证概览聚合 ----------
print("\n[5] GET /classes/{id}/overview 聚合校验")
st, ov = call(f"/api/teacher/classes/{cid}/overview?days=30", token=ttok)
check("概览 200", st == 200, f"status={st}")
s = ov.get("summary") or {}
students = ov.get("students") or []
check("班级学生数正确", len(students) == 5, f"实际 {len(students)} 人 / 期望 5")
print(f"     summary = {json.dumps(s, ensure_ascii=False)}")

if DB_OK and students:
    exp_total_time = sum(e["time"] for e in EXPECT.values())
    exp_total_cnt = sum(e["cnt"] for e in EXPECT.values())
    print(f"     期望总时长={exp_total_time}  期望总练习数={exp_total_cnt}")
    print(f"     实际总时长={s.get('total_time')}  实际总练习数={s.get('total_exercises')}")
    check("总学习时长一致", s.get("total_time") == exp_total_time,
          f"{s.get('total_time')} vs {exp_total_time}")
    check("总练习数一致", s.get("total_exercises") == exp_total_cnt,
          f"{s.get('total_exercises')} vs {exp_total_cnt}")

    # 校验单个学生（注意：个人统计嵌在 summary 子对象中）
    smap = {x.get("student_id") or x.get("id"): x for x in students}
    ok_cnt = 0
    for uid, e in EXPECT.items():
        sd = smap.get(uid)
        sm = (sd or {}).get("summary") or {}
        if sm.get("total_time") == e["time"] and sm.get("total_exercises") == e["cnt"]:
            ok_cnt += 1
    check("5 名学生个人统计全部一致", ok_cnt == 5, f"{ok_cnt}/5")

    # 校验均分
    all_scores = [sc for e in EXPECT.values() for sc in e["scores"]]
    exp_avg = round(sum(all_scores) / len(all_scores), 1)
    real_avg = s.get("class_avg")
    check("班级均分与原始数据吻合", abs(float(real_avg or 0) - exp_avg) <= 1.0,
          f"实际 {real_avg} vs 期望≈{exp_avg}")

    # 校验成绩分段总数 = 学生数
    bands = ov.get("score_bands") or []
    band_total = sum(b.get("count", 0) for b in bands)
    check("成绩分段总人数 = 学生总数", band_total == 5, f"{band_total} vs 5")

    # 校验模块均分
    ms = ov.get("module_scores") or []
    with_data = [m for m in ms if (m.get("avg_score") or 0) > 0]
    check("六模块均有均分数据", len(with_data) == 6, f"{len(with_data)}/6")

# ---------- 6. 验证学生画像 ----------
print("\n[6] GET /students/{id}/profile 画像校验")
if students:
    s0 = students[0]
    sid = s0.get("id") or s0.get("student_id")
    st, prof = call(f"/api/teacher/students/{sid}/profile?class_id={cid}&days=30", token=ttok)
    check("画像 200", st == 200, f"status={st}")
    psum = prof.get("summary") or {}
    ms = prof.get("module_stats") or []
    check("画像模块数 = 6", len(ms) == 6, f"{len(ms)}")
    if DB_OK and sid in EXPECT:
        e = EXPECT[sid]
        check("画像总时长一致", psum.get("total_time") == e["time"],
              f"{psum.get('total_time')} vs {e['time']}")
        check("画像练习数一致", psum.get("total_exercises") == e["cnt"],
              f"{psum.get('total_exercises')} vs {e['cnt']}")

# ---------- 7. 验证 AI 报告 ----------
print("\n[7] POST /classes/{id}/analysis-report 报告校验")
st, rep = call(f"/api/teacher/classes/{cid}/analysis-report",
               token=ttok, method="POST", body={"days": 30, "focus": "重点分析写作与口语"})
check("报告 200", st == 200, f"status={st}")
body = rep.get("report") or {}
ds = rep.get("data_summary") or {}
check("含总体诊断", bool(body.get("overall_diagnosis")))
check("含模块分析", len(body.get("module_analysis") or []) > 0,
      f"{len(body.get('module_analysis') or [])} 项")
check("含学生分层", isinstance(body.get("student_layering"), dict))
check("含教学建议", len(body.get("teaching_suggestions") or []) > 0,
      f"{len(body.get('teaching_suggestions') or [])} 条")

print(f"\n     data_summary = {json.dumps(ds, ensure_ascii=False)[:260]}")
print(f"\n     总体诊断（前 300 字）：\n     {(body.get('overall_diagnosis') or '')[:300]}")

# 分层是否识别到真实学生
lay = body.get("student_layering") or {}
for k in ("attention", "improving", "excellent"):
    v = lay.get(k) or {}
    n = len(v.get("students") or [])
    print(f"     分层[{k}]: {n} 人")
    # 不加断言（LLM 判断可能因数据而异），仅记录

# 数据说明里应提及真实数字
notes = body.get("data_notes")
print(f"\n     数据说明 = {str(notes)[:220]}")

# 关键：报告里的班级均分是否与真实一致
if ds.get("class_avg") is not None and DB_OK:
    all_scores = [sc for e in EXPECT.values() for sc in e["scores"]]
    exp_avg = round(sum(all_scores) / len(all_scores), 1)
    check("报告班级均分与真实数据吻合",
          abs(float(ds["class_avg"]) - exp_avg) <= 1.0,
          f"报告 {ds['class_avg']} vs 期望≈{exp_avg}")

print("\n" + "=" * 70)
print(f"结果：PASS={PASS}  FAIL={FAIL}")
print(f"验证班级 ID（供清理）：{cid}")
print("=" * 70)
raise SystemExit(0 if FAIL == 0 else 2)
