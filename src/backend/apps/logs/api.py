from datetime import date as date_cls, timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from ninja import Query, Router
from ninja.security import django_auth

from .models import DailyLog, DutySegment
from .schemas import (
    DailyLogIn,
    DailyLogOut,
    DailyLogPatch,
    PaginatedDailyLogs,
    SegmentIn,
    SegmentOut,
)

router = Router(auth=django_auth)


def _is_editable(log: DailyLog) -> bool:
    # Allow ±1 day from server today to absorb client/server timezone skew.
    today = date_cls.today()
    return abs((log.log_date - today).days) <= 1


def _recompute_totals(log: DailyLog) -> None:
    driving = 0
    on_duty = 0
    for seg in log.segments.all():
        dur = seg.end_minute - seg.start_minute
        if seg.type == DutySegment.Type.DRIVING:
            driving += dur
        elif seg.type == DutySegment.Type.ON_DUTY:
            on_duty += dur
    log.total_driving_minutes = driving
    log.total_on_duty_minutes = driving + on_duty
    log.save(update_fields=['total_driving_minutes', 'total_on_duty_minutes', 'updated_at'])


def _validate_segments(segments: list[SegmentIn]) -> None:
    sorted_segs = sorted(segments, key=lambda s: s.start_minute)
    for i, s in enumerate(sorted_segs):
        if s.end_minute <= s.start_minute:
            raise ValueError(f'Segment {i}: end_minute must be > start_minute')
        if i > 0 and s.start_minute < sorted_segs[i - 1].end_minute:
            raise ValueError(f'Segments overlap at index {i}')


@router.get('/', response=PaginatedDailyLogs)
def list_logs(
    request,
    date_from: date_cls | None = Query(None),
    date_to: date_cls | None = Query(None),
    trip_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=100),
):
    qs = DailyLog.objects.filter(user=request.auth).prefetch_related('segments')
    if date_from:
        qs = qs.filter(log_date__gte=date_from)
    if date_to:
        qs = qs.filter(log_date__lte=date_to)
    if trip_id:
        qs = qs.filter(trip_id=trip_id)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'has_next': offset + len(items) < total,
    }


@router.get('/today', response={200: DailyLogOut, 404: dict})
def get_today(request):
    log = (
        DailyLog.objects
        .filter(user=request.auth, log_date=date_cls.today())
        .prefetch_related('segments')
        .first()
    )
    if not log:
        return 404, {'detail': 'No log for today'}
    return 200, log


@router.post('/', response={201: DailyLogOut, 400: dict})
def create_log(request, payload: DailyLogIn):
    if DailyLog.objects.filter(user=request.auth, log_date=payload.log_date).exists():
        return 400, {'detail': 'Log already exists for date'}
    log = DailyLog.objects.create(user=request.auth, **payload.dict())
    return 201, log


@router.get('/{log_id}', response=DailyLogOut)
def get_log(request, log_id: int):
    return get_object_or_404(
        DailyLog.objects.prefetch_related('segments'),
        id=log_id,
        user=request.auth,
    )


@router.patch('/{log_id}', response={200: DailyLogOut, 403: dict})
def update_log(request, log_id: int, payload: DailyLogPatch):
    log = get_object_or_404(DailyLog, id=log_id, user=request.auth)
    if not _is_editable(log):
        return 403, {'detail': 'Only today\'s log is editable'}
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(log, field, value)
    log.save()
    return 200, log


@router.delete('/{log_id}', response={204: None, 403: dict})
def delete_log(request, log_id: int):
    log = get_object_or_404(DailyLog, id=log_id, user=request.auth)
    if not _is_editable(log):
        return 403, {'detail': 'Only today\'s log is deletable'}
    log.delete()
    return 204, None


@router.put('/{log_id}/segments', response={200: list[SegmentOut], 400: dict, 403: dict})
def replace_segments(request, log_id: int, payload: list[SegmentIn]):
    log = get_object_or_404(DailyLog, id=log_id, user=request.auth)
    if not _is_editable(log):
        return 403, {'detail': 'Only today\'s log is editable'}
    try:
        _validate_segments(payload)
    except ValueError as exc:
        return 400, {'detail': str(exc)}

    with transaction.atomic():
        log.segments.all().delete()
        DutySegment.objects.bulk_create([
            DutySegment(daily_log=log, **s.dict()) for s in payload
        ])
        _recompute_totals(log)

    return 200, list(log.segments.all())
