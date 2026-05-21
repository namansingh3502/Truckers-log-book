import random
from datetime import date as date_cls, timedelta

from django.db import transaction

from .models import DailyLog, DutySegment


_CARRIERS = [
    'Swift Logistics', 'Pioneer Freight', 'Ironhorse Trucking',
    'Blue Ridge Carriers', 'Coastline Transport', 'Summit Haulers',
    'Redwood Express', 'Cascade Freight Co', 'Liberty Lines',
]
_CITIES = [
    'Dallas, TX', 'Phoenix, AZ', 'Denver, CO', 'Atlanta, GA', 'Chicago, IL',
    'Memphis, TN', 'Kansas City, MO', 'Salt Lake City, UT', 'Albuquerque, NM',
    'Oklahoma City, OK', 'Little Rock, AR', 'Nashville, TN', 'Indianapolis, IN',
]

_TRUCK_STOPS = [
    "Pilot Travel Center", "Flying J", "Love's Travel Stop", "TA Travel Center",
    "Petro Stopping Center", "Sapp Bros", "Iowa 80 Truckstop", "Roady's",
]
_HIGHWAYS = ['I-40 W', 'I-40 E', 'I-35 N', 'I-35 S', 'I-10 W', 'I-10 E', 'I-70 W', 'I-80 E', 'US-287 N']

_REMARKS = {
    'off_duty': ['Off duty', 'Meal break', 'Rest break', 'Personal time'],
    'sleeper': ['Sleeper berth', 'Required 10h rest', 'Overnight rest'],
    'driving': ['Linehaul driving', 'Highway run', 'Route to consignee', 'Backhaul leg'],
    'on_duty': ['Pre-trip inspection', 'Post-trip inspection', 'Loading', 'Unloading',
                'Fueling', 'DOT inspection', 'Waiting at dock'],
}


def _segment_location(rng: random.Random, seg_type: str, from_city: str, to_city: str) -> str:
    if seg_type == DutySegment.Type.DRIVING:
        return f'{rng.choice(_HIGHWAYS)} ({from_city} → {to_city})'
    if seg_type == DutySegment.Type.ON_DUTY:
        return rng.choice([from_city, to_city])
    # off_duty / sleeper — typically at a truck stop or terminal
    return f'{rng.choice(_TRUCK_STOPS)}, {rng.choice([from_city, to_city])}'


def _random_segments(rng: random.Random) -> list[tuple[str, int, int]]:
    """Build a randomized 24h duty day. Returns list of (type, start, end) covering 0..1440."""
    # Randomize durations within FMCSA-ish bounds, then fill remainder with off_duty.
    sleeper = rng.randint(420, 540)        # 7–9h
    driving = rng.randint(360, 660)        # 6–11h
    on_duty = rng.randint(60, 180)         # 1–3h non-driving on-duty
    used = sleeper + driving + on_duty
    off = max(0, 1440 - used)
    # Split off_duty into pre/post chunks.
    off_pre = rng.randint(0, off)
    off_post = off - off_pre

    segs: list[tuple[str, int, int]] = []
    cursor = 0
    blocks = [
        (DutySegment.Type.OFF_DUTY, off_pre),
        (DutySegment.Type.SLEEPER, sleeper),
        (DutySegment.Type.DRIVING, driving),
        (DutySegment.Type.ON_DUTY, on_duty),
        (DutySegment.Type.OFF_DUTY, off_post),
    ]
    for t, dur in blocks:
        if dur <= 0:
            continue
        end = min(1440, cursor + dur)
        if end > cursor:
            segs.append((t, cursor, end))
        cursor = end
    if cursor < 1440 and segs:
        # Pad final segment to reach 1440 exactly.
        t, s, _ = segs[-1]
        segs[-1] = (t, s, 1440)
    return segs


@transaction.atomic
def seed_backdated_logs(
    user,
    count: int = 10,
    start_offset: int = 1,
    seed: int | None = None,
) -> list[DailyLog]:
    """Create `count` randomized DailyLog rows for `user`, dated from (today - start_offset) backward.

    Skips dates that already have a log (unique_user_log_date).
    Pass `seed` for deterministic output (tests).
    """
    rng = random.Random(seed) if seed is not None else random.Random()
    today = date_cls.today()
    carrier = rng.choice(_CARRIERS)
    truck = f'T-{rng.randint(100, 999)}'
    trailer = f'TR-{rng.randint(1000, 9999)}'

    created: list[DailyLog] = []
    for i in range(count):
        log_date = today - timedelta(days=start_offset + i)
        if DailyLog.objects.filter(user=user, log_date=log_date).exists():
            continue

        from_city, to_city = rng.sample(_CITIES, 2)
        miles_today = rng.randint(280, 820)

        log = DailyLog.objects.create(
            user=user,
            log_date=log_date,
            from_location=from_city,
            to_location=to_city,
            truck_number=truck,
            trailer_number=trailer,
            carrier_name=carrier,
            miles_today=miles_today,
            total_mileage=miles_today,
            main_office_address=getattr(user, 'main_office_address', '') or '',
            home_terminal_address=getattr(user, 'home_terminal_address', '') or '',
        )

        segments = _random_segments(rng)
        DutySegment.objects.bulk_create([
            DutySegment(
                daily_log=log,
                type=t,
                start_minute=s,
                end_minute=e,
                location=_segment_location(rng, t, from_city, to_city),
                notes=rng.choice(_REMARKS[t]),
            )
            for t, s, e in segments
        ])
        driving = sum(e - s for t, s, e in segments if t == DutySegment.Type.DRIVING)
        on_duty = sum(e - s for t, s, e in segments if t == DutySegment.Type.ON_DUTY)
        log.total_driving_minutes = driving
        log.total_on_duty_minutes = driving + on_duty
        log.save(update_fields=['total_driving_minutes', 'total_on_duty_minutes', 'updated_at'])
        created.append(log)
    return created
