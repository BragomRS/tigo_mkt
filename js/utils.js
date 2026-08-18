/**
 * Utilidades genéricas y puras, sin estado y sin dependencias del resto de la app.
 */

function $(selector, scope = document) {
    return scope.querySelector(selector);
}

function $$(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
}

function debounce(fn, wait = 200) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), wait);
    };
}

function formatNumber(value, options = {}) {
    return new Intl.NumberFormat(CONFIG.language, options).format(value);
}

function formatDate(date, options = { dateStyle: "medium", timeStyle: "short" }) {
    return new Intl.DateTimeFormat(CONFIG.language, options).format(date);
}

function hexToRgba(hex, alpha = 1) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
