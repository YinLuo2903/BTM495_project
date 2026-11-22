PRAGMA foreign_keys = ON;

-- 1. Admin Table
CREATE TABLE IF NOT EXISTS admin (
    admin_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    password_hash TEXT
);

--2. Customer Table
-- customer_id is the internal key that other tables link to. customer_code is the
-- customer-facing ID (LPVR001, LPVR002, ...) and is always derived from customer_id.
CREATE TABLE IF NOT EXISTS customer (
    customer_id INTEGER PRIMARY KEY,
    customer_code TEXT UNIQUE
        CHECK (customer_code IS NULL OR customer_code = 'LPVR' || printf('%03d', customer_id)),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    password_hash TEXT
);

-- Assign the LPVR customer code as soon as a customer row is saved.
CREATE TRIGGER IF NOT EXISTS customer_assign_code
AFTER INSERT ON customer
WHEN NEW.customer_code IS NULL
BEGIN
    UPDATE customer
    SET customer_code = 'LPVR' || printf('%03d', NEW.customer_id)
    WHERE customer_id = NEW.customer_id;
END;

-- Backfill codes for customers saved before codes existed.
UPDATE customer
SET customer_code = 'LPVR' || printf('%03d', customer_id)
WHERE customer_code IS NULL;

CREATE TABLE IF NOT EXISTS user_session (
    token_hash TEXT PRIMARY KEY NOT NULL,
    admin_id INTEGER,
    customer_id INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    CHECK ((admin_id IS NOT NULL) != (customer_id IS NOT NULL)),
    FOREIGN KEY (admin_id) REFERENCES admin(admin_id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_session_expires_at ON user_session(expires_at);
-- Prevent duplicate email entries for admin and customer tables
DROP TRIGGER IF EXISTS admin_email_insert_unique;
DROP TRIGGER IF EXISTS admin_email_update_unique;
DROP TRIGGER IF EXISTS customer_email_insert_unique;
DROP TRIGGER IF EXISTS customer_email_update_unique;

-- Status Table: one generic set of statuses shared by event, appointment, order and payment.
CREATE TABLE IF NOT EXISTS status (
    statusID INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO status (statusID, name) VALUES
    (1, 'Pending'),
    (2, 'Completed'),
    (3, 'Cancelled');

-- 3. Event Table
CREATE TABLE IF NOT EXISTS event (
    event_id INTEGER PRIMARY KEY,
    admin_id INTEGER,
    location TEXT,
    name TEXT NOT NULL,
    description TEXT,
    eventDateTime DATETIME,
    participantLimit INTEGER NOT NULL DEFAULT 0 CHECK (participantLimit >= 0),
    statusID INTEGER,
    image_path TEXT,  -- optional picture uploaded by an admin, e.g. /uploads/<hex>.jpg
    FOREIGN KEY (admin_id) REFERENCES admin(admin_id),
    FOREIGN KEY (statusID) REFERENCES status(statusID)
);

-- Event Registration Table: tracks which customers joined which events.
CREATE TABLE IF NOT EXISTS event_registration (
    event_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    PRIMARY KEY (event_id, customer_id),
    FOREIGN KEY (event_id) REFERENCES event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE CASCADE
);

-- 4. Appointment Table
CREATE TABLE IF NOT EXISTS appointment (
    appointment_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    appointmentTime DATETIME,
    description TEXT,
    statusID INTEGER,
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
    FOREIGN KEY (statusID) REFERENCES status(statusID)
);

-- 5. Order Table
CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    orderDateTime DATETIME,
    totalAmount REAL,
    statusID INTEGER,
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
    FOREIGN KEY (statusID) REFERENCES status(statusID)
);

-- 6. Item Table
CREATE TABLE IF NOT EXISTS item (
    item_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL,
    category TEXT,
    brand TEXT,
    image_path TEXT  -- optional picture uploaded by an admin, e.g. /uploads/<hex>.jpg
);

-- Current stock per item. An item without a row here is not stock-tracked (e.g. a service).
CREATE TABLE IF NOT EXISTS inventory (
    item_id INTEGER PRIMARY KEY,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    admin_id INTEGER,  -- last admin to change it; NULL for system changes such as checkout
    FOREIGN KEY (item_id) REFERENCES item(item_id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES admin(admin_id) ON DELETE SET NULL
);

-- Append-only audit trail: one row per quantity change.
CREATE TABLE IF NOT EXISTS inventory_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    old_quantity INTEGER,  -- NULL when tracking starts
    new_quantity INTEGER,  -- NULL when tracking stops
    admin_id INTEGER,      -- NULL for system changes such as checkout
    reason TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES item(item_id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES admin(admin_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_history_item ON inventory_history(item_id, created_at);

-- Persist each customer's active cart as a JSON array of item IDs and quantities.
CREATE TABLE IF NOT EXISTS shopping_cart (
    customer_id INTEGER PRIMARY KEY,
    items_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(items_json)),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE CASCADE
);

-- 7. Order_Item Table
CREATE TABLE IF NOT EXISTS order_item (
    order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, item_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES item(item_id)
);

-- 8. Payment Table
CREATE TABLE IF NOT EXISTS payment (
    payment_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    paymentDateTime DATETIME NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    paymentMethod TEXT NOT NULL,
    statusID INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (statusID) REFERENCES status(statusID)
);
