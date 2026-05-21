#!/bin/sh
set -e

python - <<'PY'
import os
import time

import psycopg

database_url = os.environ.get("DATABASE_URL")
if database_url:
    for attempt in range(60):
        try:
            with psycopg.connect(database_url):
                break
        except psycopg.OperationalError:
            if attempt == 59:
                raise
            time.sleep(1)
PY

python manage.py migrate --noinput

exec "$@"
