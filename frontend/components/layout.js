/**
 * Global Layout Component
 * Injects shared header/nav and footer into any page
 * Usage: Add <script type="module" src="/components/layout.js"></script> to your HTML
 */

class PageLayout {
  constructor() {
    this.detectUserRole();
    this.injectLayout();
  }

  detectUserRole() {
    // Check if we're in admin or customer section
    const path = window.location.pathname;
    this.isAdmin = path.includes('/admin/');
    this.isCustomer = path.includes('/customer/');
  }

  injectLayout() {
    // Remove any old customer-nav elements to prevent duplicates
    const oldNav = document.querySelector('nav.customer-nav');
    if (oldNav) {
      oldNav.remove();
    }

    // Inject nav (replaces any existing .home-nav)
    this.injectNavigation();

    // Inject footer
    this.injectFooter();
  }

  injectNavigation() {
    const navElement = document.querySelector('nav.home-nav') || this.createNavContainer();

    // Clear any existing nav content to prevent duplicates
    navElement.innerHTML = '';

    if (this.isAdmin) {
      navElement.innerHTML = this.getAdminNav();
      navElement.classList.add('admin-nav');
    } else {
      navElement.innerHTML = this.getCustomerNav();
    }

    // Remove conflicting nav classes
    navElement.classList.remove('customer-nav');
  }

  createNavContainer() {
    const nav = document.createElement('nav');
    nav.className = 'home-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    const body = document.body;
    const main = document.querySelector('main');
    if (main) {
      main.insertBefore(nav, main.firstChild);
    } else {
      body.insertBefore(nav, body.firstChild);
    }

    return nav;
  }

  getCustomerNav() {
    return `
      <div class="nav-container">
        <div class="nav-brand">
          <img src="/assets/images/logo.png" alt="Logo" class="nav-logo" loading="lazy">
          <span class="nav-title">LE PETIT VÉLO ROUGE</span>
        </div>
        <ul class="nav-menu">
          <li><a href="/views/customer/index.html">Home</a></li>
          <li><a href="/views/customer/items.html">Items</a></li>
          <li><a href="/views/customer/events.html">Events</a></li>
          <li><a href="/views/customer/appointments.html">Appointments</a></li>
          <li><a href="/views/customer/login.html" class="nav-auth">Sign Out</a></li>
          <li><a href="/views/customer/profile.html" class="nav-profile">Profile</a></li>
        </ul>
      </div>
    `;
  }

  getAdminNav() {
    return `
      <div class="nav-container">
        <div class="nav-brand">
          <img src="/assets/images/logo.png" alt="Logo" class="nav-logo" loading="lazy">
          <span class="nav-title">LE PETIT VÉLO ROUGE - ADMIN</span>
        </div>
        <ul class="nav-menu">
          <li><a href="/views/admin/index.html">Dashboard</a></li>
          <li><a href="/views/admin/items.html">Items</a></li>
          <li><a href="/views/admin/inventory.html">Inventory</a></li>
          <li><a href="/views/admin/orders.html">Orders</a></li>
          <li><a href="/views/admin/events.html">Events</a></li>
          <li><a href="/views/admin/appointments.html">Appointments</a></li>
          <li><a href="/views/customer/login.html" class="nav-auth">Sign Out</a></li>
          <li><a href="/views/customer/index.html" class="nav-back">← Customer View</a></li>
        </ul>
      </div>
    `;
  }

  injectFooter() {
    const footerElement = document.querySelector('footer.site-footer');
    if (!footerElement) {
      return; // Footer element doesn't exist, skip injection
    }

    // Clear any existing footer content
    footerElement.innerHTML = '';

    footerElement.innerHTML = `
      <div class="footer-grid">
        <div>
          <h3>LE PETIT VÉLO ROUGE</h3>
          <p>Located in: Concordia University - Loyola Campus<br>
             7141 Rue Sherbrooke O PS 145, Montréal, QC H4B 2B9<br>
             <a href="mailto:petitvelorouge@gmail.com">petitvelorouge@gmail.com</a><br>
             <a href="https://www.instagram.com/LPVR_lepetitvelorouge" target="_blank">@LPVR_lepetitvelorouge</a></p>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 LE PETIT VÉLO ROUGE. All rights reserved.</p>
      </div>
    `;
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PageLayout());
} else {
  new PageLayout();
}
