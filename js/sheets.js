/**
 * Única responsabilidad: obtener el CSV crudo de Google Sheets.
 * No parsea, no interpreta columnas, no conoce el resto de la app.
 * El resultado se entrega tal cual llega, listo para que processor.js
 * lo procese en la Fase 3.
 */

const SheetsService = {

    buildCsvUrl() {
        const { spreadsheetId, gid } = CONFIG;
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    },

    async fetchRawCsv() {
        if (!CONFIG.spreadsheetId) {
            throw new Error("CONFIG.spreadsheetId no está configurado en js/config.js.");
        }

        const url = this.buildCsvUrl();
        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(
                `No se pudo leer la hoja (HTTP ${response.status}). ` +
                `Verificá que esté compartida como "Cualquiera con el enlace puede ver".`
            );
        }

        return await response.text();
    },

};
