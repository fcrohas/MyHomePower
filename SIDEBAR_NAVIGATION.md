# Sidebar Navigation - Feature Update

**Date**: December 31, 2025  
**Update**: Converted horizontal tab navigation to collapsible sidebar

## Overview

The application navigation has been upgraded from a horizontal tab bar to a modern collapsible sidebar menu. This provides better space utilization and a more intuitive navigation experience.

## Features

### 🎯 Collapsible Sidebar

- **Normal Mode** (250px): Full sidebar with icons and text labels
- **Mini Mode** (70px): Collapsed sidebar showing only icons
- **Toggle Button**: Click the ☰/✕ button to collapse/expand
- **Persistent State**: Your preference is saved in localStorage

### 📱 Responsive Design

- **Desktop**: Full sidebar functionality with collapse toggle
- **Tablet**: Adjustable sidebar for optimal space usage
- **Mobile**: Horizontal bottom navigation bar (auto-adapts)

### 🎨 Visual Design

- **Dark Background**: Professional #2c3e50 color scheme
- **Active Indicator**: Green accent bar and background highlight
- **Smooth Animations**: 300ms transitions for all state changes
- **Hover Effects**: Visual feedback on interaction

## Navigation Items

| Icon | Label | Purpose |
|------|-------|---------|
| 📊 | Power Tagging | Tag and label power consumption periods |
| 🧠 | ML Trainer | Train machine learning models |
| 🔍 | Power Detector | Detect appliance usage patterns |
| 🔬 | Anomaly Detector | Find unusual power consumption |
| 📚 | Libraries | Manage appliance model library |

## Usage

### Desktop/Tablet

1. **Expand/Collapse**: Click the toggle button (☰/✕) at the top
2. **Navigate**: Click any menu item to switch views
3. **Hover Tooltips**: In mini mode, hover for full labels

### Mobile

- Sidebar automatically converts to horizontal bottom bar
- All labels remain visible
- Swipe horizontally to access all items

## Keyboard Shortcuts

While focused on sidebar items:
- **Enter/Space**: Activate selected item
- **Tab**: Navigate between items
- **Shift+Tab**: Navigate backwards

## Customization

### Adjusting Sidebar Width

Edit in `PowerViewer.vue`:

```css
.sidebar {
  width: 250px;  /* Normal width */
}

.sidebar.collapsed {
  width: 70px;   /* Mini width */
}
```

### Changing Colors

```css
.sidebar {
  background: #2c3e50;  /* Dark blue-gray */
}

.sidebar-item.active {
  border-left-color: #42b983;  /* Green accent */
}
```

### Animation Speed

```css
.sidebar {
  transition: width 0.3s ease;  /* Adjust timing */
}
```

## Technical Details

### State Management

```javascript
// Sidebar collapse state (persisted in localStorage)
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')

// Toggle function
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed.value)
}
```

### Layout Structure

```
.viewer-container (flex container)
├── .sidebar (aside element)
│   ├── .sidebar-toggle (button)
│   └── .sidebar-nav
│       ├── .sidebar-item × 5
│       │   ├── .sidebar-icon
│       │   └── .sidebar-label
└── .main-area (main content)
    └── .tab-content (active view)
```

### CSS Classes

- `.sidebar`: Main sidebar container
- `.sidebar.collapsed`: Mini mode state
- `.sidebar-toggle`: Collapse/expand button
- `.sidebar-nav`: Navigation menu container
- `.sidebar-item`: Individual menu item
- `.sidebar-item.active`: Currently selected item
- `.sidebar-icon`: Icon display
- `.sidebar-label`: Text label (hidden in mini mode)
- `.main-area`: Content area

## Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

- **Semantic HTML**: Uses `<aside>`, `<nav>`, `<button>` elements
- **ARIA Labels**: Title attributes on collapsed items
- **Keyboard Navigation**: Full keyboard support
- **Focus Indicators**: Visible focus states
- **Screen Readers**: Proper element labeling

## Performance

- **Minimal Reflow**: CSS transitions for smooth performance
- **GPU Acceleration**: Transform-based animations
- **Lazy Rendering**: Content loads only when active
- **Memory Efficient**: Single DOM structure

## Migration Notes

### Changed Components

- `PowerViewer.vue`: Complete navigation restructure
  - Removed: `.tab-navigation` and `.tab-btn`
  - Added: `.sidebar`, `.sidebar-nav`, `.sidebar-item`
  - Added: `sidebarCollapsed` reactive state
  - Added: `toggleSidebar()` method

### Layout Changes

- Container changed from single-column to flexbox
- Content area now in `.main-area` wrapper
- Height constraint: `calc(100vh - 60px)` for full viewport

### CSS Breakpoints

- Desktop: > 768px (full sidebar)
- Mobile: ≤ 768px (horizontal bar)

## Best Practices

### For Users

1. **Maximize Space**: Collapse sidebar when viewing charts
2. **Quick Access**: Keep expanded for frequent navigation
3. **Mobile**: Swipe horizontally for all options

### For Developers

1. **Maintain Consistency**: Keep icon sizing uniform
2. **Test Responsiveness**: Verify on all breakpoints
3. **Preserve State**: Always sync with localStorage
4. **Accessibility**: Maintain ARIA labels and keyboard nav

## Troubleshooting

### Sidebar Won't Collapse

- Check browser console for JavaScript errors
- Verify localStorage is enabled
- Clear browser cache and reload

### Items Not Visible in Mini Mode

- Icons may be too small - adjust `.sidebar-icon` font-size
- Check if labels are properly hidden with CSS

### Mobile View Issues

- Ensure viewport meta tag is present: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- Test on actual devices, not just browser DevTools

### Animations Stuttering

- Check for expensive operations during state changes
- Reduce animation complexity or duration
- Use CSS `will-change` property for smoother transitions

## Future Enhancements

### Planned Improvements

1. **User Preferences**: Save sidebar width preferences
2. **Drag to Resize**: Allow manual width adjustment
3. **Nested Menus**: Submenu support for related features
4. **Quick Actions**: Right-click context menus
5. **Search**: Filter navigation items
6. **Badges**: Notification indicators on menu items
7. **Themes**: Light/dark sidebar themes

### Community Requests

- Custom icon sets
- Sidebar position (left/right)
- Pinned items feature
- Recent items list

## Comparison: Before & After

### Before (Horizontal Tabs)

- ❌ Fixed horizontal space
- ❌ Limited menu items (5-7 max)
- ❌ No collapse option
- ❌ Poor mobile UX
- ✅ Simple layout

### After (Collapsible Sidebar)

- ✅ Flexible vertical space (unlimited items)
- ✅ Collapsible to save space
- ✅ Professional appearance
- ✅ Better mobile experience
- ✅ Persistent user preferences

## Changelog

### v2.0.0 - December 31, 2025

**Added**
- Collapsible sidebar navigation
- Mini mode (icon-only view)
- Normal mode (icon + text view)
- Persistent state in localStorage
- Responsive mobile horizontal bar
- Smooth CSS transitions
- Hover tooltips in mini mode

**Changed**
- Layout from single column to flexbox
- Navigation from horizontal tabs to vertical sidebar
- Color scheme to dark sidebar with green accents

**Removed**
- Old tab navigation system
- Horizontal tab bar styles

## Support

For questions or issues:
1. Check browser console for errors
2. Verify CSS is loading correctly
3. Test in different browsers
4. Review localStorage for saved state
5. Clear cache and reload if needed

---

**Enjoy your new collapsible sidebar navigation!** 🎉
