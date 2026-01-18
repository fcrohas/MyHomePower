# MyHomePower GitHub Pages Website

This directory contains the GitHub Pages website for the MyHomePower project.

## Structure

- `index.html` - Main landing page with all sections
- `styles.css` - Complete styling and responsive design
- `script.js` - Interactive features and animations

## Features

The website includes:

- **Hero Section** - Eye-catching introduction with gradient background
- **Features Grid** - Showcases 8 key features with icons and descriptions
- **How It Works** - Step-by-step guide with numbered steps
- **Demo Sections** - Tabbed interface for different features
- **Technology Stack** - Technologies used in the project
- **Getting Started** - Installation instructions with code blocks
- **Use Cases** - Real-world applications
- **CTA Section** - Call to action buttons
- **Footer** - Links to documentation and resources

## Design

- Modern gradient design with purple/blue theme
- Fully responsive (mobile, tablet, desktop)
- Smooth animations and transitions
- Interactive demo tabs
- Copy-to-clipboard functionality
- Smooth scrolling navigation
- Parallax effects
- Intersection Observer animations

## Deployment

The site is automatically deployed to GitHub Pages via GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) on every push to the main branch.

### Manual Deployment

If needed, you can also configure GitHub Pages manually:

1. Go to repository Settings > Pages
2. Source: Deploy from a branch
3. Branch: Select main/master
4. Folder: Select `/docs`
5. Save

## Local Development

To test the website locally:

1. Open `docs/index.html` in a web browser
2. Or use a local server:
   ```bash
   cd docs
   python -m http.server 8000
   # Visit http://localhost:8000
   ```

## Customization

### Colors

Edit CSS variables in `styles.css`:

```css
:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --accent-color: #f093fb;
    /* ... more colors */
}
```

### Content

Edit sections directly in `index.html`:

- Hero title/subtitle
- Feature cards
- Demo descriptions
- Installation instructions
- Footer links

### Screenshots

When you have actual screenshots:

1. Add images to the `docs/` folder
2. Replace `.screenshot-placeholder` divs with `<img>` tags:
   ```html
   <img src="screenshot-name.png" alt="Description">
   ```

## Adding New Sections

To add a new section:

1. Add HTML in `index.html`:
   ```html
   <section id="new-section" class="new-section">
       <div class="container">
           <h2 class="section-title">Section Title</h2>
           <!-- content -->
       </div>
   </section>
   ```

2. Add styling in `styles.css`:
   ```css
   .new-section {
       padding: 5rem 0;
       background: var(--bg-light);
   }
   ```

3. Add to navigation if needed:
   ```html
   <li><a href="#new-section">New Section</a></li>
   ```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Optimized CSS with CSS Grid and Flexbox
- Debounced scroll handlers
- Intersection Observer for animations
- Reduced motion support for accessibility
- Lazy loading ready for images

## Accessibility

- Semantic HTML5 elements
- ARIA labels for interactive elements
- Keyboard navigation support
- Responsive font sizes
- High contrast colors
- Focus states for interactive elements

## Future Enhancements

Potential additions:

- [ ] Add real screenshots from the application
- [ ] Add animated GIFs showing features in action
- [ ] Blog section for updates
- [ ] Search functionality
- [ ] Dark mode toggle
- [ ] Language switcher (i18n)
- [ ] Contact form
- [ ] Newsletter signup
- [ ] Video demos
- [ ] User testimonials
- [ ] FAQ section

## License

Same as the main project: CC BY-NC-SA 4.0
