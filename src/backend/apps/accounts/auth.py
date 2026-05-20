from ninja.security import HttpBearer

from .models import Token


class AuthBearer(HttpBearer):
    def authenticate(self, request, token: str):
        try:
            row = Token.objects.select_related('user').get(key=token)
        except Token.DoesNotExist:
            return None
        request.user = row.user
        return row.user
