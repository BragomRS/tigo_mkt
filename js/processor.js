/**
 * Orquesta el procesamiento de datos delegando en el Web Worker.
 * No parsea ni recorre filas acá: solo entrega el CSV crudo al worker
 * y devuelve el dashboardData ya construido.
 */

const ProcessorService = {

    _worker: null,

    _getWorker() {
        if (!this._worker) {
            this._worker = new Worker("workers/processor.worker.js");
        }
        return this._worker;
    },

    process(rawCsv) {
        return new Promise((resolve, reject) => {
            const worker = this._getWorker();

            const cleanup = () => {
                worker.removeEventListener("message", onMessage);
                worker.removeEventListener("error", onError);
            };

            const onMessage = (event) => {
                cleanup();
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data.dashboardData);
                }
            };

            const onError = () => {
                cleanup();
                reject(new Error(
                    "No se pudo cargar el Web Worker de procesamiento. " +
                    "Si abriste el archivo directamente (file://), serví el proyecto con un servidor local."
                ));
            };

            worker.addEventListener("message", onMessage);
            worker.addEventListener("error", onError);
            worker.postMessage({ rawCsv });
        });
    },

};
