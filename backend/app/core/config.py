import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
SECRET_KEY = os.getenv("JWT_SECRET", "change_this_secret_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# Was hardcoded as MODEL = "gpt-4o-mini" directly in app/ai/manager_service.py
# -- moved here so the model name isn't duplicated/hardcoded throughout the
# app (section 26/27's explicit requirement).
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
# Minimum seconds between two stress declarations from the same session --
# prevents the self-report control from becoming a way to spam telemetry
# (section 5/19/29 of the stress-declaration spec). Centralized here
# rather than a literal scattered across app/api/sessions.py.
STRESS_DECLARATION_MIN_INTERVAL_SECONDS = int(os.getenv("STRESS_DECLARATION_MIN_INTERVAL_SECONDS", "300"))