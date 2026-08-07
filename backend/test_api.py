"""API 接口测试脚本"""
import httpx
import json

BASE = "http://127.0.0.1:8080"

# 登录
resp = httpx.post(f"{BASE}/api/auth/login", json={"username": "student", "password": "123456"})
token = resp.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}

tests = []

# 1. 健康检查
r = httpx.get(f"{BASE}/api/health")
tests.append(("Health Check", r.status_code, "OK" if r.status_code == 200 else r.text[:80]))

# 2. 写作批改
r = httpx.post(f"{BASE}/api/writing/grade", json={
    "content": "Technology has changed our lives.",
    "type": "argumentative",
    "prompt": "Discuss technology."
}, headers=h, timeout=30)
data = r.json() if r.status_code == 200 else {}
tests.append(("Writing Grade", r.status_code, f"score={data.get('overall_score', 'N/A')}"))

# 3. 阅读分析
r = httpx.post(f"{BASE}/api/reading/analyze", json={
    "content": "Technology has changed society in many ways.",
    "difficulty": "intermediate"
}, headers=h, timeout=30)
data = r.json() if r.status_code == 200 else {}
tests.append(("Reading Analysis", r.status_code, f"keys={list(data.keys()) if data else 'N/A'}"))

# 4. 口语评估
r = httpx.post(f"{BASE}/api/speaking/evaluate", json={
    "type": "presentation",
    "topic": "My favorite hobby",
    "transcript": "I like reading books in my free time."
}, headers=h, timeout=30)
data = r.json() if r.status_code == 200 else {}
tests.append(("Speaking Eval", r.status_code, f"score={data.get('overall_score', 'N/A')}"))

# 5. 翻译评分
r = httpx.post(f"{BASE}/api/translation/grade", json={
    "source_text": "The weather is nice today.",
    "user_translation": "今天天气很好。",
    "direction": "en-to-zh"
}, headers=h, timeout=30)
data = r.json() if r.status_code == 200 else {}
tests.append(("Translation Grade", r.status_code, f"score={data.get('overall_score', 'N/A')}"))

# 6. 语法生成
r = httpx.post(f"{BASE}/api/vocabulary/grammar/generate", json={
    "grammar_point": "",
    "type": "multiple-choice",
    "difficulty": "intermediate",
    "count": 3
}, headers=h, timeout=30)
data = r.json() if r.status_code == 200 else []
tests.append(("Grammar Generate", r.status_code, f"count={len(data) if data else 'N/A'}"))

# 7. 词根分析
r = httpx.post(f"{BASE}/api/vocabulary/root-analysis", json={"word": "unprecedented"}, headers=h, timeout=30)
data = r.json() if r.status_code == 200 else {}
tests.append(("Root Analysis", r.status_code, f"word={data.get('word', 'N/A')}"))

# 8. 词汇列表
r = httpx.get(f"{BASE}/api/vocabulary/words", headers=h, timeout=10)
tests.append(("Vocab List", r.status_code, f"count={len(r.json()) if r.status_code == 200 else 'N/A'}"))

# 9. 错题本
r = httpx.get(f"{BASE}/api/vocabulary/wrong-answers", headers=h, timeout=10)
tests.append(("Wrong Answers", r.status_code, f"count={len(r.json()) if r.status_code == 200 else 'N/A'}"))

# 10. 学习统计
r = httpx.get(f"{BASE}/api/profile/stats", headers=h, timeout=10)
data = r.json() if r.status_code == 200 else {}
tests.append(("Profile Stats", r.status_code, f"keys={list(data.keys()) if data else 'N/A'}"))

# 11. 排行榜
r = httpx.get(f"{BASE}/api/community/leaderboard", headers=h, timeout=10)
tests.append(("Leaderboard", r.status_code, f"count={len(r.json()) if r.status_code == 200 else 'N/A'}"))

# 12. 成就
r = httpx.get(f"{BASE}/api/community/achievements", headers=h, timeout=10)
tests.append(("Achievements", r.status_code, f"count={len(r.json()) if r.status_code == 200 else 'N/A'}"))

# 13. 最近活动
r = httpx.get(f"{BASE}/api/profile/recent-activities", headers=h, timeout=10)
tests.append(("Recent Activities", r.status_code, f"count={len(r.json()) if r.status_code == 200 else 'N/A'}"))

# 14. 学习小组
r = httpx.get(f"{BASE}/api/community/groups", headers=h, timeout=10)
tests.append(("Study Groups", r.status_code, f"count={len(r.json()) if r.status_code == 200 else 'N/A'}"))

# 15. AI 助教
r = httpx.post(f"{BASE}/api/profile/ai-assistant?message=How+to+improve+English", headers=h, timeout=30)
data = r.json() if r.status_code == 200 else {}
tests.append(("AI Assistant", r.status_code, f"reply_len={len(data.get('reply', '')) if data else 'N/A'}"))

print("\n" + "=" * 70)
print(f"  API Interface Test Results ({len(tests)} endpoints)")
print("=" * 70)
passed = 0
for name, status, detail in tests:
    icon = "PASS" if status == 200 else "FAIL"
    if status == 200:
        passed += 1
    print(f"  [{icon}] {name:25s} | {status} | {detail}")
print("-" * 70)
print(f"  Result: {passed}/{len(tests)} passed")
print("=" * 70)
