import clips from '../clips.js';

/**
 * Tipo de clip base para la definición de vistas que se pueden abrir dentro de un viewport.
 * @class ViewClip
 */
clips.define('view', {

    /** @see Clip#create */
    create: function(options) {
        // ...
    }

});

/**
 * Nodo de ruta.
 * @typedef {Object} ViewportRouteNode
 * @property {string} path
 * @property {string} view
 */

/**
 * Clip especializado en la gestión de rutas y vistas. Permite definir un conjunto de rutas asociadas a vistas y 
 * abrirlas dinámicamente. Es especialmente útil para la gestión de vistas en aplicaciones SPA.
 * @class ViewportClip
 * @extends ViewClip
 */
clips.define('viewport', {

    /** @type {string} */
    extends: 'view',

    /** @type {string} */
    styles: /*css*/`
        [data-clip="viewport"] {
            display: block;
        }
    `,

    /** @see Clip#create */
    create: function(options) {
        this.basePrototype.create.call(this, options);

        /**
         * Mapeo de rutas.
         * @type {ViewportRouteNode[]}
         */
        this.routes = options.routes || [];
    },

    /** @see Clip#render */
    render: function(options) {
        return /*html*/`
            <div data-clip="viewport"></div>
        `;
    },

    // -----------------------------------------------------------------------------------------------------------------
    /**
     * Abre la ruta especificada.
     * @param {string} path Ruta a abrir.
     * @param {Object} [options] Opciones adicionales.
     * @return {Promise<Clip>} Clip de la ruta abierta.
     * @throws {Error} Si no se encuentra la ruta especificada.
     */
    open: async function(path, options = {}) {
        const route = this.routes.find(r => r.path === path);
        if (!route) {
            throw new Error(`Route not found: ${path}`);
        }
        return clips.include(route.view, this.root, { parentClip: this, ...options });
    }

});

export default {};