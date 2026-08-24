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

// Velocímetro (medio-donut de Chart.js con texto superpuesto): respuestas
// totales sobre el máximo posible -- los mensajes enviados -- sumando SOLO
// las difusiones elegidas en el selector, recalculado cada vez que se
// presiona "Aplicar" (mismo disparador que "Resultados por difusión").
let gaugeChartInstance = null;
let gaugeSelectedDifusiones = [];

// Dibuja un medio-donut de Chart.js (value/max) en el canvas dado. Reutilizado
// tanto por el velocímetro principal como por los velocímetros por respuesta.
function drawGauge(canvas, { value, max }) {
    const tokens = ChartService.getThemeTokens();

    return new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
            labels: ["Valor", "Resto"],
            datasets: [{
                data: max > 0 ? [value, Math.max(max - value, 0)] : [0, 1],
                backgroundColor: [tokens.series1, tokens.grid],
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            cutout: "75%",
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
            },
        },
    });
}

// Dibuja un gráfico de barras horizontal con el desglose de respuestas de
// una pregunta (entries ya viene ordenado de mayor a menor). Se usa dentro
// de la misma tarjeta del velocímetro cuando hay más de una difusión
// seleccionada, para ver cómo se compone el total consolidado.
function drawAnswerBreakdown(canvas, entries) {
    const tokens = ChartService.getThemeTokens();

    return new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: entries.map(([answer]) => answer),
            datasets: [{
                label: "Respuestas",
                data: entries.map(([, count]) => count),
                backgroundColor: tokens.series1,
                borderRadius: 4,
                maxBarThickness: 28,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: tokens.muted },
                    grid: { color: tokens.grid },
                },
                y: {
                    ticks: { color: tokens.muted },
                    grid: { display: false },
                },
            },
        },
    });
}

function renderGauge() {
    const canvas = document.getElementById("gaugeRespuestasCanvas");
    const valueLabel = $("#gaugeRespuestasValue");
    if (!canvas || !dashboardData) return;

    const byCampaign = dashboardData.responses?.byCampaign || {};
    const campaignRows = dashboardData.tables.campaigns || [];

    const max = gaugeSelectedDifusiones.reduce((sum, difusion) => {
        return sum + (campaignRows.find((row) => row.difusion === difusion)?.mensajesEnviados ?? 0);
    }, 0);
    const value = gaugeSelectedDifusiones.reduce((sum, difusion) => {
        return sum + (byCampaign[difusion]?.totalResponses ?? 0);
    }, 0);
    const percent = max > 0 ? Math.round((value / max) * 100) : 0;

    if (valueLabel) {
        valueLabel.textContent = gaugeSelectedDifusiones.length
            ? `${formatNumber(value)} / ${formatNumber(max)} (${percent}%)`
            : "--";
    }

    gaugeChartInstance?.destroy();
    gaugeChartInstance = drawGauge(canvas, { value, max });
}

// Ids de las instancias de Chart.js de los velocímetros por pregunta
// actualmente montados, para destruirlos antes de la próxima selección.
let questionGaugeInstances = [];

// Velocímetros por pregunta: un velocímetro por cada pregunta (ej.
// "respuesta_calidad_conexion"), sumando cuántas respuestas tuvo esa
// pregunta entre TODAS las difusiones seleccionadas -- si aparece en más de
// una, se suma en un solo velocímetro, sin duplicar. El máximo es el total
// de mensajes enviados de la selección completa (misma escala para todas
// las preguntas y para el velocímetro principal de arriba).
function renderQuestionGauges(selectedDifusiones) {
    const container = $("#answerGaugesGrid");
    if (!container) return;

    questionGaugeInstances.forEach((chart) => chart.destroy());
    questionGaugeInstances = [];
    container.innerHTML = "";

    if (!selectedDifusiones.length) {
        container.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar.",
        }));
        return;
    }

    const byCampaign = dashboardData?.responses?.byCampaign || {};
    const campaignRows = dashboardData?.tables.campaigns || [];

    const maxTotal = selectedDifusiones.reduce((sum, difusion) => {
        return sum + (campaignRows.find((row) => row.difusion === difusion)?.mensajesEnviados ?? 0);
    }, 0);

    // answersByTotalQuestion solo se necesita para el desglose que aparece
    // cuando hay más de una difusión seleccionada (con una sola, el desglose
    // no aporta nada nuevo respecto al gráfico de "Resultados por difusión").
    const totalsByQuestion = {};
    const answersByQuestion = {};
    selectedDifusiones.forEach((difusion) => {
        const stats = byCampaign[difusion];
        if (!stats) return;

        Object.entries(stats.questions).forEach(([question, tally]) => {
            const questionResponses = Object.values(tally).reduce((sum, count) => sum + count, 0);
            totalsByQuestion[question] = (totalsByQuestion[question] || 0) + questionResponses;

            if (!answersByQuestion[question]) answersByQuestion[question] = {};
            Object.entries(tally).forEach(([answer, count]) => {
                answersByQuestion[question][answer] = (answersByQuestion[question][answer] || 0) + count;
            });
        });
    });

    const showBreakdown = selectedDifusiones.length > 1;

    const ranked = Object.entries(totalsByQuestion).sort((a, b) => b[1] - a[1]);

    if (!ranked.length) {
        container.appendChild(Components.createEmptyState({
            icon: "📭",
            message: "Sin respuestas registradas para esta selección.",
        }));
        return;
    }

    ranked.forEach(([question, count]) => {
        const card = document.createElement("div");
        card.className = "card gauge-widget";

        const visual = document.createElement("div");
        visual.className = "gauge-visual";

        const canvas = document.createElement("canvas");
        visual.appendChild(canvas);

        const percent = maxTotal > 0 ? Math.round((count / maxTotal) * 100) : 0;
        const valueEl = document.createElement("div");
        valueEl.className = "gauge-value gauge-value-text";
        valueEl.textContent = `${formatNumber(count)} respuesta${count === 1 ? "" : "s"} de ` +
            `${formatNumber(maxTotal)} mensaje${maxTotal === 1 ? "" : "s"} enviado${maxTotal === 1 ? "" : "s"} (${percent}%)`;
        visual.appendChild(valueEl);

        card.appendChild(visual);

        const labelEl = document.createElement("div");
        labelEl.className = "gauge-label";
        labelEl.textContent = question;
        card.appendChild(labelEl);

        container.appendChild(card);
        questionGaugeInstances.push(drawGauge(canvas, { value: count, max: maxTotal }));

        if (showBreakdown) {
            const entries = Object.entries(answersByQuestion[question] || {}).sort((a, b) => b[1] - a[1]);

            if (entries.length) {
                const breakdownWrap = document.createElement("div");
                breakdownWrap.className = "gauge-breakdown";

                const breakdownCanvas = document.createElement("canvas");
                breakdownWrap.appendChild(breakdownCanvas);
                card.appendChild(breakdownWrap);

                questionGaugeInstances.push(drawAnswerBreakdown(breakdownCanvas, entries));
            }
        }
    });
}

document.addEventListener("themechange", () => {
    if (!dashboardData) return;
    renderGauge();
    renderQuestionGauges(gaugeSelectedDifusiones);
});

// Ids de los gráficos de respuestas actualmente montados, para poder
// destruirlos antes de pintar la próxima selección (Chart.js no libera solo
// las instancias cuyo canvas se borra vía innerHTML).
let respuestasChartIds = [];

// Pinta, por difusión seleccionada, un gráfico de barras por pregunta con la
// tabulación de respuestas armada por el worker (dashboardData.responses.
// byCampaign a partir de output_variables). La cantidad de preguntas y de
// respuestas distintas por pregunta es variable según el flujo de cada
// difusión: se genera un gráfico por cada pregunta que aparezca en los datos.
function renderRespuestasResultado(selectedDifusiones) {
    const body = $("#respuestasResultCard .card-body");
    if (!body) return;

    respuestasChartIds.forEach((id) => ChartService.destroyChart(id));
    respuestasChartIds = [];
    body.innerHTML = "";

    if (!selectedDifusiones.length) {
        body.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar.",
        }));
        return;
    }

    const byCampaign = (dashboardData && dashboardData.responses && dashboardData.responses.byCampaign) || {};
    const campaignRows = (dashboardData && dashboardData.tables.campaigns) || [];
    const tokens = ChartService.getThemeTokens();

    selectedDifusiones.forEach((difusion, blockIndex) => {
        const stats = byCampaign[difusion];
        const totalResponses = stats?.totalResponses ?? 0;
        const mensajesEnviados = campaignRows.find((row) => row.difusion === difusion)?.mensajesEnviados ?? 0;

        const block = document.createElement("div");
        block.className = "respuestas-block";

        const title = document.createElement("h4");
        title.className = "respuestas-block-title";
        title.textContent = formatDifusionName(difusion);
        block.appendChild(title);

        const total = document.createElement("p");
        total.className = "respuestas-block-total";
        total.textContent = `${formatNumber(totalResponses)} respuesta${totalResponses === 1 ? "" : "s"} de ` +
            `${formatNumber(mensajesEnviados)} mensaje${mensajesEnviados === 1 ? "" : "s"} enviado${mensajesEnviados === 1 ? "" : "s"}`;
        block.appendChild(total);

        if (totalResponses === 0) {
            const empty = document.createElement("p");
            empty.className = "respuestas-block-empty";
            empty.textContent = "Sin respuestas registradas.";
            block.appendChild(empty);
            body.appendChild(block);
            return;
        }

        const chartsWrap = document.createElement("div");
        chartsWrap.className = "respuestas-charts";
        block.appendChild(chartsWrap);
        body.appendChild(block);

        // Preguntas ordenadas de mayor a menor cantidad de respuestas (mismo
        // criterio que las barras dentro de cada gráfico).
        const questionsRanked = Object.entries(stats.questions)
            .map(([question, tally]) => {
                const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
                const questionResponses = entries.reduce((sum, [, count]) => sum + count, 0);
                return { question, entries, questionResponses };
            })
            .sort((a, b) => b.questionResponses - a.questionResponses);

        questionsRanked.forEach(({ question, entries, questionResponses }, questionIndex) => {
            const chartId = `respuestas-${blockIndex}-${questionIndex}`;
            respuestasChartIds.push(chartId);

            createChart({
                id: chartId,
                type: "bar",
                title: question,
                subtitle: `${formatNumber(questionResponses)} respuesta${questionResponses === 1 ? "" : "s"}`,
                container: chartsWrap,
                data: {
                    labels: entries.map(([answer]) => answer),
                    datasets: [{
                        label: "Respuestas",
                        data: entries.map(([, count]) => count),
                        backgroundColor: tokens.series1,
                        borderRadius: 4,
                        maxBarThickness: 28,
                    }],
                },
                options: {
                    indexAxis: "y",
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { precision: 0 } },
                    },
                },
            });
        });
    });
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

    RespuestasView.init({
        onApply: (difusionesSeleccionadas) => {
            gaugeSelectedDifusiones = difusionesSeleccionadas;
            renderGauge();
            renderQuestionGauges(difusionesSeleccionadas);
            renderRespuestasResultado(difusionesSeleccionadas);
        },
    });

    loadData();

});
