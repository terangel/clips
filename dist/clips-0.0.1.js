var clips = (function () {
    'use strict';

    const HTML_ESCAPES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    var esc = {

        /**
         * Escapa los caracteres especiales en HTML.
         * @param {*} x Valor especificado. 
         * @returns {string} Cadena escapada.
         */
        html: (x) => String(x).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]),

        /**
         * Escapa los caracteres especiales en literales de plantilla.
         * @param {string} str Cadena especificada. 
         * @returns {string} Cadena escapada.
         */
        literal: (str) => str
            .replace(/\\/g, "\\\\")
            .replace(/`/g, "\\`")
            .replace(/\$\{/g, "\\${")
            .replace(/\r/g, "\\r")

    };

    /**
     * Expresión regular para detectar las etiquetas EJS.
     * @type {RegExp}
     * @constant
     */
    const ejsTagsRe = /<%[-=]?[\s\S]*?%>/g;

    var ejs = {

        /**
         * Compila el código fuente de una plantilla EJS.
         * @param {string} src Código fuente de la plantilla.
         * @returns {Function} Función de plantilla compilada.
         * @private
         */
        compile: function(src) {
            let offset = 0, match;
            let body = '', mark, code;
            const appendText = (text) => body += text ? `out.push(\`${esc.literal(text)}\`);` : '';
            while ((match = ejsTagsRe.exec(src)) !== null) {
                appendText(src.slice(offset, match.index));

                mark = match[0][2]; // '%', '=', '-'
                code = match[0].slice(2 + (mark === '=' || mark === '-' ? 1 : 0), -2).trim();

                if (mark === '=') {
                    body += `out.push(escape((${code}))); \n`;
                } else if (mark === '-') {
                    body += `out.push(String((${code}))); \n`;
                } else {
                    body += code + '\n';
                }

                offset = match.index + match[0].length;
            }
            appendText(src.slice(offset));
            return new Function('out', 'locals', `with (locals) { ${body} }`);
        }

    };

    /* Clip prototype
     * ================================================================================================================== */
    /**
     * Property symbol "eventListeners" of Clip object.
     * @type {symbol}
     * @const
     */
    const EVENT_LISTENERS = Symbol('eventListeners');

    /**
     * Función constructora, base de todo clip.
     * @param {Object} [options={}] Opciones de creación.
     * @constructor
     */
    function Clip(options = {}) {

        /**
         * Referencia al nodo raíz del clip.
         * @type {Element}
         * @private
         */
        this._root = null;

        /**
         * Referencia al clip padre o contenedor.
         * @type {Clip}
         * @private
         */
        this._parentClip = null;

        /**
         * Conjunto de subclips contenidos.
         * @type {Set<Clip>}
         * @private
         */
        this._childClips = new Set();

        /**
         * Tiempo de carga.
         * @type {number}
         * @private
         */
        this._loadTime = 0;

        /**
         * Manejadores de eventos por tipo.
         * @type {Map<string, Set<Function>>}
         * @private
         */
        Object.defineProperty(this, EVENT_LISTENERS, {
            value: new Map(),
            enumerable: false,
            writable: false,
            configurable: false
        });


        // Se llama a la función create.
        this.create(options);
    }

    // Se definen los accesores de las propiedades anteriores.
    Object.defineProperties(Clip.prototype, {
        root: {
            /** @returns {Element|null} */
            get() {
                return this._root;
            },
            enumerable: true
        },
        parentClip: {
            /** @returns {Clip|null} */
            get() {
                return this._parentClip;
            },
            enumerable: true
        },
        childClips: {
            /** @returns {Clip[]} */
            get() {
                return [...this._childClips];
            },
            enumerable: true
        },
        childCount: {
            /** @returns {number} */
            get() {
                return this._childClips.size;
            }
        }
    });


    /* Constants of Clip
     * ================================================================================================================== */
    /**
     * Diferentes posiciones en las que incluir un clip en el DOM con respecto al elemento objetivo.
     * @enum {string}
     * @constant
     */
    Clip.Position = Object.freeze({
        START:      'start',
        END:        'end',
        BEFORE:     'before',
        AFTER:      'after',
        REPLACE:    'replace'
    });

    /**
     * Nombre del fichero manejador por defecto.
     * @type {string}
     * @constant
     */
    Clip.defaultHandlerName = 'handler';

    /**
     * Nombre de plantilla por defecto.
     * @type {string}
     * @constant
     */
    Clip.defaultTemplateName = 'layout';

    /**
     * Nombre de hoja de estilos por defecto.
     * @type {string}
     * @constant
     */
    Clip.defaultStylesName = 'styles';


    /* Prototype functions
     * ================================================================================================================== */
    /**
     * Función de creación de nuevas instancias.
     * @param {Object} options Opciones de creación.
     */
    Clip.prototype.create = function(options) {};

    /**
     * Función para incluir el clip con respecto al elemento (target) especificado.
     * @param {Element} target Elemento especificado.
     * @param {Object} [options] Opciones de inclusión.
     * @param {Clip} [options.parentClip] Referencia al clip contenedor.
     * @param {Clip.Position} [options.position=Clip.Position.END] Posición de inclusión del clip con respecto al elemento 
     * (target) especificado. 
     */
    Clip.prototype.include = async function(target, options = {}) {
        // Se comprueba que el target sea un Element.
        if (!target || target.nodeType !== Node.ELEMENT_NODE) {
            throw new TypeError('Invalid target: must be an Element.');
        }
        // Si todavía no se ha generado el elemento raíz se llama al render.
        if (!this._root) {
            let out;
            try {
                out = await this.render(options);
            } catch (err) {
                throw new Error(`Unable to render clip "${this.clipName}": ${err.message}`, {
                    cause: err
                });
            }
            if (out?.nodeType === Node.ELEMENT_NODE) {
                this._root = out;
            } else {
                let root;
                if (typeof out === 'string') {
                    const template = document.createElement('template');
                    template.innerHTML = out;
                    out = template.content;
                }
                if (out?.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    for (let n = out.firstChild; n; n = n.nextSibling) {
                        if (n.nodeType === Node.ELEMENT_NODE) {
                            if (root) {
                                throw new Error('Multiple root elements are not allowed.');
                            }
                            root = n;
                        } else if (n.nodeType === Node.TEXT_NODE) {
                            if (!WS_RE.test(n.data)) {
                                throw new Error('Text outside the root element is not allowed.');
                            }
                        } else if (n.nodeType !== Node.COMMENT_NODE) {
                            throw new Error(`Unsupported node type (${n.nodeType}) outside the root element.`);                    }
                    }
                }
                if (!root) {
                    throw new Error(`Missing clip root. Ensure render() returns an Element, or a DocumentFragment/HTML string with a single-root Element.`);
                }
                this._root = root;
            }
            // Se guarda la vinculación del clip con su elemento raíz.
            _elementClips.set(this._root, this);
            // Se guarda como propiedad del elemento para mejorar la visibilidad en depuración.
            Object.defineProperty(this._root, '__clip', {
                value: this,
                writable: false,
                configurable: true
            });
        }

        // TODO: Añadir propiedades de estilo adicionales (options.style) y clases (options.class).
        // TODO: Evaluar si incluir el parámetro hide o hidden para ocultar el elemento inicialmente.

        // Se inserta el elemento en la posición especificada.
        const position = options.position ?? Clip.Position.END; 
        switch (position) {
            case Clip.Position.AFTER:
                target.after(this._root);
                break;
            case Clip.Position.BEFORE:
                target.before(this._root);
            break;
            case Clip.Position.REPLACE:
                if (this._root.contains(target)) {
                    target.before(this._root);
                    target.remove();
                } else {
                    target.replaceWith(this._root);
                }
                break;
            case Clip.Position.START:
                target.prepend(this._root);
                break;
            case Clip.Position.END:
                target.append(this._root);
                break;
            default:
                throw new RangeError(`Invalid position: ${position}.`);
        }

        // Se añade al clip padre o contenedor. Si no se especifica, se busca en los elementos ascendientes.
        (options.parentClip || _closestClip(this._root))?._appendClip(this);

        // Llamada al método ready.
        this.ready(options);

        // Se evalua si emitir el evento "attach".
        window.cancelAnimationFrame(this._attachReq);
        if (this.root.isConnected) {
            const parent = this.root.parentNode;
            this._attachReq = window.requestAnimationFrame(() => {
                if (!this.root || !this.root.isConnected || this.root.parentNode !== parent) {
                    return;
                }
                _reflow(this.root);
                this._attachReq = window.requestAnimationFrame(() => {
                    if (!this.root || !this.root.isConnected || this.root.parentNode !== parent) {
                        return;
                    }
                    this.fire('attach', true);
                    // TODO: Al propagar el evento habría que asegurarse que los clips contenidos siguen enganchados, si no 
                    // habría que evitar la emisión del evento. En principio si el elemento se ha desenganchado del elemento
                    // padre, la vinculación entre clips no debería existir tampoco de forma que el evento no se propagaría,
                    // pero es importante tenerlo en cuenta.
                });
            });
        }

        // Se inicia la carga de datos adicionales.
        this._load(options);

        // Se devuelve la instancia del propio clip.
        return this;
    };

    /**
     * Renderiza el clip. Por defecto intentará renderizar la plantilla por defecto (/layout.ejs) localizada en la misma 
     * ubicación que el manejador del clip. 
     * @param {Object} [options] Opciones adicionales de renderizado.
     * @returns {Promise<DocumentFragment|Element|string>} Devuelve un fragmento, un elemento o directamente código HTML.
     */
    Clip.prototype.render = async function(options) {
        return clips.render(this, `${this.clipName}/${Clip.defaultTemplateName}`, options);
    };

    /**
     * Clip preparado después de la primera renderización. Implementa aquí la inicialización de la estructura DOM y añade el 
     * tratamiento de eventos necesario.  
     */
    Clip.prototype.ready = function(options) {};

    /**
     * Carga de datos.
     * @param {Object} options Opciones adicionales.
     */
    Clip.prototype.load = async function(options) {};

    /**
     * Carga de datos (envoltorio). Llama a la carga, actualiza el tiempo de carga y llama a la actualización.
     * @param {Object} options Opciones adicionales.
     * @private
     */
    Clip.prototype._load = async function(options) {
        const data = await this.load(options);
        this._loadTime = Date.now();
        return this.update(data === undefined ? options : { ...options, data });
    };

    /**
     * Actualiza la representación visual del clip.
     * @param {Object} options Opciones adicionales.
     */
    Clip.prototype.update = async function(options) {};

    /**
     * Inicia la recarga del clip.
     * @param {Object} options Opciones adicionales.
     */
    Clip.prototype.reload = async function(options) {
        this.clear(options);
        return this._load(options);
    };

    /**
     * Limpia el contenido del clip y llama de nuevo a la renderización.
     * @param {Object} options Opciones adicionales.
     */
    Clip.prototype.clear = function(options) {
        if (!this.root) {
            throw new ClipError('No root element', { code: ClipError.ROOT_REQUIRED });
        }
        this.render();
        this._clearAll();

        // try {
        //     // Se comprueba que haya raíz.
        //     if (!this.root) {
        //         throw new Error('No root element');
        //     }
        //     // Se renderiza nuevamente la vista.
        //     /** @type {HTMLElement} */
        //     const root = this.render(options);
        //     // Se sustituye el contenido anterior de la vista por el nuevo sin modificar la raíz.
        //     this._clearAll();
        //     this.root.append(...root.childNodes);
        //     // Se llama a la función ready de nuevo.
        //     this.ready(this.root, options);
        //     this.fire('ready');
        // } catch (err) {
        //     console.error(`Unable to update view "${this.__name}":`, err);
        //     this._fireError(err);
        // } 
    };

    /**
     * ...
     */
    Clip.prototype.toggle = function(options) {};

    /**
     * ...
     */
    Clip.prototype.isVisible = function(options) {};

    /**
     * ...
     */
    Clip.prototype.remove = function(options) {};

    /**
     * Añade un nuevo subclip.
     * @param {Clip} clip Clip especificado.
     * @private
     */
    Clip.prototype._appendClip = function(clip) {
        if (clip._parentClip) {
            clip._parentClip._removeClip(clip);
        }
        this._childClips.add(clip);
        clip._parentClip = this;
    };

    /**
     * Elimina el subclip especificado.
     * @param {Clip} clip Clip especificado.
     * @private
     */
    Clip.prototype._removeClip = function(clip) {
        if (this._childClips.delete(clip)) {
            clip._parentClip = null;
        }
    };

    /**
     * ...
     */
    Clip.prototype.removeAll = function() {
        for (let c of this._childClips) {
            this._childClips.delete(c);
            c._parentClip = null;
        }
        // let c;
        // while (c = this.childClips.shift()) {
        //     if (uix.contains(this._root, v.root)) {
        //         c.destroy();
        //     }
        // }
        // uix.empty(this._root);
    };

    /**
     * ...
     */
    Clip.prototype.destroy = function(options) {
        // TODO: ...
    };


    // Scroll
    Clip.prototype.saveScroll = function() {};

    Clip.prototype.restoreScroll = function() {};


    /* DOM-Like Event Model
     * ================================================================================================================== */
    /**
     * Clip event.
     * @param {string} type Event type.
     * @param {{ detail?: any, cancelable?: boolean }=} [options] Options.
     */
    function ClipEvent(type, options={}) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('Invalid event type: a non-empty string is required.');
        }
        Object.defineProperties(this, {
            type: {
                value: type,
                enumerable: true,
                writable: false,
                configurable: false
            },
            detail: {
                value: options.detail,
                enumerable: true,
                writable: true,
                configurable: true
            },
            target: {
                value: undefined,
                enumerable: false,
                writable: false,
                configurable: true
            },
            currentTarget: {
                value: undefined,
                enumerable: false,
                writable: false,
                configurable: true
            }
        });
    }

    /**
     * Añade un nuevo manejador para el evento del tipo o nombre especificado.
     * @param {string} type Tipo o nombre de evento especificado.
     * @param {(event: Event) => void} callback Función manejadora del tipo de evento especificado a añadir.
     */
    Clip.prototype.addEventListener = Clip.prototype.on = function(type, callback) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('Invalid event type: a non-empty string is required.');
        }
        if (typeof callback !== 'function') {
            throw new TypeError('Invalid event listener: a callback function is required.');
        }
        let bucket = this[EVENT_LISTENERS].get(type);
        if (!bucket) {
            this[EVENT_LISTENERS].set(type, bucket = new Set());
        }
        bucket.add(callback);
    };

    /**
     * Elimina el manejador de evento especificado.
     * @param {string} type Tipo o nombre de evento especificado.
     * @param {(event: Event) => void} callback Función manejadora del tipo de evento especificado a eliminar.
     */
    Clip.prototype.removeEventListener = Clip.prototype.off = function(type, callback) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('Invalid event type: a non-empty string is required.');
        }
        if (typeof callback !== 'function') {
            throw new TypeError('Invalid event listener: a callback function is required.');
        }
        const bucket = this[EVENT_LISTENERS].get(type);
        if (bucket) {
            bucket.delete(callback);
            if (bucket.size === 0) {
                this[EVENT_LISTENERS].delete(type);
            }
        }    
    };

    /**
     * Emite el evento especificado.
     * @param {string|ClipEvent|{ type: string, detail?: any }} Evento especificado.
     * @param {boolean|'post'} [spread] Indica si propagar el evento a los clips contenidos y cómo hacer el recorrido, 
     * si en pre-orden (cualquier valor "truly") o en post-orden ("post").
     */
    Clip.prototype.dispatchEvent = Clip.prototype.fire = function(event, spread) {
        // Normalización del parámetro "event".
        if (!(event instanceof ClipEvent)) {
            if (typeof event === 'string' && event.length > 0) {
                event = new ClipEvent(event);
            } else if (typeof event === 'object' && event !== null 
                    && typeof event.type === 'string' && event.type.length > 0) {
                const ev = new ClipEvent(event.type, { detail: event.detail });
                for (const key of Object.keys(event)) {
                    if (['type', 'target', 'currentTarget'].includes(key)) {
                        console.warn(`Event property "${key}" is reserved.`);
                        continue;
                    }
                    ev[key] = event[key];
                }
                event = ev;
            } else {
                throw new TypeError('Invalid event format: a non-empty string, an object with a string "type" property, or an instance of ClipEvent is required.');
            }
        }

        // Solo se define la propiedad "target" en la primera llamada y se mantiene en todo el procesamiento del evento.
        if (!('target' in event) || event.target == null) {
            Object.defineProperty(event, 'target', {
                value: this,
                enumerable: true
            });
        }

        // Se evalua si propagar el evento primero a los clips contenidos (post-order).
        if (spread === 'post') {
            _spreadEvent.call(this, event, spread);
        }

        // Se procesa el evento.
        const bucket = this[EVENT_LISTENERS].get(event.type); 
        if (bucket) {
            Object.defineProperty(event, 'currentTarget', {
                value: this,
                writable: true,
                enumerable: true
            });
            for (const callback of [...bucket]) {
                try {
                    callback.call(this, event);
                } catch (err) {
                    console.error(`Error calling event listener "${event.type}" in clip "${this.clipName}":`, err);
                }
            }
            event.currentTarget = null;
        }

        // Se evalua si propagar el evento a los clips contenidos (pre-order). 
        if (spread && spread !== 'post') {
            _spreadEvent.call(this, event, spread);
        }
    };

    /**
     * Propaga el evento especificado a los clips contenidos en el clip (this).
     * @param {ClipEvent} event Evento de clip.
     * @param {boolean|'post'} [spread=false] Indica si propagar el evento y cómo recorrer la jerarquia de clips, si en pre-orden 
     * (cualquier valor "truly") o en post-orden (literal "post").
     * @private
     */
    function _spreadEvent(event, spread) {
        for (const clip of [...this._childClips]) {
            clip.fire(event, spread);
        }
    }


    /* Constants
     * ================================================================================================================== */
    /**
     * Formato del nombre de los clips (path-like), uno o varios segmentos separados 
     * por "/", cada segmento: [A-Za-z0-9_-]+
     * @type {RegExp}
     * @constant
     */ 
    const CLIP_NAME_RE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

    /**
     * Longitud máxima permitida para los nombres de clip.
     * @type {number}
     * @constant
     */
    const CLIP_NAME_MAX_LENGTH = 256;

    /**
     * Prefijo para especificar referencias a clips en inclusiones.
     * @type {string}
     * @constant
     */
    const CLIP_PREFIX = 'clip:';

    /**
     * Expresión para verificar si una cadena solo contiene espacios.
     * @type {RegExp}
     * @constant  
     */
    const WS_RE = /^\s*$/;

    /* ------------------------------------------------------------------------------------------------------------------ */
    /**
     * Clip Error.
     * @param {string} message Descripción del error.
     * @param {{ code?: string, cause?: any }=} [options] Opciones adicionales.
     */
    function ClipError(message, { code = null, cause } = {}) {
        this.name = 'ClipError';
        this.message = String(message);
        this.code = code;

        if (cause !== undefined) {
            this.cause = cause;
        }

        Error.captureStackTrace ? Error.captureStackTrace(this, ClipError) : this.stack = (new Error(message)).stack;
    }
    ClipError.prototype = Object.create(Error.prototype);
    ClipError.prototype.constructor = ClipError;

    // Códigos de error.
    ClipError.ROOT_REQUIRED = 'root_required';
    ClipError.LOAD_FAILED   = 'load_failed';
    ClipError.NOT_DEFINED   = 'not_defined';
    ClipError.NOT_FOUND     = 'not_found';


    /* Template functions 
     * ================================================================================================================== */
    /**
     * Carga la plantilla especificada.
     * @param {string} name Nombre o ruta de la plantilla especificada.
     * @return {Function} Función de la plantilla cargada.
     */
    const _loadTemplate = async function(name) {
        const path = `${_settings.basePath}/${name}.ejs`;
        const res = await fetch(path, { cache: "no-store" }); // evita cache en dev
        if (!res.ok) {
            throw new Error(`Unable to load template: ${path} (${res.status})`);
        }
        return _templates[name] = ejs.compile(await res.text());
    };

    /**
     * Fuerza el reflow del elemento especificado.
     * @param {Element} el Elemento especificado.
     * @private
     */
    function _reflow(el) {
        return el.getBoundingClientRect();
    }


    /* Main Object 
     * ================================================================================================================== */
    /**
     * Settings.
     * @type {Object}
     * @private
     * @constant
     */
    const _settings = {

        /**
         * Indica si activar el modo debug.
         * @type {boolean}
         * @default false
         */
        debug: false,

        /**
         * Ruta base donde se localiza la definición de los clips.
         * @type {string}
         * @default '/clips'
         */
        basePath: '/clips',

        /**
         * Indica si los estilos están pre-empaquetados.
         * @type {boolean}
         * @default false
         */
        stylesBundled: false,

        /**
         * Indica si las plantillas están pre-empaquetadas.
         * @type {boolean}
         * @default false
         */
        templatesBundled: false
    };

    /**
     * Manejadores de Clips definidos.
     * @type {Object.<string, Clip>}
     * @constant
     */
    const _handlers = Object.create(null);

    /**
     * Funciones de plantilla añadidas.
     * @type {Object.<string, (...) => HTMLElement}
     * @constant
     */
    const _templates = Object.create(null);

    /**
     * Mapa de asociación entre elementos e instancias de clips.
     * @type {WeakMap.<Element, Clip>}
     * @constant
     * @private
     */
    const _elementClips = new WeakMap();

    /**
     * Referencia al elemento de estilos donde se importan los estilos de los diferentes clips definidos.
     * @type {HTMLStyleElement}
     * @private
     */
    let _styleElement;

    /**
     * Devuelve el primer clip vinculado a uno de los ascendientes del elemento especificado.
     * @param {Element} el Elemento especificado.
     * @returns {Clip|null} Clip encontrado o null si no se encuentra.
     * @private
     */
    const _closestClip = function(el) {
        for (let n = el?.parentElement, c; n; n = n.parentElement) {
            if (c = _elementClips.get(n)) return c;
        }
        return null;
    };

    /**
     * Importa los estilos del clip especificado.
     * @param {string} name Nombre del clip.
     * @param {string|function|HTMLStyleElement|CSSStyleSheet} styles Estilos del clip.
     */
    const _importClipStyles = async function(name, styles) {
        // Los estilos se pueden definir como propiedad o como función.
        if (typeof styles === 'function') {
            styles = styles();
        }
        // Si se definen como HTMLStyleElement, se añaden directamente al head.
        if (styles instanceof HTMLStyleElement) {
            document.head.appendChild(styles);
            return;
        }
        // Si se definen como CSSStyleSheet, se añaden a las hojas de estilo adoptadas.
        if (styles instanceof CSSStyleSheet) {
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles];
            return;
        }
        // Si el clip no define estilos en código y no están empaquetados, se intenta cargar la hoja de estilos por defecto 
        // ubicada en la misma ubicación que el clip.
        if (!styles && !_settings.stylesBundled) {
            // TODO: Más que un flag que nos indique si los estilos están empaquetados o no, lo que realmente necesitamos es 
            // una definición de bundles con la especificación de nombres o patrones de clips incluidos en cada bundle, de 
            // forma que podamos introducir aquí la lógica de carga adecuada.
            const path = `${_settings.basePath}/${name}/${Clip.defaultStylesName}.css`;
            let res;
            try {
                res = await fetch(path);
            } catch (err) {
                throw new ClipError(`Failed to fetch styles for clip "${name}" from "${path}": ${err.message}`, {
                    code: ClipError.LOAD_FAILED,
                    cause: err
                });
            }
            if (res.ok) {
                styles = await res.text();
            } else if (res.status !== 404 && res.status !== 410) {
                throw new ClipError(`Failed to load styles for clip "${name}" from "${path}": ${res.statusText} (${res.status})`, {
                    code: ClipError.LOAD_FAILED
                });
            } else if (_settings.debug) {
                console.warn(`No styles found for clip "${name}" at "${path}".`);
            }
        }
        if (styles && (styles = styles.trim())) {
            if (!_styleElement) {
                _styleElement = document.createElement('style');
                _styleElement.id = 'clips-styles';
                _styleElement.setAttribute('data-source', 'clips');
                document.head.appendChild(_styleElement);
            }
            _styleElement.textContent += `\n/* ${name} */\n${styles}\n`;
        }
    };

    /**
     * Carga el manejador del clip especificado por nombre.
     * @param {string} name Nombre del clip especificado.
     * @return {Clip} Manejador del clip especificado.
     */
    const _loadHandler = async function(name) {
        // TODO: Introducir aquí posibles mapeos para bundles.
        // Se carga el prototipo del manejador.
        const path = `${_settings.basePath}/${name}/${Clip.defaultHandlerName}.js`;
        let module;
        try {
            module = await import(path);
        } catch (err) {
            throw new ClipError(`Clip "${name}" could not be loaded from ${path}.`, {
                code: ClipError.LOAD_FAILED,
                cause: err
            });
        }

        // Se define el clip con el prototipo cargado.
        const proto = module && module.default;
        if (proto === null || typeof proto !== 'object') {
            throw new ClipError(`Clip "${name}" has no default export.`, {
                code: ClipError.NOT_DEFINED
            });
        }
        return await clips.define(name, proto);
    };


    /**
     * Main Object.
     * @namespace
     */
    const clips = {

        /**
         * Actualiza los ajustes de configuración especificados.
         * @param {Object} settings Ajustes de configuración.
         * @param {boolean} [settings.debug] Indica si activar el modo debug.
         * @param {string}  [settings.basePath] Ruta base donde se localiza la definición de los clips.
         * @param {boolean} [settings.stylesBundled] Indica si los estilos están pre-empaquetados.
         * @param {boolean} [settings.templatesBundled] Indica si las plantillas están pre-empaquetadas.
         */
        setup: function(settings) {
            Object.assign(_settings, settings);
        },
        
        /**
         * Define un nuevo tipo de clip.
         * @param {string} name Nombre del clip (único).
         * @param {Object} proto Prototipo del clip.
         * @return {new (options: ClipOptions) => Clip} Constructor del nuevo tipo de clip.
         */
        define: async function(name, proto) {
            // Nombre del clip.
            if (typeof name !== 'string') {
                throw new TypeError('Invalid clip name: string required.');
            }
            name = name.trim();
            if (!name) {
                throw new TypeError('Invalid clip name: empty string.');
            }
            if (name.length > CLIP_NAME_MAX_LENGTH) {
                throw new RangeError(`Invalid clip name: too long (${name.length} > ${CLIP_NAME_MAX_LENGTH}).`);
            }
            if (!CLIP_NAME_RE.test(name)) {
                throw new TypeError('Invalid clip name: expected path-like string without leading or trailing slash.');
            }
            if (_handlers[name]) {
                throw new Error(`Clip "${name}" already defined.`);
            }

            // Objeto prototipo.
            if (proto === null || typeof proto !== 'object' || Object.getPrototypeOf(proto) !== Object.prototype) {
                throw new TypeError('Invalid prototype: plain object required.');
            }

            // Se comprueba la validez de la propiedad "extends" si se ha especificado.
            let base = proto.extends;
            if (base !== undefined) {
                if (typeof base !== 'string') {
                    throw new TypeError(`Invalid extends: string required.`);
                }
                base = base.trim();
                if (!base) {
                    throw new TypeError(`Invalid extends: empty string.`);
                }
                if (!_handlers[base]) {
                    await _loadHandler(base);
                    if (!_handlers[base]) {
                        throw new ReferenceError(`Invalid extends: clip "${base}" not defined.`);
                    }
                }
            }

            // Se determina el constructor base si se ha especificado.
            const B = base ? _handlers[base] : Clip;

            // Se crea la función constructora del nuevo clip.
            const C = function(options) {
                B.call(this, options);
            };

            // Se heredan los estáticos del constructor base.
            Object.setPrototypeOf(C, B);

            // Se extraen los descriptores del prototipo, excluyendo "extends" y "styles".
            const desc = Object.getOwnPropertyDescriptors(proto);
            delete desc.extends;
            delete desc.styles;

            // Se crea el prototipo del nuevo clip a partir del prototipo base.
            C.prototype = Object.create(B.prototype);
            Object.defineProperties(C.prototype, desc);

            // Se define la propiedad "constructor" no enumerable.
            Object.defineProperty(C.prototype, 'constructor', {
                value: C,
                writable: true,
                configurable: true,
                enumerable: false
            });

            // Se añade la propiedad "clipName" al constructor y el método de acceso para facilitar el acceso desde las instancias.
            const CLIP_NAME = Symbol('clips.name');
            Object.defineProperty(C, CLIP_NAME, {
                value: name
            });
            Object.defineProperty(C.prototype, 'clipName', {
                get() {
                    return this.constructor[CLIP_NAME];
                },
                configurable: true,
                enumerable: false
            });

            // Se define la propiedad "displayName" para depuración.
            C.displayName = name;

            // Se añade la referencia al prototipo base.
            const BASE = Symbol('clips.base');
            Object.defineProperty(C, BASE, {
                value: B
            });
            Object.defineProperty(C.prototype, 'basePrototype', {
                get() { return this.constructor[BASE].prototype; },
                enumerable: false
            });

            // Se guarda el constructor por nombre.
            _handlers[name] = C;

            // Se importan la hoja de estilos asociada.
            _importClipStyles(name, proto.styles);
            
            // Se devuelve el constructor del nuevo clip.
            return C;
        },

        /**
         * Crea una nueva instancia del tipo de clip especificado por nombre.
         * @param {string} name Nombre del tipo de clip especificado.
         * @param {ClipOptions} [options] Opciones de creación del clip.
         * @return {Clip} Instancia del clip creada.
         */
        create: async function(name, options = {}) {
            if (typeof name !== "string" || !(name = name.trim())) {
                throw new TypeError('Invalid clip name: non-empty string required.');
            }
            if (!_handlers[name]) {
                await _loadHandler(name);
            }
            const handler = _handlers[name];
            if (!handler) {
                throw new ClipError(`Clip "${name}" is not defined.`, {
                    code: ClipError.NOT_DEFINED
                });
            }
            return new handler(options);
        },

        /**
         * Renderiza la plantilla especificada por nombre en el contexto del clip especificado.
         * @param {Clip} clip Referencia al clip actual.
         * @param {string} name Nombre o ruta de la plantilla a renderizar.
         * @param {Object} [options] Opciones adicionales de renderizado.
         * @return {DocumentFragment} Fragmento generado. 
         */
        render: async function(clip, name, options) {
            // Se comprueba si la función de plantilla está definida.
            let templateFn = _templates[name];
            if (!templateFn && !_settings.templatesBundled) {
                // Si no existe la plantilla, y no se han pre-empaquetado las plantillas, se intenta cargar.
                templateFn = await _loadTemplate(name);
            }
            if (!templateFn) {
                throw new Error(`Template "${name}" not found.`);
            }

            /** 
             * Buffer de salida.
             * @type {string[]}
             */
            const out = [];
            
            /** 
             * Includes añadidos durante la ejecución de la plantilla.
             * Cada entrada contiene el nombre y las opciones especificadas.
             * @type {{name: string, options?: any}[]}
             */
            const includes = [];

            /** 
             * Contexto local pasado a la función de plantilla. Contiene el buffer de salida y las utilidades básicas 
             * (escape, print, include...).
             * @type {{
             *  escape: (value: any) => string,
             *  print: (...args: any[]) => void,
             *  printRaw: (...args: any[]) => void,
             *  include: (name: string, options?: Object) => void
             * }}
             */
            const locals = {
                options, // TODO: Evaluar si definir solo "data" o que hacer?
                escape: esc.html,
                print: (...args) => out.push(...args.map(v => esc.html(String(v)))),
                printRaw: (...args) => out.push(...args.map(v => String(v))),
                include: function(name, options = {}) {
                    includes.push({ name, options });
                    out.push('<clip-slot></clip-slot>');
                }
            };

            // Se ejecuta la plantilla con el contexto anterior.
            templateFn.call(clip, out, locals);

            // Se crea un elemento "template" para parsear el código HTML generado.
            const template = document.createElement('template');
            template.innerHTML = out.join('');
            
            // Resolvemos las inclusiones añadidas.
            const slots = template.content.querySelectorAll('clip-slot');
            if (slots.length !== includes.length) {
                throw new Error(`Includes mismatch: ${slots.length} vs ${includes.length}`);
            }
            for (let i = 0, c, fragment; i < includes.length; i++) {
                if (includes[i].name.startsWith(CLIP_PREFIX)) {
                    c = await clips.create(includes[i].name.substring(CLIP_PREFIX.length), includes[i].options);
                    await c.include(slots[i], { ...includes[i].options, position: Clip.Position.REPLACE, parentClip: clip });
                    continue;
                }
                fragment = await clips.render(clip, includes[i].name, includes[i].options);
                slots[i].replaceWith(fragment);
            }

            // Se devuelve el contenido generado.
            return template.content;
        },

        /**
         * Incluye un clip o una plantilla en el elemento o selector especificado.
         * @param {string} name Nombre del clip o plantilla especificado.
         * @param {Element} target Elemento especificado. 
         * @param {Object} [options] Opciones adicionales.
         * @see Clip#create
         * @see Clip#include
         */
        include: async function(name, target, options) {
            return (await this.create(name, options)).include(target, options); 
        },

        /**
         * Devuelve el clip asociado con el elemento especificado.
         * @param {HTMLElement|string} el Elemento o selector.
         * @param {string} [selector] Selector adicional dentro del elemento especificado.
         * @returns {Clip|null} Clip o nulo si no se encuentra.
         */
        find: function(el, selector) {
            if (typeof el === 'string') {
                el = document.querySelector(el);
            } else if (el instanceof Element && selector) {
                el = el.querySelector(selector);
            }
            return (el instanceof Element && _elementClips.get(el)) || null;
        },

        /**
         * Fija la ruta base de donde cargar los clips.
         * @param {string} path Ruta especificada.
         */
        basePath: function(path) {
            if (typeof path === 'string') {
                path = path.trim().replace(/\/$/, '');
            }
            _settings.basePath = path;
        }

    };

    /**
     * Tipo de clip base para la definición de vistas que se pueden abrir dentro de un viewport.
     * @class ViewClip
     */
    clips.define('view', {

        /** @see Clip#create */
        create: function(options) {
            // ...
        },

        /** @type {string} */
        styles: /*css*/`
        .view {
            display: block;
        }
    `

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
            <div class="viewport"></div>
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
        },

        // -----------------------------------------------------------------------------------------------------------------
        /** 
         * Clip styles.
         * @type {string}
         */
        styles: /*css*/`
        .viewport {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;

            > .view {
                display: block;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
            }
        }
    `

    });

    return clips;

})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpcHMtMC4wLjEuanMiLCJzb3VyY2VzIjpbIi4uL3V0aWwvZXNjYXBlLmpzIiwiLi4vdXRpbC9lanMuanMiLCIuLi9jbGlwcy5qcyIsIi4uL2FkZC1vbnMvdmlld3MuanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgSFRNTF9FU0NBUEVTID0ge1xyXG4gICAgJyYnOiAnJmFtcDsnLFxyXG4gICAgJzwnOiAnJmx0OycsXHJcbiAgICAnPic6ICcmZ3Q7JyxcclxuICAgICdcIic6ICcmcXVvdDsnLFxyXG4gICAgXCInXCI6ICcmIzM5OydcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEVzY2FwYSBsb3MgY2FyYWN0ZXJlcyBlc3BlY2lhbGVzIGVuIEhUTUwuXHJcbiAgICAgKiBAcGFyYW0geyp9IHggVmFsb3IgZXNwZWNpZmljYWRvLiBcclxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IENhZGVuYSBlc2NhcGFkYS5cclxuICAgICAqL1xyXG4gICAgaHRtbDogKHgpID0+IFN0cmluZyh4KS5yZXBsYWNlKC9bJjw+XCInXS9nLCAoY2gpID0+IEhUTUxfRVNDQVBFU1tjaF0pLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRXNjYXBhIGxvcyBjYXJhY3RlcmVzIGVzcGVjaWFsZXMgZW4gbGl0ZXJhbGVzIGRlIHBsYW50aWxsYS5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdHIgQ2FkZW5hIGVzcGVjaWZpY2FkYS4gXHJcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBDYWRlbmEgZXNjYXBhZGEuXHJcbiAgICAgKi9cclxuICAgIGxpdGVyYWw6IChzdHIpID0+IHN0clxyXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcL2csIFwiXFxcXFxcXFxcIilcclxuICAgICAgICAucmVwbGFjZSgvYC9nLCBcIlxcXFxgXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xcJFxcey9nLCBcIlxcXFwke1wiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHIvZywgXCJcXFxcclwiKVxyXG5cclxufTsiLCJpbXBvcnQgZXNjIGZyb20gJy4vZXNjYXBlLmpzJztcclxuXHJcbi8qKlxyXG4gKiBFeHByZXNpw7NuIHJlZ3VsYXIgcGFyYSBkZXRlY3RhciBsYXMgZXRpcXVldGFzIEVKUy5cclxuICogQHR5cGUge1JlZ0V4cH1cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5jb25zdCBlanNUYWdzUmUgPSAvPCVbLT1dP1tcXHNcXFNdKj8lPi9nO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29tcGlsYSBlbCBjw7NkaWdvIGZ1ZW50ZSBkZSB1bmEgcGxhbnRpbGxhIEVKUy5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcmMgQ8OzZGlnbyBmdWVudGUgZGUgbGEgcGxhbnRpbGxhLlxyXG4gICAgICogQHJldHVybnMge0Z1bmN0aW9ufSBGdW5jacOzbiBkZSBwbGFudGlsbGEgY29tcGlsYWRhLlxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqL1xyXG4gICAgY29tcGlsZTogZnVuY3Rpb24oc3JjKSB7XHJcbiAgICAgICAgbGV0IG9mZnNldCA9IDAsIG1hdGNoO1xyXG4gICAgICAgIGxldCBib2R5ID0gJycsIG1hcmssIGNvZGU7XHJcbiAgICAgICAgY29uc3QgYXBwZW5kVGV4dCA9ICh0ZXh0KSA9PiBib2R5ICs9IHRleHQgPyBgb3V0LnB1c2goXFxgJHtlc2MubGl0ZXJhbCh0ZXh0KX1cXGApO2AgOiAnJztcclxuICAgICAgICB3aGlsZSAoKG1hdGNoID0gZWpzVGFnc1JlLmV4ZWMoc3JjKSkgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgYXBwZW5kVGV4dChzcmMuc2xpY2Uob2Zmc2V0LCBtYXRjaC5pbmRleCkpO1xyXG5cclxuICAgICAgICAgICAgbWFyayA9IG1hdGNoWzBdWzJdOyAvLyAnJScsICc9JywgJy0nXHJcbiAgICAgICAgICAgIGNvZGUgPSBtYXRjaFswXS5zbGljZSgyICsgKG1hcmsgPT09ICc9JyB8fCBtYXJrID09PSAnLScgPyAxIDogMCksIC0yKS50cmltKCk7XHJcblxyXG4gICAgICAgICAgICBpZiAobWFyayA9PT0gJz0nKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5ICs9IGBvdXQucHVzaChlc2NhcGUoKCR7Y29kZX0pKSk7IFxcbmA7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobWFyayA9PT0gJy0nKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5ICs9IGBvdXQucHVzaChTdHJpbmcoKCR7Y29kZX0pKSk7IFxcbmA7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBib2R5ICs9IGNvZGUgKyAnXFxuJztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgb2Zmc2V0ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGFwcGVuZFRleHQoc3JjLnNsaWNlKG9mZnNldCkpO1xyXG4gICAgICAgIHJldHVybiBuZXcgRnVuY3Rpb24oJ291dCcsICdsb2NhbHMnLCBgd2l0aCAobG9jYWxzKSB7ICR7Ym9keX0gfWApO1xyXG4gICAgfVxyXG5cclxufTsiLCJpbXBvcnQgZWpzIGZyb20gJy4vdXRpbC9lanMuanMnO1xyXG5pbXBvcnQgZXNjIGZyb20gJy4vdXRpbC9lc2NhcGUuanMnO1xyXG5cclxuLyogQ2xpcCBwcm90b3R5cGVcclxuICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXHJcbi8qKlxyXG4gKiBQcm9wZXJ0eSBzeW1ib2wgXCJldmVudExpc3RlbmVyc1wiIG9mIENsaXAgb2JqZWN0LlxyXG4gKiBAdHlwZSB7c3ltYm9sfVxyXG4gKiBAY29uc3RcclxuICovXHJcbmNvbnN0IEVWRU5UX0xJU1RFTkVSUyA9IFN5bWJvbCgnZXZlbnRMaXN0ZW5lcnMnKTtcclxuXHJcbi8qKlxyXG4gKiBGdW5jacOzbiBjb25zdHJ1Y3RvcmEsIGJhc2UgZGUgdG9kbyBjbGlwLlxyXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnM9e31dIE9wY2lvbmVzIGRlIGNyZWFjacOzbi5cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBDbGlwKG9wdGlvbnMgPSB7fSkge1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVmZXJlbmNpYSBhbCBub2RvIHJhw616IGRlbCBjbGlwLlxyXG4gICAgICogQHR5cGUge0VsZW1lbnR9XHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICB0aGlzLl9yb290ID0gbnVsbDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZmVyZW5jaWEgYWwgY2xpcCBwYWRyZSBvIGNvbnRlbmVkb3IuXHJcbiAgICAgKiBAdHlwZSB7Q2xpcH1cclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKi9cclxuICAgIHRoaXMuX3BhcmVudENsaXAgPSBudWxsO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29uanVudG8gZGUgc3ViY2xpcHMgY29udGVuaWRvcy5cclxuICAgICAqIEB0eXBlIHtTZXQ8Q2xpcD59XHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICB0aGlzLl9jaGlsZENsaXBzID0gbmV3IFNldCgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGllbXBvIGRlIGNhcmdhLlxyXG4gICAgICogQHR5cGUge251bWJlcn1cclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKi9cclxuICAgIHRoaXMuX2xvYWRUaW1lID0gMDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIE1hbmVqYWRvcmVzIGRlIGV2ZW50b3MgcG9yIHRpcG8uXHJcbiAgICAgKiBAdHlwZSB7TWFwPHN0cmluZywgU2V0PEZ1bmN0aW9uPj59XHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgRVZFTlRfTElTVEVORVJTLCB7XHJcbiAgICAgICAgdmFsdWU6IG5ldyBNYXAoKSxcclxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcclxuICAgICAgICB3cml0YWJsZTogZmFsc2UsXHJcbiAgICAgICAgY29uZmlndXJhYmxlOiBmYWxzZVxyXG4gICAgfSk7XHJcblxyXG5cclxuICAgIC8vIFNlIGxsYW1hIGEgbGEgZnVuY2nDs24gY3JlYXRlLlxyXG4gICAgdGhpcy5jcmVhdGUob3B0aW9ucyk7XHJcbn1cclxuXHJcbi8vIFNlIGRlZmluZW4gbG9zIGFjY2Vzb3JlcyBkZSBsYXMgcHJvcGllZGFkZXMgYW50ZXJpb3Jlcy5cclxuT2JqZWN0LmRlZmluZVByb3BlcnRpZXMoQ2xpcC5wcm90b3R5cGUsIHtcclxuICAgIHJvb3Q6IHtcclxuICAgICAgICAvKiogQHJldHVybnMge0VsZW1lbnR8bnVsbH0gKi9cclxuICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yb290O1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZVxyXG4gICAgfSxcclxuICAgIHBhcmVudENsaXA6IHtcclxuICAgICAgICAvKiogQHJldHVybnMge0NsaXB8bnVsbH0gKi9cclxuICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wYXJlbnRDbGlwO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZVxyXG4gICAgfSxcclxuICAgIGNoaWxkQ2xpcHM6IHtcclxuICAgICAgICAvKiogQHJldHVybnMge0NsaXBbXX0gKi9cclxuICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbLi4udGhpcy5fY2hpbGRDbGlwc107XHJcbiAgICAgICAgfSxcclxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlXHJcbiAgICB9LFxyXG4gICAgY2hpbGRDb3VudDoge1xyXG4gICAgICAgIC8qKiBAcmV0dXJucyB7bnVtYmVyfSAqL1xyXG4gICAgICAgIGdldCgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NoaWxkQ2xpcHMuc2l6ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0pO1xyXG5cclxuXHJcbi8qIENvbnN0YW50cyBvZiBDbGlwXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogRGlmZXJlbnRlcyBwb3NpY2lvbmVzIGVuIGxhcyBxdWUgaW5jbHVpciB1biBjbGlwIGVuIGVsIERPTSBjb24gcmVzcGVjdG8gYWwgZWxlbWVudG8gb2JqZXRpdm8uXHJcbiAqIEBlbnVtIHtzdHJpbmd9XHJcbiAqIEBjb25zdGFudFxyXG4gKi9cclxuQ2xpcC5Qb3NpdGlvbiA9IE9iamVjdC5mcmVlemUoe1xyXG4gICAgU1RBUlQ6ICAgICAgJ3N0YXJ0JyxcclxuICAgIEVORDogICAgICAgICdlbmQnLFxyXG4gICAgQkVGT1JFOiAgICAgJ2JlZm9yZScsXHJcbiAgICBBRlRFUjogICAgICAnYWZ0ZXInLFxyXG4gICAgUkVQTEFDRTogICAgJ3JlcGxhY2UnXHJcbn0pO1xyXG5cclxuLyoqXHJcbiAqIE5vbWJyZSBkZWwgZmljaGVybyBtYW5lamFkb3IgcG9yIGRlZmVjdG8uXHJcbiAqIEB0eXBlIHtzdHJpbmd9XHJcbiAqIEBjb25zdGFudFxyXG4gKi9cclxuQ2xpcC5kZWZhdWx0SGFuZGxlck5hbWUgPSAnaGFuZGxlcic7XHJcblxyXG4vKipcclxuICogTm9tYnJlIGRlIHBsYW50aWxsYSBwb3IgZGVmZWN0by5cclxuICogQHR5cGUge3N0cmluZ31cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5DbGlwLmRlZmF1bHRUZW1wbGF0ZU5hbWUgPSAnbGF5b3V0JztcclxuXHJcbi8qKlxyXG4gKiBOb21icmUgZGUgaG9qYSBkZSBlc3RpbG9zIHBvciBkZWZlY3RvLlxyXG4gKiBAdHlwZSB7c3RyaW5nfVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbkNsaXAuZGVmYXVsdFN0eWxlc05hbWUgPSAnc3R5bGVzJztcclxuXHJcblxyXG4vKiBQcm90b3R5cGUgZnVuY3Rpb25zXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogRnVuY2nDs24gZGUgY3JlYWNpw7NuIGRlIG51ZXZhcyBpbnN0YW5jaWFzLlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcGNpb25lcyBkZSBjcmVhY2nDs24uXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihvcHRpb25zKSB7fTtcclxuXHJcbi8qKlxyXG4gKiBGdW5jacOzbiBwYXJhIGluY2x1aXIgZWwgY2xpcCBjb24gcmVzcGVjdG8gYWwgZWxlbWVudG8gKHRhcmdldCkgZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0ge0VsZW1lbnR9IHRhcmdldCBFbGVtZW50byBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3BjaW9uZXMgZGUgaW5jbHVzacOzbi5cclxuICogQHBhcmFtIHtDbGlwfSBbb3B0aW9ucy5wYXJlbnRDbGlwXSBSZWZlcmVuY2lhIGFsIGNsaXAgY29udGVuZWRvci5cclxuICogQHBhcmFtIHtDbGlwLlBvc2l0aW9ufSBbb3B0aW9ucy5wb3NpdGlvbj1DbGlwLlBvc2l0aW9uLkVORF0gUG9zaWNpw7NuIGRlIGluY2x1c2nDs24gZGVsIGNsaXAgY29uIHJlc3BlY3RvIGFsIGVsZW1lbnRvIFxyXG4gKiAodGFyZ2V0KSBlc3BlY2lmaWNhZG8uIFxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuaW5jbHVkZSA9IGFzeW5jIGZ1bmN0aW9uKHRhcmdldCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICAvLyBTZSBjb21wcnVlYmEgcXVlIGVsIHRhcmdldCBzZWEgdW4gRWxlbWVudC5cclxuICAgIGlmICghdGFyZ2V0IHx8IHRhcmdldC5ub2RlVHlwZSAhPT0gTm9kZS5FTEVNRU5UX05PREUpIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIHRhcmdldDogbXVzdCBiZSBhbiBFbGVtZW50LicpO1xyXG4gICAgfVxyXG4gICAgLy8gU2kgdG9kYXbDrWEgbm8gc2UgaGEgZ2VuZXJhZG8gZWwgZWxlbWVudG8gcmHDrXogc2UgbGxhbWEgYWwgcmVuZGVyLlxyXG4gICAgaWYgKCF0aGlzLl9yb290KSB7XHJcbiAgICAgICAgbGV0IG91dDtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBvdXQgPSBhd2FpdCB0aGlzLnJlbmRlcihvcHRpb25zKTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gcmVuZGVyIGNsaXAgXCIke3RoaXMuY2xpcE5hbWV9XCI6ICR7ZXJyLm1lc3NhZ2V9YCwge1xyXG4gICAgICAgICAgICAgICAgY2F1c2U6IGVyclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG91dD8ubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3Jvb3QgPSBvdXQ7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbGV0IHJvb3Q7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb3V0ID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZW1wbGF0ZScpO1xyXG4gICAgICAgICAgICAgICAgdGVtcGxhdGUuaW5uZXJIVE1MID0gb3V0O1xyXG4gICAgICAgICAgICAgICAgb3V0ID0gdGVtcGxhdGUuY29udGVudDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAob3V0Py5ub2RlVHlwZSA9PT0gTm9kZS5ET0NVTUVOVF9GUkFHTUVOVF9OT0RFKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBuID0gb3V0LmZpcnN0Q2hpbGQ7IG47IG4gPSBuLm5leHRTaWJsaW5nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG4ubm9kZVR5cGUgPT09IE5vZGUuRUxFTUVOVF9OT0RFKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyb290KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ011bHRpcGxlIHJvb3QgZWxlbWVudHMgYXJlIG5vdCBhbGxvd2VkLicpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvb3QgPSBuO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobi5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFXU19SRS50ZXN0KG4uZGF0YSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVGV4dCBvdXRzaWRlIHRoZSByb290IGVsZW1lbnQgaXMgbm90IGFsbG93ZWQuJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG4ubm9kZVR5cGUgIT09IE5vZGUuQ09NTUVOVF9OT0RFKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgbm9kZSB0eXBlICgke24ubm9kZVR5cGV9KSBvdXRzaWRlIHRoZSByb290IGVsZW1lbnQuYCk7ICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFyb290KSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgY2xpcCByb290LiBFbnN1cmUgcmVuZGVyKCkgcmV0dXJucyBhbiBFbGVtZW50LCBvciBhIERvY3VtZW50RnJhZ21lbnQvSFRNTCBzdHJpbmcgd2l0aCBhIHNpbmdsZS1yb290IEVsZW1lbnQuYCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5fcm9vdCA9IHJvb3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNlIGd1YXJkYSBsYSB2aW5jdWxhY2nDs24gZGVsIGNsaXAgY29uIHN1IGVsZW1lbnRvIHJhw616LlxyXG4gICAgICAgIF9lbGVtZW50Q2xpcHMuc2V0KHRoaXMuX3Jvb3QsIHRoaXMpO1xyXG4gICAgICAgIC8vIFNlIGd1YXJkYSBjb21vIHByb3BpZWRhZCBkZWwgZWxlbWVudG8gcGFyYSBtZWpvcmFyIGxhIHZpc2liaWxpZGFkIGVuIGRlcHVyYWNpw7NuLlxyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl9yb290LCAnX19jbGlwJywge1xyXG4gICAgICAgICAgICB2YWx1ZTogdGhpcyxcclxuICAgICAgICAgICAgd3JpdGFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBUT0RPOiBBw7FhZGlyIHByb3BpZWRhZGVzIGRlIGVzdGlsbyBhZGljaW9uYWxlcyAob3B0aW9ucy5zdHlsZSkgeSBjbGFzZXMgKG9wdGlvbnMuY2xhc3MpLlxyXG4gICAgLy8gVE9ETzogRXZhbHVhciBzaSBpbmNsdWlyIGVsIHBhcsOhbWV0cm8gaGlkZSBvIGhpZGRlbiBwYXJhIG9jdWx0YXIgZWwgZWxlbWVudG8gaW5pY2lhbG1lbnRlLlxyXG5cclxuICAgIC8vIFNlIGluc2VydGEgZWwgZWxlbWVudG8gZW4gbGEgcG9zaWNpw7NuIGVzcGVjaWZpY2FkYS5cclxuICAgIGNvbnN0IHBvc2l0aW9uID0gb3B0aW9ucy5wb3NpdGlvbiA/PyBDbGlwLlBvc2l0aW9uLkVORDsgXHJcbiAgICBzd2l0Y2ggKHBvc2l0aW9uKSB7XHJcbiAgICAgICAgY2FzZSBDbGlwLlBvc2l0aW9uLkFGVEVSOlxyXG4gICAgICAgICAgICB0YXJnZXQuYWZ0ZXIodGhpcy5fcm9vdCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgQ2xpcC5Qb3NpdGlvbi5CRUZPUkU6XHJcbiAgICAgICAgICAgIHRhcmdldC5iZWZvcmUodGhpcy5fcm9vdCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBDbGlwLlBvc2l0aW9uLlJFUExBQ0U6XHJcbiAgICAgICAgICAgIGlmICh0aGlzLl9yb290LmNvbnRhaW5zKHRhcmdldCkpIHtcclxuICAgICAgICAgICAgICAgIHRhcmdldC5iZWZvcmUodGhpcy5fcm9vdCk7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXQucmVwbGFjZVdpdGgodGhpcy5fcm9vdCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBDbGlwLlBvc2l0aW9uLlNUQVJUOlxyXG4gICAgICAgICAgICB0YXJnZXQucHJlcGVuZCh0aGlzLl9yb290KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBDbGlwLlBvc2l0aW9uLkVORDpcclxuICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZCh0aGlzLl9yb290KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEludmFsaWQgcG9zaXRpb246ICR7cG9zaXRpb259LmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlIGHDsWFkZSBhbCBjbGlwIHBhZHJlIG8gY29udGVuZWRvci4gU2kgbm8gc2UgZXNwZWNpZmljYSwgc2UgYnVzY2EgZW4gbG9zIGVsZW1lbnRvcyBhc2NlbmRpZW50ZXMuXHJcbiAgICAob3B0aW9ucy5wYXJlbnRDbGlwIHx8IF9jbG9zZXN0Q2xpcCh0aGlzLl9yb290KSk/Ll9hcHBlbmRDbGlwKHRoaXMpO1xyXG5cclxuICAgIC8vIExsYW1hZGEgYWwgbcOpdG9kbyByZWFkeS5cclxuICAgIHRoaXMucmVhZHkob3B0aW9ucyk7XHJcblxyXG4gICAgLy8gU2UgZXZhbHVhIHNpIGVtaXRpciBlbCBldmVudG8gXCJhdHRhY2hcIi5cclxuICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLl9hdHRhY2hSZXEpO1xyXG4gICAgaWYgKHRoaXMucm9vdC5pc0Nvbm5lY3RlZCkge1xyXG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMucm9vdC5wYXJlbnROb2RlO1xyXG4gICAgICAgIHRoaXMuX2F0dGFjaFJlcSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMucm9vdCB8fCAhdGhpcy5yb290LmlzQ29ubmVjdGVkIHx8IHRoaXMucm9vdC5wYXJlbnROb2RlICE9PSBwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBfcmVmbG93KHRoaXMucm9vdCk7XHJcbiAgICAgICAgICAgIHRoaXMuX2F0dGFjaFJlcSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnJvb3QgfHwgIXRoaXMucm9vdC5pc0Nvbm5lY3RlZCB8fCB0aGlzLnJvb3QucGFyZW50Tm9kZSAhPT0gcGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKCdhdHRhY2gnLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIC8vIFRPRE86IEFsIHByb3BhZ2FyIGVsIGV2ZW50byBoYWJyw61hIHF1ZSBhc2VndXJhcnNlIHF1ZSBsb3MgY2xpcHMgY29udGVuaWRvcyBzaWd1ZW4gZW5nYW5jaGFkb3MsIHNpIG5vIFxyXG4gICAgICAgICAgICAgICAgLy8gaGFicsOtYSBxdWUgZXZpdGFyIGxhIGVtaXNpw7NuIGRlbCBldmVudG8uIEVuIHByaW5jaXBpbyBzaSBlbCBlbGVtZW50byBzZSBoYSBkZXNlbmdhbmNoYWRvIGRlbCBlbGVtZW50b1xyXG4gICAgICAgICAgICAgICAgLy8gcGFkcmUsIGxhIHZpbmN1bGFjacOzbiBlbnRyZSBjbGlwcyBubyBkZWJlcsOtYSBleGlzdGlyIHRhbXBvY28gZGUgZm9ybWEgcXVlIGVsIGV2ZW50byBubyBzZSBwcm9wYWdhcsOtYSxcclxuICAgICAgICAgICAgICAgIC8vIHBlcm8gZXMgaW1wb3J0YW50ZSB0ZW5lcmxvIGVuIGN1ZW50YS5cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2UgaW5pY2lhIGxhIGNhcmdhIGRlIGRhdG9zIGFkaWNpb25hbGVzLlxyXG4gICAgdGhpcy5fbG9hZChvcHRpb25zKTtcclxuXHJcbiAgICAvLyBTZSBkZXZ1ZWx2ZSBsYSBpbnN0YW5jaWEgZGVsIHByb3BpbyBjbGlwLlxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyaXphIGVsIGNsaXAuIFBvciBkZWZlY3RvIGludGVudGFyw6EgcmVuZGVyaXphciBsYSBwbGFudGlsbGEgcG9yIGRlZmVjdG8gKC9sYXlvdXQuZWpzKSBsb2NhbGl6YWRhIGVuIGxhIG1pc21hIFxyXG4gKiB1YmljYWNpw7NuIHF1ZSBlbCBtYW5lamFkb3IgZGVsIGNsaXAuIFxyXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wY2lvbmVzIGFkaWNpb25hbGVzIGRlIHJlbmRlcml6YWRvLlxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZTxEb2N1bWVudEZyYWdtZW50fEVsZW1lbnR8c3RyaW5nPn0gRGV2dWVsdmUgdW4gZnJhZ21lbnRvLCB1biBlbGVtZW50byBvIGRpcmVjdGFtZW50ZSBjw7NkaWdvIEhUTUwuXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5yZW5kZXIgPSBhc3luYyBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICByZXR1cm4gY2xpcHMucmVuZGVyKHRoaXMsIGAke3RoaXMuY2xpcE5hbWV9LyR7Q2xpcC5kZWZhdWx0VGVtcGxhdGVOYW1lfWAsIG9wdGlvbnMpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENsaXAgcHJlcGFyYWRvIGRlc3B1w6lzIGRlIGxhIHByaW1lcmEgcmVuZGVyaXphY2nDs24uIEltcGxlbWVudGEgYXF1w60gbGEgaW5pY2lhbGl6YWNpw7NuIGRlIGxhIGVzdHJ1Y3R1cmEgRE9NIHkgYcOxYWRlIGVsIFxyXG4gKiB0cmF0YW1pZW50byBkZSBldmVudG9zIG5lY2VzYXJpby4gIFxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUucmVhZHkgPSBmdW5jdGlvbihvcHRpb25zKSB7fTtcclxuXHJcbi8qKlxyXG4gKiBDYXJnYSBkZSBkYXRvcy5cclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3BjaW9uZXMgYWRpY2lvbmFsZXMuXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5sb2FkID0gYXN5bmMgZnVuY3Rpb24ob3B0aW9ucykge307XHJcblxyXG4vKipcclxuICogQ2FyZ2EgZGUgZGF0b3MgKGVudm9sdG9yaW8pLiBMbGFtYSBhIGxhIGNhcmdhLCBhY3R1YWxpemEgZWwgdGllbXBvIGRlIGNhcmdhIHkgbGxhbWEgYSBsYSBhY3R1YWxpemFjacOzbi5cclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3BjaW9uZXMgYWRpY2lvbmFsZXMuXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5fbG9hZCA9IGFzeW5jIGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWQob3B0aW9ucyk7XHJcbiAgICB0aGlzLl9sb2FkVGltZSA9IERhdGUubm93KCk7XHJcbiAgICByZXR1cm4gdGhpcy51cGRhdGUoZGF0YSA9PT0gdW5kZWZpbmVkID8gb3B0aW9ucyA6IHsgLi4ub3B0aW9ucywgZGF0YSB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBBY3R1YWxpemEgbGEgcmVwcmVzZW50YWNpw7NuIHZpc3VhbCBkZWwgY2xpcC5cclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3BjaW9uZXMgYWRpY2lvbmFsZXMuXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS51cGRhdGUgPSBhc3luYyBmdW5jdGlvbihvcHRpb25zKSB7fTtcclxuXHJcbi8qKlxyXG4gKiBJbmljaWEgbGEgcmVjYXJnYSBkZWwgY2xpcC5cclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3BjaW9uZXMgYWRpY2lvbmFsZXMuXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5yZWxvYWQgPSBhc3luYyBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICB0aGlzLmNsZWFyKG9wdGlvbnMpO1xyXG4gICAgcmV0dXJuIHRoaXMuX2xvYWQob3B0aW9ucyk7XHJcbn07XHJcblxyXG4vKipcclxuICogTGltcGlhIGVsIGNvbnRlbmlkbyBkZWwgY2xpcCB5IGxsYW1hIGRlIG51ZXZvIGEgbGEgcmVuZGVyaXphY2nDs24uXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICBpZiAoIXRoaXMucm9vdCkge1xyXG4gICAgICAgIHRocm93IG5ldyBDbGlwRXJyb3IoJ05vIHJvb3QgZWxlbWVudCcsIHsgY29kZTogQ2xpcEVycm9yLlJPT1RfUkVRVUlSRUQgfSk7XHJcbiAgICB9XHJcbiAgICBjb25zdCByb290ID0gdGhpcy5yZW5kZXIoKTtcclxuICAgIHRoaXMuX2NsZWFyQWxsKCk7XHJcblxyXG4gICAgLy8gdHJ5IHtcclxuICAgIC8vICAgICAvLyBTZSBjb21wcnVlYmEgcXVlIGhheWEgcmHDrXouXHJcbiAgICAvLyAgICAgaWYgKCF0aGlzLnJvb3QpIHtcclxuICAgIC8vICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyByb290IGVsZW1lbnQnKTtcclxuICAgIC8vICAgICB9XHJcbiAgICAvLyAgICAgLy8gU2UgcmVuZGVyaXphIG51ZXZhbWVudGUgbGEgdmlzdGEuXHJcbiAgICAvLyAgICAgLyoqIEB0eXBlIHtIVE1MRWxlbWVudH0gKi9cclxuICAgIC8vICAgICBjb25zdCByb290ID0gdGhpcy5yZW5kZXIob3B0aW9ucyk7XHJcbiAgICAvLyAgICAgLy8gU2Ugc3VzdGl0dXllIGVsIGNvbnRlbmlkbyBhbnRlcmlvciBkZSBsYSB2aXN0YSBwb3IgZWwgbnVldm8gc2luIG1vZGlmaWNhciBsYSByYcOtei5cclxuICAgIC8vICAgICB0aGlzLl9jbGVhckFsbCgpO1xyXG4gICAgLy8gICAgIHRoaXMucm9vdC5hcHBlbmQoLi4ucm9vdC5jaGlsZE5vZGVzKTtcclxuICAgIC8vICAgICAvLyBTZSBsbGFtYSBhIGxhIGZ1bmNpw7NuIHJlYWR5IGRlIG51ZXZvLlxyXG4gICAgLy8gICAgIHRoaXMucmVhZHkodGhpcy5yb290LCBvcHRpb25zKTtcclxuICAgIC8vICAgICB0aGlzLmZpcmUoJ3JlYWR5Jyk7XHJcbiAgICAvLyB9IGNhdGNoIChlcnIpIHtcclxuICAgIC8vICAgICBjb25zb2xlLmVycm9yKGBVbmFibGUgdG8gdXBkYXRlIHZpZXcgXCIke3RoaXMuX19uYW1lfVwiOmAsIGVycik7XHJcbiAgICAvLyAgICAgdGhpcy5fZmlyZUVycm9yKGVycik7XHJcbiAgICAvLyB9IFxyXG59O1xyXG5cclxuLyoqXHJcbiAqIC4uLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUudG9nZ2xlID0gZnVuY3Rpb24ob3B0aW9ucykge307XHJcblxyXG4vKipcclxuICogLi4uXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5pc1Zpc2libGUgPSBmdW5jdGlvbihvcHRpb25zKSB7fTtcclxuXHJcbi8qKlxyXG4gKiAuLi5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHt9O1xyXG5cclxuLyoqXHJcbiAqIEHDsWFkZSB1biBudWV2byBzdWJjbGlwLlxyXG4gKiBAcGFyYW0ge0NsaXB9IGNsaXAgQ2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5fYXBwZW5kQ2xpcCA9IGZ1bmN0aW9uKGNsaXApIHtcclxuICAgIGlmIChjbGlwLl9wYXJlbnRDbGlwKSB7XHJcbiAgICAgICAgY2xpcC5fcGFyZW50Q2xpcC5fcmVtb3ZlQ2xpcChjbGlwKTtcclxuICAgIH1cclxuICAgIHRoaXMuX2NoaWxkQ2xpcHMuYWRkKGNsaXApO1xyXG4gICAgY2xpcC5fcGFyZW50Q2xpcCA9IHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogRWxpbWluYSBlbCBzdWJjbGlwIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtDbGlwfSBjbGlwIENsaXAgZXNwZWNpZmljYWRvLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuX3JlbW92ZUNsaXAgPSBmdW5jdGlvbihjbGlwKSB7XHJcbiAgICBpZiAodGhpcy5fY2hpbGRDbGlwcy5kZWxldGUoY2xpcCkpIHtcclxuICAgICAgICBjbGlwLl9wYXJlbnRDbGlwID0gbnVsbDtcclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiAuLi5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLnJlbW92ZUFsbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgZm9yIChsZXQgYyBvZiB0aGlzLl9jaGlsZENsaXBzKSB7XHJcbiAgICAgICAgdGhpcy5fY2hpbGRDbGlwcy5kZWxldGUoYyk7XHJcbiAgICAgICAgYy5fcGFyZW50Q2xpcCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICAvLyBsZXQgYztcclxuICAgIC8vIHdoaWxlIChjID0gdGhpcy5jaGlsZENsaXBzLnNoaWZ0KCkpIHtcclxuICAgIC8vICAgICBpZiAodWl4LmNvbnRhaW5zKHRoaXMuX3Jvb3QsIHYucm9vdCkpIHtcclxuICAgIC8vICAgICAgICAgYy5kZXN0cm95KCk7XHJcbiAgICAvLyAgICAgfVxyXG4gICAgLy8gfVxyXG4gICAgLy8gdWl4LmVtcHR5KHRoaXMuX3Jvb3QpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIC4uLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICAgIC8vIFRPRE86IC4uLlxyXG59O1xyXG5cclxuXHJcbi8vIFNjcm9sbFxyXG5DbGlwLnByb3RvdHlwZS5zYXZlU2Nyb2xsID0gZnVuY3Rpb24oKSB7fTtcclxuXHJcbkNsaXAucHJvdG90eXBlLnJlc3RvcmVTY3JvbGwgPSBmdW5jdGlvbigpIHt9O1xyXG5cclxuXHJcbi8qIFJlbmRlciBDb250ZXh0XHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogQ29udGV4dG8gZGUgcmVuZGVyaXphZG8uXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3BjaW9uZXMgZGUgY3JlYWNpw7NuLlxyXG4gKi9cclxuZnVuY3Rpb24gUmVuZGVyQ29udGV4dChvcHRpb25zID0ge30pIHtcclxuICAgIHRoaXMuaW5jbHVkZXMgPSBbXTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEHDsWFkZSB1bmEgbnVldmEgaW5jbHVzacOzbiBkZSBjbGlwIGFsIGNvbnRleHRvIGRlIHJlbmRlcml6YWRvLlxyXG4gKiBAcGFyYW0geyp9IG5hbWUgXHJcbiAqIEBwYXJhbSB7Kn0gb3B0aW9ucyBcclxuICogQHJldHVybnMgXHJcbiAqL1xyXG5SZW5kZXJDb250ZXh0LnByb3RvdHlwZS5pbmNsdWRlID0gZnVuY3Rpb24obmFtZSwgb3B0aW9ucykge1xyXG4gICAgdGhpcy5pbmNsdWRlcy5wdXNoKHsgbmFtZSwgb3B0aW9ucyB9KTtcclxuICAgIHJldHVybiAnPGNsaXAtc2xvdD48L2NsaXAtc2xvdD4nO1xyXG59O1xyXG5cclxuXHJcbi8qIERPTS1MaWtlIEV2ZW50IE1vZGVsXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogQ2xpcCBldmVudC5cclxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgRXZlbnQgdHlwZS5cclxuICogQHBhcmFtIHt7IGRldGFpbD86IGFueSwgY2FuY2VsYWJsZT86IGJvb2xlYW4gfT19IFtvcHRpb25zXSBPcHRpb25zLlxyXG4gKi9cclxuZnVuY3Rpb24gQ2xpcEV2ZW50KHR5cGUsIG9wdGlvbnM9e30pIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycgfHwgdHlwZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGV2ZW50IHR5cGU6IGEgbm9uLWVtcHR5IHN0cmluZyBpcyByZXF1aXJlZC4nKTtcclxuICAgIH1cclxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHRoaXMsIHtcclxuICAgICAgICB0eXBlOiB7XHJcbiAgICAgICAgICAgIHZhbHVlOiB0eXBlLFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB3cml0YWJsZTogZmFsc2UsXHJcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbDoge1xyXG4gICAgICAgICAgICB2YWx1ZTogb3B0aW9ucy5kZXRhaWwsXHJcbiAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIHdyaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIHRhcmdldDoge1xyXG4gICAgICAgICAgICB2YWx1ZTogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgd3JpdGFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIGN1cnJlbnRUYXJnZXQ6IHtcclxuICAgICAgICAgICAgdmFsdWU6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXHJcbiAgICAgICAgICAgIHdyaXRhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBw7FhZGUgdW4gbnVldm8gbWFuZWphZG9yIHBhcmEgZWwgZXZlbnRvIGRlbCB0aXBvIG8gbm9tYnJlIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgVGlwbyBvIG5vbWJyZSBkZSBldmVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0geyhldmVudDogRXZlbnQpID0+IHZvaWR9IGNhbGxiYWNrIEZ1bmNpw7NuIG1hbmVqYWRvcmEgZGVsIHRpcG8gZGUgZXZlbnRvIGVzcGVjaWZpY2FkbyBhIGHDsWFkaXIuXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVyID0gQ2xpcC5wcm90b3R5cGUub24gPSBmdW5jdGlvbih0eXBlLCBjYWxsYmFjaykge1xyXG4gICAgaWYgKHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJyB8fCB0eXBlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgZXZlbnQgdHlwZTogYSBub24tZW1wdHkgc3RyaW5nIGlzIHJlcXVpcmVkLicpO1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgZXZlbnQgbGlzdGVuZXI6IGEgY2FsbGJhY2sgZnVuY3Rpb24gaXMgcmVxdWlyZWQuJyk7XHJcbiAgICB9XHJcbiAgICBsZXQgYnVja2V0ID0gdGhpc1tFVkVOVF9MSVNURU5FUlNdLmdldCh0eXBlKTtcclxuICAgIGlmICghYnVja2V0KSB7XHJcbiAgICAgICAgdGhpc1tFVkVOVF9MSVNURU5FUlNdLnNldCh0eXBlLCBidWNrZXQgPSBuZXcgU2V0KCkpO1xyXG4gICAgfVxyXG4gICAgYnVja2V0LmFkZChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogRWxpbWluYSBlbCBtYW5lamFkb3IgZGUgZXZlbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgVGlwbyBvIG5vbWJyZSBkZSBldmVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0geyhldmVudDogRXZlbnQpID0+IHZvaWR9IGNhbGxiYWNrIEZ1bmNpw7NuIG1hbmVqYWRvcmEgZGVsIHRpcG8gZGUgZXZlbnRvIGVzcGVjaWZpY2FkbyBhIGVsaW1pbmFyLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUucmVtb3ZlRXZlbnRMaXN0ZW5lciA9IENsaXAucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uKHR5cGUsIGNhbGxiYWNrKSB7XHJcbiAgICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnIHx8IHR5cGUubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBldmVudCB0eXBlOiBhIG5vbi1lbXB0eSBzdHJpbmcgaXMgcmVxdWlyZWQuJyk7XHJcbiAgICB9XHJcbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBldmVudCBsaXN0ZW5lcjogYSBjYWxsYmFjayBmdW5jdGlvbiBpcyByZXF1aXJlZC4nKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGJ1Y2tldCA9IHRoaXNbRVZFTlRfTElTVEVORVJTXS5nZXQodHlwZSk7XHJcbiAgICBpZiAoYnVja2V0KSB7XHJcbiAgICAgICAgYnVja2V0LmRlbGV0ZShjYWxsYmFjayk7XHJcbiAgICAgICAgaWYgKGJ1Y2tldC5zaXplID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXNbRVZFTlRfTElTVEVORVJTXS5kZWxldGUodHlwZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSAgICBcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFbWl0ZSBlbCBldmVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0ge3N0cmluZ3xDbGlwRXZlbnR8eyB0eXBlOiBzdHJpbmcsIGRldGFpbD86IGFueSB9fSBFdmVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0ge2Jvb2xlYW58J3Bvc3QnfSBbc3ByZWFkXSBJbmRpY2Egc2kgcHJvcGFnYXIgZWwgZXZlbnRvIGEgbG9zIGNsaXBzIGNvbnRlbmlkb3MgeSBjw7NtbyBoYWNlciBlbCByZWNvcnJpZG8sIFxyXG4gKiBzaSBlbiBwcmUtb3JkZW4gKGN1YWxxdWllciB2YWxvciBcInRydWx5XCIpIG8gZW4gcG9zdC1vcmRlbiAoXCJwb3N0XCIpLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuZGlzcGF0Y2hFdmVudCA9IENsaXAucHJvdG90eXBlLmZpcmUgPSBmdW5jdGlvbihldmVudCwgc3ByZWFkKSB7XHJcbiAgICAvLyBOb3JtYWxpemFjacOzbiBkZWwgcGFyw6FtZXRybyBcImV2ZW50XCIuXHJcbiAgICBpZiAoIShldmVudCBpbnN0YW5jZW9mIENsaXBFdmVudCkpIHtcclxuICAgICAgICBpZiAodHlwZW9mIGV2ZW50ID09PSAnc3RyaW5nJyAmJiBldmVudC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGV2ZW50ID0gbmV3IENsaXBFdmVudChldmVudCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZXZlbnQgPT09ICdvYmplY3QnICYmIGV2ZW50ICE9PSBudWxsIFxyXG4gICAgICAgICAgICAgICAgJiYgdHlwZW9mIGV2ZW50LnR5cGUgPT09ICdzdHJpbmcnICYmIGV2ZW50LnR5cGUubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBjb25zdCBldiA9IG5ldyBDbGlwRXZlbnQoZXZlbnQudHlwZSwgeyBkZXRhaWw6IGV2ZW50LmRldGFpbCB9KTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZXZlbnQpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoWyd0eXBlJywgJ3RhcmdldCcsICdjdXJyZW50VGFyZ2V0J10uaW5jbHVkZXMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgRXZlbnQgcHJvcGVydHkgXCIke2tleX1cIiBpcyByZXNlcnZlZC5gKTtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGV2W2tleV0gPSBldmVudFtrZXldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGV2ZW50ID0gZXY7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBldmVudCBmb3JtYXQ6IGEgbm9uLWVtcHR5IHN0cmluZywgYW4gb2JqZWN0IHdpdGggYSBzdHJpbmcgXCJ0eXBlXCIgcHJvcGVydHksIG9yIGFuIGluc3RhbmNlIG9mIENsaXBFdmVudCBpcyByZXF1aXJlZC4nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU29sbyBzZSBkZWZpbmUgbGEgcHJvcGllZGFkIFwidGFyZ2V0XCIgZW4gbGEgcHJpbWVyYSBsbGFtYWRhIHkgc2UgbWFudGllbmUgZW4gdG9kbyBlbCBwcm9jZXNhbWllbnRvIGRlbCBldmVudG8uXHJcbiAgICBpZiAoISgndGFyZ2V0JyBpbiBldmVudCkgfHwgZXZlbnQudGFyZ2V0ID09IG51bGwpIHtcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZXZlbnQsICd0YXJnZXQnLCB7XHJcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2UgZXZhbHVhIHNpIHByb3BhZ2FyIGVsIGV2ZW50byBwcmltZXJvIGEgbG9zIGNsaXBzIGNvbnRlbmlkb3MgKHBvc3Qtb3JkZXIpLlxyXG4gICAgaWYgKHNwcmVhZCA9PT0gJ3Bvc3QnKSB7XHJcbiAgICAgICAgX3NwcmVhZEV2ZW50LmNhbGwodGhpcywgZXZlbnQsIHNwcmVhZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2UgcHJvY2VzYSBlbCBldmVudG8uXHJcbiAgICBjb25zdCBidWNrZXQgPSB0aGlzW0VWRU5UX0xJU1RFTkVSU10uZ2V0KGV2ZW50LnR5cGUpOyBcclxuICAgIGlmIChidWNrZXQpIHtcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZXZlbnQsICdjdXJyZW50VGFyZ2V0Jywge1xyXG4gICAgICAgICAgICB2YWx1ZTogdGhpcyxcclxuICAgICAgICAgICAgd3JpdGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWVcclxuICAgICAgICB9KTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNhbGxiYWNrIG9mIFsuLi5idWNrZXRdKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIGV2ZW50KTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBjYWxsaW5nIGV2ZW50IGxpc3RlbmVyIFwiJHtldmVudC50eXBlfVwiIGluIGNsaXAgXCIke3RoaXMuY2xpcE5hbWV9XCI6YCwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBldmVudC5jdXJyZW50VGFyZ2V0ID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZSBldmFsdWEgc2kgcHJvcGFnYXIgZWwgZXZlbnRvIGEgbG9zIGNsaXBzIGNvbnRlbmlkb3MgKHByZS1vcmRlcikuIFxyXG4gICAgaWYgKHNwcmVhZCAmJiBzcHJlYWQgIT09ICdwb3N0Jykge1xyXG4gICAgICAgIF9zcHJlYWRFdmVudC5jYWxsKHRoaXMsIGV2ZW50LCBzcHJlYWQpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFByb3BhZ2EgZWwgZXZlbnRvIGVzcGVjaWZpY2FkbyBhIGxvcyBjbGlwcyBjb250ZW5pZG9zIGVuIGVsIGNsaXAgKHRoaXMpLlxyXG4gKiBAcGFyYW0ge0NsaXBFdmVudH0gZXZlbnQgRXZlbnRvIGRlIGNsaXAuXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbnwncG9zdCd9IFtzcHJlYWQ9ZmFsc2VdIEluZGljYSBzaSBwcm9wYWdhciBlbCBldmVudG8geSBjw7NtbyByZWNvcnJlciBsYSBqZXJhcnF1aWEgZGUgY2xpcHMsIHNpIGVuIHByZS1vcmRlbiBcclxuICogKGN1YWxxdWllciB2YWxvciBcInRydWx5XCIpIG8gZW4gcG9zdC1vcmRlbiAobGl0ZXJhbCBcInBvc3RcIikuXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5mdW5jdGlvbiBfc3ByZWFkRXZlbnQoZXZlbnQsIHNwcmVhZCkge1xyXG4gICAgZm9yIChjb25zdCBjbGlwIG9mIFsuLi50aGlzLl9jaGlsZENsaXBzXSkge1xyXG4gICAgICAgIGNsaXAuZmlyZShldmVudCwgc3ByZWFkKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbi8qIENvbnN0YW50c1xyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIEZvcm1hdG8gZGVsIG5vbWJyZSBkZSBsb3MgY2xpcHMgKHBhdGgtbGlrZSksIHVubyBvIHZhcmlvcyBzZWdtZW50b3Mgc2VwYXJhZG9zIFxyXG4gKiBwb3IgXCIvXCIsIGNhZGEgc2VnbWVudG86IFtBLVphLXowLTlfLV0rXHJcbiAqIEB0eXBlIHtSZWdFeHB9XHJcbiAqIEBjb25zdGFudFxyXG4gKi8gXHJcbmNvbnN0IENMSVBfTkFNRV9SRSA9IC9eW0EtWmEtejAtOV8tXSsoPzpcXC9bQS1aYS16MC05Xy1dKykqJC87XHJcblxyXG4vKipcclxuICogTG9uZ2l0dWQgbcOheGltYSBwZXJtaXRpZGEgcGFyYSBsb3Mgbm9tYnJlcyBkZSBjbGlwLlxyXG4gKiBAdHlwZSB7bnVtYmVyfVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbmNvbnN0IENMSVBfTkFNRV9NQVhfTEVOR1RIID0gMjU2O1xyXG5cclxuLyoqXHJcbiAqIFByZWZpam8gcGFyYSBlc3BlY2lmaWNhciByZWZlcmVuY2lhcyBhIGNsaXBzIGVuIGluY2x1c2lvbmVzLlxyXG4gKiBAdHlwZSB7c3RyaW5nfVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbmNvbnN0IENMSVBfUFJFRklYID0gJ2NsaXA6JztcclxuXHJcbi8qKlxyXG4gKiBFeHByZXNpw7NuIHBhcmEgdmVyaWZpY2FyIHNpIHVuYSBjYWRlbmEgc29sbyBjb250aWVuZSBlc3BhY2lvcy5cclxuICogQHR5cGUge1JlZ0V4cH1cclxuICogQGNvbnN0YW50ICBcclxuICovXHJcbmNvbnN0IFdTX1JFID0gL15cXHMqJC87XHJcblxyXG4vKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cclxuLyoqXHJcbiAqIENsaXAgRXJyb3IuXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIERlc2NyaXBjacOzbiBkZWwgZXJyb3IuXHJcbiAqIEBwYXJhbSB7eyBjb2RlPzogc3RyaW5nLCBjYXVzZT86IGFueSB9PX0gW29wdGlvbnNdIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gKi9cclxuZnVuY3Rpb24gQ2xpcEVycm9yKG1lc3NhZ2UsIHsgY29kZSA9IG51bGwsIGNhdXNlIH0gPSB7fSkge1xyXG4gICAgdGhpcy5uYW1lID0gJ0NsaXBFcnJvcic7XHJcbiAgICB0aGlzLm1lc3NhZ2UgPSBTdHJpbmcobWVzc2FnZSk7XHJcbiAgICB0aGlzLmNvZGUgPSBjb2RlO1xyXG5cclxuICAgIGlmIChjYXVzZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhpcy5jYXVzZSA9IGNhdXNlO1xyXG4gICAgfVxyXG5cclxuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlID8gRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcywgQ2xpcEVycm9yKSA6IHRoaXMuc3RhY2sgPSAobmV3IEVycm9yKG1lc3NhZ2UpKS5zdGFjaztcclxufVxyXG5DbGlwRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUpO1xyXG5DbGlwRXJyb3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gQ2xpcEVycm9yO1xyXG5cclxuLy8gQ8OzZGlnb3MgZGUgZXJyb3IuXHJcbkNsaXBFcnJvci5ST09UX1JFUVVJUkVEID0gJ3Jvb3RfcmVxdWlyZWQnO1xyXG5DbGlwRXJyb3IuTE9BRF9GQUlMRUQgICA9ICdsb2FkX2ZhaWxlZCc7XHJcbkNsaXBFcnJvci5OT1RfREVGSU5FRCAgID0gJ25vdF9kZWZpbmVkJztcclxuQ2xpcEVycm9yLk5PVF9GT1VORCAgICAgPSAnbm90X2ZvdW5kJztcclxuXHJcblxyXG4vKiBUZW1wbGF0ZSBmdW5jdGlvbnMgXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogQ2FyZ2EgbGEgcGxhbnRpbGxhIGVzcGVjaWZpY2FkYS5cclxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgTm9tYnJlIG8gcnV0YSBkZSBsYSBwbGFudGlsbGEgZXNwZWNpZmljYWRhLlxyXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gRnVuY2nDs24gZGUgbGEgcGxhbnRpbGxhIGNhcmdhZGEuXHJcbiAqL1xyXG5jb25zdCBfbG9hZFRlbXBsYXRlID0gYXN5bmMgZnVuY3Rpb24obmFtZSkge1xyXG4gICAgY29uc3QgcGF0aCA9IGAke19zZXR0aW5ncy5iYXNlUGF0aH0vJHtuYW1lfS5lanNgO1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2gocGF0aCwgeyBjYWNoZTogXCJuby1zdG9yZVwiIH0pOyAvLyBldml0YSBjYWNoZSBlbiBkZXZcclxuICAgIGlmICghcmVzLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gbG9hZCB0ZW1wbGF0ZTogJHtwYXRofSAoJHtyZXMuc3RhdHVzfSlgKTtcclxuICAgIH1cclxuICAgIHJldHVybiBfdGVtcGxhdGVzW25hbWVdID0gZWpzLmNvbXBpbGUoYXdhaXQgcmVzLnRleHQoKSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGdWVyemEgZWwgcmVmbG93IGRlbCBlbGVtZW50byBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWwgRWxlbWVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gX3JlZmxvdyhlbCkge1xyXG4gICAgcmV0dXJuIGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG59XHJcblxyXG5cclxuLyogTWFpbiBPYmplY3QgXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogU2V0dGluZ3MuXHJcbiAqIEB0eXBlIHtPYmplY3R9XHJcbiAqIEBwcml2YXRlXHJcbiAqIEBjb25zdGFudFxyXG4gKi9cclxuY29uc3QgX3NldHRpbmdzID0ge1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5kaWNhIHNpIGFjdGl2YXIgZWwgbW9kbyBkZWJ1Zy5cclxuICAgICAqIEB0eXBlIHtib29sZWFufVxyXG4gICAgICogQGRlZmF1bHQgZmFsc2VcclxuICAgICAqL1xyXG4gICAgZGVidWc6IGZhbHNlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUnV0YSBiYXNlIGRvbmRlIHNlIGxvY2FsaXphIGxhIGRlZmluaWNpw7NuIGRlIGxvcyBjbGlwcy5cclxuICAgICAqIEB0eXBlIHtzdHJpbmd9XHJcbiAgICAgKiBAZGVmYXVsdCAnL2NsaXBzJ1xyXG4gICAgICovXHJcbiAgICBiYXNlUGF0aDogJy9jbGlwcycsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbmRpY2Egc2kgbG9zIGVzdGlsb3MgZXN0w6FuIHByZS1lbXBhcXVldGFkb3MuXHJcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cclxuICAgICAqIEBkZWZhdWx0IGZhbHNlXHJcbiAgICAgKi9cclxuICAgIHN0eWxlc0J1bmRsZWQ6IGZhbHNlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5kaWNhIHNpIGxhcyBwbGFudGlsbGFzIGVzdMOhbiBwcmUtZW1wYXF1ZXRhZGFzLlxyXG4gICAgICogQHR5cGUge2Jvb2xlYW59XHJcbiAgICAgKiBAZGVmYXVsdCBmYWxzZVxyXG4gICAgICovXHJcbiAgICB0ZW1wbGF0ZXNCdW5kbGVkOiBmYWxzZVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIE1hbmVqYWRvcmVzIGRlIENsaXBzIGRlZmluaWRvcy5cclxuICogQHR5cGUge09iamVjdC48c3RyaW5nLCBDbGlwPn1cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5jb25zdCBfaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xyXG5cclxuLyoqXHJcbiAqIEZ1bmNpb25lcyBkZSBwbGFudGlsbGEgYcOxYWRpZGFzLlxyXG4gKiBAdHlwZSB7T2JqZWN0LjxzdHJpbmcsICguLi4pID0+IEhUTUxFbGVtZW50fVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbmNvbnN0IF90ZW1wbGF0ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xyXG5cclxuLyoqXHJcbiAqIE1hcGEgZGUgYXNvY2lhY2nDs24gZW50cmUgZWxlbWVudG9zIGUgaW5zdGFuY2lhcyBkZSBjbGlwcy5cclxuICogQHR5cGUge1dlYWtNYXAuPEVsZW1lbnQsIENsaXA+fVxyXG4gKiBAY29uc3RhbnRcclxuICogQHByaXZhdGVcclxuICovXHJcbmNvbnN0IF9lbGVtZW50Q2xpcHMgPSBuZXcgV2Vha01hcCgpO1xyXG5cclxuLyoqXHJcbiAqIFJlZmVyZW5jaWEgYWwgZWxlbWVudG8gZGUgZXN0aWxvcyBkb25kZSBzZSBpbXBvcnRhbiBsb3MgZXN0aWxvcyBkZSBsb3MgZGlmZXJlbnRlcyBjbGlwcyBkZWZpbmlkb3MuXHJcbiAqIEB0eXBlIHtIVE1MU3R5bGVFbGVtZW50fVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxubGV0IF9zdHlsZUVsZW1lbnQ7XHJcblxyXG4vKipcclxuICogRGV2dWVsdmUgZWwgcHJpbWVyIGNsaXAgdmluY3VsYWRvIGEgdW5vIGRlIGxvcyBhc2NlbmRpZW50ZXMgZGVsIGVsZW1lbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtFbGVtZW50fSBlbCBFbGVtZW50byBlc3BlY2lmaWNhZG8uXHJcbiAqIEByZXR1cm5zIHtDbGlwfG51bGx9IENsaXAgZW5jb250cmFkbyBvIG51bGwgc2kgbm8gc2UgZW5jdWVudHJhLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuY29uc3QgX2Nsb3Nlc3RDbGlwID0gZnVuY3Rpb24oZWwpIHtcclxuICAgIGZvciAobGV0IG4gPSBlbD8ucGFyZW50RWxlbWVudCwgYzsgbjsgbiA9IG4ucGFyZW50RWxlbWVudCkge1xyXG4gICAgICAgIGlmIChjID0gX2VsZW1lbnRDbGlwcy5nZXQobikpIHJldHVybiBjO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn07XHJcblxyXG4vKipcclxuICogSW1wb3J0YSBsb3MgZXN0aWxvcyBkZWwgY2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBkZWwgY2xpcC5cclxuICogQHBhcmFtIHtzdHJpbmd8ZnVuY3Rpb258SFRNTFN0eWxlRWxlbWVudHxDU1NTdHlsZVNoZWV0fSBzdHlsZXMgRXN0aWxvcyBkZWwgY2xpcC5cclxuICovXHJcbmNvbnN0IF9pbXBvcnRDbGlwU3R5bGVzID0gYXN5bmMgZnVuY3Rpb24obmFtZSwgc3R5bGVzKSB7XHJcbiAgICAvLyBMb3MgZXN0aWxvcyBzZSBwdWVkZW4gZGVmaW5pciBjb21vIHByb3BpZWRhZCBvIGNvbW8gZnVuY2nDs24uXHJcbiAgICBpZiAodHlwZW9mIHN0eWxlcyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHN0eWxlcyA9IHN0eWxlcygpO1xyXG4gICAgfVxyXG4gICAgLy8gU2kgc2UgZGVmaW5lbiBjb21vIEhUTUxTdHlsZUVsZW1lbnQsIHNlIGHDsWFkZW4gZGlyZWN0YW1lbnRlIGFsIGhlYWQuXHJcbiAgICBpZiAoc3R5bGVzIGluc3RhbmNlb2YgSFRNTFN0eWxlRWxlbWVudCkge1xyXG4gICAgICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGVzKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBTaSBzZSBkZWZpbmVuIGNvbW8gQ1NTU3R5bGVTaGVldCwgc2UgYcOxYWRlbiBhIGxhcyBob2phcyBkZSBlc3RpbG8gYWRvcHRhZGFzLlxyXG4gICAgaWYgKHN0eWxlcyBpbnN0YW5jZW9mIENTU1N0eWxlU2hlZXQpIHtcclxuICAgICAgICBkb2N1bWVudC5hZG9wdGVkU3R5bGVTaGVldHMgPSBbLi4uZG9jdW1lbnQuYWRvcHRlZFN0eWxlU2hlZXRzLCBzdHlsZXNdO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIC8vIFNpIGVsIGNsaXAgbm8gZGVmaW5lIGVzdGlsb3MgZW4gY8OzZGlnbyB5IG5vIGVzdMOhbiBlbXBhcXVldGFkb3MsIHNlIGludGVudGEgY2FyZ2FyIGxhIGhvamEgZGUgZXN0aWxvcyBwb3IgZGVmZWN0byBcclxuICAgIC8vIHViaWNhZGEgZW4gbGEgbWlzbWEgdWJpY2FjacOzbiBxdWUgZWwgY2xpcC5cclxuICAgIGlmICghc3R5bGVzICYmICFfc2V0dGluZ3Muc3R5bGVzQnVuZGxlZCkge1xyXG4gICAgICAgIC8vIFRPRE86IE3DoXMgcXVlIHVuIGZsYWcgcXVlIG5vcyBpbmRpcXVlIHNpIGxvcyBlc3RpbG9zIGVzdMOhbiBlbXBhcXVldGFkb3MgbyBubywgbG8gcXVlIHJlYWxtZW50ZSBuZWNlc2l0YW1vcyBlcyBcclxuICAgICAgICAvLyB1bmEgZGVmaW5pY2nDs24gZGUgYnVuZGxlcyBjb24gbGEgZXNwZWNpZmljYWNpw7NuIGRlIG5vbWJyZXMgbyBwYXRyb25lcyBkZSBjbGlwcyBpbmNsdWlkb3MgZW4gY2FkYSBidW5kbGUsIGRlIFxyXG4gICAgICAgIC8vIGZvcm1hIHF1ZSBwb2RhbW9zIGludHJvZHVjaXIgYXF1w60gbGEgbMOzZ2ljYSBkZSBjYXJnYSBhZGVjdWFkYS5cclxuICAgICAgICBjb25zdCBwYXRoID0gYCR7X3NldHRpbmdzLmJhc2VQYXRofS8ke25hbWV9LyR7Q2xpcC5kZWZhdWx0U3R5bGVzTmFtZX0uY3NzYDtcclxuICAgICAgICBsZXQgcmVzO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHJlcyA9IGF3YWl0IGZldGNoKHBhdGgpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgQ2xpcEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggc3R5bGVzIGZvciBjbGlwIFwiJHtuYW1lfVwiIGZyb20gXCIke3BhdGh9XCI6ICR7ZXJyLm1lc3NhZ2V9YCwge1xyXG4gICAgICAgICAgICAgICAgY29kZTogQ2xpcEVycm9yLkxPQURfRkFJTEVELFxyXG4gICAgICAgICAgICAgICAgY2F1c2U6IGVyclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHJlcy5vaykge1xyXG4gICAgICAgICAgICBzdHlsZXMgPSBhd2FpdCByZXMudGV4dCgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAocmVzLnN0YXR1cyAhPT0gNDA0ICYmIHJlcy5zdGF0dXMgIT09IDQxMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgQ2xpcEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzdHlsZXMgZm9yIGNsaXAgXCIke25hbWV9XCIgZnJvbSBcIiR7cGF0aH1cIjogJHtyZXMuc3RhdHVzVGV4dH0gKCR7cmVzLnN0YXR1c30pYCwge1xyXG4gICAgICAgICAgICAgICAgY29kZTogQ2xpcEVycm9yLkxPQURfRkFJTEVEXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoX3NldHRpbmdzLmRlYnVnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgTm8gc3R5bGVzIGZvdW5kIGZvciBjbGlwIFwiJHtuYW1lfVwiIGF0IFwiJHtwYXRofVwiLmApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChzdHlsZXMgJiYgKHN0eWxlcyA9IHN0eWxlcy50cmltKCkpKSB7XHJcbiAgICAgICAgaWYgKCFfc3R5bGVFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIF9zdHlsZUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xyXG4gICAgICAgICAgICBfc3R5bGVFbGVtZW50LmlkID0gJ2NsaXBzLXN0eWxlcyc7XHJcbiAgICAgICAgICAgIF9zdHlsZUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLXNvdXJjZScsICdjbGlwcycpO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKF9zdHlsZUVsZW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBfc3R5bGVFbGVtZW50LnRleHRDb250ZW50ICs9IGBcXG4vKiAke25hbWV9ICovXFxuJHtzdHlsZXN9XFxuYDtcclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYXJnYSBlbCBtYW5lamFkb3IgZGVsIGNsaXAgZXNwZWNpZmljYWRvIHBvciBub21icmUuXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBkZWwgY2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAqIEByZXR1cm4ge0NsaXB9IE1hbmVqYWRvciBkZWwgY2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAqL1xyXG5jb25zdCBfbG9hZEhhbmRsZXIgPSBhc3luYyBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICAvLyBUT0RPOiBJbnRyb2R1Y2lyIGFxdcOtIHBvc2libGVzIG1hcGVvcyBwYXJhIGJ1bmRsZXMuXHJcbiAgICAvLyBTZSBjYXJnYSBlbCBwcm90b3RpcG8gZGVsIG1hbmVqYWRvci5cclxuICAgIGNvbnN0IHBhdGggPSBgJHtfc2V0dGluZ3MuYmFzZVBhdGh9LyR7bmFtZX0vJHtDbGlwLmRlZmF1bHRIYW5kbGVyTmFtZX0uanNgO1xyXG4gICAgbGV0IG1vZHVsZTtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgbW9kdWxlID0gYXdhaXQgaW1wb3J0KHBhdGgpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IENsaXBFcnJvcihgQ2xpcCBcIiR7bmFtZX1cIiBjb3VsZCBub3QgYmUgbG9hZGVkIGZyb20gJHtwYXRofS5gLCB7XHJcbiAgICAgICAgICAgIGNvZGU6IENsaXBFcnJvci5MT0FEX0ZBSUxFRCxcclxuICAgICAgICAgICAgY2F1c2U6IGVyclxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlIGRlZmluZSBlbCBjbGlwIGNvbiBlbCBwcm90b3RpcG8gY2FyZ2Fkby5cclxuICAgIGNvbnN0IHByb3RvID0gbW9kdWxlICYmIG1vZHVsZS5kZWZhdWx0O1xyXG4gICAgaWYgKHByb3RvID09PSBudWxsIHx8IHR5cGVvZiBwcm90byAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgICB0aHJvdyBuZXcgQ2xpcEVycm9yKGBDbGlwIFwiJHtuYW1lfVwiIGhhcyBubyBkZWZhdWx0IGV4cG9ydC5gLCB7XHJcbiAgICAgICAgICAgIGNvZGU6IENsaXBFcnJvci5OT1RfREVGSU5FRFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGF3YWl0IGNsaXBzLmRlZmluZShuYW1lLCBwcm90byk7XHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIE1haW4gT2JqZWN0LlxyXG4gKiBAbmFtZXNwYWNlXHJcbiAqL1xyXG5jb25zdCBjbGlwcyA9IHtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEFjdHVhbGl6YSBsb3MgYWp1c3RlcyBkZSBjb25maWd1cmFjacOzbiBlc3BlY2lmaWNhZG9zLlxyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHNldHRpbmdzIEFqdXN0ZXMgZGUgY29uZmlndXJhY2nDs24uXHJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtzZXR0aW5ncy5kZWJ1Z10gSW5kaWNhIHNpIGFjdGl2YXIgZWwgbW9kbyBkZWJ1Zy5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSAgW3NldHRpbmdzLmJhc2VQYXRoXSBSdXRhIGJhc2UgZG9uZGUgc2UgbG9jYWxpemEgbGEgZGVmaW5pY2nDs24gZGUgbG9zIGNsaXBzLlxyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbc2V0dGluZ3Muc3R5bGVzQnVuZGxlZF0gSW5kaWNhIHNpIGxvcyBlc3RpbG9zIGVzdMOhbiBwcmUtZW1wYXF1ZXRhZG9zLlxyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbc2V0dGluZ3MudGVtcGxhdGVzQnVuZGxlZF0gSW5kaWNhIHNpIGxhcyBwbGFudGlsbGFzIGVzdMOhbiBwcmUtZW1wYXF1ZXRhZGFzLlxyXG4gICAgICovXHJcbiAgICBzZXR1cDogZnVuY3Rpb24oc2V0dGluZ3MpIHtcclxuICAgICAgICBPYmplY3QuYXNzaWduKF9zZXR0aW5ncywgc2V0dGluZ3MpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgLyoqXHJcbiAgICAgKiBEZWZpbmUgdW4gbnVldm8gdGlwbyBkZSBjbGlwLlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgTm9tYnJlIGRlbCBjbGlwICjDum5pY28pLlxyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHByb3RvIFByb3RvdGlwbyBkZWwgY2xpcC5cclxuICAgICAqIEByZXR1cm4ge25ldyAob3B0aW9uczogQ2xpcE9wdGlvbnMpID0+IENsaXB9IENvbnN0cnVjdG9yIGRlbCBudWV2byB0aXBvIGRlIGNsaXAuXHJcbiAgICAgKi9cclxuICAgIGRlZmluZTogYXN5bmMgZnVuY3Rpb24obmFtZSwgcHJvdG8pIHtcclxuICAgICAgICAvLyBOb21icmUgZGVsIGNsaXAuXHJcbiAgICAgICAgaWYgKHR5cGVvZiBuYW1lICE9PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGNsaXAgbmFtZTogc3RyaW5nIHJlcXVpcmVkLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBuYW1lID0gbmFtZS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFuYW1lKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgY2xpcCBuYW1lOiBlbXB0eSBzdHJpbmcuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChuYW1lLmxlbmd0aCA+IENMSVBfTkFNRV9NQVhfTEVOR1RIKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBJbnZhbGlkIGNsaXAgbmFtZTogdG9vIGxvbmcgKCR7bmFtZS5sZW5ndGh9ID4gJHtDTElQX05BTUVfTUFYX0xFTkdUSH0pLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoIUNMSVBfTkFNRV9SRS50ZXN0KG5hbWUpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgY2xpcCBuYW1lOiBleHBlY3RlZCBwYXRoLWxpa2Ugc3RyaW5nIHdpdGhvdXQgbGVhZGluZyBvciB0cmFpbGluZyBzbGFzaC4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKF9oYW5kbGVyc1tuYW1lXSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENsaXAgXCIke25hbWV9XCIgYWxyZWFkeSBkZWZpbmVkLmApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gT2JqZXRvIHByb3RvdGlwby5cclxuICAgICAgICBpZiAocHJvdG8gPT09IG51bGwgfHwgdHlwZW9mIHByb3RvICE9PSAnb2JqZWN0JyB8fCBPYmplY3QuZ2V0UHJvdG90eXBlT2YocHJvdG8pICE9PSBPYmplY3QucHJvdG90eXBlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgcHJvdG90eXBlOiBwbGFpbiBvYmplY3QgcmVxdWlyZWQuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZSBjb21wcnVlYmEgbGEgdmFsaWRleiBkZSBsYSBwcm9waWVkYWQgXCJleHRlbmRzXCIgc2kgc2UgaGEgZXNwZWNpZmljYWRvLlxyXG4gICAgICAgIGxldCBiYXNlID0gcHJvdG8uZXh0ZW5kcztcclxuICAgICAgICBpZiAoYmFzZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgYmFzZSAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYEludmFsaWQgZXh0ZW5kczogc3RyaW5nIHJlcXVpcmVkLmApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJhc2UgPSBiYXNlLnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKCFiYXNlKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBJbnZhbGlkIGV4dGVuZHM6IGVtcHR5IHN0cmluZy5gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIV9oYW5kbGVyc1tiYXNlXSkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgX2xvYWRIYW5kbGVyKGJhc2UpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFfaGFuZGxlcnNbYmFzZV0pIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUmVmZXJlbmNlRXJyb3IoYEludmFsaWQgZXh0ZW5kczogY2xpcCBcIiR7YmFzZX1cIiBub3QgZGVmaW5lZC5gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2UgZGV0ZXJtaW5hIGVsIGNvbnN0cnVjdG9yIGJhc2Ugc2kgc2UgaGEgZXNwZWNpZmljYWRvLlxyXG4gICAgICAgIGNvbnN0IEIgPSBiYXNlID8gX2hhbmRsZXJzW2Jhc2VdIDogQ2xpcDtcclxuXHJcbiAgICAgICAgLy8gU2UgY3JlYSBsYSBmdW5jacOzbiBjb25zdHJ1Y3RvcmEgZGVsIG51ZXZvIGNsaXAuXHJcbiAgICAgICAgY29uc3QgQyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgQi5jYWxsKHRoaXMsIG9wdGlvbnMpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFNlIGhlcmVkYW4gbG9zIGVzdMOhdGljb3MgZGVsIGNvbnN0cnVjdG9yIGJhc2UuXHJcbiAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKEMsIEIpO1xyXG5cclxuICAgICAgICAvLyBTZSBleHRyYWVuIGxvcyBkZXNjcmlwdG9yZXMgZGVsIHByb3RvdGlwbywgZXhjbHV5ZW5kbyBcImV4dGVuZHNcIiB5IFwic3R5bGVzXCIuXHJcbiAgICAgICAgY29uc3QgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzKHByb3RvKTtcclxuICAgICAgICBkZWxldGUgZGVzYy5leHRlbmRzO1xyXG4gICAgICAgIGRlbGV0ZSBkZXNjLnN0eWxlcztcclxuXHJcbiAgICAgICAgLy8gU2UgY3JlYSBlbCBwcm90b3RpcG8gZGVsIG51ZXZvIGNsaXAgYSBwYXJ0aXIgZGVsIHByb3RvdGlwbyBiYXNlLlxyXG4gICAgICAgIEMucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShCLnByb3RvdHlwZSk7XHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMoQy5wcm90b3R5cGUsIGRlc2MpO1xyXG5cclxuICAgICAgICAvLyBTZSBkZWZpbmUgbGEgcHJvcGllZGFkIFwiY29uc3RydWN0b3JcIiBubyBlbnVtZXJhYmxlLlxyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShDLnByb3RvdHlwZSwgJ2NvbnN0cnVjdG9yJywge1xyXG4gICAgICAgICAgICB2YWx1ZTogQyxcclxuICAgICAgICAgICAgd3JpdGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gU2UgYcOxYWRlIGxhIHByb3BpZWRhZCBcImNsaXBOYW1lXCIgYWwgY29uc3RydWN0b3IgeSBlbCBtw6l0b2RvIGRlIGFjY2VzbyBwYXJhIGZhY2lsaXRhciBlbCBhY2Nlc28gZGVzZGUgbGFzIGluc3RhbmNpYXMuXHJcbiAgICAgICAgY29uc3QgQ0xJUF9OQU1FID0gU3ltYm9sKCdjbGlwcy5uYW1lJyk7XHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEMsIENMSVBfTkFNRSwge1xyXG4gICAgICAgICAgICB2YWx1ZTogbmFtZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShDLnByb3RvdHlwZSwgJ2NsaXBOYW1lJywge1xyXG4gICAgICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb25zdHJ1Y3RvcltDTElQX05BTUVdO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNlIGRlZmluZSBsYSBwcm9waWVkYWQgXCJkaXNwbGF5TmFtZVwiIHBhcmEgZGVwdXJhY2nDs24uXHJcbiAgICAgICAgQy5kaXNwbGF5TmFtZSA9IG5hbWU7XHJcblxyXG4gICAgICAgIC8vIFNlIGHDsWFkZSBsYSByZWZlcmVuY2lhIGFsIHByb3RvdGlwbyBiYXNlLlxyXG4gICAgICAgIGNvbnN0IEJBU0UgPSBTeW1ib2woJ2NsaXBzLmJhc2UnKTtcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQywgQkFTRSwge1xyXG4gICAgICAgICAgICB2YWx1ZTogQlxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShDLnByb3RvdHlwZSwgJ2Jhc2VQcm90b3R5cGUnLCB7XHJcbiAgICAgICAgICAgIGdldCgpIHsgcmV0dXJuIHRoaXMuY29uc3RydWN0b3JbQkFTRV0ucHJvdG90eXBlOyB9LFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZSBndWFyZGEgZWwgY29uc3RydWN0b3IgcG9yIG5vbWJyZS5cclxuICAgICAgICBfaGFuZGxlcnNbbmFtZV0gPSBDO1xyXG5cclxuICAgICAgICAvLyBTZSBpbXBvcnRhbiBsYSBob2phIGRlIGVzdGlsb3MgYXNvY2lhZGEuXHJcbiAgICAgICAgX2ltcG9ydENsaXBTdHlsZXMobmFtZSwgcHJvdG8uc3R5bGVzKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTZSBkZXZ1ZWx2ZSBlbCBjb25zdHJ1Y3RvciBkZWwgbnVldm8gY2xpcC5cclxuICAgICAgICByZXR1cm4gQztcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhIHVuYSBudWV2YSBpbnN0YW5jaWEgZGVsIHRpcG8gZGUgY2xpcCBlc3BlY2lmaWNhZG8gcG9yIG5vbWJyZS5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBkZWwgdGlwbyBkZSBjbGlwIGVzcGVjaWZpY2Fkby5cclxuICAgICAqIEBwYXJhbSB7Q2xpcE9wdGlvbnN9IFtvcHRpb25zXSBPcGNpb25lcyBkZSBjcmVhY2nDs24gZGVsIGNsaXAuXHJcbiAgICAgKiBAcmV0dXJuIHtDbGlwfSBJbnN0YW5jaWEgZGVsIGNsaXAgY3JlYWRhLlxyXG4gICAgICovXHJcbiAgICBjcmVhdGU6IGFzeW5jIGZ1bmN0aW9uKG5hbWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIiB8fCAhKG5hbWUgPSBuYW1lLnRyaW0oKSkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBjbGlwIG5hbWU6IG5vbi1lbXB0eSBzdHJpbmcgcmVxdWlyZWQuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghX2hhbmRsZXJzW25hbWVdKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IF9sb2FkSGFuZGxlcihuYW1lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaGFuZGxlciA9IF9oYW5kbGVyc1tuYW1lXTtcclxuICAgICAgICBpZiAoIWhhbmRsZXIpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IENsaXBFcnJvcihgQ2xpcCBcIiR7bmFtZX1cIiBpcyBub3QgZGVmaW5lZC5gLCB7XHJcbiAgICAgICAgICAgICAgICBjb2RlOiBDbGlwRXJyb3IuTk9UX0RFRklORURcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBuZXcgaGFuZGxlcihvcHRpb25zKTtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW5kZXJpemEgbGEgcGxhbnRpbGxhIGVzcGVjaWZpY2FkYSBwb3Igbm9tYnJlIGVuIGVsIGNvbnRleHRvIGRlbCBjbGlwIGVzcGVjaWZpY2Fkby5cclxuICAgICAqIEBwYXJhbSB7Q2xpcH0gY2xpcCBSZWZlcmVuY2lhIGFsIGNsaXAgYWN0dWFsLlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgTm9tYnJlIG8gcnV0YSBkZSBsYSBwbGFudGlsbGEgYSByZW5kZXJpemFyLlxyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcGNpb25lcyBhZGljaW9uYWxlcyBkZSByZW5kZXJpemFkby5cclxuICAgICAqIEByZXR1cm4ge0RvY3VtZW50RnJhZ21lbnR9IEZyYWdtZW50byBnZW5lcmFkby4gXHJcbiAgICAgKi9cclxuICAgIHJlbmRlcjogYXN5bmMgZnVuY3Rpb24oY2xpcCwgbmFtZSwgb3B0aW9ucykge1xyXG4gICAgICAgIC8vIFNlIGNvbXBydWViYSBzaSBsYSBmdW5jacOzbiBkZSBwbGFudGlsbGEgZXN0w6EgZGVmaW5pZGEuXHJcbiAgICAgICAgbGV0IHRlbXBsYXRlRm4gPSBfdGVtcGxhdGVzW25hbWVdO1xyXG4gICAgICAgIGlmICghdGVtcGxhdGVGbiAmJiAhX3NldHRpbmdzLnRlbXBsYXRlc0J1bmRsZWQpIHtcclxuICAgICAgICAgICAgLy8gU2kgbm8gZXhpc3RlIGxhIHBsYW50aWxsYSwgeSBubyBzZSBoYW4gcHJlLWVtcGFxdWV0YWRvIGxhcyBwbGFudGlsbGFzLCBzZSBpbnRlbnRhIGNhcmdhci5cclxuICAgICAgICAgICAgdGVtcGxhdGVGbiA9IGF3YWl0IF9sb2FkVGVtcGxhdGUobmFtZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghdGVtcGxhdGVGbikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRlbXBsYXRlIFwiJHtuYW1lfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8qKiBcclxuICAgICAgICAgKiBCdWZmZXIgZGUgc2FsaWRhLlxyXG4gICAgICAgICAqIEB0eXBlIHtzdHJpbmdbXX1cclxuICAgICAgICAgKi9cclxuICAgICAgICBjb25zdCBvdXQgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICAvKiogXHJcbiAgICAgICAgICogSW5jbHVkZXMgYcOxYWRpZG9zIGR1cmFudGUgbGEgZWplY3VjacOzbiBkZSBsYSBwbGFudGlsbGEuXHJcbiAgICAgICAgICogQ2FkYSBlbnRyYWRhIGNvbnRpZW5lIGVsIG5vbWJyZSB5IGxhcyBvcGNpb25lcyBlc3BlY2lmaWNhZGFzLlxyXG4gICAgICAgICAqIEB0eXBlIHt7bmFtZTogc3RyaW5nLCBvcHRpb25zPzogYW55fVtdfVxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGNvbnN0IGluY2x1ZGVzID0gW107XHJcblxyXG4gICAgICAgIC8qKiBcclxuICAgICAgICAgKiBDb250ZXh0byBsb2NhbCBwYXNhZG8gYSBsYSBmdW5jacOzbiBkZSBwbGFudGlsbGEuIENvbnRpZW5lIGVsIGJ1ZmZlciBkZSBzYWxpZGEgeSBsYXMgdXRpbGlkYWRlcyBiw6FzaWNhcyBcclxuICAgICAgICAgKiAoZXNjYXBlLCBwcmludCwgaW5jbHVkZS4uLikuXHJcbiAgICAgICAgICogQHR5cGUge3tcclxuICAgICAgICAgKiAgZXNjYXBlOiAodmFsdWU6IGFueSkgPT4gc3RyaW5nLFxyXG4gICAgICAgICAqICBwcmludDogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxyXG4gICAgICAgICAqICBwcmludFJhdzogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkLFxyXG4gICAgICAgICAqICBpbmNsdWRlOiAobmFtZTogc3RyaW5nLCBvcHRpb25zPzogT2JqZWN0KSA9PiB2b2lkXHJcbiAgICAgICAgICogfX1cclxuICAgICAgICAgKi9cclxuICAgICAgICBjb25zdCBsb2NhbHMgPSB7XHJcbiAgICAgICAgICAgIG9wdGlvbnMsIC8vIFRPRE86IEV2YWx1YXIgc2kgZGVmaW5pciBzb2xvIFwiZGF0YVwiIG8gcXVlIGhhY2VyP1xyXG4gICAgICAgICAgICBlc2NhcGU6IGVzYy5odG1sLFxyXG4gICAgICAgICAgICBwcmludDogKC4uLmFyZ3MpID0+IG91dC5wdXNoKC4uLmFyZ3MubWFwKHYgPT4gZXNjLmh0bWwoU3RyaW5nKHYpKSkpLFxyXG4gICAgICAgICAgICBwcmludFJhdzogKC4uLmFyZ3MpID0+IG91dC5wdXNoKC4uLmFyZ3MubWFwKHYgPT4gU3RyaW5nKHYpKSksXHJcbiAgICAgICAgICAgIGluY2x1ZGU6IGZ1bmN0aW9uKG5hbWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgICAgICAgICAgICAgaW5jbHVkZXMucHVzaCh7IG5hbWUsIG9wdGlvbnMgfSk7XHJcbiAgICAgICAgICAgICAgICBvdXQucHVzaCgnPGNsaXAtc2xvdD48L2NsaXAtc2xvdD4nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFNlIGVqZWN1dGEgbGEgcGxhbnRpbGxhIGNvbiBlbCBjb250ZXh0byBhbnRlcmlvci5cclxuICAgICAgICB0ZW1wbGF0ZUZuLmNhbGwoY2xpcCwgb3V0LCBsb2NhbHMpO1xyXG5cclxuICAgICAgICAvLyBTZSBjcmVhIHVuIGVsZW1lbnRvIFwidGVtcGxhdGVcIiBwYXJhIHBhcnNlYXIgZWwgY8OzZGlnbyBIVE1MIGdlbmVyYWRvLlxyXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKTtcclxuICAgICAgICB0ZW1wbGF0ZS5pbm5lckhUTUwgPSBvdXQuam9pbignJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUmVzb2x2ZW1vcyBsYXMgaW5jbHVzaW9uZXMgYcOxYWRpZGFzLlxyXG4gICAgICAgIGNvbnN0IHNsb3RzID0gdGVtcGxhdGUuY29udGVudC5xdWVyeVNlbGVjdG9yQWxsKCdjbGlwLXNsb3QnKTtcclxuICAgICAgICBpZiAoc2xvdHMubGVuZ3RoICE9PSBpbmNsdWRlcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbmNsdWRlcyBtaXNtYXRjaDogJHtzbG90cy5sZW5ndGh9IHZzICR7aW5jbHVkZXMubGVuZ3RofWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGxldCBpID0gMCwgYywgZnJhZ21lbnQ7IGkgPCBpbmNsdWRlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoaW5jbHVkZXNbaV0ubmFtZS5zdGFydHNXaXRoKENMSVBfUFJFRklYKSkge1xyXG4gICAgICAgICAgICAgICAgYyA9IGF3YWl0IGNsaXBzLmNyZWF0ZShpbmNsdWRlc1tpXS5uYW1lLnN1YnN0cmluZyhDTElQX1BSRUZJWC5sZW5ndGgpLCBpbmNsdWRlc1tpXS5vcHRpb25zKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IGMuaW5jbHVkZShzbG90c1tpXSwgeyAuLi5pbmNsdWRlc1tpXS5vcHRpb25zLCBwb3NpdGlvbjogQ2xpcC5Qb3NpdGlvbi5SRVBMQUNFLCBwYXJlbnRDbGlwOiBjbGlwIH0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZnJhZ21lbnQgPSBhd2FpdCBjbGlwcy5yZW5kZXIoY2xpcCwgaW5jbHVkZXNbaV0ubmFtZSwgaW5jbHVkZXNbaV0ub3B0aW9ucyk7XHJcbiAgICAgICAgICAgIHNsb3RzW2ldLnJlcGxhY2VXaXRoKGZyYWdtZW50KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNlIGRldnVlbHZlIGVsIGNvbnRlbmlkbyBnZW5lcmFkby5cclxuICAgICAgICByZXR1cm4gdGVtcGxhdGUuY29udGVudDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbmNsdXllIHVuIGNsaXAgbyB1bmEgcGxhbnRpbGxhIGVuIGVsIGVsZW1lbnRvIG8gc2VsZWN0b3IgZXNwZWNpZmljYWRvLlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgTm9tYnJlIGRlbCBjbGlwIG8gcGxhbnRpbGxhIGVzcGVjaWZpY2Fkby5cclxuICAgICAqIEBwYXJhbSB7RWxlbWVudH0gdGFyZ2V0IEVsZW1lbnRvIGVzcGVjaWZpY2Fkby4gXHJcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gICAgICogQHNlZSBDbGlwI2NyZWF0ZVxyXG4gICAgICogQHNlZSBDbGlwI2luY2x1ZGVcclxuICAgICAqL1xyXG4gICAgaW5jbHVkZTogYXN5bmMgZnVuY3Rpb24obmFtZSwgdGFyZ2V0LCBvcHRpb25zKSB7XHJcbiAgICAgICAgcmV0dXJuIChhd2FpdCB0aGlzLmNyZWF0ZShuYW1lLCBvcHRpb25zKSkuaW5jbHVkZSh0YXJnZXQsIG9wdGlvbnMpOyBcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEZXZ1ZWx2ZSBlbCBjbGlwIGFzb2NpYWRvIGNvbiBlbCBlbGVtZW50byBlc3BlY2lmaWNhZG8uXHJcbiAgICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fHN0cmluZ30gZWwgRWxlbWVudG8gbyBzZWxlY3Rvci5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbc2VsZWN0b3JdIFNlbGVjdG9yIGFkaWNpb25hbCBkZW50cm8gZGVsIGVsZW1lbnRvIGVzcGVjaWZpY2Fkby5cclxuICAgICAqIEByZXR1cm5zIHtDbGlwfG51bGx9IENsaXAgbyBudWxvIHNpIG5vIHNlIGVuY3VlbnRyYS5cclxuICAgICAqL1xyXG4gICAgZmluZDogZnVuY3Rpb24oZWwsIHNlbGVjdG9yKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBlbCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGVsKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGVsIGluc3RhbmNlb2YgRWxlbWVudCAmJiBzZWxlY3Rvcikge1xyXG4gICAgICAgICAgICBlbCA9IGVsLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gKGVsIGluc3RhbmNlb2YgRWxlbWVudCAmJiBfZWxlbWVudENsaXBzLmdldChlbCkpIHx8IG51bGw7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRmlqYSBsYSBydXRhIGJhc2UgZGUgZG9uZGUgY2FyZ2FyIGxvcyBjbGlwcy5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwYXRoIFJ1dGEgZXNwZWNpZmljYWRhLlxyXG4gICAgICovXHJcbiAgICBiYXNlUGF0aDogZnVuY3Rpb24ocGF0aCkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgcGF0aCA9IHBhdGgudHJpbSgpLnJlcGxhY2UoL1xcLyQvLCAnJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIF9zZXR0aW5ncy5iYXNlUGF0aCA9IHBhdGg7XHJcbiAgICB9XHJcblxyXG59O1xyXG5cclxuXHJcbi8vIEV4cG9ydFxyXG5leHBvcnQgZGVmYXVsdCBjbGlwcztcclxuIiwiaW1wb3J0IGNsaXBzIGZyb20gJy4uL2NsaXBzLmpzJztcclxuXHJcbi8qKlxyXG4gKiBUaXBvIGRlIGNsaXAgYmFzZSBwYXJhIGxhIGRlZmluaWNpw7NuIGRlIHZpc3RhcyBxdWUgc2UgcHVlZGVuIGFicmlyIGRlbnRybyBkZSB1biB2aWV3cG9ydC5cclxuICogQGNsYXNzIFZpZXdDbGlwXHJcbiAqL1xyXG5jbGlwcy5kZWZpbmUoJ3ZpZXcnLCB7XHJcblxyXG4gICAgLyoqIEBzZWUgQ2xpcCNjcmVhdGUgKi9cclxuICAgIGNyZWF0ZTogZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gICAgICAgIC8vIC4uLlxyXG4gICAgfSxcclxuXHJcbiAgICAvKiogQHR5cGUge3N0cmluZ30gKi9cclxuICAgIHN0eWxlczogLypjc3MqL2BcclxuICAgICAgICAudmlldyB7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6IGJsb2NrO1xyXG4gICAgICAgIH1cclxuICAgIGBcclxuXHJcbn0pO1xyXG5cclxuLyoqXHJcbiAqIE5vZG8gZGUgcnV0YS5cclxuICogQHR5cGVkZWYge09iamVjdH0gVmlld3BvcnRSb3V0ZU5vZGVcclxuICogQHByb3BlcnR5IHtzdHJpbmd9IHBhdGhcclxuICogQHByb3BlcnR5IHtzdHJpbmd9IHZpZXdcclxuICovXHJcblxyXG4vKipcclxuICogQ2xpcCBlc3BlY2lhbGl6YWRvIGVuIGxhIGdlc3Rpw7NuIGRlIHJ1dGFzIHkgdmlzdGFzLiBQZXJtaXRlIGRlZmluaXIgdW4gY29uanVudG8gZGUgcnV0YXMgYXNvY2lhZGFzIGEgdmlzdGFzIHkgXHJcbiAqIGFicmlybGFzIGRpbsOhbWljYW1lbnRlLiBFcyBlc3BlY2lhbG1lbnRlIMO6dGlsIHBhcmEgbGEgZ2VzdGnDs24gZGUgdmlzdGFzIGVuIGFwbGljYWNpb25lcyBTUEEuXHJcbiAqIEBjbGFzcyBWaWV3cG9ydENsaXBcclxuICogQGV4dGVuZHMgVmlld0NsaXBcclxuICovXHJcbmNsaXBzLmRlZmluZSgndmlld3BvcnQnLCB7XHJcblxyXG4gICAgLyoqIEB0eXBlIHtzdHJpbmd9ICovXHJcbiAgICBleHRlbmRzOiAndmlldycsXHJcblxyXG4gICAgLyoqIEBzZWUgQ2xpcCNjcmVhdGUgKi9cclxuICAgIGNyZWF0ZTogZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gICAgICAgIHRoaXMuYmFzZVByb3RvdHlwZS5jcmVhdGUuY2FsbCh0aGlzLCBvcHRpb25zKTtcclxuXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgICogTWFwZW8gZGUgcnV0YXMuXHJcbiAgICAgICAgICogQHR5cGUge1ZpZXdwb3J0Um91dGVOb2RlW119XHJcbiAgICAgICAgICovXHJcbiAgICAgICAgdGhpcy5yb3V0ZXMgPSBvcHRpb25zLnJvdXRlcyB8fCBbXTtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqIEBzZWUgQ2xpcCNyZW5kZXIgKi9cclxuICAgIHJlbmRlcjogZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gICAgICAgIHJldHVybiAvKmh0bWwqL2BcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInZpZXdwb3J0XCI+PC9kaXY+XHJcbiAgICAgICAgYDtcclxuICAgIH0sXHJcblxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8qKlxyXG4gICAgICogQWJyZSBsYSBydXRhIGVzcGVjaWZpY2FkYS5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwYXRoIFJ1dGEgYSBhYnJpci5cclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3BjaW9uZXMgYWRpY2lvbmFsZXMuXHJcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlPENsaXA+fSBDbGlwIGRlIGxhIHJ1dGEgYWJpZXJ0YS5cclxuICAgICAqIEB0aHJvd3Mge0Vycm9yfSBTaSBubyBzZSBlbmN1ZW50cmEgbGEgcnV0YSBlc3BlY2lmaWNhZGEuXHJcbiAgICAgKi9cclxuICAgIG9wZW46IGFzeW5jIGZ1bmN0aW9uKHBhdGgsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgICAgIGNvbnN0IHJvdXRlID0gdGhpcy5yb3V0ZXMuZmluZChyID0+IHIucGF0aCA9PT0gcGF0aCk7XHJcbiAgICAgICAgaWYgKCFyb3V0ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFJvdXRlIG5vdCBmb3VuZDogJHtwYXRofWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY2xpcHMuaW5jbHVkZShyb3V0ZS52aWV3LCB0aGlzLnJvb3QsIHsgcGFyZW50Q2xpcDogdGhpcywgLi4ub3B0aW9ucyB9KTtcclxuICAgIH0sXHJcblxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8qKiBcclxuICAgICAqIENsaXAgc3R5bGVzLlxyXG4gICAgICogQHR5cGUge3N0cmluZ31cclxuICAgICAqL1xyXG4gICAgc3R5bGVzOiAvKmNzcyovYFxyXG4gICAgICAgIC52aWV3cG9ydCB7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6IGJsb2NrO1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICAgICAgICAgIHRvcDogMDtcclxuICAgICAgICAgICAgbGVmdDogMDtcclxuICAgICAgICAgICAgd2lkdGg6IDEwMCU7XHJcbiAgICAgICAgICAgIGhlaWdodDogMTAwJTtcclxuXHJcbiAgICAgICAgICAgID4gLnZpZXcge1xyXG4gICAgICAgICAgICAgICAgZGlzcGxheTogYmxvY2s7XHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICAgICAgICAgICAgICB0b3A6IDA7XHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAwO1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IDEwMCU7XHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IDEwMCU7XHJcbiAgICAgICAgICAgICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgYFxyXG5cclxufSk7XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTsiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0lBQUEsTUFBTSxZQUFZLEdBQUc7SUFDckIsSUFBSSxHQUFHLEVBQUUsT0FBTztJQUNoQixJQUFJLEdBQUcsRUFBRSxNQUFNO0lBQ2YsSUFBSSxHQUFHLEVBQUUsTUFBTTtJQUNmLElBQUksR0FBRyxFQUFFLFFBQVE7SUFDakIsSUFBSSxHQUFHLEVBQUUsT0FBTztJQUNoQixDQUFDLENBQUM7QUFDRjtBQUNBLGNBQWU7QUFDZjtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQSxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLEVBQUUsS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDeEU7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0EsSUFBSSxPQUFPLEVBQUUsQ0FBQyxHQUFHLEtBQUssR0FBRztJQUN6QixTQUFTLE9BQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDO0lBQy9CLFNBQVMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUM7SUFDN0IsU0FBUyxPQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztJQUNqQyxTQUFTLE9BQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDO0FBQzlCO0lBQ0EsQ0FBQzs7SUMxQkQ7SUFDQTtJQUNB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
