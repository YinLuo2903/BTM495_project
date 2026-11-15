# CSS Files Quick Guide

## 📁 File Organization

```
frontend/css/
├── style.css              ← Import file (edit this to add new files)
├── variables.css          ← Colors, fonts, spacing
├── base.css              ← Global styles, resets
├── typography.css        ← Text utilities
├── page-layout.css       ← Page structure, headers, cards
├── navigation.css        ← Navigation bars
├── forms.css             ← Input fields, labels
├── buttons.css           ← Buttons, interactive
├── content.css           ← Lists, alerts, badges
├── tables.css            ← Data tables
├── dialogs.css           ← Modals, popups
├── footer.css            ← Footer
├── home-sections.css     ← Home page sections
├── responsive.css        ← Media queries
└── layout.css            ← Navigation component (existing)
```

---

## 🎨 Where to Edit?

### Updating Colors
📝 Edit: `variables.css`
```css
--brand: #f26a1b;              /* Change brand color here */
--brand-dark: #c9540f;         /* Change hover color here */
--ink: #111111;                /* Change text color here */
```

### Updating Buttons
📝 Edit: `buttons.css`
```css
button { ... }                 /* Primary button */
.button-secondary { ... }      /* Secondary button */
.button-danger { ... }         /* Danger button */
```

### Updating Forms
📝 Edit: `forms.css`
```css
input, select { ... }          /* Input styling */
label { ... }                  /* Label styling */
```

### Updating Navigation
📝 Edit: `navigation.css`
```css
.home-nav { ... }              /* Top navigation bar */
.customer-nav { ... }          /* Secondary nav */
```

### Updating Tables
📝 Edit: `tables.css`
```css
table { ... }                  /* Table styling */
th { ... }                     /* Header row */
```

### Updating Footer
📝 Edit: `footer.css`
```css
.site-footer { ... }           /* Footer container */
.footer-grid { ... }           /* Footer layout */
```

### Updating Home Page Sections
📝 Edit: `home-sections.css`
```css
.events-grid { ... }           /* Events grid layout */
.sections-grid { ... }         /* Browse/Book sections */
```

### Updating Responsive Design
📝 Edit: `responsive.css`
```css
@media (max-width: 700px) { } /* Tablet */
@media (max-width: 480px) { } /* Mobile */
```

---

## ✨ Common Tasks

### Task: Change Brand Color from Orange to Blue

1. Open `frontend/css/variables.css`
2. Find: `--brand: #f26a1b;`
3. Change to: `--brand: #0066cc;`
4. Find: `--brand-dark: #c9540f;`
5. Change to: `--brand-dark: #0052a3;`
6. Save & refresh browser ✅

### Task: Make Buttons Larger

1. Open `frontend/css/buttons.css`
2. Find: `min-height: 40px;`
3. Change to: `min-height: 50px;`
4. Adjust padding if needed
5. Save & refresh ✅

### Task: Change Primary Font

1. Open `frontend/css/variables.css`
2. Find: `--font-family: "Segoe UI", Arial, sans-serif;`
3. Change to: `--font-family: "Your Font", fallback;`
4. Save & refresh ✅

### Task: Adjust Card Spacing

1. Open `frontend/css/page-layout.css`
2. Find: `.card { padding: 26px 28px; }`
3. Adjust padding values
4. Save & refresh ✅

### Task: Modify Mobile Layout

1. Open `frontend/css/responsive.css`
2. Find the breakpoint you want: `@media (max-width: 480px)`
3. Add or modify styles
4. Save & refresh ✅

---

## 🔍 How to Find Something

**Need to change...**

| What | File to Check |
|------|---------------|
| Button color | buttons.css |
| Font size | typography.css or variables.css |
| Card style | page-layout.css |
| Form input | forms.css |
| Navigation | navigation.css |
| Table row color | tables.css |
| Footer | footer.css |
| Mobile layout | responsive.css |
| Any color | variables.css |

---

## 📊 CSS Cascade Order

Files are imported in this order (important for specificity):

1. ✅ variables.css (defines colors, fonts)
2. ✅ base.css (resets, global)
3. ✅ typography.css (text styles)
4. ✅ page-layout.css (structure)
5. ✅ navigation.css (nav bar)
6. ✅ forms.css (inputs)
7. ✅ buttons.css (buttons)
8. ✅ content.css (lists, alerts)
9. ✅ tables.css (data tables)
10. ✅ dialogs.css (modals)
11. ✅ footer.css (footer)
12. ✅ home-sections.css (home page)
13. ✅ responsive.css (media queries - last!)

---

## 🆕 Adding a New CSS Module

### Step 1: Create File
Create `frontend/css/my-feature.css` with your styles:
```css
/* My Feature - short description */

.my-class {
  color: var(--brand);
  font-size: 16px;
}
```

### Step 2: Import in style.css
Add this line to `frontend/css/style.css`:
```css
@import url("./my-feature.css");
```

### Step 3: Done! ✅
Refresh the browser and your styles will apply.

---

## ⚡ Performance Notes

- All files are imported via CSS `@import` (not multiple `<link>` tags)
- Browser caches each file separately
- Changes don't require any build process
- All files are loaded in cascade order
- No performance impact vs. single file

---

## 📚 File Size Reference

- **variables.css** ~600 bytes - Design tokens
- **base.css** ~880 bytes - Global styles
- **typography.css** ~430 bytes - Text utilities
- **page-layout.css** ~1400 bytes - Page structure
- **navigation.css** ~1300 bytes - Navigation
- **forms.css** ~1500 bytes - Forms
- **buttons.css** ~1400 bytes - Buttons
- **content.css** ~1000 bytes - Lists & alerts
- **tables.css** ~1000 bytes - Tables
- **dialogs.css** ~680 bytes - Dialogs
- **footer.css** ~950 bytes - Footer
- **home-sections.css** ~1400 bytes - Home sections
- **responsive.css** ~1100 bytes - Media queries

**Total:** ~14.5 KB (same as original single file)

---

## ✅ Verification

All pages tested and working:
- ✅ Home page
- ✅ Items page
- ✅ Appointments page
- ✅ Events page
- ✅ Signup page
- ✅ Login page
- ✅ Admin dashboard
- ✅ Mobile responsive
- ✅ No console errors

---

## 📞 Troubleshooting

**Changes not showing?**
1. Hard refresh: `Ctrl+Shift+Delete` (clear cache)
2. Or press: `Ctrl+F5` to force reload

**Getting weird styling?**
1. Check which file was edited
2. Verify import order in style.css
3. Check for typos in selectors

**Need a style but don't know where?**
1. Use browser DevTools (F12)
2. Inspect the element
3. Look for the CSS rule
4. File name is in the @import comments

---

That's it! The CSS is now organized, easy to find, and easy to update. 🎉
