// Mobile Navigation Toggle + Dropdown Support
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        var navToggle = document.querySelector('.nav-toggle');
        var navLinks = document.querySelector('.nav-links');

        if (!navToggle || !navLinks) return;

        navToggle.addEventListener('click', function() {
            navToggle.classList.toggle('active');
            navLinks.classList.toggle('open');
        });

        // Close menu when clicking a direct nav link (not dropdown toggles)
        navLinks.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                navToggle.classList.remove('active');
                navLinks.classList.remove('open');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
                navToggle.classList.remove('active');
                navLinks.classList.remove('open');
            }
        });

        // Dropdown toggles (mobile: click, desktop: CSS hover/focus-within)
        var dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');
        dropdownToggles.forEach(function(toggle) {
            toggle.addEventListener('click', function(e) {
                e.preventDefault();
                var expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', String(!expanded));
                var dropdown = toggle.nextElementSibling;
                if (dropdown) {
                    dropdown.classList.toggle('open');
                }
            });
        });

        // Escape key closes dropdowns
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                dropdownToggles.forEach(function(toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                    var dropdown = toggle.nextElementSibling;
                    if (dropdown) dropdown.classList.remove('open');
                });
            }
        });
    });
})();
