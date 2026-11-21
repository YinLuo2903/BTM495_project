import base64
import binascii
import hashlib
import hmac
import secrets
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.models.admin import Admin
from backend.models.customer import Customer
from backend.models.user import User
from backend.utils.constants import DatabaseColumns, DatabaseTables
from backend.utils.response import Response
from backend.utils.sqlite import SQLiteQuery, SQLCondition
from backend.utils.validators import (
    is_valid_email,
    is_valid_password,
    is_valid_phone,
    is_valid_profile,
)
from database.sqlite_database import DB_PATH


_PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
_PASSWORD_HASH_ITERATIONS = 600_000
_PASSWORD_HASH_SALT_BYTES = 16


class ManageProfile:
    def __init__(self, database_path: str | Path = DB_PATH) -> None:
        self.database = SQLiteQuery(database_path)

    def createAccount(self, user: User, password: str) -> User:
        self._validateProfile(user)
        if not self.validatePassword(password):
            raise ValueError("Password must be at least 8 characters.")
        user.password_hash = self._hashPassword(password)
        return self._insertUser(user)

    def _insertUser(self, user: User) -> User:
        role_table, _, _ = self._roleDetails(user)
        result = self.database.insert(role_table, self._profileValues(user))
        if isinstance(user, Admin):
            user.adminID = result.lastrowid
        else:
            user.customerID = result.lastrowid
        return user

    def login(
        self,
        email: str,
        password: str,
    ) -> User | None:
        if not is_valid_email(email) or not isinstance(password, str):
            return None
        matches: list[tuple[type[User], int]] = []
        for user_type in (Admin, Customer):
            role_table, id_column, _ = self._roleDetailsForType(user_type)
            row = self.database.select_one(
                role_table,
                (id_column, DatabaseColumns.PASSWORD_HASH),
                where=(SQLCondition(DatabaseColumns.EMAIL, email),),
            )
            if row is not None and self._verifyPassword(password, row[1]):
                matches.append((user_type, row[0]))
        if len(matches) != 1:
            return None
        user_type, role_id = matches[0]
        return self._getUser(role_id, user_type)

    def _getUser(self, roleID: int, userType: type[User]) -> User | None:
        role_table, id_column, _ = self._roleDetailsForType(userType)
        name_columns = self._nameColumns(userType)
        row = self.database.select_one(
            role_table,
            (
                id_column,
                *name_columns,
                DatabaseColumns.EMAIL,
                DatabaseColumns.PHONE,
                DatabaseColumns.ADDRESS,
                DatabaseColumns.PASSWORD_HASH,
            ),
            where=(SQLCondition(id_column, roleID),),
        )

        if row is None:
            return None

        names = row[1 : 1 + len(name_columns)]
        email, phone, address, password_hash = row[1 + len(name_columns) :]
        profile = {
            "email": email,
            "phone": phone or "",
            "address": address or "",
            "password_hash": password_hash,
        }
        if userType is Admin:
            return Admin(name=names[0], adminID=row[0], **profile)
        return Customer(
            first_name=names[0], last_name=names[1] or "", customerID=row[0], **profile
        )

    def getProfile(self, customerID: int) -> Customer | None:
        user = self._getUser(customerID, Customer)
        return user if isinstance(user, Customer) else None

    def updateProfile(self, user: User) -> bool:
        role_table, id_column, id_attribute = self._roleDetails(user)
        user_id = getattr(user, id_attribute)
        if user_id is None:
            return False
        self._validateProfile(user)
        result = self.database.update(
            role_table,
            self._profileValues(user),
            where=(SQLCondition(id_column, user_id),),
        )
        return result.rowcount > 0

    @staticmethod
    def validatePassword(password: str) -> bool:
        return is_valid_password(password)

    @staticmethod
    def validateInformation(name: str, email: str) -> bool:
        return is_valid_profile(name, email)

    @staticmethod
    def confirmInformation(confirmation: str) -> bool:
        return confirmation.lower() == "yes"

    @staticmethod
    def _validateProfile(user: User) -> None:
        ManageProfile._roleDetails(user)
        if isinstance(user, Customer):
            for label, value in (
                ("First name", user.first_name),
                ("Last name", user.last_name),
            ):
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"{label} is required.")
        if user.phone and not is_valid_phone(user.phone):
            raise ValueError("Phone number must contain 7 to 15 digits.")
        error = ManageProfile._profileValidationError(user.name, user.email)
        if error is not None:
            raise ValueError(error.msg)

    @staticmethod
    def _nameColumns(userType: type[User]) -> tuple[str, ...]:
        if userType is Customer:
            return (DatabaseColumns.FIRST_NAME, DatabaseColumns.LAST_NAME)
        return (DatabaseColumns.NAME,)

    @staticmethod
    def _profileValues(user: User) -> dict[str, object]:
        if isinstance(user, Customer):
            names: dict[str, object] = {
                DatabaseColumns.FIRST_NAME: user.first_name.strip(),
                DatabaseColumns.LAST_NAME: user.last_name.strip(),
            }
        else:
            names = {DatabaseColumns.NAME: user.name}
        return {
            **names,
            DatabaseColumns.EMAIL: user.email,
            DatabaseColumns.PHONE: user.phone,
            DatabaseColumns.ADDRESS: user.address,
            DatabaseColumns.PASSWORD_HASH: user.password_hash,
        }

    @staticmethod
    def _roleDetails(user: User) -> tuple[str, str, str]:
        return ManageProfile._roleDetailsForType(type(user))

    @staticmethod
    def _roleDetailsForType(userType: type[User]) -> tuple[str, str, str]:
        if userType is Admin:
            return DatabaseTables.ADMIN, DatabaseColumns.ADMIN_ID, "adminID"
        if userType is Customer:
            return DatabaseTables.CUSTOMER, DatabaseColumns.CUSTOMER_ID, "customerID"
        raise TypeError("Profiles must be an Admin or Customer.")

    @staticmethod
    def _profileValidationError(name: str, email: str) -> Response | None:
        if not isinstance(name, str) or not name.strip():
            return Response.warning("Name is required.")
        if not isinstance(email, str) or not email.strip():
            return Response.warning("Email is required.")
        if not is_valid_email(email):
            return Response.warning("Email must contain '@' and be a valid address.")
        return None

    @staticmethod
    def _hashPassword(password: str) -> str:
        salt = secrets.token_bytes(_PASSWORD_HASH_SALT_BYTES)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            _PASSWORD_HASH_ITERATIONS,
        )
        return "$".join(
            (
                _PASSWORD_HASH_ALGORITHM,
                str(_PASSWORD_HASH_ITERATIONS),
                base64.b64encode(salt).decode("ascii"),
                base64.b64encode(digest).decode("ascii"),
            )
        )

    @staticmethod
    def _verifyPassword(password: str, encoded_hash: str | None) -> bool:
        if not encoded_hash:
            return False
        try:
            algorithm, iterations_text, salt_text, digest_text = encoded_hash.split("$")
            iterations = int(iterations_text)
            salt = base64.b64decode(salt_text, validate=True)
            expected_digest = base64.b64decode(digest_text, validate=True)
        except (ValueError, binascii.Error):
            return False
        if (
            algorithm != _PASSWORD_HASH_ALGORITHM
            or iterations != _PASSWORD_HASH_ITERATIONS
            or len(salt) != _PASSWORD_HASH_SALT_BYTES
        ):
            return False
        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(actual_digest, expected_digest)
