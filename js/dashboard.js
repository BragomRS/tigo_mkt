/**
 * Ensambla el dashboard a partir de dashboardData.
 * Único consumidor de dashboardData para pintar la pantalla: nunca vuelve
 * a leer Google Sheets ni a recorrer las filas, solo lee el objeto ya
 * construido por processor.js.
 *
 * Los gráficos "recordsByCampaign" y "recordsByDate" son ejemplos de
 * validación de arquitectura, no las métricas finales del dashboard.
 *
 * KPI_DEFINITIONS es el punto de extensión para las tarjetas de arriba:
 * agregar un KPI nuevo es sumar una entrada acá (más su procesador en
 * processor.worker.js), nunca tocar _renderKPIs.
 */

const KPI_DEFINITIONS = [
    {
        key: "totalDifusiones",
        label: "Total de difusiones",
        icon: "📣",
        format: (value) => formatNumber(value),
    },
    {
        key: "mensajesEnviados",
        label: "Mensajes enviados",
        icon: "📤",
        format: (value) => formatNumber(value),
    },
    {
        key: "mensajesEntregados",
        label: "Total de mensajes entregados",
        icon: "✅",
        format: (value) => formatNumber(value),
    },
    {
        key: "mensajesLeidos",
        label: "Mensajes leídos",
        icon: "👁️",
        format: (value) => formatNumber(value),
    },
    {
        key: "fallosEntrega",
        label: "Fallos de entrega",
        icon: "⚠️",
        format: (value) => formatNumber(value),
    },
];

// Los nombres de campaña llegan con un prefijo fijo del tipo
// "Gestion P2p 2607.030 . " -- se recorta para mostrar solo la parte
// descriptiva (ej. "Plan Full Tigo Mas Tv Basico B 27 De Julio Del 2026 . Lote 1").
function formatDifusionName(value) {
    return String(value)
        .replace(/^Gestion P2p\s+[\d.]+\s*\.\s*/i, "")
        .replace(/mas/gi, "+")
        .trim();
}

const Dashboard = {

    render(data) {
        this._renderKPIs(data);
        this._renderCharts(data);
        this._renderTables(data);
    },

    _renderKPIs(data) {
        const grid = $("#kpiGrid");
        if (!grid) return;

        grid.innerHTML = "";

        KPI_DEFINITIONS.forEach((definition) => {
            const value = data.kpis[definition.key];
            if (value === undefined) return;

            grid.appendChild(Components.createKPICard({
                id: definition.key,
                label: definition.label,
                value: definition.format(value),
                icon: definition.icon,
            }));
        });
    },

    _renderCharts(data) {
        const grid = $("#chartsGrid");
        if (!grid) return;

        grid.innerHTML = "";

        const tokens = ChartService.getThemeTokens();

        if (data.charts.recordsByCampaign) {
            createChart({
                id: "records-by-campaign",
                type: "bar",
                title: "Top 10 registros por campaña",
                data: {
                    labels: data.charts.recordsByCampaign.labels,
                    datasets: [{
                        label: "Registros",
                        data: data.charts.recordsByCampaign.values,
                        backgroundColor: tokens.series1,
                        borderRadius: 4,
                        borderSkipped: "bottom",
                        maxBarThickness: 24,
                    }],
                },
                options: {
                    scales: {
                        x: { ticks: { display: false } },
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                title: (items) => items.map((item) => formatDifusionName(item.label)),
                            },
                        },
                    },
                },
            });
        }

        if (data.charts.recordsByDate) {
            createChart({
                id: "records-by-date",
                type: "line",
                title: "Registros por día",
                data: {
                    labels: data.charts.recordsByDate.labels,
                    datasets: [{
                        label: "Registros",
                        data: data.charts.recordsByDate.values,
                        borderColor: tokens.series1,
                        backgroundColor: hexToRgba(tokens.series1, 0.1),
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: tokens.series1,
                        pointBorderColor: tokens.surface,
                        pointBorderWidth: 2,
                        fill: true,
                        tension: 0.3,
                    }],
                },
            });
        }
    },

    _renderTables(data) {
        const grid = $("#tablesGrid");
        if (!grid || !data.tables.campaigns) return;

        grid.innerHTML = "";
        grid.appendChild(Components.createTableCard({ id: "campaigns", title: "Difusiones por campaña" }));

        Components.renderTable($("#table-container-campaigns"), {
            columns: [
                { key: "difusion", label: "Difusión", format: formatDifusionName },
                { key: "mensajesEnviados", label: "Mensajes enviados", format: formatNumber },
                { key: "mensajesConError", label: "Mensajes con error", format: formatNumber },
                { key: "fechaEnvio", label: "Fecha de envío" },
                { key: "horaEnvio", label: "Hora de envío" },
                { key: "categoria", label: "Categoría" },
            ],
            rows: data.tables.campaigns,
        });
    },

};

// Si el tema cambia después de tener datos cargados, se vuelve a pintar
// para que los gráficos usen los tokens de color del tema nuevo.
document.addEventListener("themechange", () => {
    if (typeof dashboardData !== "undefined" && dashboardData) {
        Dashboard.render(dashboardData);
    }
});
