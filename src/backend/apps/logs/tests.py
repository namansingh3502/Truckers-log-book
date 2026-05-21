from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.trips.models import Trip
from .models import DailyLog, DutySegment


class LogApiTests(TestCase):
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
        self.trip = Trip.objects.create(
            user=self.user,
            current_location='Denver, CO',
            pickup_location='Boulder, CO',
            dropoff_location='Kansas City, MO',
        )

    def _create_log(self, user=None, log_date=None, **kwargs):
        return DailyLog.objects.create(
            user=user or self.user,
            log_date=log_date or date.today(),
            **kwargs,
        )

    def test_list_logs_paginates_filters_and_scopes_to_user(self):
        first = self._create_log(
            log_date=date(2026, 1, 1),
            trip=self.trip,
            from_location='Denver',
        )
        second = self._create_log(
            log_date=date(2026, 1, 2),
            trip=self.trip,
            from_location='Kansas City',
        )
        self._create_log(log_date=date(2026, 1, 3), from_location='Omaha')
        self._create_log(
            user=self.other_user,
            log_date=date(2026, 1, 2),
            from_location='Hidden',
        )

        response = self.client.get(
            '/api/logs/',
            {
                'date_from': '2026-01-01',
                'date_to': '2026-01-02',
                'trip_id': self.trip.id,
                'page': 1,
                'page_size': 1,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['total'], 2)
        self.assertEqual(payload['page'], 1)
        self.assertEqual(payload['page_size'], 1)
        self.assertTrue(payload['has_next'])
        self.assertEqual(payload['items'][0]['id'], second.id)
        self.assertNotEqual(payload['items'][0]['id'], first.id)

    def test_get_today_returns_log_or_404(self):
        response = self.client.get('/api/logs/today')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {'detail': 'No log for today'})

        today_log = self._create_log(
            log_date=date.today(),
            from_location='Denver',
            to_location='Kansas City',
        )
        DutySegment.objects.create(
            daily_log=today_log,
            type=DutySegment.Type.DRIVING,
            start_minute=60,
            end_minute=120,
        )

        response = self.client.get('/api/logs/today')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['id'], today_log.id)
        self.assertEqual(len(payload['segments']), 1)

    def test_create_log_rejects_duplicate_date_for_same_user(self):
        self._create_log(log_date=date(2026, 1, 4))
        payload = {
            'log_date': '2026-01-04',
            'trip_id': self.trip.id,
            'from_location': 'Denver',
            'to_location': 'Kansas City',
            'miles_today': 610,
            'total_mileage': 12000,
        }

        response = self.client.post(
            '/api/logs/',
            data=payload,
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'detail': 'Log already exists for date'})

    def test_create_log_allows_same_date_for_different_user_and_sets_trip(self):
        self._create_log(user=self.other_user, log_date=date(2026, 1, 4))
        payload = {
            'log_date': '2026-01-04',
            'trip_id': self.trip.id,
            'from_location': 'Denver',
            'to_location': 'Kansas City',
        }

        response = self.client.post(
            '/api/logs/',
            data=payload,
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        log = DailyLog.objects.get(id=response.json()['id'])
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.trip, self.trip)

    def test_get_log_enforces_ownership(self):
        log = self._create_log(user=self.other_user, log_date=date(2026, 1, 5))

        response = self.client.get(f'/api/logs/{log.id}')

        self.assertEqual(response.status_code, 404)

    def test_patch_log_updates_editable_log(self):
        log = self._create_log(log_date=date.today(), from_location='Denver')

        response = self.client.patch(
            f'/api/logs/{log.id}',
            data={'from_location': 'Boulder', 'miles_today': 200},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        log.refresh_from_db()
        self.assertEqual(log.from_location, 'Boulder')
        self.assertEqual(log.miles_today, 200)

    def test_patch_and_delete_reject_non_editable_logs(self):
        old_log = self._create_log(log_date=date.today() - timedelta(days=3))

        patch_response = self.client.patch(
            f'/api/logs/{old_log.id}',
            data={'from_location': 'Boulder'},
            content_type='application/json',
        )
        delete_response = self.client.delete(f'/api/logs/{old_log.id}')

        self.assertEqual(patch_response.status_code, 403)
        self.assertEqual(patch_response.json(), {'detail': "Only today's log is editable"})
        self.assertEqual(delete_response.status_code, 403)
        self.assertEqual(delete_response.json(), {'detail': "Only today's log is deletable"})
        self.assertTrue(DailyLog.objects.filter(id=old_log.id).exists())

    def test_delete_log_removes_editable_log(self):
        log = self._create_log(log_date=date.today())

        response = self.client.delete(f'/api/logs/{log.id}')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(DailyLog.objects.filter(id=log.id).exists())

    def test_replace_segments_validates_overlap_and_recomputes_totals(self):
        log = self._create_log(log_date=date.today())

        invalid_response = self.client.put(
            f'/api/logs/{log.id}/segments',
            data=[
                {'type': 'driving', 'start_minute': 60, 'end_minute': 180},
                {'type': 'on_duty', 'start_minute': 120, 'end_minute': 240},
            ],
            content_type='application/json',
        )

        self.assertEqual(invalid_response.status_code, 400)
        self.assertEqual(invalid_response.json(), {'detail': 'Segments overlap at index 1'})

        response = self.client.put(
            f'/api/logs/{log.id}/segments',
            data=[
                {'type': 'off_duty', 'start_minute': 0, 'end_minute': 60},
                {'type': 'driving', 'start_minute': 60, 'end_minute': 180},
                {'type': 'on_duty', 'start_minute': 180, 'end_minute': 240},
            ],
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 3)
        log.refresh_from_db()
        self.assertEqual(log.total_driving_minutes, 120)
        self.assertEqual(log.total_on_duty_minutes, 180)

    def test_replace_segments_rejects_non_editable_log(self):
        old_log = self._create_log(log_date=date.today() - timedelta(days=3))

        response = self.client.put(
            f'/api/logs/{old_log.id}/segments',
            data=[{'type': 'driving', 'start_minute': 60, 'end_minute': 180}],
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {'detail': "Only today's log is editable"})
