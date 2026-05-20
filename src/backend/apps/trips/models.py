from django.conf import settings
from django.db import models


class Trip(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='trips',
    )
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_used_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    distance_miles = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    driving_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    total_trip_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    fuel_stop_count = models.PositiveIntegerField(null=True, blank=True)

    route_geometry = models.JSONField(default=list, blank=True)  # [{lat, lon}, ...]
    geocoded = models.JSONField(default=dict, blank=True)        # {current, pickup, dropoff}

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', '-created_at'])]

    def __str__(self) -> str:
        return f'{self.pickup_location} → {self.dropoff_location}'
