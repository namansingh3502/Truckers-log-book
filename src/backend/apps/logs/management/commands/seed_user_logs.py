from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

from apps.logs.seeders import seed_backdated_logs


class Command(BaseCommand):
    help = 'Seed N backdated DailyLog rows for a user, starting from (today - start_offset).'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str)
        parser.add_argument('--count', type=int, default=10)
        parser.add_argument('--start-offset', type=int, default=1)
        parser.add_argument('--seed', type=int, default=None,
                            help='Optional RNG seed for deterministic output.')

    def handle(self, *args, **opts):
        User = get_user_model()
        try:
            user = User.objects.get(username=opts['username'])
        except User.DoesNotExist as exc:
            raise CommandError(f'User not found: {opts["username"]}') from exc

        created = seed_backdated_logs(
            user,
            count=opts['count'],
            start_offset=opts['start_offset'],
            seed=opts['seed'],
        )
        self.stdout.write(self.style.SUCCESS(
            f'Created {len(created)} logs for {user.username} '
            f'(skipped {opts["count"] - len(created)} existing dates).'
        ))
