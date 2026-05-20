from ninja import NinjaAPI

from apps.accounts.api import router as accounts_router
from apps.logs.api import router as logs_router
from apps.trips.api import router as trips_router

api = NinjaAPI(title='ELB Logbook', version='1.0.0')

api.add_router('/auth', accounts_router)
api.add_router('/trips', trips_router)
api.add_router('/logs', logs_router)
