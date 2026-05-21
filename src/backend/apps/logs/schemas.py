from datetime import date, datetime
from typing import Literal

from ninja import Schema
from pydantic import Field

SegmentType = Literal['off_duty', 'sleeper', 'driving', 'on_duty']


class SegmentIn(Schema):
    type: SegmentType
    start_minute: int = Field(ge=0, le=1440)
    end_minute: int = Field(ge=0, le=1440)
    location: str = ''
    notes: str = ''


class SegmentOut(SegmentIn):
    id: int


class DailyLogIn(Schema):
    trip_id: int | None = None
    log_date: date
    from_location: str = ''
    to_location: str = ''
    truck_number: str = ''
    trailer_number: str = ''
    carrier_name: str = ''
    miles_today: int = 0
    total_mileage: int = 0
    main_office_address: str = ''
    home_terminal_address: str = ''


class DailyLogPatch(Schema):
    trip_id: int | None = None
    from_location: str | None = None
    to_location: str | None = None
    truck_number: str | None = None
    trailer_number: str | None = None
    carrier_name: str | None = None
    miles_today: int | None = None
    total_mileage: int | None = None
    main_office_address: str | None = None
    home_terminal_address: str | None = None


class DailyLogOut(Schema):
    id: int
    trip_id: int | None
    log_date: date
    from_location: str
    to_location: str
    truck_number: str
    trailer_number: str
    carrier_name: str
    miles_today: int
    total_mileage: int
    main_office_address: str
    home_terminal_address: str
    total_driving_minutes: int
    total_on_duty_minutes: int
    segments: list[SegmentOut]
    created_at: datetime
    updated_at: datetime


class PaginatedDailyLogs(Schema):
    items: list[DailyLogOut]
    total: int
    page: int
    page_size: int
    has_next: bool
