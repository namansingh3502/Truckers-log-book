from django.shortcuts import get_object_or_404
from ninja import Router

from apps.accounts.auth import SessionKeyAuth
from .models import Trip
from .schemas import TripIn, TripOut, TripPatch

router = Router(auth=SessionKeyAuth())


@router.get('/', response=list[TripOut])
def list_trips(request):
    return Trip.objects.filter(user=request.auth)


@router.post('/', response={201: TripOut})
def create_trip(request, payload: TripIn):
    data = payload.dict()
    data['route_geometry'] = [p if isinstance(p, dict) else p.dict() for p in data.get('route_geometry', [])]
    trip = Trip.objects.create(user=request.auth, **data)
    return 201, trip


@router.get('/{trip_id}', response=TripOut)
def get_trip(request, trip_id: int):
    return get_object_or_404(Trip, id=trip_id, user=request.auth)


@router.patch('/{trip_id}', response=TripOut)
def update_trip(request, trip_id: int, payload: TripPatch):
    trip = get_object_or_404(Trip, id=trip_id, user=request.auth)
    for field, value in payload.dict(exclude_unset=True).items():
        if field == 'route_geometry' and value is not None:
            value = [p if isinstance(p, dict) else p.dict() for p in value]
        setattr(trip, field, value)
    trip.save()
    return trip


@router.delete('/{trip_id}', response={204: None})
def delete_trip(request, trip_id: int):
    trip = get_object_or_404(Trip, id=trip_id, user=request.auth)
    trip.delete()
    return 204, None
