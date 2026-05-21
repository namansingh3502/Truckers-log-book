from django.conf import settings
from django.db import models


class DailyLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='daily_logs',
    )
    trip = models.ForeignKey(
        'trips.Trip',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_logs',
    )
    log_date = models.DateField(db_index=True)

    from_location = models.CharField(max_length=255, blank=True)
    to_location = models.CharField(max_length=255, blank=True)

    truck_number = models.CharField(max_length=64, blank=True)
    trailer_number = models.CharField(max_length=64, blank=True)
    carrier_name = models.CharField(max_length=128, blank=True)

    miles_today = models.PositiveIntegerField(default=0)
    total_mileage = models.PositiveIntegerField(default=0)

    main_office_address = models.CharField(max_length=255, blank=True)
    home_terminal_address = models.CharField(max_length=255, blank=True)

    total_driving_minutes = models.PositiveIntegerField(default=0)
    total_on_duty_minutes = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-log_date']
        constraints = [
            models.UniqueConstraint(fields=['user', 'log_date'], name='unique_user_log_date'),
        ]
        indexes = [models.Index(fields=['user', '-log_date'])]

    def __str__(self) -> str:
        return f'{self.user_id} {self.log_date}'


class DutySegment(models.Model):
    class Type(models.TextChoices):
        OFF_DUTY = 'off_duty', 'Off Duty'
        SLEEPER = 'sleeper', 'Sleeper'
        DRIVING = 'driving', 'Driving'
        ON_DUTY = 'on_duty', 'On Duty'

    daily_log = models.ForeignKey(
        DailyLog,
        on_delete=models.CASCADE,
        related_name='segments',
    )
    type = models.CharField(max_length=16, choices=Type.choices)
    start_minute = models.PositiveIntegerField()  # 0..1440
    end_minute = models.PositiveIntegerField()    # 0..1440
    location = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['daily_log', 'start_minute']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_minute__gt=models.F('start_minute')),
                name='segment_end_after_start',
            ),
            models.CheckConstraint(
                condition=models.Q(start_minute__gte=0) & models.Q(end_minute__lte=1440),
                name='segment_within_day',
            ),
        ]
        indexes = [models.Index(fields=['daily_log', 'start_minute'])]

    def __str__(self) -> str:
        return f'{self.type} {self.start_minute}-{self.end_minute}'
