/**
 * Control de filtro por mes/año del header.
 * Solo maneja la interacción del selector (abrir/cerrar panel, poblar
 * opciones, actualizar la etiqueta del botón). No conoce dashboardData
 * ni cómo se reprocesa el CSV: delega ambos cambios (aplicar/limpiar)
 * a los callbacks que le pase quien lo inicializa (script.js).
 */

const MonthFilter = {

    _onApply: null,
    _onReset: null,

    init({ onApply, onReset } = {}) {
        this._onApply = onApply;
        this._onReset = onReset;

        this._populateSelects();
        this._bindEvents();
    },

    setActive(year, month) {
        const monthSelect = $("#monthFilterMonth");
        const yearSelect = $("#monthFilterYear");
        if (monthSelect) monthSelect.value = String(month);
        if (yearSelect) yearSelect.value = String(year);
        this._updateLabel(year, month);
    },

    setLabelAll() {
        const label = $("#monthFilterLabel");
        if (label) label.textContent = "Todo el histórico";
    },

    _updateLabel(year, month) {
        const label = $("#monthFilterLabel");
        if (!label) return;

        const monthName = new Intl.DateTimeFormat(CONFIG.language, { month: "long" })
            .format(new Date(year, month - 1, 1));
        label.textContent = `${capitalize(monthName)} ${year}`;
    },

    _populateSelects() {
        const monthSelect = $("#monthFilterMonth");
        const yearSelect = $("#monthFilterYear");
        if (!monthSelect || !yearSelect) return;

        for (let m = 1; m <= 12; m++) {
            const name = new Intl.DateTimeFormat(CONFIG.language, { month: "long" })
                .format(new Date(2000, m - 1, 1));
            const option = document.createElement("option");
            option.value = String(m);
            option.textContent = capitalize(name);
            monthSelect.appendChild(option);
        }

        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= currentYear - 4; y--) {
            const option = document.createElement("option");
            option.value = String(y);
            option.textContent = String(y);
            yearSelect.appendChild(option);
        }
    },

    _bindEvents() {
        const toggleBtn = $("#monthFilterToggle");
        const panel = $("#monthFilterPanel");
        const applyBtn = $("#monthFilterApply");
        const resetBtn = $("#monthFilterReset");

        toggleBtn?.addEventListener("click", (event) => {
            event.stopPropagation();
            const isOpen = panel?.classList.toggle("open");
            toggleBtn.setAttribute("aria-expanded", String(!!isOpen));
        });

        document.addEventListener("click", (event) => {
            if (!panel?.classList.contains("open")) return;
            if (panel.contains(event.target) || toggleBtn?.contains(event.target)) return;
            panel.classList.remove("open");
            toggleBtn?.setAttribute("aria-expanded", "false");
        });

        applyBtn?.addEventListener("click", () => {
            const year = Number($("#monthFilterYear").value);
            const month = Number($("#monthFilterMonth").value);

            this._updateLabel(year, month);
            panel?.classList.remove("open");
            toggleBtn?.setAttribute("aria-expanded", "false");

            this._onApply?.(year, month);
        });

        resetBtn?.addEventListener("click", () => {
            this.setLabelAll();
            panel?.classList.remove("open");
            toggleBtn?.setAttribute("aria-expanded", "false");

            this._onReset?.();
        });
    },

};
