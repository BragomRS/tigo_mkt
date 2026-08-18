/**
 * Vista "Respuestas": selector múltiple de difusiones y botón "Aplicar".
 * La lista de difusiones que ofrece ya viene acotada por el filtro de mes
 * activo (quien la llama -- script.js -- le pasa las difusiones del
 * dashboardData ya filtrado, esta vista no vuelve a filtrar por fecha).
 *
 * Todavía no está definida qué información mostrar al aplicar la
 * selección: por ahora solo junta los nombres elegidos y se los entrega
 * al callback onApply.
 */

const RespuestasView = {

    _onApply: null,
    _selected: new Set(),

    init({ onApply } = {}) {
        this._onApply = onApply;
        this._bindEvents();
    },

    // difusiones: array de nombres crudos (campaign_name tal cual vienen en
    // dashboardData.tables.campaigns), ya acotados por el filtro de mes activo.
    setDifusiones(difusiones = []) {
        this._selected = new Set([...this._selected].filter((name) => difusiones.includes(name)));

        const list = $("#difusionesFilterList");
        if (!list) return;
        list.innerHTML = "";

        if (difusiones.length === 0) {
            list.appendChild(Components.createEmptyState({
                icon: "📭",
                message: "No hay difusiones en el mes seleccionado.",
            }));
            this._updateLabel();
            return;
        }

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
                this._updateLabel();
            });

            const text = document.createElement("span");
            text.textContent = formatDifusionName(name);

            option.append(checkbox, text);
            list.appendChild(option);
        });

        this._updateLabel();
    },

    _updateLabel() {
        const label = $("#difusionesFilterLabel");
        if (!label) return;

        const count = this._selected.size;
        label.textContent = count === 0
            ? "Seleccionar difusiones"
            : `${count} ${count === 1 ? "difusión" : "difusiones"} seleccionada${count === 1 ? "" : "s"}`;
    },

    _bindEvents() {
        const toggleBtn = $("#difusionesFilterToggle");
        const panel = $("#difusionesFilterPanel");
        const applyBtn = $("#difusionesFilterApply");
        const clearBtn = $("#difusionesFilterClear");

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
            $$("#difusionesFilterList input[type=checkbox]").forEach((checkbox) => {
                checkbox.checked = false;
            });
            this._updateLabel();
        });

        applyBtn?.addEventListener("click", () => {
            panel?.classList.remove("open");
            toggleBtn?.setAttribute("aria-expanded", "false");
            this._onApply?.([...this._selected]);
        });
    },

};
