# CSS Architecture - Visual Reference

## 📊 Module Organization

```
                           style.css
                          (Main Import)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   Design Tokens         Page Structure         Interactive
   ────────────          ──────────────         ────────────
   variables.css         page-layout.css         buttons.css
   (colors, fonts)       (structure)             (interactions)
        │                     │                     │
        │                     ├─ Forms
        │                     │  forms.css
        │                     │
        │                     └─ Tables
        │                        tables.css
        │
        ├─ Base Styles
        │  base.css
        │  (resets)
        │
        └─ Typography
           typography.css
           (text utilities)


                    Component Styles
                    ─────────────────
                           │
        ┌──────────────────┬┼┬──────────────────┐
        │                  │││                  │
        ▼                  ▼▼▼                  ▼
    Navigation        Content & Lists       Layouts
    ──────────        ─────────────        ────────
    navigation.css    content.css          footer.css
                      dialogs.css          home-sections.css
                      (modals)
        │                 │                     │
        └─────────────────┼─────────────────────┘
                          │
                          ▼
                 Responsive Design
                 ─────────────────
                  responsive.css
                  (media queries)
```

---

## 🗂️ File Dependency Map

```
style.css (MAIN)
  ├─ imports: variables.css ──────────→ Used by ALL other files
  │
  ├─ imports: base.css ───────────────→ Global resets
  │
  ├─ imports: typography.css ────────→ Text utilities
  │
  ├─ imports: page-layout.css ───────→ Page structure, headers
  │
  ├─ imports: navigation.css ────────→ Navigation bar
  │
  ├─ imports: forms.css ─────────────→ Form inputs
  │
  ├─ imports: buttons.css ───────────→ Button styles
  │
  ├─ imports: content.css ───────────→ Lists, alerts, badges
  │
  ├─ imports: tables.css ────────────→ Data tables
  │
  ├─ imports: dialogs.css ───────────→ Modals, dialogs
  │
  ├─ imports: footer.css ────────────→ Footer
  │
  ├─ imports: home-sections.css ────→ Home page sections
  │
  ├─ imports: responsive.css ───────→ Media queries (LAST!)
  │
  └─ imports: layout.css ────────────→ Navigation component (existing)
```

---

## 🎯 Feature to File Mapping

```
Feature              │ File              │ Key Classes
─────────────────────┼──────────────────┼──────────────────────
Colors & Tokens      │ variables.css    │ --brand, --ink, --muted
Global Styles        │ base.css         │ *, body, h1-h3
Text Utils           │ typography.css   │ .eyebrow, .subtitle
Page Structure       │ page-layout.css  │ .page, .header, .card
Navigation           │ navigation.css   │ .home-nav, .customer-nav
Form Inputs          │ forms.css        │ input, select, label
Buttons              │ buttons.css      │ button, .button-*
Lists & Alerts       │ content.css      │ .customer-list, .status
Tables               │ tables.css       │ table, th, td
Modals               │ dialogs.css      │ dialog
Footer               │ footer.css       │ .site-footer
Home Sections        │ home-sections.css│ .events-grid, .sections-grid
Responsive           │ responsive.css   │ @media queries
```

---

## 💾 File Size Reference

```
variables.css       600 bytes  ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
base.css            880 bytes  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
typography.css      430 bytes  ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
page-layout.css   1,400 bytes  ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░
navigation.css    1,300 bytes  ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░
forms.css         1,500 bytes  ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░
buttons.css       1,400 bytes  ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░
content.css       1,000 bytes  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
tables.css        1,000 bytes  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
dialogs.css         680 bytes  ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
footer.css          950 bytes  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
home-sections.css 1,400 bytes  ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░
responsive.css    1,100 bytes  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
────────────────────────────────────────────────────────────────
Total: ~14.5 KB   (same as single style.css file)
```

---

## 🔄 CSS Cascade Order (Important!)

Files are loaded in this order:

```
1️⃣  variables.css      ← MUST BE FIRST (defines design tokens)
2️⃣  base.css          ← Global resets
3️⃣  typography.css    ← Text styles
4️⃣  page-layout.css   ← Page structure
5️⃣  navigation.css    ← Navigation
6️⃣  forms.css         ← Forms
7️⃣  buttons.css       ← Buttons
8️⃣  content.css       ← Lists, alerts
9️⃣  tables.css        ← Tables
🔟 dialogs.css        ← Dialogs
1️⃣1️⃣ footer.css       ← Footer
1️⃣2️⃣ home-sections.css← Home page
1️⃣3️⃣ responsive.css   ← MUST BE LAST (overrides all)
```

---

## 📝 How to Add a New Module

### Step 1: Create the file
```bash
touch frontend/css/my-feature.css
```

### Step 2: Add your CSS
```css
/* My Feature - description of what this module covers */

.my-class {
  color: var(--brand);
  /* ... */
}
```

### Step 3: Import in style.css
```css
/* Add to style.css in the appropriate position */
@import url("./my-feature.css");
```

### Done! 🎉

---

## ✅ Quality Checklist

Before committing CSS changes:

- [ ] Changed only the relevant module file(s)
- [ ] Verified styles apply correctly in browser
- [ ] No console CSS errors
- [ ] Mobile responsive still works
- [ ] Colors use `var(--brand)` tokens (not hardcoded)
- [ ] Followed existing naming conventions
- [ ] Added comments explaining complex rules
- [ ] Tested on multiple pages if applicable

---

## 🚀 Quick Navigation

Need to modify something? Use this guide:

```
Browser Button → buttons.css
Mobile Layout → responsive.css
Form Input → forms.css
Page Background → variables.css
Navigation Bar → navigation.css
Card Styling → page-layout.css
Table Row → tables.css
Alert Box → content.css
Modal Dialog → dialogs.css
Footer Text → footer.css
Home Page Layout → home-sections.css
Text Color → typography.css or variables.css
Brand Color → variables.css
```

---

## 📚 Documentation Links

- **CSS_ARCHITECTURE.md** - Detailed module documentation
- **CSS_QUICK_GUIDE.md** - Quick reference & common tasks

---

That's the CSS architecture! Clean, organized, and easy to work with. 🎨
