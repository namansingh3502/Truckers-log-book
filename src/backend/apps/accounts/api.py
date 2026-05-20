from django.contrib.auth import authenticate
from django.db import IntegrityError
from ninja import Router

from apps.logs.seeders import seed_backdated_logs

from .auth import AuthBearer
from .models import Token, User
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
    token = Token.objects.create(user=user)
    return 201, {'token': token.key, 'user': UserOut.from_orm(user)}


@router.post('/login', response={200: AuthOut, 401: dict})
def login(request, payload: LoginIn):
    user = authenticate(request, username=payload.username, password=payload.password)
    if not user:
        return 401, {'detail': 'Invalid credentials'}
    token = Token.objects.create(user=user)
    return 200, {'token': token.key, 'user': UserOut.from_orm(user)}


@router.post('/logout', auth=AuthBearer(), response={204: None})
def logout(request):
    auth_header = request.headers.get('Authorization', '')
    key = auth_header.removeprefix('Bearer ').strip()
    Token.objects.filter(key=key).delete()
    return 204, None


@router.get('/me', auth=AuthBearer(), response=UserOut)
def me(request):
    return request.auth
