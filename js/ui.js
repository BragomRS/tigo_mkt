/**
 * Comportamientos de interfaz reutilizables: tema, sidebar, loader y notificaciones.
 * No conoce datos de negocio, solo manipula el DOM y el estado visual de la app.
 */

const UI = {

    initTheme() {
        const savedTheme = localStorage.getItem("theme") || CONFIG.theme;
        document.documentElement.setAttribute("data-theme", savedTheme);
        this.updateThemeToggleIcon(savedTheme);
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
        this.updateThemeToggleIcon(next);
        document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
    },

    updateThemeToggleIcon(theme) {
        const btn = $("#themeToggle");
        if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
    },

    toggleSidebar() {
        $("#sidebar")?.classList.toggle("collapsed");
        $(".main-content")?.classList.toggle("sidebar-collapsed");
    },

    showLoader() {
        $("#loaderOverlay")?.classList.add("visible");
    },

    hideLoader() {
        $("#loaderOverlay")?.classList.remove("visible");
    },

    showNotification(message, type = "info", duration = 4000) {
        const container = $("#notificationContainer");
        if (!container) return;

        const notification = document.createElement("div");
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        container.appendChild(notification);
        setTimeout(() => notification.classList.add("visible"), 10);

        setTimeout(() => {
            notification.classList.remove("visible");
            setTimeout(() => notification.remove(), 300);
        }, duration);
    },

};
