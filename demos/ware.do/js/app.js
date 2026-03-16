import clips from '../../../clips.js';
import '../../../add-ons/views.js';

/**
 * Ajustes de configuración.
 */
clips.setup({
    debug: true,
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

        // await clips.load('home');
        const homeView = await clips.create('home', {});
        console.log(`home: ${homeView}`);

        // Se incluye e inicializa el "viewport".
        // this.viewport = await clips.include('viewport', document.getElementById('app'), {
        //     routes
        // });

        // // Se carga la ruta inicial.
        // this.viewport.open('/');
    }

};

// Llamada al inicio de la aplicación una vez cargado el DOM.
document.addEventListener('DOMContentLoaded', () => {
    app.start();
});