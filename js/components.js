/**
 * Fábricas de componentes de UI reutilizables.
 * Devuelven elementos DOM listos para insertar; no conocen Chart.js
 * ni de dónde vienen los datos (eso lo maneja charts.js / dashboard.js).
 * Construyen el DOM con createElement/textContent (nunca innerHTML con
 * datos externos) para evitar inyección de HTML si algún valor proviene
 * de la hoja de cálculo.
 */

const Components = {

    createKPICard({ id, label, value = "--", icon = "" } = {}) {
        const card = document.createElement("div");
        card.className = "card kpi-card";
        if (id) card.id = `kpi-${id}`;

        const body = document.createElement("div");
        body.className = "card-body";

        const valueEl = document.createElement("span");
        valueEl.className = "kpi-value";
        valueEl.textContent = icon ? `${icon} ${value}` : String(value);

        const labelEl = document.createElement("span");
        labelEl.className = "kpi-label";
        labelEl.textContent = label;

        body.append(valueEl, labelEl);
        card.appendChild(body);
        return card;
    },

    createChartCard({ id, title, subtitle }) {
        const card = document.createElement("div");
        card.className = "card chart-card";
        card.id = `chart-card-${id}`;

        const header = document.createElement("div");
        header.className = "card-header";

        const headingGroup = document.createElement("div");
        const heading = document.createElement("h3");
        heading.textContent = title;
        headingGroup.appendChild(heading);

        if (subtitle) {
            const subheading = document.createElement("span");
            subheading.className = "chart-card-subtitle";
            subheading.textContent = subtitle;
            headingGroup.appendChild(subheading);
        }

        header.appendChild(headingGroup);

        const body = document.createElement("div");
        body.className = "card-body";
        const canvas = document.createElement("canvas");
        canvas.id = `chart-canvas-${id}`;
        body.appendChild(canvas);

        card.append(header, body);
        return card;
    },

    createTableCard({ id, title }) {
        const card = document.createElement("div");
        card.className = "card table-card";
        card.id = `table-card-${id}`;

        const header = document.createElement("div");
        header.className = "card-header";
        const heading = document.createElement("h3");
        heading.textContent = title;
        header.appendChild(heading);

        const body = document.createElement("div");
        body.className = "card-body";
        const tableContainer = document.createElement("div");
        tableContainer.className = "table-scroll";
        tableContainer.id = `table-container-${id}`;
        body.appendChild(tableContainer);

        card.append(header, body);
        return card;
    },

    renderTable(container, { columns, rows }) {
        container.innerHTML = "";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        columns.forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col.label;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        const tbody = document.createElement("tbody");
        rows.forEach((row) => {
            const tr = document.createElement("tr");
            columns.forEach((col) => {
                const td = document.createElement("td");
                const rawValue = row[col.key] ?? "";
                td.textContent = col.format ? col.format(rawValue) : String(rawValue);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        table.append(thead, tbody);
        container.appendChild(table);
    },

    createEmptyState({ icon = "📭", message = "Sin datos disponibles" } = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = "empty-state";

        const iconEl = document.createElement("span");
        iconEl.className = "empty-state-icon";
        iconEl.textContent = icon;

        const messageEl = document.createElement("p");
        messageEl.textContent = message;

        wrapper.append(iconEl, messageEl);
        return wrapper;
    },

};
