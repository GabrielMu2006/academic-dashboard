# Academic Dashboard Theme-Author Contract

Status: Phase 12 public visual contract

The Academic Dashboard follows Obsidian's semantic variables by default. A
theme may customize the Dashboard without targeting component internals by
overriding only the `--academic-dashboard-*` variables on
`.academic-dashboard-view`.

Component class names, GridStack markup, DOM order, and data attributes are not
theme APIs. Themes must not depend on them.

## Surfaces and material

| Variable | Default semantic fallback | Role |
| --- | --- | --- |
| `--academic-dashboard-shell` | `--background-primary` | Full Dashboard canvas |
| `--academic-dashboard-toolbar` | translucent `--background-secondary` | Sticky toolbar material |
| `--academic-dashboard-panel` | `--background-secondary` | Widget and primary panel surface |
| `--academic-dashboard-panel-elevated` | `--background-secondary-alt` | Hover/elevated/fallback surface |
| `--academic-dashboard-surface-hover` | `--background-modifier-hover` | Hovered interactive surface |
| `--academic-dashboard-surface-active` | `--background-modifier-active-hover` | Pressed surface |
| `--academic-dashboard-surface-inset` | `--background-modifier-form-field` | Inputs and compact inset controls |
| `--academic-dashboard-reading-surface` | `--background-primary` | Rows and sustained-reading content |
| `--academic-dashboard-blur` | `16px` | Optional toolbar backdrop blur |

The toolbar must remain readable without transparency. If backdrop filters are
unsupported or reduced transparency is requested, the Dashboard uses the
elevated opaque panel role.

## Text, border, and interaction

| Variable | Default semantic fallback | Role |
| --- | --- | --- |
| `--academic-dashboard-text` | `--text-normal` | Primary text |
| `--academic-dashboard-text-muted` | `--text-muted` | Secondary text and metadata |
| `--academic-dashboard-text-faint` | `--text-faint` | Tertiary labels |
| `--academic-dashboard-border` | `--background-modifier-border` | Default 1 px boundary |
| `--academic-dashboard-border-strong` | `--background-modifier-border-hover` | Hovered/emphasized boundary |
| `--academic-dashboard-divider` | `--background-modifier-border` | Row and section divider |
| `--academic-dashboard-accent` | `--interactive-accent` | Selection and primary action |
| `--academic-dashboard-accent-hover` | `--interactive-accent-hover` | Hovered primary action |
| `--academic-dashboard-accent-soft` | 14-18% semantic accent mix | Selected background |
| `--academic-dashboard-accent-strong` | `--text-on-accent` | Text on saturated accent |
| `--academic-dashboard-activity-level-0` | Inset surface | Empty activity day |
| `--academic-dashboard-activity-level-1` | Solid semantic error | Low activity |
| `--academic-dashboard-activity-level-2` | Solid red-magenta mix | Moderate activity |
| `--academic-dashboard-activity-level-3` | Solid magenta-purple mix | High activity |
| `--academic-dashboard-activity-level-4` | Hovered semantic accent | Highest activity |
| `--academic-dashboard-focus` | `--background-modifier-border-focus` | Keyboard focus ring |

Accent and focus roles must preserve sufficient contrast against their actual
surfaces. Color cannot replace the existing text, icon, border, shape, pressed,
or ARIA state cues.

## Semantic state and personal markers

| Variable | Default semantic fallback | Role |
| --- | --- | --- |
| `--academic-dashboard-info` | `--color-blue` | Loading/information marker |
| `--academic-dashboard-success` | `--text-success` / `--color-green` | Success and ready state |
| `--academic-dashboard-warning` | `--text-warning` / `--color-orange` | Unavailable/recovery state |
| `--academic-dashboard-error` | `--text-error` / `--color-red` | Error state |
| `--academic-dashboard-info-soft` | 12% info mix | Information surface |
| `--academic-dashboard-success-soft` | 12% success mix | Success surface |
| `--academic-dashboard-warning-soft` | 12% warning mix | Warning surface |
| `--academic-dashboard-error-soft` | 12% error mix | Error surface |
| `--academic-dashboard-favorite` | `--color-yellow` / `--text-accent` | Favorite marker |

State surfaces must remain low saturation and readable. Paper/reading surfaces
must never use a saturated brand gradient.

## Radius, shadow, and rhythm

| Variable | Default semantic fallback | Role |
| --- | --- | --- |
| `--academic-dashboard-radius-xs` | `--radius-s` / `6px` | Calendar cells and compact controls |
| `--academic-dashboard-radius-sm` | `--radius-s` / `8px` | Inputs, rows, and buttons |
| `--academic-dashboard-radius-md` | `--radius-m` / `10px` | Navigation controls |
| `--academic-dashboard-radius-lg` | `--radius-l` / `12px` | Widgets and panels |
| `--academic-dashboard-radius-toolbar` | `--radius-l` / `16px` | Toolbar shell |
| `--academic-dashboard-shadow-panel` | `--shadow-s` / `none` | Widget depth |
| `--academic-dashboard-shadow-toolbar` | `--shadow-s` / `none` | Sticky toolbar depth |
| `--academic-dashboard-shadow-edit` | `--shadow-s` / `none` | Resize handle depth |
| `--academic-dashboard-space-page` | `--size-4-5` | Major vertical rhythm |
| `--academic-dashboard-space-panel` | `--size-4-4` | Widget padding |
| `--academic-dashboard-space-control-x` | `--size-4-3` | Horizontal control padding |
| `--academic-dashboard-space-control-y` | `--size-2-2` | Vertical control padding |

## Example override

This example demonstrates scope only; it is not the PaperPulse Academic theme.

```css
.theme-dark .academic-dashboard-view {
  --academic-dashboard-panel: var(--background-secondary);
  --academic-dashboard-reading-surface: var(--background-primary);
  --academic-dashboard-accent: var(--interactive-accent);
  --academic-dashboard-accent-hover: var(--interactive-accent-hover);
  --academic-dashboard-favorite: var(--color-yellow);
  --academic-dashboard-radius-lg: 12px;
}
```

Theme authors should define Light and Dark overrides separately when their
surface hierarchy differs. They should also test default, hover, active,
disabled, focus-visible, invalid, loading, empty, unavailable, success,
conflict/error, edit-layout, reduced-motion, increased-contrast, forced-colors,
and reduced-transparency presentations at 100-200% zoom.
