from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.db import IntegrityError
from ninja.security import django_auth
from ninja import Router

from apps.logs.seeders import seed_backdated_logs

from .models import User
from .schemas import AuthOut, LoginIn, RegisterIn, UserOut

router = Router()


@router.post('/register', response={201: AuthOut, 400: dict})
def register(request, payload: RegisterIn):
    try:
        user = User.objects.create_user(
            username=payload.username,
            password=payload.password,
            email=payload.email or '',
        )
    except IntegrityError:
        return 400, {'detail': 'Username already taken'}
    seed_backdated_logs(user, count=10, start_offset=1)
    auth_login(request, user)
    return 201, {'user': UserOut.from_orm(user)}


@router.post('/login', response={200: AuthOut, 401: dict})
def login(request, payload: LoginIn):
    user = authenticate(request, username=payload.username, password=payload.password)
    if not user:
        return 401, {'detail': 'Invalid credentials'}
    auth_login(request, user)
    return 200, {'user': UserOut.from_orm(user)}


@router.post('/logout', auth=django_auth, response={204: None})
def logout(request):
    auth_logout(request)
    return 204, None


@router.get('/me', auth=django_auth, response=UserOut)
def me(request):
    return request.auth
