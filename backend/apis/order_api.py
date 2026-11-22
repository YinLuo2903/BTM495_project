from datetime import datetime
from pathlib import Path

from backend.apis.inventory_list_api import InventoryList
from backend.apis.shopping_cart_api import ShoppingCartAPI
from backend.models.order import Order
from backend.models.shopping_cart import ShoppingCart
from backend.utils.constants import DatabaseColumns, DatabaseTables, DatabaseValues
from backend.utils.response import Response
from backend.utils.sqlite import SQLCondition, SQLiteQuery
from database.sqlite_database import DB_PATH


class OrderService:
    def __init__(self, database_path: str | Path = DB_PATH) -> None:
        self.database = SQLiteQuery(database_path)

    def checkout(self, cart: ShoppingCart, customerID: int) -> Response:
        if cart.customerID != customerID:
            raise ValueError("Shopping cart does not belong to this customer.")
        if not cart.items:
            return Response.warning("Cart is empty.")
        stock_error = cart._stockError()
        if not stock_error.success:
            return stock_error

        total_amount = cart.calculateTotal()
        with self.database.transaction(immediate=True) as database:
            customer = database.select_one(
                DatabaseTables.CUSTOMER,
                (DatabaseColumns.CUSTOMER_ID,),
                where=(SQLCondition(DatabaseColumns.CUSTOMER_ID, customerID),),
            )
            if customer is None:
                raise ValueError(f"Customer {customerID} does not exist.")
            ShoppingCartAPI.verifyInTransaction(database, cart)

            database_items: dict[int, int | None] = {}
            for cart_item in cart.items.values():
                item_id = cart_item.item.itemId
                if database.select_one(
                    DatabaseTables.ITEM,
                    (DatabaseColumns.ITEM_ID,),
                    where=(SQLCondition(DatabaseColumns.ITEM_ID, item_id),),
                ) is None:
                    raise ValueError(f"Item {item_id} does not exist.")
                stock = InventoryList.stockOf(database, item_id)
                if stock is not None and cart_item.quantity > stock:
                    database.rollback()
                    return Response.warning("Item out of stock.")
                database_items[item_id] = stock

            result = database.insert(
                DatabaseTables.ORDERS,
                {
                    DatabaseColumns.CUSTOMER_ID: customerID,
                    DatabaseColumns.ORDER_DATE_TIME: datetime.now().strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),
                    DatabaseColumns.TOTAL_AMOUNT: total_amount,
                    DatabaseColumns.STATUS_ID: DatabaseValues.ORDER_STATUS_ID_PENDING,
                },
            )
            order_id = result.lastrowid

            for item_id, cart_item in cart.items.items():
                database.insert(
                    DatabaseTables.ORDER_ITEM,
                    {
                        DatabaseColumns.ORDER_ID: order_id,
                        DatabaseColumns.ITEM_ID: item_id,
                        DatabaseColumns.QUANTITY: cart_item.quantity,
                        DatabaseColumns.UNIT_PRICE: cart_item.item.getPrice(),
                    },
                )
                database_stock = database_items[item_id]
                if database_stock is not None and not (
                    InventoryList.setQuantityInTransaction(
                        database,
                        item_id,
                        database_stock - cart_item.quantity,
                        reason=f"Checkout order {order_id}",
                    )
                ):
                    database.rollback()
                    return Response.warning("Item out of stock.")
            ShoppingCartAPI.clearInTransaction(database, customerID)

        order = Order(order_id, total_amount)
        order.placeOrder()
        cart._completeCheckout(order)
        return Response.ok("Order placed successfully.", order)

    def checkoutSelected(
        self,
        cart: ShoppingCart,
        customerID: int,
        itemIds: list[int],
        paymentMethod: str,
    ) -> Response:
        """Order only the selected cart lines and record their approved payment.

        One transaction creates the order and its items, takes the stock, stores
        a completed payment, and saves the unselected lines back to the cart.
        The caller approves the payment first, so a declined card never creates
        an order. On success `data` is {"order_id", "total", "paid_at"}.
        """
        if cart.customerID != customerID:
            raise ValueError("Shopping cart does not belong to this customer.")
        selected = list(dict.fromkeys(itemIds))
        if not selected:
            return Response.warning("Select at least one item to check out.")
        if any(item_id not in cart.items for item_id in selected):
            return Response.warning("Some selected items are no longer in your cart.")

        # Sum in cents so the stored total matches the lines exactly.
        total_amount = sum(
            round(cart.items[item_id].getSubtotal() * 100) for item_id in selected
        ) / 100
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        remaining = ShoppingCart(customerID)
        remaining.items = {
            item_id: cart_item
            for item_id, cart_item in cart.items.items()
            if item_id not in selected
        }

        with self.database.transaction(immediate=True) as database:
            ShoppingCartAPI.verifyInTransaction(database, cart)
            stock_before: dict[int, int | None] = {}
            for item_id in selected:
                stock = InventoryList.stockOf(database, item_id)
                if stock is not None and cart.items[item_id].quantity > stock:
                    database.rollback()
                    name = cart.items[item_id].item.name
                    return Response.warning(
                        f"{name} is no longer available in that quantity. Update your cart and try again."
                    )
                stock_before[item_id] = stock

            order_id = database.insert(
                DatabaseTables.ORDERS,
                {
                    DatabaseColumns.CUSTOMER_ID: customerID,
                    DatabaseColumns.ORDER_DATE_TIME: now,
                    DatabaseColumns.TOTAL_AMOUNT: total_amount,
                    DatabaseColumns.STATUS_ID: DatabaseValues.ORDER_STATUS_ID_PENDING,
                },
            ).lastrowid
            for item_id in selected:
                cart_item = cart.items[item_id]
                database.insert(
                    DatabaseTables.ORDER_ITEM,
                    {
                        DatabaseColumns.ORDER_ID: order_id,
                        DatabaseColumns.ITEM_ID: item_id,
                        DatabaseColumns.QUANTITY: cart_item.quantity,
                        DatabaseColumns.UNIT_PRICE: cart_item.item.getPrice(),
                    },
                )
                stock = stock_before[item_id]
                if stock is not None and not InventoryList.setQuantityInTransaction(
                    database,
                    item_id,
                    stock - cart_item.quantity,
                    reason=f"Checkout order {order_id}",
                ):
                    database.rollback()
                    return Response.warning("Item out of stock.")
            database.insert(
                DatabaseTables.PAYMENT,
                {
                    DatabaseColumns.ORDER_ID: order_id,
                    DatabaseColumns.PAYMENT_DATE_TIME: now,
                    DatabaseColumns.AMOUNT: total_amount,
                    DatabaseColumns.PAYMENT_METHOD: paymentMethod,
                    DatabaseColumns.PAYMENT_STATUS_ID: DatabaseValues.PAYMENT_STATUS_ID_PAID,
                },
            )
            database.update(
                DatabaseTables.SHOPPING_CART,
                {
                    DatabaseColumns.ITEMS_JSON: ShoppingCartAPI.serializeItems(remaining),
                    DatabaseColumns.UPDATED_AT: now,
                },
                where=(SQLCondition(DatabaseColumns.CUSTOMER_ID, customerID),),
            )

        cart.items = remaining.items
        return Response.ok(
            "Order placed successfully.",
            {"order_id": order_id, "total": total_amount, "paid_at": now},
        )
