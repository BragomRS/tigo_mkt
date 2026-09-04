/**
 * Vista "Clics en links": selector múltiple de difusiones, igual al de
 * "Análisis de entregas" (js/entregas.js) -- arranca con TODAS las
 * difusiones seleccionadas por defecto.
 */

const ClicksView = {

    _onApply: null,
    _selected: new Set(),
    _hasInitialized: false,

    init({ onApply } = {}) {
        this._onApply = onApply;
        this._bindEvents();
    },

    // difusiones: array de nombres crudos (campaign_name tal cual vienen en
    // dashboardData.tables.campaigns), ya acotados por el filtro de mes activo.
    setDifusiones(difusiones = []) {
        const isFirstLoad = !this._hasInitialized;

        if (isFirstLoad) {
            // Primera carga: todas seleccionadas por defecto.
            this._selected = new Set(difusiones);
            this._hasInitialized = true;
        } else {
            this._selected = new Set([...this._selected].filter((name) => difusiones.includes(name)));
        }

        const list = $("#clicksFilterList");
        const selectAll = $("#clicksFilterSelectAll");
        if (!list) return;
        list.innerHTML = "";

        if (difusiones.length === 0) {
            list.appendChild(Components.createEmptyState({
                icon: "📭",
                message: "No hay difusiones en el mes seleccionado.",
            }));
            if (selectAll) {
                selectAll.checked = false;
                selectAll.disabled = true;
            }
            this._updateLabel();
            return;
        }

        if (selectAll) selectAll.disabled = false;

        difusiones.forEach((name) => {
            const option = document.createElement("label");
            option.className = "difusion-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = name;
            checkbox.checked = this._selected.has(name);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) this._selected.add(name);
                else this._selected.delete(name);
                this._syncSelectAll();
                this._updateLabel();
            });

            const text = document.createElement("span");
            text.textContent = formatDifusionName(name);

            option.append(checkbox, text);
            list.appendChild(option);
        });

        this._syncSelectAll();
        this._updateLabel();

        // La primera vez que hay difusiones disponibles, se pintan los
        // gráficos de una con la selección por defecto (todas), sin esperar
        // a que el usuario toque "Aplicar".
        if (isFirstLoad) {
            this._onApply?.([...this._selected]);
        }
    },

    // El checkbox "Seleccionar todos" refleja el estado actual: marcado solo
    // si TODAS las difusiones listadas están seleccionadas.
    _syncSelectAll() {
        const selectAll = $("#clicksFilterSelectAll");
        if (!selectAll) return;

        const checkboxes = $$("#clicksFilterList input[type=checkbox]");
        selectAll.checked = checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);
    },

    _updateLabel() {
        const label = $("#clicksFilterLabel");
        if (!label) return;

        const count = this._selected.size;
        label.textContent = count === 0
            ? "Seleccionar difusiones"
            : `${count} ${count === 1 ? "difusión" : "difusiones"} seleccionada${count === 1 ? "" : "s"}`;
    },

    _bindEvents() {
        const toggleBtn = $("#clicksFilterToggle");
        const panel = $("#clicksFilterPanel");
        const applyBtn = $("#clicksFilterApply");
        const clearBtn = $("#clicksFilterClear");
        const selectAll = $("#clicksFilterSelectAll");

        selectAll?.addEventListener("change", () => {
            const checkboxes = $$("#clicksFilterList input[type=checkbox]");
            checkboxes.forEach((checkbox) => {
                checkbox.checked = selectAll.checked;
                if (selectAll.checked) this._selected.add(checkbox.value);
                else this._selected.delete(checkbox.value);
            });
            this._updateLabel();
        });

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

        clearBtn?.addEventListener("click", () => {
            this._selected.clear();
            $$("#clicksFilterList input[type=checkbox]").forEach((checkbox) => {
                checkbox.checked = false;
            });
            if (selectAll) selectAll.checked = false;
            this._updateLabel();
        });

        applyBtn?.addEventListener("click", () => {
            panel?.classList.remove("open");
            toggleBtn?.setAttribute("aria-expanded", "false");
            this._onApply?.([...this._selected]);
        });
    },

};
