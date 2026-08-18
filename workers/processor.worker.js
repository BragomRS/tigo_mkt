/**
 * Web Worker de procesamiento.
 * Parsea el CSV con Papa Parse en modo streaming y recorre el dataset
 * UNA sola vez, alimentando a todos los procesadores registrados al mismo tiempo.
 *
 * Para agregar un procesador nuevo (un KPI, una agregación para un gráfico, etc.)
 * sumá un objeto al arreglo PROCESSORS. Nunca modifiques el bucle de abajo:
 * ese es justamente el punto de este registro.
 */

importScripts("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js");

// ===================================================================
// REGISTRO DE PROCESADORES
// ===================================================================
// Cada procesador define:
//   - createState()               -> estado inicial acumulado durante la pasada
//   - onRow(row, state, columns)  -> se ejecuta una vez por fila
//   - finalize(state, dashboardData, columns) -> vuelca el resultado final
//
// Los procesadores "recordsByCampaign" y "recordsByDate" son ejemplos
// estructurales (conteo de filas agrupado por una columna) para validar que
// el pipeline agrega datos correctamente de punta a punta. No son KPIs de
// negocio: cuando definas las métricas reales del dashboard, se agregan como
// procesadores nuevos acá mismo, sin tocar el bucle ni estos dos ejemplos.

function extractDayKey(rawValue) {
    const parsed = new Date(rawValue);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return String(rawValue).slice(0, 10);
}

// Separa fecha y hora tal cual vienen escritas en dispatched_at, sin pasar
// por Date/toISOString (eso convierte a UTC y corre la hora respecto a la
// hoja). Es un corte literal de texto: "2026-07-27 10:23:00" -> fecha/hora.
function splitDateTime(rawValue) {
    if (!rawValue) return { date: "", time: "" };

    const trimmed = String(rawValue).trim();
    const match = trimmed.match(/^(.*?)[ T](.*)$/);

    if (match) {
        return { date: match[1], time: match[2] };
    }

    return { date: trimmed, time: "" };
}

// Filtro por mes/año seleccionado en el header (js/monthFilter.js).
// Se aplica sobre dispatched_at con un corte literal de texto (mismo
// criterio que splitDateTime/extractDayKey) para no correr la fecha por
// husos horarios. filter = { year, month } con month 1-12, o null/undefined
// para no filtrar (reporte histórico completo).
function matchesMonthFilter(row, filter) {
    if (!filter || filter.year == null || filter.month == null) return true;

    const raw = row.dispatched_at;
    if (!raw) return false;

    const match = String(raw).trim().match(/^(\d{4})-(\d{2})/);
    if (!match) return false;

    const rowYear = Number(match[1]);
    const rowMonth = Number(match[2]);
    return rowYear === filter.year && rowMonth === filter.month;
}

const PROCESSORS = [
    {
        name: "meta",
        createState: () => ({ totalRows: 0 }),
        onRow(row, state) {
            state.totalRows++;
        },
        finalize(state, dashboardData, columns) {
            dashboardData.meta.totalRows = state.totalRows;
            dashboardData.meta.columns = columns;
        },
    },
    {
        // KPI: Mensajes leídos -- cantidad de filas con read_at no vacío.
        name: "mensajesLeidos",
        createState: () => ({ count: 0 }),
        onRow(row, state) {
            if (row.read_at) {
                state.count++;
            }
        },
        finalize(state, dashboardData) {
            dashboardData.kpis.mensajesLeidos = state.count;
        },
    },
    {
        // KPI: Total de mensajes entregados -- cantidad de filas con sent_at no vacío.
        name: "mensajesEntregados",
        createState: () => ({ count: 0 }),
        onRow(row, state) {
            if (row.sent_at) {
                state.count++;
            }
        },
        finalize(state, dashboardData) {
            dashboardData.kpis.mensajesEntregados = state.count;
        },
    },
    {
        // KPI: Fallos de entrega -- cantidad de filas con error_code no vacío
        // Y sent_at vacío (si llegó a enviarse, no cuenta como fallo).
        name: "fallosEntrega",
        createState: () => ({ count: 0 }),
        onRow(row, state) {
            if (row.error_code && !row.sent_at) {
                state.count++;
            }
        },
        finalize(state, dashboardData) {
            dashboardData.kpis.fallosEntrega = state.count;
        },
    },
    {
        // KPI: Mensajes enviados -- cantidad de filas con customer_external_id
        // presente (cada fila con destinatario es un mensaje enviado).
        name: "mensajesEnviados",
        createState: () => ({ count: 0 }),
        onRow(row, state) {
            if (row.customer_external_id) {
                state.count++;
            }
        },
        finalize(state, dashboardData) {
            dashboardData.kpis.mensajesEnviados = state.count;
        },
    },
    {
        // KPI: Total de difusiones -- cantidad de campañas (campaign_name) únicas,
        // no cantidad de filas. Una campaña que se repite en varias filas cuenta una sola vez.
        name: "totalDifusiones",
        createState: () => ({ seen: new Set() }),
        onRow(row, state) {
            if (row.campaign_name) {
                state.seen.add(row.campaign_name);
            }
        },
        finalize(state, dashboardData) {
            dashboardData.kpis.totalDifusiones = state.seen.size;
        },
    },
    {
        // Tabla: una fila por difusión (campaign_name único) con sus mensajes
        // enviados, mensajes con error (misma regla que el KPI "Fallos de
        // entrega": error_code presente y sent_at vacío) y la fecha/hora del
        // primer mensaje de esa campaña según dispatched_at.
        name: "campaignsTable",
        createState: () => ({ campaigns: {} }),
        onRow(row, state) {
            const key = row.campaign_name || "Sin campaña";

            if (!state.campaigns[key]) {
                state.campaigns[key] = {
                    mensajesEnviados: 0,
                    mensajesConError: 0,
                    firstDispatchedAt: null,
                    firstTemplates: null,
                };
            }

            const campaign = state.campaigns[key];
            campaign.mensajesEnviados++;

            if (row.error_code && !row.sent_at) {
                campaign.mensajesConError++;
            }

            if (campaign.firstDispatchedAt === null && row.dispatched_at) {
                campaign.firstDispatchedAt = row.dispatched_at;
            }

            if (campaign.firstTemplates === null && row.templates) {
                campaign.firstTemplates = row.templates;
            }
        },
        finalize(state, dashboardData) {
            const rows = Object.entries(state.campaigns).map(([difusion, stats]) => {
                const { date, time } = splitDateTime(stats.firstDispatchedAt);
                const sortTimestamp = stats.firstDispatchedAt ? new Date(stats.firstDispatchedAt).getTime() : NaN;

                // La columna "templates" trae mucha información junta; solo
                // buscamos si el campo category aparece como marketing (incluye
                // "marketing_lite", ya que contiene "marketing") o utility.
                let categoria = "Unknown";
                if (stats.firstTemplates && /marketing/i.test(stats.firstTemplates)) {
                    categoria = "Marketing";
                } else if (stats.firstTemplates && /utility/i.test(stats.firstTemplates)) {
                    categoria = "Utility";
                }

                return {
                    difusion,
                    mensajesEnviados: stats.mensajesEnviados,
                    mensajesConError: stats.mensajesConError,
                    fechaEnvio: date,
                    horaEnvio: time,
                    categoria,
                    _sortTimestamp: sortTimestamp,
                };
            });

            // Difusión más reciente primero; las que no tienen fecha válida quedan al final.
            rows.sort((a, b) => {
                const aValid = !isNaN(a._sortTimestamp);
                const bValid = !isNaN(b._sortTimestamp);
                if (aValid && bValid) return b._sortTimestamp - a._sortTimestamp;
                if (aValid) return -1;
                if (bValid) return 1;
                return 0;
            });

            dashboardData.tables.campaigns = rows.map(({ _sortTimestamp, ...row }) => row);
        },
    },
    {
        // Ejemplo: cantidad de registros agrupados por campaña.
        name: "recordsByCampaign",
        createState: () => ({ counts: {} }),
        onRow(row, state) {
            const key = row.campaign_name || "Sin campaña";
            state.counts[key] = (state.counts[key] || 0) + 1;
        },
        finalize(state, dashboardData) {
            const topEntries = Object.entries(state.counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            dashboardData.charts.recordsByCampaign = {
                labels: topEntries.map(([label]) => label),
                values: topEntries.map(([, value]) => value),
            };
        },
    },
    {
        // Ejemplo: cantidad de registros agrupados por día de envío.
        name: "recordsByDate",
        createState: () => ({ counts: {} }),
        onRow(row, state) {
            if (!row.dispatched_at) return;
            const day = extractDayKey(row.dispatched_at);
            state.counts[day] = (state.counts[day] || 0) + 1;
        },
        finalize(state, dashboardData) {
            const days = Object.keys(state.counts).sort();

            dashboardData.charts.recordsByDate = {
                labels: days,
                values: days.map((day) => state.counts[day]),
            };
        },
    },
];

function createDashboardData() {
    return {
        meta: { totalRows: 0, columns: [], generatedAt: null },
        kpis: {},
        charts: {},
        tables: {},
        filters: {},
        metrics: {},
    };
}

self.onmessage = function (event) {
    const { rawCsv, filter } = event.data;

    try {
        const dashboardData = createDashboardData();
        const states = PROCESSORS.map((processor) => processor.createState());
        let columns = [];

        Papa.parse(rawCsv, {
            header: true,
            skipEmptyLines: true,

            step(results) {
                if (columns.length === 0) {
                    columns = results.meta.fields || [];
                }

                const row = results.data;
                if (!matchesMonthFilter(row, filter)) return;

                // Única pasada: todos los procesadores reciben la misma fila.
                for (let i = 0; i < PROCESSORS.length; i++) {
                    PROCESSORS[i].onRow(row, states[i], columns);
                }
            },

            complete() {
                for (let i = 0; i < PROCESSORS.length; i++) {
                    PROCESSORS[i].finalize(states[i], dashboardData, columns);
                }

                dashboardData.meta.generatedAt = Date.now();
                dashboardData.filters = filter ? { year: filter.year, month: filter.month } : null;
                self.postMessage({ dashboardData });
            },

            error(error) {
                self.postMessage({ error: error.message });
            },
        });
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
