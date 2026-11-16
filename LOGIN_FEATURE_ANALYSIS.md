# Login Feature Analysis & Implementation Plan

## Status update

Phase 1 creates expiring server-side sessions and returns a bearer token
from the login API. `GET /api/session` validates it and `POST /api/logout`
revokes it. Phase 2 stores the token in browser localStorage, checks the
session, and adds sign-in redirects and logout. Phase 3 improves the login
design and adds password visibility and sign-in progress. Existing pages and APIs are
not protected. See the README's Session API section for the current contract
and security limitations.

The analysis and implementation plan below describe the original baseline
before Phases 1 through 3; statements about missing sessions are historical.

## Original Status: PARTIALLY IMPLEMENTED ✓

### What Already Exists ✅

#### Frontend (HTML/CSS/JS)
1. **Login Page**: `/frontend/views/customer/login.html`
   - Email input field with validation
   - Password input field
   - Submit button
   - Error/success messages display
   - Demo credentials displayed (login@example.com / 1234)

2. **Frontend Controller**: `/frontend/controllers/auth_controller.js`
   - Form submission handler
   - API call to `/api/login` endpoint
   - Error/success message handling
   - Form reset on successful login

3. **CSS Styling**: 
   - Form styling already in place (`/frontend/css/forms.css`)
   - Layout and responsive design (`/frontend/css/layout.css`)

#### Backend (Python)
1. **Authentication API**: `/backend/apis/local_website_api.py`
   - `_login()` method handles POST requests to `/api/login`
   - Validates email and password
   - Returns user data (name, is_admin flag)

2. **Profile Management**: `/backend/apis/profile_api.py` - `ManageProfile` class
   - `login(email, password)` method for credential verification
   - Secure password hashing: PBKDF2-SHA256 with 600k iterations
   - Password verification with constant-time comparison (HMAC)
   - Returns User object with name and admin status

3. **Database Models**: 
   - `Customer` and `Admin` tables in SQLite
   - Password stored as hash (`PASSWORD_HASH` column)
   - User profile fields: name, email, phone, address

4. **Demo User**: 
   - Automatically created on first run
   - Email: `login@example.com`
   - Password: `1234`

---

## What's Missing ❌

### Session Management (CRITICAL)
1. **No Session Creation**
   - Login API only verifies credentials, doesn't create session/token
   - No way to keep user logged in after page refresh
   - No protected routes/endpoints

2. **No Session Storage**
   - No JWT tokens or session tokens
   - No session cookie management
   - No session database table

3. **No Authentication Middleware**
   - No route protection
   - No permission checks on API endpoints
   - No logout functionality

4. **No Protected Pages**
   - All pages accessible without login
   - No redirect to login page for unauthorized users
   - No user info displayed in navigation

### UI/UX Enhancements Needed
1. **Login Flow**
   - No redirect to dashboard/home after successful login
   - No "Remember me" option
   - No password recovery/reset feature
   - No account creation link integration

2. **User Navigation**
   - No way to display logged-in user's name
   - No logout button in navigation
   - No user profile dropdown menu
   - No indication of login status

3. **Form Validation**
   - Limited client-side validation
   - No password visibility toggle
   - No "Forgot Password" link

---

## Implementation Plan

### Phase 1: Session Management (Backend)
**Files to Create/Modify:**

1. **Create: `/backend/apis/session_api.py`** (NEW)
   - Session token generation (JWT or simple token)
   - Session validation
   - Session cleanup/expiration

2. **Modify: `/backend/apis/local_website_api.py`**
   - Update `_login()` to create session after credential verification
   - Return session token to frontend
   - Add `_logout()` endpoint

3. **Modify: `/backend/apis/profile_api.py`** (if needed)
   - Add session token generation

4. **Database Schema: `/database/schema.sql`**
   - Add `sessions` or `user_sessions` table
   - Fields: session_id, user_id, token, expires_at, created_at

### Phase 2: Frontend Session Handling
**Files to Modify:**

1. **Modify: `/frontend/controllers/auth_controller.js`**
   - Store session token in localStorage/sessionStorage
   - Redirect to home/dashboard on successful login
   - Add logout functionality
   - Clear token on logout

2. **Create: `/frontend/components/session_handler.js`** (NEW)
   - Check for valid session on page load
   - Redirect to login if not authenticated
   - Auto-refresh token before expiration
   - Provide session check utility

3. **Create: `/frontend/components/auth_guard.js`** (NEW)
   - Middleware to protect pages
   - Check authentication status
   - Handle unauthorized access

### Phase 3: UI/UX Improvements
**Files to Modify/Create:**

1. **Modify: `/frontend/views/customer/login.html`**
   - Add password visibility toggle
   - Improve form styling
   - Add loading state on submit
   - Add "Forgot Password" link (placeholder)

2. **Modify: `/frontend/components/layout.js`**
   - Display logged-in user's name
   - Add logout button
   - Show/hide elements based on auth status

3. **Modify: `/frontend/css/forms.css`**
   - Enhanced login form styling
   - Loading state styles
   - Better error message styling

### Phase 4: Protected Routes
**Files to Modify:**

1. **Modify: `/backend/apis/local_website_api.py`**
   - Add session validation middleware
   - Protect endpoints (profile, orders, cart, etc.)
   - Return 401 for invalid/missing session

2. **Modify: Frontend Controllers**
   - Add auth checks before API calls
   - Handle 401 responses by redirecting to login

---

## Technical Decisions

### Session Token Strategy
- **Option 1**: JWT (JSON Web Tokens) - Stateless, good for scalability
- **Option 2**: Database sessions - Simpler, better control
- **Recommendation**: Start with simple database sessions for this project

### Storage
- Phase 1 stores only a hash of the bearer token in the database.
- Phase 2 stores bearer tokens in browser localStorage as requested. This is
  exposed to JavaScript; an HttpOnly, Secure, SameSite cookie with CSRF
  protection is a safer choice for production.

### Expiration
- Session timeout: 24 hours
- Expired tokens fail validation and are cleared from browser storage
- Refresh token mechanism (optional)

---

## Quick Reference: Current Architecture

```
Frontend (HTML/JS)
    ↓
auth_controller.js → POST /api/login
    ↓
Backend (Python)
    ↓
local_website_api.py (_login method)
    ↓
profile_api.py (ManageProfile.login)
    ↓
Database (SQLite)
    ↓
Customer/Admin table (with password_hash)
```

### Current Flow Issues:
- ❌ No session token returned
- ❌ No way to persist login state
- ❌ No protected endpoints
- ❌ No logout mechanism
- ❌ No user context after login

---

## Testing Checklist
- [ ] Login with valid credentials
- [ ] Persist session across page refresh
- [ ] Logout clears session
- [ ] Unauthorized access redirects to login
- [ ] Protected endpoints return 401 without token
- [ ] Session expires after timeout
- [ ] Multiple concurrent sessions work
- [ ] Password hashing is secure

---

## Demo Credentials
- Email: `login@example.com`
- Password: `1234`
