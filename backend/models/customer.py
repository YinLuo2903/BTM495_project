#subclass of User class, representing a customer in the system
from backend.models.user import User

CUSTOMER_CODE_PREFIX = "LPVR"


def customer_code_for(customerID: int) -> str:
    """Customer-facing ID: LPVR001, LPVR002, ... (more digits after LPVR999)."""
    return f"{CUSTOMER_CODE_PREFIX}{customerID:03d}"


class Customer(User):
    def __init__(
        self,
        first_name: str,
        last_name: str,
        email: str,
        phone: str = "",
        address: str = "",
        customerID: int | None = None,
        password_hash: str | None = None,
    ) -> None:
        super().__init__(email, phone, address, password_hash)
        self.first_name = first_name
        self.last_name = last_name
        self.customerID = customerID

    @property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def customerCode(self) -> str | None:
        if self.customerID is None:
            return None
        return customer_code_for(self.customerID)

    @property
    def isAdmin(self) -> bool:
        return False
