import secrets

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    cdl_number = models.CharField(max_length=64, blank=True)
    home_terminal_address = models.CharField(max_length=255, blank=True)
    main_office_address = models.CharField(max_length=255, blank=True)


def _generate_token() -> str:
    return secrets.token_hex(32)


class Token(models.Model):
    key = models.CharField(max_length=128, unique=True, default=_generate_token, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tokens',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'{self.user_id}:{self.key[:8]}'
