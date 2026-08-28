/**
 * Bootstrap de la aplicación.
 * Orquesta la carga de datos (sheets.js -> processor.js -> dashboard.js)
 * sin que los módulos de UI necesiten cambiar a medida que se agreguen fases.
 */

// El dashboard tiene que pedir contraseña cada vez que alguien entra, no
// confiar en que el navegador la recuerde de una visita a la otra. Basic
// Auth no tiene un "expirar sesión" real (no hay sesión en el servidor que
// invalidar) -- el truco que sí funciona en la práctica: al SALIR de la
// página, mandarle al navegador una credencial incorrecta a propósito para
// que reemplace la buena que tenía guardada. La próxima vez que alguien
// abra el dashboard, esa credencial falsa falla y aparece el popup de login
// de nuevo. Se dispara en pagehide (no beforeunload, que es menos
// confiable) con fetch keepalive para que la petición llegue a completarse
// aunque la pestaña ya se esté cerrando. Si el sitio no tiene Basic Auth
// (ej. en desarrollo local), esto no hace nada.
window.addEventListener("pagehide", () => {
    fetch(window.location.pathname, {
        headers: { Authorization: "Basic " + btoa("logout:logout") },
        keepalive: true,
        cache: "no-store",
    }).catch(() => {});
});

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
    EntregasView.setDifusiones(difusiones);

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
    const container = $("#gaugeGrid");
    if (!container || !dashboardData) return;

    gaugeChartInstance?.destroy();
    gaugeChartInstance = null;
    container.innerHTML = "";

    if (!gaugeSelectedDifusiones.length) {
        container.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar para ver los gráficos de respuestas.",
        }));
        return;
    }

    const byCampaign = dashboardData.responses?.byCampaign || {};
    const campaignRows = dashboardData.tables.campaigns || [];

    const max = gaugeSelectedDifusiones.reduce((sum, difusion) => {
        return sum + (campaignRows.find((row) => row.difusion === difusion)?.mensajesEnviados ?? 0);
    }, 0);
    const value = gaugeSelectedDifusiones.reduce((sum, difusion) => {
        return sum + (byCampaign[difusion]?.totalResponses ?? 0);
    }, 0);
    const percent = max > 0 ? Math.round((value / max) * 100) : 0;

    const widget = document.createElement("div");
    widget.className = "card gauge-widget";

    const visual = document.createElement("div");
    visual.className = "gauge-visual";

    const canvas = document.createElement("canvas");
    visual.appendChild(canvas);

    const valueEl = document.createElement("div");
    valueEl.className = "gauge-value";
    valueEl.textContent = `${formatNumber(value)} / ${formatNumber(max)} (${percent}%)`;
    visual.appendChild(valueEl);

    widget.appendChild(visual);

    const labelEl = document.createElement("div");
    labelEl.className = "gauge-label";
    labelEl.textContent = "Respuestas sobre mensajes enviados";
    widget.appendChild(labelEl);

    container.appendChild(widget);

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
            message: "Seleccioná una o más difusiones y presioná Aplicar para ver los gráficos de respuestas.",
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

// Instancias de Chart.js de "Análisis de entregas" actualmente montadas
// (una por donut), para destruirlas antes de la próxima selección.
let entregasChartInstances = {};
let entregasSelectedDifusiones = [];

// Plugin de Chart.js (solo para donuts completos, no para los velocímetros
// que también son type:"doughnut") que dibuja, para cada porción, una línea
// guía que sale del borde del donut hacia afuera con la cantidad y el
// porcentaje. Se pasa por chart, no se registra global, para no afectar a
// los velocímetros de medio círculo.
const donutCalloutLabels = {
    id: "donutCalloutLabels",
    afterDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        const dataset = chart.data.datasets[0];
        if (!meta || !dataset) return;

        const total = dataset.data.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return;

        const { ctx } = chart;
        const tokens = ChartService.getThemeTokens();
        const lineLength = 14;
        const elbowLength = 18;
        // Alto mínimo reservado por etiqueta (dos líneas de texto) para que
        // dos porciones vecinas no terminen con los apuntadores pisados.
        const minLabelGap = 30;

        const labelLineHeight = 13;

        const items = meta.data.map((arc, i) => {
            const value = dataset.data[i];
            if (!value) return null;

            const { x, y, startAngle, endAngle, outerRadius } = arc.getProps(
                ["x", "y", "startAngle", "endAngle", "outerRadius"], true
            );
            const angle = (startAngle + endAngle) / 2;
            const isRight = Math.cos(angle) >= 0;
            // La etiqueta puede traer "\n" para partirla en varias líneas
            // (categorías largas como "Enviado\nsin entregar") y ocupar
            // menos ancho horizontal.
            const labelLines = String(chart.data.labels[i]).split("\n");

            return {
                labelLines,
                value,
                percent: Math.round((value / total) * 100),
                isRight,
                startX: x + Math.cos(angle) * outerRadius,
                startY: y + Math.sin(angle) * outerRadius,
                midX: x + Math.cos(angle) * (outerRadius + lineLength),
                midY: y + Math.sin(angle) * (outerRadius + lineLength),
            };
        }).filter(Boolean);

        // Separar verticalmente los apuntadores que caen del mismo lado y
        // quedan demasiado cerca entre sí (porciones chicas y vecinas). Una
        // etiqueta de 2 líneas necesita más espacio reservado que una de 1.
        ["left", "right"].forEach((side) => {
            const sideItems = items
                .filter((item) => (side === "right" ? item.isRight : !item.isRight))
                .sort((a, b) => a.midY - b.midY);

            for (let k = 1; k < sideItems.length; k++) {
                const prev = sideItems[k - 1];
                const curr = sideItems[k];
                // El texto de "curr" crece hacia arriba desde su propio
                // midY, así que lo que importa para no pisar a "prev" es
                // la altura de "curr" (no la de "prev").
                const gap = minLabelGap + (curr.labelLines.length - 1) * labelLineHeight;
                const minY = prev.midY + gap;
                if (curr.midY < minY) curr.midY = minY;
            }
        });

        items.forEach(({ labelLines, value, percent, isRight, startX, startY, midX, midY }) => {
            const endX = midX + (isRight ? elbowLength : -elbowLength);

            ctx.save();
            ctx.strokeStyle = tokens.muted;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(midX, midY);
            ctx.lineTo(endX, midY);
            ctx.stroke();

            const textX = endX + (isRight ? 4 : -4);
            ctx.textAlign = isRight ? "left" : "right";
            ctx.textBaseline = "bottom";

            ctx.fillStyle = tokens.textPrimary;
            ctx.font = "600 12px Inter, sans-serif";
            labelLines.forEach((line, i) => {
                const offsetFromBottom = 12 + (labelLines.length - 1 - i) * labelLineHeight;
                ctx.fillText(line, textX, midY - offsetFromBottom);
            });

            ctx.fillStyle = tokens.textSecondary;
            ctx.font = "400 11px Inter, sans-serif";
            ctx.fillText(`${formatNumber(value)} (${percent}%)`, textX, midY - 1);
            ctx.restore();
        });
    },
};

// Dibuja un donut completo (sin recorte de medio círculo, a diferencia de
// los velocímetros) con leyenda abajo y apuntadores con cantidad/porcentaje
// saliendo de cada porción. Reutilizable para los distintos donuts de
// "Análisis de entregas".
function drawDoughnut(canvas, { labels, values, colors }) {
    const total = values.reduce((sum, value) => sum + value, 0);
    const percentOf = (value) => (total > 0 ? Math.round((value / total) * 100) : 0);

    return new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
            }],
        },
        plugins: [donutCalloutLabels],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            radius: "75%",
            layout: {
                padding: 40,
            },
            plugins: {
                // Sin leyenda: los apuntadores de donutCalloutLabels ya
                // muestran el nombre, la cantidad y el porcentaje de cada
                // porción directamente sobre el gráfico.
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${formatNumber(context.parsed)} (${percentOf(context.parsed)}%)`,
                    },
                },
            },
        },
    });
}

// Pinta un donut "métrica vs base" (ej. enviados vs despachados, entregados
// vs enviados) dentro de la tarjeta indicada, sumando las difusiones
// seleccionadas. baseByDifusion/metricByDifusion reciben el nombre de la
// difusión y devuelven su cantidad correspondiente.
function renderDeliveryDonut({ cardBodySelector, instanceKey, labels, selectedDifusiones, baseByDifusion, metricByDifusion }) {
    const body = $(cardBodySelector);
    if (!body) return;

    entregasChartInstances[instanceKey]?.destroy();
    body.innerHTML = "";

    if (!selectedDifusiones.length) {
        body.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar.",
        }));
        return;
    }

    const totalBase = selectedDifusiones.reduce((sum, difusion) => sum + (baseByDifusion(difusion) ?? 0), 0);
    const totalMetric = selectedDifusiones.reduce((sum, difusion) => sum + (metricByDifusion(difusion) ?? 0), 0);
    const totalRest = Math.max(totalBase - totalMetric, 0);

    const tokens = ChartService.getThemeTokens();
    const canvas = document.createElement("canvas");
    body.appendChild(canvas);

    entregasChartInstances[instanceKey] = drawDoughnut(canvas, {
        labels,
        values: [totalMetric, totalRest],
        colors: [tokens.series1, tokens.grid],
    });
}

function readCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Orden y color de cada estado del embudo (sin doble conteo, ver
// classifyDeliveryStatus en el worker). Reutiliza los tokens semánticos ya
// definidos en style.css para que combine con el resto del tema.
// "label" es lo que se dibuja en el apuntador (puede tener un salto de
// línea con "\n" para acortar el ancho que ocupa); "status" es la clave real
// de los datos (tiene que matchear tal cual con classifyDeliveryStatus en
// el worker), así que no lleva el salto de línea.
const DELIVERY_STATUS_STYLE = [
    { status: "Leído", label: "Leído", colorVar: "--color-success" },
    { status: "Entregado sin leer", label: "Entregado\nsin leer", colorVar: "--viz-series-1" },
    { status: "Enviado sin entregar", label: "Enviado\nsin entregar", colorVar: "--color-warning" },
    { status: "Con error", label: "Con error", colorVar: "--color-danger" },
];

// "Despachos por estado": a diferencia de los otros donuts (métrica vs
// resto), acá se consolidan las 4 categorías reales sin doble conteo --
// cada mensaje cuenta en un solo estado, el más avanzado que alcanzó.
function renderEstadoDonut(selectedDifusiones) {
    const body = $("#entregasChartEstadoCard .card-body");
    if (!body) return;

    entregasChartInstances.estado?.destroy();
    body.innerHTML = "";

    if (!selectedDifusiones.length) {
        body.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar.",
        }));
        return;
    }

    const statusByCampaign = dashboardData?.delivery?.statusByCampaign || {};
    const totals = {};
    selectedDifusiones.forEach((difusion) => {
        const statuses = statusByCampaign[difusion];
        if (!statuses) return;
        Object.entries(statuses).forEach(([status, count]) => {
            totals[status] = (totals[status] || 0) + count;
        });
    });

    const present = DELIVERY_STATUS_STYLE.filter(({ status }) => totals[status] > 0);

    if (!present.length) {
        body.appendChild(Components.createEmptyState({
            icon: "📭",
            message: "Sin datos para esta selección.",
        }));
        return;
    }

    const canvas = document.createElement("canvas");
    body.appendChild(canvas);

    entregasChartInstances.estado = drawDoughnut(canvas, {
        labels: present.map(({ label }) => label),
        values: present.map(({ status }) => totals[status]),
        colors: present.map(({ colorVar }) => readCssVar(colorVar)),
    });
}

// Nombres oficiales de los códigos de error de la API de WhatsApp Cloud
// (Meta), en español. error_msg viene vacío en los datos de la hoja, así
// que el nombre legible sale de esta tabla en vez de la fila. Fuente:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
const WHATSAPP_ERROR_NAMES = {
    "130429": "Límite de envíos alcanzado",
    "131026": "Mensaje no entregable",
    "131047": "Fuera de la ventana de 24 horas",
    "131051": "Tipo de mensaje no soportado",
    "131052": "No se pudo descargar el archivo multimedia",
    "131053": "No se pudo subir el archivo multimedia",
    "131056": "Exceso de mensajes al mismo destinatario",
    "132000": "Parámetros de la plantilla no coinciden",
    "133010": "Número no registrado en WhatsApp Business",
    "368": "Cuenta de WhatsApp Business restringida",
};

// Lista de errores: cada error_code que aparezca (sin importar si ese
// mensaje se llegó a enviar después), consolidado entre las difusiones
// seleccionadas y ordenado de mayor a menor cantidad.
function renderEntregasErrors(selectedDifusiones) {
    const container = $("#entregasErrorsContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!selectedDifusiones.length) {
        container.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar.",
        }));
        return;
    }

    const errorsByCampaign = dashboardData?.delivery?.errorsByCampaign || {};
    const totals = {};
    selectedDifusiones.forEach((difusion) => {
        const errors = errorsByCampaign[difusion];
        if (!errors) return;
        Object.entries(errors).forEach(([code, count]) => {
            totals[code] = (totals[code] || 0) + count;
        });
    });

    const rows = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([codigo, cantidad]) => ({
            codigo,
            nombre: WHATSAPP_ERROR_NAMES[codigo] || "Código no identificado",
            cantidad,
        }));

    if (!rows.length) {
        container.appendChild(Components.createEmptyState({
            icon: "✅",
            message: "Sin errores registrados para esta selección.",
        }));
        return;
    }

    Components.renderTable(container, {
        columns: [
            { key: "codigo", label: "Código" },
            { key: "nombre", label: "Nombre del error" },
            { key: "cantidad", label: "Cantidad", format: formatNumber },
        ],
        rows,
    });
}

// Detalle por difusión: una fila por CADA difusión seleccionada (sin
// consolidar, a diferencia de los donuts) con solicitados, enviados, no
// enviados, entregados, no entregados y errores.
function renderEntregasSummaryTable(selectedDifusiones) {
    const container = $("#entregasSummaryContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!selectedDifusiones.length) {
        container.appendChild(Components.createEmptyState({
            icon: "🚧",
            message: "Seleccioná una o más difusiones y presioná Aplicar.",
        }));
        return;
    }

    const campaignRows = dashboardData?.tables.campaigns || [];
    const sentByCampaign = dashboardData?.delivery?.sentByCampaign || {};
    const deliveredByCampaign = dashboardData?.delivery?.deliveredByCampaign || {};
    const errorsByCampaign = dashboardData?.delivery?.errorsByCampaign || {};

    const rows = selectedDifusiones.map((difusion) => {
        const solicitados = campaignRows.find((row) => row.difusion === difusion)?.mensajesEnviados ?? 0;
        const enviados = sentByCampaign[difusion] ?? 0;
        const entregados = deliveredByCampaign[difusion] ?? 0;
        const errores = Object.values(errorsByCampaign[difusion] || {}).reduce((sum, count) => sum + count, 0);

        return {
            difusion,
            solicitados,
            enviados,
            noEnviados: Math.max(solicitados - enviados, 0),
            entregados,
            noEntregados: Math.max(enviados - entregados, 0),
            errores,
        };
    });

    Components.renderTable(container, {
        columns: [
            { key: "difusion", label: "Difusión", format: formatDifusionName },
            { key: "solicitados", label: "Solicitados", format: formatNumber },
            { key: "enviados", label: "Enviados", format: formatNumber },
            { key: "noEnviados", label: "No enviados", format: formatNumber },
            { key: "entregados", label: "Entregados", format: formatNumber },
            { key: "noEntregados", label: "No entregados", format: formatNumber },
            { key: "errores", label: "Errores", format: formatNumber },
        ],
        rows,
    });
}

function renderEntregasCharts(selectedDifusiones) {
    const campaignRows = dashboardData?.tables.campaigns || [];
    const sentByCampaign = dashboardData?.delivery?.sentByCampaign || {};
    const deliveredByCampaign = dashboardData?.delivery?.deliveredByCampaign || {};
    const readByCampaign = dashboardData?.delivery?.readByCampaign || {};

    // Enviados vs No enviados: Enviados = sent_at presente; base = total de
    // mensajes despachados de la difusión (mensajesEnviados de
    // dashboardData.tables.campaigns, que cuenta TODAS las filas).
    renderDeliveryDonut({
        cardBodySelector: "#entregasChartEnviadosCard .card-body",
        instanceKey: "enviados",
        labels: ["Enviados", "No enviados"],
        selectedDifusiones,
        baseByDifusion: (difusion) => campaignRows.find((row) => row.difusion === difusion)?.mensajesEnviados,
        metricByDifusion: (difusion) => sentByCampaign[difusion],
    });

    // Entregados vs No entregados: Entregados = delivered_at presente;
    // base = mensajes enviados (solo lo que se envió puede entregarse).
    renderDeliveryDonut({
        cardBodySelector: "#entregasChartEntregadosCard .card-body",
        instanceKey: "entregados",
        labels: ["Entregados", "No entregados"],
        selectedDifusiones,
        baseByDifusion: (difusion) => sentByCampaign[difusion],
        metricByDifusion: (difusion) => deliveredByCampaign[difusion],
    });

    // Leídos vs No leídos: Leídos = read_at presente;
    // base = mensajes entregados (solo lo entregado puede leerse).
    renderDeliveryDonut({
        cardBodySelector: "#entregasChartLeidosCard .card-body",
        instanceKey: "leidos",
        labels: ["Leídos", "No leídos"],
        selectedDifusiones,
        baseByDifusion: (difusion) => deliveredByCampaign[difusion],
        metricByDifusion: (difusion) => readByCampaign[difusion],
    });

    renderEstadoDonut(selectedDifusiones);
    renderEntregasErrors(selectedDifusiones);
    renderEntregasSummaryTable(selectedDifusiones);
}

document.addEventListener("themechange", () => {
    if (!dashboardData) return;
    renderGauge();
    renderQuestionGauges(gaugeSelectedDifusiones);
    renderEntregasCharts(entregasSelectedDifusiones);
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
            message: "Seleccioná una o más difusiones y presioná Aplicar para ver los gráficos de respuestas.",
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

    // "Entregados vs No entregados", "Leídos vs No leídos" y "Despachos por
    // estado" siguen pendientes de definir -- por ahora solo se resuelve
    // "Enviados vs No enviados".
    EntregasView.init({
        onApply: (difusionesSeleccionadas) => {
            entregasSelectedDifusiones = difusionesSeleccionadas;
            renderEntregasCharts(difusionesSeleccionadas);
        },
    });

    loadData();

});
