import clips from '../../../clips.js';

/**
 * Ajustes de configuración.
 */
clips.setup({
    basePath: new URL('../clips', import.meta.url)
});

/**
 * Mapeo de rutas y vistas
 * @type {RouteNode[]}
 * @constant
 */
const routes = [
    {
        path: '/',
        view: 'home'
    }
];

/**
 * Objeto global de la aplicación.
 * @namespace app
 */
const app = {

    start: async function() {
        console.log('Starting app...');

        // Se incluye e inicializa el "viewport".
        this.viewport = await clips.include('viewport', document.getElementById('app'), {
            routes
        });

        // Se carga la ruta inicial.
        this.viewport.open('/');
    }

};

// Llamada al inicio de la aplicación una vez cargado el DOM.
document.addEventListener('DOMContentLoaded', () => {
    app.start();
});