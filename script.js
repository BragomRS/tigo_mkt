/**
 * Bootstrap de la aplicación.
 * Orquesta la carga de datos (sheets.js -> processor.js -> dashboard.js)
 * sin que los módulos de UI necesiten cambiar a medida que se agreguen fases.
 */

let dashboardData = null;

// CSV crudo cacheado tras la primera descarga: cambiar el filtro de mes
// reprocesa este mismo texto en el worker, sin volver a pedirle la hoja a
// Google Sheets.
let rawCsv = null;

// Filtro activo por defecto: el mes actual (el botón del header "siempre
// apunta al mes actual" hasta que el usuario elija otro). null = histórico completo.
let currentFilter = getCurrentMonthFilter();

function getCurrentMonthFilter() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

async function loadData() {
    UI.showLoader();

    try {
        rawCsv = await SheetsService.fetchRawCsv();
        await renderWithCurrentFilter();
    } catch (error) {
        console.error(error);
        UI.showNotification(error.message, "danger", 6000);
    } finally {
        UI.hideLoader();
    }
}

async function renderWithCurrentFilter() {
    if (!rawCsv) return;

    dashboardData = await ProcessorService.process(rawCsv, currentFilter);

    console.log("dashboardData construido:", dashboardData);

    Dashboard.render(dashboardData);

    const difusiones = (dashboardData.tables.campaigns || []).map((row) => row.difusion);
    RespuestasView.setDifusiones(difusiones);

    const lastUpdated = $("#lastUpdated");
    if (lastUpdated) {
        lastUpdated.textContent = `Actualizado: ${formatDate(new Date(dashboardData.meta.generatedAt))}`;
    }

    UI.showNotification(
        `Procesamiento completo: ${formatNumber(dashboardData.meta.totalRows)} filas y ` +
        `${dashboardData.meta.columns.length} columnas detectadas en una única pasada.`,
        "success"
    );
}

async function applyMonthFilter(filter) {
    currentFilter = filter;
    UI.showLoader();

    try {
        await renderWithCurrentFilter();
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
    UI.bindSidebarNav();

    $("#themeToggle")?.addEventListener("click", () => UI.toggleTheme());
    $("#sidebarToggle")?.addEventListener("click", () => UI.toggleSidebar());

    MonthFilter.init({
        onApply: (year, month) => applyMonthFilter({ year, month }),
        onReset: () => applyMonthFilter(null),
    });
    MonthFilter.setActive(currentFilter.year, currentFilter.month);

    // La información a mostrar con la selección todavía no está definida;
    // por ahora solo se registra en consola.
    RespuestasView.init({
        onApply: (difusionesSeleccionadas) => {
            console.log("Difusiones seleccionadas:", difusionesSeleccionadas);
        },
    });

    loadData();

});
