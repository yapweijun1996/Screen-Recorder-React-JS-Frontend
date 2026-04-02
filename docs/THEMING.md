# Theming Guide

ScreenClip Pro uses a CSS variable-based theme system integrated with Tailwind CSS. The theme automatically adapts between light and dark mode.

## Architecture

```
index.html          → Inline script prevents flash of wrong theme
src/index.css       → CSS variables for light/dark color tokens
tailwind.config.js  → Tailwind `th-*` color utilities mapped to CSS vars
src/context/ThemeContext.tsx → React context for theme state
src/components/ThemeToggle.tsx → UI toggle button
```

## How It Works

1. **Before React loads**: An inline `<script>` in `index.html` reads `localStorage('screenclip.theme')` and applies the `dark` class to `<html>` to prevent flash.
2. **ThemeProvider**: Wraps the app, manages theme state, syncs to `localStorage` and the `dark` class.
3. **CSS Variables**: Defined in `:root` (light) and `.dark` (dark) in `index.css`.
4. **Tailwind Utilities**: `th-*` colors reference CSS variables with alpha support.

## Color Token Reference

### Base Surfaces

| Token | Tailwind Class | Light | Dark |
|-------|---------------|-------|------|
| `--c-base` | `bg-th-base` | slate-100 `#f1f5f9` | slate-900 `#0f172a` |
| `--c-surface` | `bg-th-surface` | white `#ffffff` | slate-800 `#1e293b` |
| `--c-card` | `bg-th-card` | slate-50 `#f8fafc` | slate-800 `#1e293b` |
| `--c-input` | `bg-th-input` | slate-100 `#f1f5f9` | slate-700 `#334155` |
| `--c-deep` | `bg-th-deep` | slate-900 `#0f172a` | slate-950 `#020617` |

> `th-deep` is for always-dark areas: video player, timeline track.

### Text Colors

| Token | Tailwind Class | Light | Dark |
|-------|---------------|-------|------|
| `--c-text` | `text-th-primary` | slate-900 `#0f172a` | slate-100 `#f1f5f9` |
| `--c-text-secondary` | `text-th-secondary` | slate-700 `#334155` | slate-400 `#94a3b8` |
| `--c-text-tertiary` | `text-th-tertiary` | slate-600 `#475569` | slate-500 `#64748b` |
| `--c-text-muted` | `text-th-muted` | slate-500 `#64748b` | slate-600 `#475569` |
| `--c-text-faint` | `text-th-faint` | slate-400 `#94a3b8` | slate-700 `#334155` |

### Border Colors

| Token | Tailwind Class | Light | Dark |
|-------|---------------|-------|------|
| `--c-border` | `border-th-edge` | slate-300 `#cbd5e1` | slate-800 `#1e293b` |
| `--c-divider` | `border-th-divider` | slate-200 `#e2e8f0` | slate-700 `#334155` |

### Adaptive Accent Colors

These CSS utility classes automatically switch between light-safe and dark-safe colors:

| Class | Light | Dark | Usage |
|-------|-------|------|-------|
| `.text-accent-indigo` | indigo-600 | indigo-300 | Highlighted values, links |
| `.text-accent-purple` | purple-600 | purple-300 | Settings icons, labels |
| `.text-accent-emerald` | emerald-600 | emerald-300 | Success states |
| `.accent-indigo-active` | indigo-50 bg + indigo-700 text | indigo-900 bg + indigo-200 text | Active toggle/button |
| `.accent-purple-active` | purple-50 bg + purple-700 text | purple-900 bg + purple-200 text | Active toggle/button |
| `.accent-emerald-active` | emerald-50 bg + emerald-700 text | emerald-900 bg + emerald-200 text | Active toggle/button |

## Usage Guidelines

### DO

```tsx
// Use semantic theme colors for neutral surfaces/text
<div className="bg-th-surface text-th-primary border-th-edge">

// Use adaptive accent classes for interactive states
<button className={active ? 'accent-indigo-active' : 'bg-th-card text-th-secondary'}>

// Use dark: prefix for accent colors that differ by theme
<Icon className="text-indigo-600 dark:text-indigo-400" />
```

### DON'T

```tsx
// Don't use hardcoded slate colors for neutral UI
<div className="bg-slate-900 text-slate-100">  // BAD

// Don't use light accent text on variable backgrounds
<span className="text-emerald-100">  // Invisible in light mode
```

### Always-Dark Areas

The video player and timeline are always dark regardless of theme. Use hardcoded dark colors (`bg-slate-950`, `text-white`, `text-slate-400`) inside these areas:

- `EditorPlayer` — video preview area
- `ProTimeline` — timeline track and clips
- `RecorderPreview` — recording preview area

## Adding New Components

1. Use `th-*` classes for all neutral colors
2. Use `dark:` prefix when accent colors need different values per theme
3. Use `.accent-*-active` classes for selected/active states
4. Test both themes — run `npm run dev` and toggle with the header button
