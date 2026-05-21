from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    cdl_number = models.CharField(max_length=64, blank=True)
    home_terminal_address = models.CharField(max_length=255, blank=True)
    main_office_address = models.CharField(max_length=255, blank=True)
