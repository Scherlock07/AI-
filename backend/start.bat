@echo off
echo Starting AI Language Platform Backend...
cd /d "%~dp0"
"C:\Users\睿\.workbuddy\binaries\python\envs\ai-lang-platform\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
