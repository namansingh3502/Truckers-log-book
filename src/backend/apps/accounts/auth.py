from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from ninja.security import APIKeyHeader


class SessionKeyAuth(APIKeyHeader):
    param_name = 'X-Session-Key'

    def authenticate(self, request, key: str | None):
        if getattr(request.user, 'is_authenticated', False):
            return request.user
        auth_header = request.headers.get('Authorization', '')
        if not key and auth_header.startswith('Session '):
            key = auth_header.removeprefix('Session ').strip()
        if not key:
            return None

        session = SessionStore(session_key=key)
        try:
            data = session.load()
        except Exception:
            return None

        user_id = data.get('_auth_user_id')
        if not user_id:
            return None

        try:
            user = get_user_model().objects.get(pk=user_id)
        except get_user_model().DoesNotExist:
            return None
        request.user = user
        return user
