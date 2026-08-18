/**
 * Registro de instancias de Chart.js.
 * Expone createChart({ id, type, title, data, options }) como única API
 * pública: agregar un gráfico nuevo en el futuro es una llamada a esta
 * función, nunca una modificación de dashboard.js ni de este archivo.
 *
 * También centraliza el theming (colores, grillas, tooltip) para que
 * todos los gráficos se vean consistentes y reaccionen al cambio de tema.
 */

const ChartService = {

    _instances: {},

    getThemeTokens() {
        const styles = getComputedStyle(document.documentElement);
        const read = (name) => styles.getPropertyValue(name).trim();

        return {
            textPrimary: read("--viz-text-primary"),
            textSecondary: read("--viz-text-secondary"),
            muted: read("--viz-muted"),
            grid: read("--viz-grid"),
            baseline: read("--viz-baseline"),
            series1: read("--viz-series-1"),
            surface: read("--color-bg-elevated"),
        };
    },

    _buildDefaultOptions(type, seriesCount, tokens) {
        const hasScales = type === "bar" || type === "line";

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: seriesCount > 1,
                    labels: { color: tokens.textSecondary },
                },
                tooltip: {
                    backgroundColor: tokens.surface,
                    titleColor: tokens.textPrimary,
                    bodyColor: tokens.textSecondary,
                    borderColor: tokens.grid,
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                },
            },
            scales: hasScales ? {
                x: {
                    grid: { color: tokens.grid },
                    border: { color: tokens.baseline },
                    ticks: { color: tokens.muted },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: tokens.grid },
                    border: { color: tokens.baseline },
                    ticks: { color: tokens.muted },
                },
            } : undefined,
        };
    },

    createChart({ id, type, title, data, options = {}, container } = {}) {
        if (!id) throw new Error("createChart requiere un 'id' único.");
        if (!type) throw new Error("createChart requiere un 'type' (bar, line, pie, ...).");

        let canvas = document.getElementById(`chart-canvas-${id}`);

        if (!canvas) {
            const card = Components.createChartCard({ id, title });
            const target = container || $("#chartsGrid");
            target?.appendChild(card);
            canvas = document.getElementById(`chart-canvas-${id}`);
        }

        this.destroyChart(id);

        const tokens = this.getThemeTokens();
        Chart.defaults.color = tokens.muted;
        Chart.defaults.borderColor = tokens.grid;

        const seriesCount = data?.datasets?.length || 0;
        const defaultOptions = this._buildDefaultOptions(type, seriesCount, tokens);

        const mergeAxis = (defaultAxis = {}, overrideAxis = {}) => ({
            ...defaultAxis,
            ...overrideAxis,
            ticks: { ...(defaultAxis.ticks || {}), ...(overrideAxis.ticks || {}) },
        });

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            plugins: {
                ...defaultOptions.plugins,
                ...options.plugins,
                legend: { ...defaultOptions.plugins.legend, ...options.plugins?.legend },
                tooltip: { ...defaultOptions.plugins.tooltip, ...options.plugins?.tooltip },
            },
            scales: (defaultOptions.scales || options.scales) ? {
                x: mergeAxis(defaultOptions.scales?.x, options.scales?.x),
                y: mergeAxis(defaultOptions.scales?.y, options.scales?.y),
            } : undefined,
        };

        this._instances[id] = new Chart(canvas.getContext("2d"), { type, data, options: mergedOptions });
        return this._instances[id];
    },

    destroyChart(id) {
        if (this._instances[id]) {
            this._instances[id].destroy();
            delete this._instances[id];
        }
    },

};

function createChart(args) {
    return ChartService.createChart(args);
}
