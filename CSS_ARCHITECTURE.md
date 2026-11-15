# CSS Architecture Documentation

**Date:** November 15, 2026  
**Status:** COMPLETE ✅  

---

## Overview

The `style.css` file has been refactored and organized into logical, feature-based modules. This modular approach makes the codebase easier to maintain, verify, and extend.

---

## File Structure

```
frontend/css/
├── style.css              (Main import file - orchestrates all modules)
├── variables.css          (Design tokens & CSS custom properties)
├── base.css              (Global resets & base styles)
├── typography.css        (Typography utilities & text styles)
├── page-layout.css       (Page structure & header layout)
├── navigation.css        (Navigation styling)
├── forms.css             (Form inputs & controls)
├── buttons.css           (Button styles & interactive elements)
├── content.css           (Lists, alerts, & content utilities)
├── tables.css            (Table styling for data display)
├── dialogs.css           (Modal & dialog styling)
├── footer.css            (Footer styling)
├── home-sections.css     (Home page specific sections)
├── responsive.css        (Media queries & responsive design)
└── layout.css            (Navigation component - existing file)
```

---

## Module Descriptions

### 1. **variables.css** - Design Tokens
Centralized CSS custom properties for:
- Brand colors (`--brand`, `--brand-dark`)
- Text colors (`--ink`, `--muted`, `--line`)
- Surface colors (`--background`, `--surface`)
- Typography (`--font-family`, `--font-hero`, `--font-section`, etc.)
- Color aliases
- Effects & shadows

**Use When:** Updating colors, fonts, or spacing across the entire site

---

### 2. **base.css** - Global Base Styles
Fundamental styles including:
- CSS reset (`*` selector)
- Body styling & background
- Heading styles (h1, h2, h3)
- Paragraph margins
- Code block styling

**Use When:** Changing global base element styling

---

### 3. **typography.css** - Text Styling
Text utility classes:
- `.eyebrow` - Small caps text
- `.subtitle` - Subtitle text
- `.muted` - Muted/secondary text
- `.footnote` - Small helper text

**Use When:** Adding or modifying text utility classes

---

### 4. **page-layout.css** - Page Structure
Page-level layout:
- `.page` - Main container
- `.header` - Hero section with gradient background
- `.card` - Content cards
- `.card-heading` - Card heading layout
- `.header-logo` - Logo sizing

**Use When:** Changing page structure, hero sections, or card styling

---

### 5. **navigation.css** - Navigation Styling
Navigation components:
- `.home-nav` - Fixed navigation bar
- `.home-nav-links` - Navigation links
- `.home-nav-accounts` - Account section
- `.customer-nav` - Secondary navigation

**Use When:** Updating navigation appearance or layout

---

### 6. **forms.css** - Form Elements
Form input styling:
- Label styling
- Input & select fields
- Focus states
- Inline forms
- Form rows

**Use When:** Modifying form appearance or input styles

---

### 7. **buttons.css** - Buttons & Interactions
Button styles:
- Primary button
- Secondary button (`.button-secondary`)
- Danger button (`.button-danger`)
- Hover & active states
- Icon buttons
- Button groups
- Focus states

**Use When:** Adding or changing button styles/interactions

---

### 8. **content.css** - Content Utilities
Content and list styling:
- `.customer-list` - List layout
- `.customer-notice` - Alert boxes
- `.status`, `.status-ok`, `.status-error` - Status badges
- `.error` - Error messages

**Use When:** Styling lists, alerts, or status indicators

---

### 9. **tables.css** - Table Styling
Data table styling:
- Table layout
- Header styling
- Row hover states
- Status row styling (`.row-ok`, `.row-pending`)
- Responsive table wrapper

**Use When:** Modifying table appearance (admin pages)

---

### 10. **dialogs.css** - Modal & Dialog Styling
Dialog/modal styling:
- Dialog container
- Dialog backdrop with blur
- Dialog heading
- Dialog actions

**Use When:** Styling modals and dialog boxes

---

### 11. **footer.css** - Footer Styling
Footer styling:
- Footer container
- Footer grid layout
- Footer headings & text
- Footer links
- Copyright section

**Use When:** Modifying footer appearance or layout

---

### 12. **home-sections.css** - Home Page Sections
Home page specific styling:
- `.events-section` - Events section
- `.events-grid` - Event cards grid
- `.sections-grid` - Two-column layout
- `.section-description` - Description text
- `.section-link` - Section links

**Use When:** Updating home page specific sections

---

### 13. **responsive.css** - Responsive Design
Media queries for:
- Tablet layout (`@media (max-width: 700px)`)
- Mobile layout (`@media (max-width: 480px)`)
- Reduced motion (`@media (prefers-reduced-motion: reduce)`)

**Use When:** Adding or modifying responsive breakpoints

---

## Usage Guide

### For Simple Updates
1. **Changing a color?** → Edit `variables.css`
2. **Updating buttons?** → Edit `buttons.css`
3. **Modifying forms?** → Edit `forms.css`
4. **Adjusting fonts?** → Edit `typography.css`

### For Component Updates
1. Identify which file contains your component
2. Make your changes
3. Browser automatically reloads (no extra compilation needed)
4. Changes apply immediately

### For New Features
1. Create a new `.css` file in `frontend/css/`
2. Name it descriptively (e.g., `cards.css`, `alerts.css`)
3. Add `@import url("./new-file.css");` to `style.css`
4. Add a comment explaining the module's purpose

---

## Benefits of This Structure

✅ **Easy to Find** - Know exactly where to look for any style  
✅ **Easy to Verify** - View one feature at a time  
✅ **Easy to Maintain** - Changes in one area don't affect others  
✅ **Easy to Scale** - Add new feature files as needed  
✅ **Organized** - Clear, documented purpose for each file  
✅ **Modular** - Components are self-contained  

---

## Import Order (in style.css)

The order of imports matters for CSS cascading:

1. **Variables** - Must be first (used by all others)
2. **Base** - Global resets
3. **Typography** - Text-level styles
4. **Layout** - Page structure
5. **Navigation** - Fixed header
6. **Forms** - Input elements
7. **Buttons** - Interactive elements
8. **Content** - Lists & alerts
9. **Tables** - Data display
10. **Dialogs** - Modals
11. **Footer** - Page bottom
12. **Home Sections** - Home-specific
13. **Responsive** - Media queries (last!)

---

## Migration Notes

### What Changed
- Single 800+ line `style.css` → 13 modular files
- No functionality changes
- All styles preserved exactly as-is
- Improved organization and maintainability

### What Stayed the Same
- All CSS class names remain unchanged
- All HTML remains unchanged
- All visual appearance remains identical
- Performance is the same (CSS still loads the same)

---

## Verification Checklist

✅ All pages load without CSS errors  
✅ All colors display correctly  
✅ All buttons function properly  
✅ Forms render correctly  
✅ Tables display properly  
✅ Navigation appears correctly  
✅ Footer is positioned correctly  
✅ Responsive design works on mobile  
✅ No console CSS errors  

---

## Quick Reference by Feature

| Feature | File | Class Names |
|---------|------|------------|
| Colors | variables.css | `--brand`, `--ink`, etc. |
| Buttons | buttons.css | `.button-*` |
| Forms | forms.css | `input`, `select`, `label` |
| Tables | tables.css | `table`, `th`, `td` |
| Navigation | navigation.css | `.home-nav`, `.customer-nav` |
| Cards | page-layout.css | `.card` |
| Lists | content.css | `.customer-list` |
| Dialogs | dialogs.css | `dialog` |
| Footer | footer.css | `.site-footer` |
| Home Sections | home-sections.css | `.events-grid`, `.sections-grid` |
| Responsive | responsive.css | `@media` queries |

---

## Future Enhancements

- Consider breaking `page-layout.css` into `header.css` and `cards.css`
- Possibly separate `home-sections.css` into smaller modules
- Add a `utilities.css` for spacing, text, and helper classes
- Create a `themes.css` if dark mode is added

---

## Summary

The CSS architecture is now organized by feature/section, making it much easier to:
- Locate specific styles quickly
- Verify styles for individual components
- Make targeted changes without unintended side effects
- Scale the codebase as new features are added
- Maintain consistency across the site

All functionality remains identical, with improved code organization and maintainability! 🎉
