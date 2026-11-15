-- All names, emails, phone numbers, and other data are illustrative.
-- Placeholder password hashes are NOT usable for authentication.
-- Use ONLY with fictional test data; no real payment credentials are stored.
-- Status IDs: 1=Pending, 2=Completed, 3=Cancelled.

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- 1. Status: generic statuses for events, appointments, orders and payments
INSERT INTO status (statusID, name) VALUES
(1, 'Pending'), (2, 'Completed'), (3, 'Cancelled')
ON CONFLICT(statusID) DO NOTHING;

-- 2. Administrators
INSERT INTO admin (admin_id, name, email, phone, address, password_hash) VALUES
(1, 'LPVR Demo Administrator', 'admin.demo@example.com', '514-555-0100', 'Montreal, QC', 'DEMO_NOT_A_REAL_HASH'),
(2, 'LPVR Inventory Manager', 'inventory.demo@example.com', '514-555-0103', 'Montreal, QC', 'DEMO_NOT_A_REAL_HASH')
ON CONFLICT(admin_id) DO NOTHING;

-- 3. Customers
INSERT INTO customer (customer_id, name, email, phone, address, password_hash) VALUES
(201, 'Alex Martin', 'alex.martin@example.com', '514-555-0101', 'Montreal, QC', 'DEMO_NOT_A_REAL_HASH'),
(202, 'Camille Roy', 'camille.roy@example.com', '514-555-0102', 'Laval, QC', 'DEMO_NOT_A_REAL_HASH'),
(203, 'Jordan Lee', 'jordan.lee@example.com', '514-555-0104', 'Montreal, QC', 'DEMO_NOT_A_REAL_HASH')
ON CONFLICT(customer_id) DO NOTHING;

-- 4. Items (7 bicycle parts/accessories)
INSERT INTO item (item_id, name, description, price, category, brand) VALUES
(101, 'Brake Pads', 'Bicycle brake pads', 19.99, 'Brakes', 'Shimano'),
(102, 'Bike Chain', '11-speed bicycle chain', 34.99, 'Drivetrain', 'KMC'),
(103, 'Bicycle Tire', 'Road bicycle tire', 49.99, 'Tires', 'Continental'),
(104, 'Front Bike Light', 'Rechargeable bicycle headlight', 29.99, 'Accessories', 'Lezyne'),
(105, 'Bike Helmet', 'Adjustable cycling helmet', 79.99, 'Safety', 'Giro'),
(106, 'Water Bottle Cage', 'Lightweight bottle holder', 14.99, 'Accessories', 'Topeak'),
(107, 'Handlebar Grips', 'Comfort bicycle grips', 24.99, 'Components', 'Ergon')
ON CONFLICT(item_id) DO NOTHING;

-- 5. Current inventory quantities
INSERT INTO inventory (item_id, quantity, updated_at, admin_id) VALUES
(101, 25, '2026-11-09 09:00:00', 2),
(102, 12, '2026-11-09 09:00:00', 2),
(103, 8,  '2026-11-09 09:00:00', 2),
(104, 15, '2026-11-09 09:00:00', 2),
(105, 6,  '2026-11-09 09:00:00', 2),
(106, 20, '2026-11-09 09:00:00', 2),
(107, 10, '2026-11-09 09:00:00', 2)
ON CONFLICT(item_id) DO NOTHING;

-- 6. Inventory history: first value may be NULL when tracking begins.
-- Item 101 has an example adjustment from 30 to 25; all others begin with their current stock.
INSERT INTO inventory_history
(history_id, item_id, old_quantity, new_quantity, admin_id, reason, created_at) VALUES
(1, 101, NULL, 30, 2, 'Initial stock', '2026-11-01 09:00:00'),
(2, 101, 30, 25, 2, 'Stock adjustment', '2026-11-09 09:00:00'),
(3, 102, NULL, 12, 2, 'Initial stock', '2026-11-09 09:00:00'),
(4, 103, NULL, 8, 2, 'Initial stock', '2026-11-09 09:00:00'),
(5, 104, NULL, 15, 2, 'Initial stock', '2026-11-09 09:00:00'),
(6, 105, NULL, 6, 2, 'Initial stock', '2026-11-09 09:00:00'),
(7, 106, NULL, 20, 2, 'Initial stock', '2026-11-09 09:00:00'),
(8, 107, NULL, 10, 2, 'Initial stock', '2026-11-09 09:00:00')
ON CONFLICT(history_id) DO NOTHING;

-- 7. Events
INSERT INTO event
(event_id, admin_id, location, name, description, eventDateTime, participantLimit, statusID) VALUES
(101, 1, 'LPVR Workshop', 'Bike Maintenance Workshop', 'Learn basic bicycle maintenance', '2027-01-20 14:00:00', 20, 1),
(102, 1, 'Montreal, QC', 'Community Bike Ride', 'Group ride for local cyclists', '2027-02-06 10:00:00', 30, 1),
(103, 1, 'LPVR Workshop', 'Winter Cycling Basics', 'Tips for cycling safely in winter', '2027-02-13 13:00:00', 18, 1),
(104, 1, 'Parc La Fontaine', 'Family Cycling Day', 'Guided family-friendly ride', '2027-03-06 11:00:00', 35, 1)
ON CONFLICT(event_id) DO NOTHING;

-- 8. Event registrations (customer/event many-to-many relationship)
INSERT INTO event_registration (event_id, customer_id) VALUES
(101, 201), (101, 202), (102, 203), (103, 201), (104, 202)
ON CONFLICT(event_id, customer_id) DO NOTHING;

-- 9. Appointments
INSERT INTO appointment
(appointment_id, customer_id, appointmentTime, description, statusID) VALUES
(301, 201, '2027-02-18 10:30:00', 'Brake adjustment and tire inspection', 1),
(302, 202, '2027-02-19 13:30:00', 'Chain replacement and tune-up', 1)
ON CONFLICT(appointment_id) DO NOTHING;

-- 10. Shopping carts stored as valid JSON according to the existing schema.
-- SQL validates JSON syntax, but the application must validate item IDs and quantities.
INSERT INTO shopping_cart (customer_id, items_json, updated_at) VALUES
(201, '[{"item_id":104,"quantity":1},{"item_id":106,"quantity":2}]', '2026-11-10 11:30:00'),
(202, '[{"item_id":105,"quantity":1}]', '2026-11-10 12:00:00'),
(203, '[]', '2026-11-10 12:15:00')
ON CONFLICT(customer_id) DO NOTHING;

-- 11. Orders; totals below equal sum of their order-item line prices (tax NOT included).
-- Order 403 is pending; a pending payment does not mean a successful charge.
INSERT INTO orders (order_id, customer_id, orderDateTime, totalAmount, statusID) VALUES
(401, 201, '2026-11-07 15:20:00', 74.97, 2),
(402, 202, '2026-11-08 10:10:00', 79.99, 2),
(403, 203, '2026-11-09 14:00:00', 49.99, 1)
ON CONFLICT(order_id) DO NOTHING;

-- 12. Order line items
INSERT INTO order_item (order_id, item_id, quantity, unit_price) VALUES
(401, 101, 2, 19.99),
(401, 102, 1, 34.99),
(402, 105, 1, 79.99),
(403, 103, 1, 49.99)
ON CONFLICT(order_id, item_id) DO NOTHING;

-- 13. Payments: fictional records; no real card data stored.
-- Payment 503 is pending and should not be treated as an approved payment.
INSERT INTO payment
(payment_id, order_id, paymentDateTime, amount, paymentMethod, statusID) VALUES
(501, 401, '2026-11-07 15:22:00', 74.97, 'Demo card', 2),
(502, 402, '2026-11-08 10:12:00', 79.99, 'Demo card', 2),
(503, 403, '2026-11-09 14:05:00', 49.99, 'Demo card', 1)
ON CONFLICT(payment_id) DO NOTHING;

COMMIT;
