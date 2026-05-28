@echo off
REM Quick-start for Windows
cd /d "%~dp0backend"

if not exist venv (
  echo Creating virtual environment...
  python -m venv venv
)

call venv\Scripts\activate.bat
pip install -q -r requirements.txt

if not exist .env (
  echo.
  echo .env not found. Copy .env.example to .env and fill in OPENAI_API_KEY.
  copy .env.example .env
  notepad .env
)

python main.py
