/**
 * Bootstrap de la aplicación.
 * Orquesta la carga de datos (sheets.js -> processor.js -> dashboard.js)
 * sin que los módulos de UI necesiten cambiar a medida que se agreguen fases.
 */

let dashboardData = null;

async function loadData() {
    UI.showLoader();

    try {
        const rawCsv = await SheetsService.fetchRawCsv();
        dashboardData = await ProcessorService.process(rawCsv);

        console.log("dashboardData construido:", dashboardData);

        Dashboard.render(dashboardData);

        const lastUpdated = $("#lastUpdated");
        if (lastUpdated) {
            lastUpdated.textContent = `Actualizado: ${formatDate(new Date(dashboardData.meta.generatedAt))}`;
        }

        UI.showNotification(
            `Procesamiento completo: ${formatNumber(dashboardData.meta.totalRows)} filas y ` +
            `${dashboardData.meta.columns.length} columnas detectadas en una única pasada.`,
            "success"
        );
    } catch (error) {
        console.error(error);
        UI.showNotification(error.message, "danger", 6000);
    } finally {
        UI.hideLoader();
    }
}

document.addEventListener("DOMContentLoaded", () => {

    document.title = CONFIG.appTitle;
    const appTitleEl = $("#appTitle");
    if (appTitleEl) appTitleEl.textContent = CONFIG.appTitle;

    UI.initTheme();

    $("#themeToggle")?.addEventListener("click", () => UI.toggleTheme());
    $("#sidebarToggle")?.addEventListener("click", () => UI.toggleSidebar());

    loadData();

});
