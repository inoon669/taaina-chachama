#!/usr/bin/env bash
# Quick-start for Mac/Linux
set -e
cd "$(dirname "$0")/backend"

if [ ! -d venv ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Created .env — please fill in OPENAI_API_KEY before continuing."
  ${EDITOR:-nano} .env
fi

python main.py
