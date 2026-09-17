---
name: Obsidian Executive OS
colors:
  surface: '#10131b'
  surface-dim: '#10131b'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#181c23'
  surface-container: '#1c2027'
  surface-container-high: '#272a32'
  surface-container-highest: '#32353d'
  on-surface: '#e0e2ed'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#e0e2ed'
  inverse-on-surface: '#2d3038'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e79400'
  on-tertiary-container: '#563400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#10131b'
  on-background: '#e0e2ed'
  surface-variant: '#32353d'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  stack-compact: 8px
  stack-dense: 4px
---

## Brand & Style
The design system is engineered for high-performance cognitive workflows. It adopts an **Executive Dark Mode** aesthetic—a synthesis of high-density SaaS utility and futuristic "HUD" (Heads-Up Display) precision. The visual narrative centers on "Obsidian Intelligence": deep, expansive voids punctuated by razor-sharp accents.

The style leverages **Glassmorphism** and **High-Tech Minimalism**. Surfaces are not merely containers but semi-transparent layers of data floating in a midnight charcoal expanse. Every element is designed to feel like a high-end tool, using 1px "micro-borders" and subtle neon glows to indicate focus and system vitality. The emotional response is one of absolute control, clarity, and intellectual rigor.

## Colors
The palette is rooted in the **Obsidian Midnight** spectrum to minimize eye strain during deep work. 

- **Base Layer:** The background uses `#070A11`, providing a near-black canvas that allows vibrant accents to pop without creating harsh contrast.
- **Surface Layer:** Functional cards and containers utilize `#111726`.
- **Primary Accent (Cyber Cyan):** Reserved for the "active" pulse of the system—focus states, primary buttons, and progress indicators.
- **Semantic Accents:** 
  - **Royal Indigo:** Knowledge nodes, search bars, and intellectual exploration.
  - **Amber Gold:** Achievement, gamification, and "LeetCode" style proficiency tracking.
  - **Emerald & Crimson:** Strict utility for system status and error correction.

## Typography
The typographic hierarchy distinguishes between **Executive UI** and **Data Precision**. 

**Plus Jakarta Sans** is used for headlines to provide a sophisticated, slightly rounded technical feel. **Inter** handles the heavy lifting of body text for maximum legibility in dense information environments. **JetBrains Mono** is strictly reserved for quantitative data, timestamps, code snippets, and system labels, reinforcing the "OS" feel. 

Typography should be kept compact; use `body-md` for standard reading and `body-sm` for secondary metadata to maintain high information density.

## Layout & Spacing
This system utilizes a **Dense Fluid Grid** optimized for power users. The base spacing unit is **4px**, allowing for tight alignments characteristic of professional SaaS dashboards.

- **Desktop:** 12-column grid with 16px gutters. Sidebars should be fixed (240px-280px) to anchor the navigation, while the main content area remains fluid.
- **Density:** Favor "Compact" spacing. Vertical margins between related items in a list should use `stack-dense` (4px), while separate sections use `stack-compact` (8px).
- **Margins:** Use a consistent 24px outer safe area for desktop, scaling down to 16px for mobile.

## Elevation & Depth
Depth is achieved through **Tonal Layering and Glassmorphism** rather than traditional drop shadows.

- **Surface 0:** Obsidian Background (#070A11).
- **Surface 1:** Slate Cards (#111726) with a 1px border (#1E293B).
- **Surface 2 (Floating/Modals):** Same as Surface 1 but with a `backdrop-filter: blur(12px)` and a slightly brighter border (#334155).

**Interaction States:** On hover, cards should transition their border color to Cyber Cyan (#06B6D4) and apply a subtle `0px 0px 15px rgba(6, 182, 212, 0.15)` outer glow to simulate system activation.

## Shapes
The shape language balances "Executive Sharpness" with modern "Soft-Tech."

- **Standard Containers:** Use `rounded-xl` (1.5rem / 24px) for main dashboard cards to create a premium, cohesive look.
- **UI Controls:** Buttons, inputs, and small modules use `rounded-md` (0.5rem / 8px) to maintain a sense of precision.
- **Badges/Tags:** Fully pill-shaped for quick visual scanning.

## Components
- **Buttons:** 
  - *Primary:* Solid Cyber Cyan with JetBrains Mono bold text. 
  - *Ghost:* 1px border (#1E293B) with text that glows on hover.
- **Inputs:** Darker than the surface (#090D16), 1px border. Focus state triggers a full Cyber Cyan border glow.
- **Knowledge Cards:** High-density layout. Header uses Plus Jakarta Sans, content uses Inter. Bottom metadata row uses JetBrains Mono.
- **Activity Heatmaps:** Use Emerald Green for consistency/success streaks.
- **Command Palette:** The centerpiece of the OS. Centralized, heavy backdrop blur (20px), Royal Indigo glow on the search icon.
- **Progress Bars:** Thin 4px tracks. The "fill" should have a subtle linear gradient from Primary to Secondary colors.