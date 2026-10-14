#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理本轮验证产生的测试数据（在服务器容器内运行）

清理对象（严格白名单，只删本轮自动化生成的）：
- 班级名含「学情验证班」/「学情链路验证班」的班级
- 用户名以 qa_tea_ / qa_stu_ / zz 开头的账号
- 上述账号的 learning_stats 记录
- 上述班级的 class_members 记录

保留：正式数据（26学生会测试、26外语平台学生会测试等）
"""
import sqlite3
import sys

DB = "/data/ai_language_platform.db"
TEST_CLASS_LIKE = ["学情验证班%", "学情链路验证班%"]
TEST_USER_LIKE = ["qa_tea_%", "qa_stu_%", "zz%"]

conn = sqlite3.connect(DB)
cur = conn.cursor()

# 1) 找出测试班级
classes = []
for pat in TEST_CLASS_LIKE:
    classes += cur.execute("select id, name from classes where name like ?", (pat,)).fetchall()
print(f"[1] 待清理测试班级 {len(classes)} 个：")
for cid, name in classes:
    print(f"    - {name} ({cid[:8]})")

# 2) 找出测试用户
users = []
for pat in TEST_USER_LIKE:
    users += cur.execute("select id, username from users where username like ?", (pat,)).fetchall()
print(f"\n[2] 待清理测试账号 {len(users)} 个")
for uid, uname in users[:12]:
    print(f"    - {uname}")
if len(users) > 12:
    print(f"    ... 其余 {len(users)-12} 个")

if not classes and not users:
    print("\n>>> 无测试数据需要清理")
    sys.exit(0)

class_ids = [c[0] for c in classes]
user_ids = [u[0] for u in users]

# 3) 执行清理（顺序：先关联表，再主体）
print("\n[3] 执行清理...")
deleted = {}

if class_ids:
    q = ",".join("?" * len(class_ids))
    cur.execute(f"delete from class_members where class_id in ({q})", class_ids)
    deleted["class_members(by class)"] = cur.rowcount
    for tbl in ("assignments", "classroom_speaking_scores"):
        try:
            cur.execute(f"delete from {tbl} where class_id in ({q})", class_ids)
            deleted[tbl] = cur.rowcount
        except Exception as e:
            print(f"    跳过 {tbl}: {e}")
    cur.execute(f"delete from classes where id in ({q})", class_ids)
    deleted["classes"] = cur.rowcount

if user_ids:
    q = ",".join("?" * len(user_ids))
    # 学习记录
    cur.execute(f"delete from learning_stats where user_id in ({q})", user_ids)
    deleted["learning_stats"] = cur.rowcount
    # 成员关系（若上述按班级清理未覆盖）
    cur.execute(f"delete from class_members where user_id in ({q})", user_ids)
    deleted["class_members(by user)"] = cur.rowcount
    # 写作/口语/阅读练习记录
    for tbl in ("writing_submissions", "speaking_records", "reading_exercises"):
        try:
            cur.execute(f"delete from {tbl} where user_id in ({q})", user_ids)
            if cur.rowcount:
                deleted[tbl] = cur.rowcount
        except Exception as e:
            print(f"    跳过 {tbl}: {e}")
    cur.execute(f"delete from users where id in ({q})", user_ids)
    deleted["users"] = cur.rowcount

conn.commit()

print("\n[4] 清理结果：")
for k, v in deleted.items():
    print(f"    {k}: 删除 {v} 行")

# 5) 复核
print("\n[5] 复核：")
remain_c = cur.execute(
    "select count(*) from classes where name like '学情验证班%' or name like '学情链路验证班%'"
).fetchone()[0]
remain_u = cur.execute(
    "select count(*) from users where username like 'qa_tea_%' or username like 'qa_stu_%' or username like 'zz%'"
).fetchone()[0]
print(f"    剩余测试班级: {remain_c}")
print(f"    剩余测试账号: {remain_u}")

print("\n[6] 保留的正式数据：")
for cid, name, tid in cur.execute("select id, name, teacher_id from classes"):
    n = cur.execute("select count(*) from class_members where class_id=?", (cid,)).fetchone()[0]
    print(f"    {name} — {n} 名学生")

conn.close()
print("\n清理完成 ✅" if (remain_c == 0 and remain_u == 0) else "\n⚠️ 仍有残留，请检查")
