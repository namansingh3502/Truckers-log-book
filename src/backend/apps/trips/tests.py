from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from .models import Trip


class TripApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = get_user_model().objects.create_user(
            username='driver',
            password='test-pass',
        )
        self.other_user = get_user_model().objects.create_user(
            username='other-driver',
            password='test-pass',
        )
        self.client.force_login(self.user)

    def test_list_trips_returns_only_authenticated_users_trips(self):
        own_trip = Trip.objects.create(
            user=self.user,
            current_location='Denver, CO',
            pickup_location='Boulder, CO',
            dropoff_location='Kansas City, MO',
        )
        Trip.objects.create(
            user=self.other_user,
            current_location='Austin, TX',
            pickup_location='Dallas, TX',
            dropoff_location='Houston, TX',
        )

        response = self.client.get('/api/trips/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([item['id'] for item in payload], [own_trip.id])

    def test_create_trip_persists_route_geometry_and_fields(self):
        payload = {
            'current_location': 'Denver, CO',
            'pickup_location': 'Boulder, CO',
            'dropoff_location': 'Kansas City, MO',
            'current_cycle_used_hours': '12.50',
            'distance_miles': '603.25',
            'driving_hours': '9.75',
            'total_trip_hours': '12.00',
            'fuel_stop_count': 1,
            'route_geometry': [{'lat': 39.7392, 'lon': -104.9903}],
            'geocoded': {'pickup': {'lat': 40.015, 'lon': -105.2705}},
        }

        response = self.client.post(
            '/api/trips/',
            data=payload,
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        trip = Trip.objects.get(id=response.json()['id'])
        self.assertEqual(trip.user, self.user)
        self.assertEqual(trip.current_cycle_used_hours, Decimal('12.50'))
        self.assertEqual(trip.route_geometry, [{'lat': 39.7392, 'lon': -104.9903}])
        self.assertEqual(trip.geocoded['pickup']['lat'], 40.015)

    def test_get_trip_enforces_ownership(self):
        trip = Trip.objects.create(
            user=self.other_user,
            current_location='Austin, TX',
            pickup_location='Dallas, TX',
            dropoff_location='Houston, TX',
        )

        response = self.client.get(f'/api/trips/{trip.id}')

        self.assertEqual(response.status_code, 404)

    def test_patch_trip_updates_only_supplied_fields(self):
        trip = Trip.objects.create(
            user=self.user,
            current_location='Denver, CO',
            pickup_location='Boulder, CO',
            dropoff_location='Kansas City, MO',
            route_geometry=[{'lat': 1, 'lon': 2}],
        )

        response = self.client.patch(
            f'/api/trips/{trip.id}',
            data={
                'dropoff_location': 'Omaha, NE',
                'route_geometry': [{'lat': 41.2565, 'lon': -95.9345}],
            },
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        trip.refresh_from_db()
        self.assertEqual(trip.current_location, 'Denver, CO')
        self.assertEqual(trip.dropoff_location, 'Omaha, NE')
        self.assertEqual(trip.route_geometry, [{'lat': 41.2565, 'lon': -95.9345}])

    def test_delete_trip_removes_owned_trip(self):
        trip = Trip.objects.create(
            user=self.user,
            current_location='Denver, CO',
            pickup_location='Boulder, CO',
            dropoff_location='Kansas City, MO',
        )

        response = self.client.delete(f'/api/trips/{trip.id}')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Trip.objects.filter(id=trip.id).exists())
