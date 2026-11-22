import re
from collections.abc import Mapping
from datetime import datetime


def string_value(values: Mapping[str, object], key: str) -> str:
    value = values.get(key)
    return value if isinstance(value, str) else ""


def is_valid_email(email: object) -> bool:
    if not isinstance(email, str) or email != email.strip() or any(
        character.isspace() for character in email
    ):
        return False
    if email.count("@") != 1:
        return False
    local, _, domain = email.partition("@")
    return bool(
        local
        and domain
        and "." in domain
        and not domain.startswith(".")
        and not domain.endswith(".")
    )


def is_valid_password(password: object, minimum_length: int = 8) -> bool:
    return isinstance(password, str) and len(password) >= minimum_length


_PHONE_CHARACTERS = set("0123456789 +-().")


def is_valid_phone(phone: object) -> bool:
    """Accept common phone formats such as 514-555-0123 or +1 (514) 555 0123."""
    if not isinstance(phone, str) or not set(phone) <= _PHONE_CHARACTERS:
        return False
    digits = sum(character.isdigit() for character in phone)
    return 7 <= digits <= 15


def is_valid_profile(name: object, email: object) -> bool:
    return isinstance(name, str) and bool(name.strip()) and is_valid_email(email)


def is_valid_card_number(card_number: object) -> bool:
    return (
        isinstance(card_number, str)
        and len(card_number) == 16
        and card_number.isdigit()
    )


def is_valid_expiration_date(expiration_date: object) -> bool:
    if (
        not isinstance(expiration_date, str)
        or len(expiration_date) != 5
        or expiration_date[2] != "/"
        or not expiration_date[:2].isdigit()
        or not expiration_date[3:].isdigit()
    ):
        return False
    month, year = map(int, expiration_date.split("/"))
    return 1 <= month <= 12 and 0 <= year <= 99


def is_valid_cvv(cvv: object) -> bool:
    return isinstance(cvv, str) and len(cvv) == 3 and cvv.isdigit()


# Only paths the upload route itself hands out: /uploads/<32 hex>.<jpg|png|webp>.
_IMAGE_PATH = re.compile(r"/uploads/[0-9a-f]{32}\.(?:jpg|png|webp)")


def is_valid_image_path(image_path: object) -> bool:
    """None (no image) or a path returned by POST /api/uploads."""
    return image_path is None or (
        isinstance(image_path, str) and _IMAGE_PATH.fullmatch(image_path) is not None
    )


def is_valid_datetime_text(value: object) -> bool:
    """SQLite datetime text as the app stores it: "YYYY-MM-DD HH:MM:SS"."""
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return False
    return True
