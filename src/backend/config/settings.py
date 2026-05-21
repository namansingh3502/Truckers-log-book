"""
Django settings for config project.
"""

from pathlib import Path

import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, True),
    ALLOWED_HOSTS=(list, ['localhost', '127.0.0.1']),
    CORS_ALLOWED_ORIGINS=(list, ['http://localhost:5173', 'http://127.0.0.1:5173']),
    CSRF_TRUSTED_ORIGINS=(list, ['http://localhost:5173', 'http://127.0.0.1:5173']),
    SESSION_COOKIE_SECURE=(bool, False),
    CSRF_COOKIE_SECURE=(bool, False),
    SESSION_COOKIE_SAMESITE=(str, 'Lax'),
    CSRF_COOKIE_SAMESITE=(str, 'Lax'),
)

# Read .env if present (local dev). On Vercel, env vars come from the
# dashboard; the file won't exist and read_env should be a no-op.
_env_file = BASE_DIR / '.env'
if _env_file.exists():
    environ.Env.read_env(_env_file)

SECRET_KEY = env(
    'SECRET_KEY',
    default='django-insecure-tf--^e^fg$$g(0o_kx1-0d1o%-ytmhmcb!a6git2!damjox^!c',
)

DEBUG = env('DEBUG')

ALLOWED_HOSTS = env('ALLOWED_HOSTS')


INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'apps.accounts',
    'apps.trips',
    'apps.logs',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

AUTH_USER_MODEL = 'accounts.User'

CORS_ALLOWED_ORIGINS = env('CORS_ALLOWED_ORIGINS')
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, 'authorization', 'x-session-key')
CSRF_TRUSTED_ORIGINS = env('CSRF_TRUSTED_ORIGINS')

SESSION_COOKIE_SECURE = env('SESSION_COOKIE_SECURE', default=not DEBUG)
CSRF_COOKIE_SECURE = env('CSRF_COOKIE_SECURE', default=not DEBUG)
SESSION_COOKIE_SAMESITE = env('SESSION_COOKIE_SAMESITE', default='None' if not DEBUG else 'Lax')
CSRF_COOKIE_SAMESITE = env('CSRF_COOKIE_SAMESITE', default='None' if not DEBUG else 'Lax')

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': env.db('DATABASE_URL', default=f'sqlite:///{BASE_DIR / "db.sqlite3"}'),
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
