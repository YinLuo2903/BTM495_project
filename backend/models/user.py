from abc import ABC, abstractmethod

## User is the parent class for Admin and Customer. It contains the common attributes and methods for both classes.
## Each subclass provides `name`: an admin stores one name, a customer combines first and last name.
class User(ABC):
    name: str

    def __init__(
        self,
        email: str,
        phone: str = "",
        address: str = "",
        password_hash: str | None = None,
    ) -> None:
        self.email = email
        self.phone = phone
        self.address = address
        self.password_hash = password_hash

    @property
    @abstractmethod
    def isAdmin(self) -> bool:
        ...
