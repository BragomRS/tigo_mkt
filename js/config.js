/**
 * Punto único de configuración de la plataforma.
 * Cualquier ajuste (fuente de datos, tema, idioma, refresco) se hace acá,
 * nunca dentro de los módulos que consumen estos valores.
 */
const CONFIG = {

    // Identidad de la app (usada por header.js / ui.js)
    appTitle: "Dashboard MKT",

    // Fuente de datos (se usa a partir de la Fase 2)
    spreadsheetId: "1BYQDPau8r_CgyGgbYl_G5aDk50sGxRDQaDkcw4DDtEw",
    sheetName: "Sheet1",
    gid: "0",

    // Refresco automático de datos, en segundos
    refreshInterval: 300,

    // Apariencia
    theme: "dark", // "dark" | "light"
    language: "es",

};
