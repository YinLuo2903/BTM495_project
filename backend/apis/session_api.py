import hashlib
import re
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

from backend.models.admin import Admin
from backend.models.customer import Customer
from backend.models.user import User
from backend.utils.constants import DatabaseColumns, DatabaseTables
from backend.utils.sqlite import SQLComparison, SQLCondition, SQLiteQuery

SESSION_LIFETIME_SECONDS = 24 * 60 * 60
_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}\Z")


@dataclass(frozen=True)
class CreatedSession:
    token: str
    expires_at: int


class SessionManager:
    def __init__(self, database_path: str | Path) -> None:
        self.database = SQLiteQuery(database_path)

    def create(self, user: User) -> CreatedSession:
        if isinstance(user, Admin) and user.adminID is not None:
            admin_id, customer_id = user.adminID, None
        elif isinstance(user, Customer) and user.customerID is not None:
            admin_id, customer_id = None, user.customerID
        else:
            raise ValueError("A saved admin or customer is required.")

        token = secrets.token_urlsafe(32)
        now = int(time.time())
        expires_at = now + SESSION_LIFETIME_SECONDS
        with self.database.transaction() as session:
            session.delete(
                DatabaseTables.USER_SESSION,
                where=(
                    SQLCondition(
                        DatabaseColumns.EXPIRES_AT, now, SQLComparison.LESS_THAN_OR_EQUAL
                    ),
                ),
            )
            session.insert(
                DatabaseTables.USER_SESSION,
                {
                    DatabaseColumns.TOKEN_HASH: self._hash_token(token),
                    DatabaseColumns.ADMIN_ID: admin_id,
                    DatabaseColumns.CUSTOMER_ID: customer_id,
                    DatabaseColumns.CREATED_AT: now,
                    DatabaseColumns.EXPIRES_AT: expires_at,
                },
            )
        return CreatedSession(token, expires_at)

    def get_user(self, token: str) -> dict[str, object] | None:
        if not _TOKEN_PATTERN.fullmatch(token):
            return None
        with self.database.session(read_only=True) as session:
            row = session.fetch_one(
                "SELECT COALESCE(a.name, c.name), s.admin_id IS NOT NULL "
                "FROM user_session s "
                "LEFT JOIN admin a ON a.admin_id = s.admin_id "
                "LEFT JOIN customer c ON c.customer_id = s.customer_id "
                "WHERE s.token_hash = ? AND s.expires_at > ? "
                "AND (a.admin_id IS NOT NULL OR c.customer_id IS NOT NULL)",
                (self._hash_token(token), int(time.time())),
            )
        if row is None:
            return None
        return {"name": row[0], "is_admin": bool(row[1])}

    def revoke(self, token: str) -> bool:
        if not _TOKEN_PATTERN.fullmatch(token):
            return False
        result = self.database.delete(
            DatabaseTables.USER_SESSION,
            where=(SQLCondition(DatabaseColumns.TOKEN_HASH, self._hash_token(token)),),
        )
        return result.rowcount == 1

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("ascii")).hexdigest()
