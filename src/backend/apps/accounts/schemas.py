from ninja import Schema


class RegisterIn(Schema):
    username: str
    password: str
    email: str | None = None


class LoginIn(Schema):
    username: str
    password: str


class UserOut(Schema):
    id: int
    username: str
    email: str | None = None
    cdl_number: str = ''
    home_terminal_address: str = ''
    main_office_address: str = ''


class AuthOut(Schema):
    session_key: str
    user: UserOut
