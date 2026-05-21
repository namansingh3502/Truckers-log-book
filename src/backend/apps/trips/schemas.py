from datetime import datetime
from decimal import Decimal

from ninja import Schema
from pydantic import Field


class LatLon(Schema):
    lat: float
    lon: float


class TripIn(Schema):
    current_location: str
    pickup_location: str
    dropoff_location: str
    current_cycle_used_hours: Decimal = Field(ge=0, le=70, default=Decimal('0'))
    distance_miles: Decimal | None = None
    driving_hours: Decimal | None = None
    total_trip_hours: Decimal | None = None
    fuel_stop_count: int | None = None
    route_geometry: list[LatLon] = Field(default_factory=list)
    geocoded: dict = Field(default_factory=dict)


class TripPatch(Schema):
    current_location: str | None = None
    pickup_location: str | None = None
    dropoff_location: str | None = None
    current_cycle_used_hours: Decimal | None = Field(default=None, ge=0, le=70)
    distance_miles: Decimal | None = None
    driving_hours: Decimal | None = None
    total_trip_hours: Decimal | None = None
    fuel_stop_count: int | None = None
    route_geometry: list[LatLon] | None = None
    geocoded: dict | None = None


class TripOut(Schema):
    id: int
    current_location: str
    pickup_location: str
    dropoff_location: str
    current_cycle_used_hours: Decimal
    distance_miles: Decimal | None
    driving_hours: Decimal | None
    total_trip_hours: Decimal | None
    fuel_stop_count: int | None
    route_geometry: list
    geocoded: dict
    created_at: datetime
    updated_at: datetime
