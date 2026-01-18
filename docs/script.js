// Performance Optimization: Debounce Function
function debounce(func, wait = 10) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if user prefers reduced motion (use MediaQueryList for dynamic updates)
const prefersReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let prefersReducedMotion = prefersReducedMotionQuery.matches;

// Listen for changes in motion preference
prefersReducedMotionQuery.addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
    // Apply or remove reduced motion styles dynamically
    if (prefersReducedMotion) {
        applyReducedMotionStyles();
    } else {
        removeReducedMotionStyles();
    }
});

// Function to apply reduced motion styles
function applyReducedMotionStyles() {
    if (!document.getElementById('reduced-motion-styles')) {
        const style = document.createElement('style');
        style.id = 'reduced-motion-styles';
        style.textContent = `
            .feature-card,
            .step,
            .use-case,
            .tech-item,
            .power-line,
            .power-chart-mockup {
                animation: none !important;
                transition: opacity 0.3s ease, transform 0.3s ease !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Function to remove reduced motion styles
function removeReducedMotionStyles() {
    const style = document.getElementById('reduced-motion-styles');
    if (style) {
        style.remove();
    }
}

// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            mobileMenuToggle.classList.toggle('active');
        });
    }
    
    // Close mobile menu when clicking on a link
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
        });
    });
});

// Demo Tabs Functionality
const demoTabs = document.querySelectorAll('.demo-tab');
const demoPanels = document.querySelectorAll('.demo-panel');

demoTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetPanel = tab.dataset.tab;
        
        // Remove active class from all tabs and panels
        demoTabs.forEach(t => t.classList.remove('active'));
        demoPanels.forEach(p => p.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding panel
        tab.classList.add('active');
        document.getElementById(targetPanel).classList.add('active');
    });
});

// Copy Code Functionality
const copyButtons = document.querySelectorAll('.copy-btn');

copyButtons.forEach(button => {
    button.addEventListener('click', () => {
        const codeId = button.dataset.copy + '-code';
        const codeElement = document.getElementById(codeId);
        
        if (codeElement) {
            const text = codeElement.textContent;
            
            // Copy to clipboard with fallback
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => {
                    // Visual feedback
                    const originalText = button.textContent;
                    button.textContent = 'Copied!';
                    button.style.background = '#48bb78';
                    
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.style.background = '';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    button.textContent = 'Failed';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                });
            } else {
                // Fallback for non-HTTPS or older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    const originalText = button.textContent;
                    button.textContent = 'Copied!';
                    button.style.background = '#48bb78';
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.style.background = '';
                    }, 2000);
                } catch (err) {
                    console.error('Fallback copy failed:', err);
                    button.textContent = 'Failed';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                } finally {
                    document.body.removeChild(textArea);
                }
            }
        }
    });
});

// Smooth Scroll for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        
        // Don't prevent default for empty hash
        if (href === '#') return;
        
        e.preventDefault();
        const target = document.querySelector(href);
        
        if (target) {
            const offsetTop = target.offsetTop - 80; // Account for fixed navbar
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// Intersection Observer for Fade-in Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            if (!prefersReducedMotion) {
                entry.target.style.transform = 'translateY(0)';
            }
        }
    });
}, observerOptions);

// Observe elements for animation
document.querySelectorAll('.feature-card, .step, .use-case, .tech-item').forEach(el => {
    el.style.opacity = '0';
    if (!prefersReducedMotion) {
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    } else {
        el.style.transition = 'opacity 0.6s ease-out';
    }
    observer.observe(el);
});

// Navbar Background and Parallax on Scroll
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

function handleScroll() {
    const currentScroll = window.pageYOffset;
    
    // Update navbar shadow
    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
    } else {
        navbar.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        navbar.style.background = '#ffffff';
    }
    
    // Apply parallax to hero only if motion is not reduced
    if (!prefersReducedMotion) {
        const hero = document.querySelector('.hero');
        if (hero && currentScroll < hero.offsetHeight) {
            const parallax = currentScroll * 0.5;
            hero.style.transform = `translateY(${parallax}px)`;
        }
    }
    
    lastScroll = currentScroll;
}

// Add active state to navigation based on scroll position
const sections = document.querySelectorAll('section[id]');

function highlightNavigation() {
    const scrollPosition = window.pageYOffset + 100;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');
        
        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-menu a').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}

// Combined scroll handler for better performance
function onScroll() {
    handleScroll();
    highlightNavigation();
}

// Use debounced scroll handler
const debouncedScroll = debounce(onScroll, 10);
window.addEventListener('scroll', debouncedScroll);

// Add Loading Animation to Buttons
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
        if (!prefersReducedMotion) {
            this.style.transform = 'translateY(-2px)';
        }
    });
    
    btn.addEventListener('mouseleave', function() {
        if (!prefersReducedMotion) {
            this.style.transform = 'translateY(0)';
        }
    });
});

// Counter Animation for Stats (if we add them later)
function animateCounter(element, target, duration = 2000) {
    let start = 0;
    const increment = target / (duration / 16);
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(start);
        }
    }, 16);
}

// Form Validation (if contact form is added)
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Console Easter Egg
console.log('%c⚡ MyHomePower', 'font-size: 24px; font-weight: bold; color: #667eea;');
console.log('%cBuilt with Vue.js and TensorFlow.js', 'font-size: 14px; color: #718096;');
console.log('%cContribute: https://github.com/fcrohas/MyHomePower', 'font-size: 12px; color: #667eea;');

// Track External Links (for analytics if needed)
document.querySelectorAll('a[href^="http"]').forEach(link => {
    link.addEventListener('click', (e) => {
        // Can add analytics tracking here
        console.log('External link clicked:', link.href);
    });
});

// Keyboard Navigation Enhancement
document.addEventListener('keydown', (e) => {
    // Press '/' to focus search (if we add it)
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    }
    
    // ESC to close mobile menu
    if (e.key === 'Escape') {
        const navMenu = document.querySelector('.nav-menu');
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        if (navMenu && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
        }
    }
});

// Lazy Load Images (when real screenshots are added)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            }
        });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Add tooltip functionality for features
const featureCards = document.querySelectorAll('.feature-card');
featureCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    });
});

// Print current year in footer
const yearElements = document.querySelectorAll('.current-year');
yearElements.forEach(el => {
    el.textContent = new Date().getFullYear();
});

// Apply initial reduced motion styles if needed
if (prefersReducedMotion) {
    applyReducedMotionStyles();
}

// Service Worker Registration (for PWA if needed in future)
if ('serviceWorker' in navigator) {
    // Uncomment when service worker is ready
    // window.addEventListener('load', () => {
    //     navigator.serviceWorker.register('/sw.js')
    //         .then(registration => console.log('SW registered:', registration))
    //         .catch(error => console.log('SW registration failed:', error));
    // });
}
