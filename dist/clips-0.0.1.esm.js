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


/* ================================================================================================================== */
// Se expone globalmente como propiedad de window.
if (typeof window !== 'undefined') {
  window.clips = clips;
}

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

export { clips as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpcHMtMC4wLjEuZXNtLmpzIiwic291cmNlcyI6WyIuLi91dGlsL2VzY2FwZS5qcyIsIi4uL3V0aWwvZWpzLmpzIiwiLi4vY2xpcHMuanMiLCIuLi9hZGQtb25zL3ZpZXdzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IEhUTUxfRVNDQVBFUyA9IHtcclxuICAgICcmJzogJyZhbXA7JyxcclxuICAgICc8JzogJyZsdDsnLFxyXG4gICAgJz4nOiAnJmd0OycsXHJcbiAgICAnXCInOiAnJnF1b3Q7JyxcclxuICAgIFwiJ1wiOiAnJiMzOTsnXHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFc2NhcGEgbG9zIGNhcmFjdGVyZXMgZXNwZWNpYWxlcyBlbiBIVE1MLlxyXG4gICAgICogQHBhcmFtIHsqfSB4IFZhbG9yIGVzcGVjaWZpY2Fkby4gXHJcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBDYWRlbmEgZXNjYXBhZGEuXHJcbiAgICAgKi9cclxuICAgIGh0bWw6ICh4KSA9PiBTdHJpbmcoeCkucmVwbGFjZSgvWyY8PlwiJ10vZywgKGNoKSA9PiBIVE1MX0VTQ0FQRVNbY2hdKSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEVzY2FwYSBsb3MgY2FyYWN0ZXJlcyBlc3BlY2lhbGVzIGVuIGxpdGVyYWxlcyBkZSBwbGFudGlsbGEuXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyIENhZGVuYSBlc3BlY2lmaWNhZGEuIFxyXG4gICAgICogQHJldHVybnMge3N0cmluZ30gQ2FkZW5hIGVzY2FwYWRhLlxyXG4gICAgICovXHJcbiAgICBsaXRlcmFsOiAoc3RyKSA9PiBzdHJcclxuICAgICAgICAucmVwbGFjZSgvXFxcXC9nLCBcIlxcXFxcXFxcXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL2AvZywgXCJcXFxcYFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXCRcXHsvZywgXCJcXFxcJHtcIilcclxuICAgICAgICAucmVwbGFjZSgvXFxyL2csIFwiXFxcXHJcIilcclxuXHJcbn07IiwiaW1wb3J0IGVzYyBmcm9tICcuL2VzY2FwZS5qcyc7XHJcblxyXG4vKipcclxuICogRXhwcmVzacOzbiByZWd1bGFyIHBhcmEgZGV0ZWN0YXIgbGFzIGV0aXF1ZXRhcyBFSlMuXHJcbiAqIEB0eXBlIHtSZWdFeHB9XHJcbiAqIEBjb25zdGFudFxyXG4gKi9cclxuY29uc3QgZWpzVGFnc1JlID0gLzwlWy09XT9bXFxzXFxTXSo/JT4vZztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbXBpbGEgZWwgY8OzZGlnbyBmdWVudGUgZGUgdW5hIHBsYW50aWxsYSBFSlMuXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3JjIEPDs2RpZ28gZnVlbnRlIGRlIGxhIHBsYW50aWxsYS5cclxuICAgICAqIEByZXR1cm5zIHtGdW5jdGlvbn0gRnVuY2nDs24gZGUgcGxhbnRpbGxhIGNvbXBpbGFkYS5cclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKi9cclxuICAgIGNvbXBpbGU6IGZ1bmN0aW9uKHNyYykge1xyXG4gICAgICAgIGxldCBvZmZzZXQgPSAwLCBtYXRjaDtcclxuICAgICAgICBsZXQgYm9keSA9ICcnLCBtYXJrLCBjb2RlO1xyXG4gICAgICAgIGNvbnN0IGFwcGVuZFRleHQgPSAodGV4dCkgPT4gYm9keSArPSB0ZXh0ID8gYG91dC5wdXNoKFxcYCR7ZXNjLmxpdGVyYWwodGV4dCl9XFxgKTtgIDogJyc7XHJcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IGVqc1RhZ3NSZS5leGVjKHNyYykpICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFRleHQoc3JjLnNsaWNlKG9mZnNldCwgbWF0Y2guaW5kZXgpKTtcclxuXHJcbiAgICAgICAgICAgIG1hcmsgPSBtYXRjaFswXVsyXTsgLy8gJyUnLCAnPScsICctJ1xyXG4gICAgICAgICAgICBjb2RlID0gbWF0Y2hbMF0uc2xpY2UoMiArIChtYXJrID09PSAnPScgfHwgbWFyayA9PT0gJy0nID8gMSA6IDApLCAtMikudHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgaWYgKG1hcmsgPT09ICc9Jykge1xyXG4gICAgICAgICAgICAgICAgYm9keSArPSBgb3V0LnB1c2goZXNjYXBlKCgke2NvZGV9KSkpOyBcXG5gO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1hcmsgPT09ICctJykge1xyXG4gICAgICAgICAgICAgICAgYm9keSArPSBgb3V0LnB1c2goU3RyaW5nKCgke2NvZGV9KSkpOyBcXG5gO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYm9keSArPSBjb2RlICsgJ1xcbic7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIG9mZnNldCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhcHBlbmRUZXh0KHNyYy5zbGljZShvZmZzZXQpKTtcclxuICAgICAgICByZXR1cm4gbmV3IEZ1bmN0aW9uKCdvdXQnLCAnbG9jYWxzJywgYHdpdGggKGxvY2FscykgeyAke2JvZHl9IH1gKTtcclxuICAgIH1cclxuXHJcbn07IiwiaW1wb3J0IGVqcyBmcm9tICcuL3V0aWwvZWpzLmpzJztcclxuaW1wb3J0IGVzYyBmcm9tICcuL3V0aWwvZXNjYXBlLmpzJztcclxuXHJcbi8qIENsaXAgcHJvdG90eXBlXHJcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xyXG4vKipcclxuICogUHJvcGVydHkgc3ltYm9sIFwiZXZlbnRMaXN0ZW5lcnNcIiBvZiBDbGlwIG9iamVjdC5cclxuICogQHR5cGUge3N5bWJvbH1cclxuICogQGNvbnN0XHJcbiAqL1xyXG5jb25zdCBFVkVOVF9MSVNURU5FUlMgPSBTeW1ib2woJ2V2ZW50TGlzdGVuZXJzJyk7XHJcblxyXG4vKipcclxuICogRnVuY2nDs24gY29uc3RydWN0b3JhLCBiYXNlIGRlIHRvZG8gY2xpcC5cclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zPXt9XSBPcGNpb25lcyBkZSBjcmVhY2nDs24uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gQ2xpcChvcHRpb25zID0ge30pIHtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZmVyZW5jaWEgYWwgbm9kbyByYcOteiBkZWwgY2xpcC5cclxuICAgICAqIEB0eXBlIHtFbGVtZW50fVxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqL1xyXG4gICAgdGhpcy5fcm9vdCA9IG51bGw7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWZlcmVuY2lhIGFsIGNsaXAgcGFkcmUgbyBjb250ZW5lZG9yLlxyXG4gICAgICogQHR5cGUge0NsaXB9XHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICB0aGlzLl9wYXJlbnRDbGlwID0gbnVsbDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbmp1bnRvIGRlIHN1YmNsaXBzIGNvbnRlbmlkb3MuXHJcbiAgICAgKiBAdHlwZSB7U2V0PENsaXA+fVxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqL1xyXG4gICAgdGhpcy5fY2hpbGRDbGlwcyA9IG5ldyBTZXQoKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFRpZW1wbyBkZSBjYXJnYS5cclxuICAgICAqIEB0eXBlIHtudW1iZXJ9XHJcbiAgICAgKiBAcHJpdmF0ZVxyXG4gICAgICovXHJcbiAgICB0aGlzLl9sb2FkVGltZSA9IDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBNYW5lamFkb3JlcyBkZSBldmVudG9zIHBvciB0aXBvLlxyXG4gICAgICogQHR5cGUge01hcDxzdHJpbmcsIFNldDxGdW5jdGlvbj4+fVxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqL1xyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIEVWRU5UX0xJU1RFTkVSUywge1xyXG4gICAgICAgIHZhbHVlOiBuZXcgTWFwKCksXHJcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXHJcbiAgICAgICAgd3JpdGFibGU6IGZhbHNlLFxyXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2VcclxuICAgIH0pO1xyXG5cclxuXHJcbiAgICAvLyBTZSBsbGFtYSBhIGxhIGZ1bmNpw7NuIGNyZWF0ZS5cclxuICAgIHRoaXMuY3JlYXRlKG9wdGlvbnMpO1xyXG59XHJcblxyXG4vLyBTZSBkZWZpbmVuIGxvcyBhY2Nlc29yZXMgZGUgbGFzIHByb3BpZWRhZGVzIGFudGVyaW9yZXMuXHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKENsaXAucHJvdG90eXBlLCB7XHJcbiAgICByb290OiB7XHJcbiAgICAgICAgLyoqIEByZXR1cm5zIHtFbGVtZW50fG51bGx9ICovXHJcbiAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcm9vdDtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGVudW1lcmFibGU6IHRydWVcclxuICAgIH0sXHJcbiAgICBwYXJlbnRDbGlwOiB7XHJcbiAgICAgICAgLyoqIEByZXR1cm5zIHtDbGlwfG51bGx9ICovXHJcbiAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGFyZW50Q2xpcDtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGVudW1lcmFibGU6IHRydWVcclxuICAgIH0sXHJcbiAgICBjaGlsZENsaXBzOiB7XHJcbiAgICAgICAgLyoqIEByZXR1cm5zIHtDbGlwW119ICovXHJcbiAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgICByZXR1cm4gWy4uLnRoaXMuX2NoaWxkQ2xpcHNdO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZVxyXG4gICAgfSxcclxuICAgIGNoaWxkQ291bnQ6IHtcclxuICAgICAgICAvKiogQHJldHVybnMge251bWJlcn0gKi9cclxuICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jaGlsZENsaXBzLnNpemU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59KTtcclxuXHJcblxyXG4vKiBDb25zdGFudHMgb2YgQ2xpcFxyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIERpZmVyZW50ZXMgcG9zaWNpb25lcyBlbiBsYXMgcXVlIGluY2x1aXIgdW4gY2xpcCBlbiBlbCBET00gY29uIHJlc3BlY3RvIGFsIGVsZW1lbnRvIG9iamV0aXZvLlxyXG4gKiBAZW51bSB7c3RyaW5nfVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbkNsaXAuUG9zaXRpb24gPSBPYmplY3QuZnJlZXplKHtcclxuICAgIFNUQVJUOiAgICAgICdzdGFydCcsXHJcbiAgICBFTkQ6ICAgICAgICAnZW5kJyxcclxuICAgIEJFRk9SRTogICAgICdiZWZvcmUnLFxyXG4gICAgQUZURVI6ICAgICAgJ2FmdGVyJyxcclxuICAgIFJFUExBQ0U6ICAgICdyZXBsYWNlJ1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBOb21icmUgZGVsIGZpY2hlcm8gbWFuZWphZG9yIHBvciBkZWZlY3RvLlxyXG4gKiBAdHlwZSB7c3RyaW5nfVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbkNsaXAuZGVmYXVsdEhhbmRsZXJOYW1lID0gJ2hhbmRsZXInO1xyXG5cclxuLyoqXHJcbiAqIE5vbWJyZSBkZSBwbGFudGlsbGEgcG9yIGRlZmVjdG8uXHJcbiAqIEB0eXBlIHtzdHJpbmd9XHJcbiAqIEBjb25zdGFudFxyXG4gKi9cclxuQ2xpcC5kZWZhdWx0VGVtcGxhdGVOYW1lID0gJ2xheW91dCc7XHJcblxyXG4vKipcclxuICogTm9tYnJlIGRlIGhvamEgZGUgZXN0aWxvcyBwb3IgZGVmZWN0by5cclxuICogQHR5cGUge3N0cmluZ31cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5DbGlwLmRlZmF1bHRTdHlsZXNOYW1lID0gJ3N0eWxlcyc7XHJcblxyXG5cclxuLyogUHJvdG90eXBlIGZ1bmN0aW9uc1xyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIEZ1bmNpw7NuIGRlIGNyZWFjacOzbiBkZSBudWV2YXMgaW5zdGFuY2lhcy5cclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3BjaW9uZXMgZGUgY3JlYWNpw7NuLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24ob3B0aW9ucykge307XHJcblxyXG4vKipcclxuICogRnVuY2nDs24gcGFyYSBpbmNsdWlyIGVsIGNsaXAgY29uIHJlc3BlY3RvIGFsIGVsZW1lbnRvICh0YXJnZXQpIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtFbGVtZW50fSB0YXJnZXQgRWxlbWVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wY2lvbmVzIGRlIGluY2x1c2nDs24uXHJcbiAqIEBwYXJhbSB7Q2xpcH0gW29wdGlvbnMucGFyZW50Q2xpcF0gUmVmZXJlbmNpYSBhbCBjbGlwIGNvbnRlbmVkb3IuXHJcbiAqIEBwYXJhbSB7Q2xpcC5Qb3NpdGlvbn0gW29wdGlvbnMucG9zaXRpb249Q2xpcC5Qb3NpdGlvbi5FTkRdIFBvc2ljacOzbiBkZSBpbmNsdXNpw7NuIGRlbCBjbGlwIGNvbiByZXNwZWN0byBhbCBlbGVtZW50byBcclxuICogKHRhcmdldCkgZXNwZWNpZmljYWRvLiBcclxuICovXHJcbkNsaXAucHJvdG90eXBlLmluY2x1ZGUgPSBhc3luYyBmdW5jdGlvbih0YXJnZXQsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgLy8gU2UgY29tcHJ1ZWJhIHF1ZSBlbCB0YXJnZXQgc2VhIHVuIEVsZW1lbnQuXHJcbiAgICBpZiAoIXRhcmdldCB8fCB0YXJnZXQubm9kZVR5cGUgIT09IE5vZGUuRUxFTUVOVF9OT0RFKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCB0YXJnZXQ6IG11c3QgYmUgYW4gRWxlbWVudC4nKTtcclxuICAgIH1cclxuICAgIC8vIFNpIHRvZGF2w61hIG5vIHNlIGhhIGdlbmVyYWRvIGVsIGVsZW1lbnRvIHJhw616IHNlIGxsYW1hIGFsIHJlbmRlci5cclxuICAgIGlmICghdGhpcy5fcm9vdCkge1xyXG4gICAgICAgIGxldCBvdXQ7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgb3V0ID0gYXdhaXQgdGhpcy5yZW5kZXIob3B0aW9ucyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHJlbmRlciBjbGlwIFwiJHt0aGlzLmNsaXBOYW1lfVwiOiAke2Vyci5tZXNzYWdlfWAsIHtcclxuICAgICAgICAgICAgICAgIGNhdXNlOiBlcnJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChvdXQ/Lm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSkge1xyXG4gICAgICAgICAgICB0aGlzLl9yb290ID0gb3V0O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGxldCByb290O1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIG91dCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKTtcclxuICAgICAgICAgICAgICAgIHRlbXBsYXRlLmlubmVySFRNTCA9IG91dDtcclxuICAgICAgICAgICAgICAgIG91dCA9IHRlbXBsYXRlLmNvbnRlbnQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKG91dD8ubm9kZVR5cGUgPT09IE5vZGUuRE9DVU1FTlRfRlJBR01FTlRfTk9ERSkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgbiA9IG91dC5maXJzdENoaWxkOyBuOyBuID0gbi5uZXh0U2libGluZykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChuLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocm9vdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNdWx0aXBsZSByb290IGVsZW1lbnRzIGFyZSBub3QgYWxsb3dlZC4nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb290ID0gbjtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG4ubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghV1NfUkUudGVzdChuLmRhdGEpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RleHQgb3V0c2lkZSB0aGUgcm9vdCBlbGVtZW50IGlzIG5vdCBhbGxvd2VkLicpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuLm5vZGVUeXBlICE9PSBOb2RlLkNPTU1FTlRfTk9ERSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIG5vZGUgdHlwZSAoJHtuLm5vZGVUeXBlfSkgb3V0c2lkZSB0aGUgcm9vdCBlbGVtZW50LmApOyAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghcm9vdCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGNsaXAgcm9vdC4gRW5zdXJlIHJlbmRlcigpIHJldHVybnMgYW4gRWxlbWVudCwgb3IgYSBEb2N1bWVudEZyYWdtZW50L0hUTUwgc3RyaW5nIHdpdGggYSBzaW5nbGUtcm9vdCBFbGVtZW50LmApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuX3Jvb3QgPSByb290O1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBTZSBndWFyZGEgbGEgdmluY3VsYWNpw7NuIGRlbCBjbGlwIGNvbiBzdSBlbGVtZW50byByYcOtei5cclxuICAgICAgICBfZWxlbWVudENsaXBzLnNldCh0aGlzLl9yb290LCB0aGlzKTtcclxuICAgICAgICAvLyBTZSBndWFyZGEgY29tbyBwcm9waWVkYWQgZGVsIGVsZW1lbnRvIHBhcmEgbWVqb3JhciBsYSB2aXNpYmlsaWRhZCBlbiBkZXB1cmFjacOzbi5cclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcy5fcm9vdCwgJ19fY2xpcCcsIHtcclxuICAgICAgICAgICAgdmFsdWU6IHRoaXMsXHJcbiAgICAgICAgICAgIHdyaXRhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVE9ETzogQcOxYWRpciBwcm9waWVkYWRlcyBkZSBlc3RpbG8gYWRpY2lvbmFsZXMgKG9wdGlvbnMuc3R5bGUpIHkgY2xhc2VzIChvcHRpb25zLmNsYXNzKS5cclxuICAgIC8vIFRPRE86IEV2YWx1YXIgc2kgaW5jbHVpciBlbCBwYXLDoW1ldHJvIGhpZGUgbyBoaWRkZW4gcGFyYSBvY3VsdGFyIGVsIGVsZW1lbnRvIGluaWNpYWxtZW50ZS5cclxuXHJcbiAgICAvLyBTZSBpbnNlcnRhIGVsIGVsZW1lbnRvIGVuIGxhIHBvc2ljacOzbiBlc3BlY2lmaWNhZGEuXHJcbiAgICBjb25zdCBwb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb24gPz8gQ2xpcC5Qb3NpdGlvbi5FTkQ7IFxyXG4gICAgc3dpdGNoIChwb3NpdGlvbikge1xyXG4gICAgICAgIGNhc2UgQ2xpcC5Qb3NpdGlvbi5BRlRFUjpcclxuICAgICAgICAgICAgdGFyZ2V0LmFmdGVyKHRoaXMuX3Jvb3QpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIENsaXAuUG9zaXRpb24uQkVGT1JFOlxyXG4gICAgICAgICAgICB0YXJnZXQuYmVmb3JlKHRoaXMuX3Jvb3QpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgQ2xpcC5Qb3NpdGlvbi5SRVBMQUNFOlxyXG4gICAgICAgICAgICBpZiAodGhpcy5fcm9vdC5jb250YWlucyh0YXJnZXQpKSB7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXQuYmVmb3JlKHRoaXMuX3Jvb3QpO1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0LnJlcGxhY2VXaXRoKHRoaXMuX3Jvb3QpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgQ2xpcC5Qb3NpdGlvbi5TVEFSVDpcclxuICAgICAgICAgICAgdGFyZ2V0LnByZXBlbmQodGhpcy5fcm9vdCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgQ2xpcC5Qb3NpdGlvbi5FTkQ6XHJcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmQodGhpcy5fcm9vdCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBJbnZhbGlkIHBvc2l0aW9uOiAke3Bvc2l0aW9ufS5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZSBhw7FhZGUgYWwgY2xpcCBwYWRyZSBvIGNvbnRlbmVkb3IuIFNpIG5vIHNlIGVzcGVjaWZpY2EsIHNlIGJ1c2NhIGVuIGxvcyBlbGVtZW50b3MgYXNjZW5kaWVudGVzLlxyXG4gICAgKG9wdGlvbnMucGFyZW50Q2xpcCB8fCBfY2xvc2VzdENsaXAodGhpcy5fcm9vdCkpPy5fYXBwZW5kQ2xpcCh0aGlzKTtcclxuXHJcbiAgICAvLyBMbGFtYWRhIGFsIG3DqXRvZG8gcmVhZHkuXHJcbiAgICB0aGlzLnJlYWR5KG9wdGlvbnMpO1xyXG5cclxuICAgIC8vIFNlIGV2YWx1YSBzaSBlbWl0aXIgZWwgZXZlbnRvIFwiYXR0YWNoXCIuXHJcbiAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5fYXR0YWNoUmVxKTtcclxuICAgIGlmICh0aGlzLnJvb3QuaXNDb25uZWN0ZWQpIHtcclxuICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLnJvb3QucGFyZW50Tm9kZTtcclxuICAgICAgICB0aGlzLl9hdHRhY2hSZXEgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLnJvb3QgfHwgIXRoaXMucm9vdC5pc0Nvbm5lY3RlZCB8fCB0aGlzLnJvb3QucGFyZW50Tm9kZSAhPT0gcGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgX3JlZmxvdyh0aGlzLnJvb3QpO1xyXG4gICAgICAgICAgICB0aGlzLl9hdHRhY2hSZXEgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5yb290IHx8ICF0aGlzLnJvb3QuaXNDb25uZWN0ZWQgfHwgdGhpcy5yb290LnBhcmVudE5vZGUgIT09IHBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSgnYXR0YWNoJywgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBBbCBwcm9wYWdhciBlbCBldmVudG8gaGFicsOtYSBxdWUgYXNlZ3VyYXJzZSBxdWUgbG9zIGNsaXBzIGNvbnRlbmlkb3Mgc2lndWVuIGVuZ2FuY2hhZG9zLCBzaSBubyBcclxuICAgICAgICAgICAgICAgIC8vIGhhYnLDrWEgcXVlIGV2aXRhciBsYSBlbWlzacOzbiBkZWwgZXZlbnRvLiBFbiBwcmluY2lwaW8gc2kgZWwgZWxlbWVudG8gc2UgaGEgZGVzZW5nYW5jaGFkbyBkZWwgZWxlbWVudG9cclxuICAgICAgICAgICAgICAgIC8vIHBhZHJlLCBsYSB2aW5jdWxhY2nDs24gZW50cmUgY2xpcHMgbm8gZGViZXLDrWEgZXhpc3RpciB0YW1wb2NvIGRlIGZvcm1hIHF1ZSBlbCBldmVudG8gbm8gc2UgcHJvcGFnYXLDrWEsXHJcbiAgICAgICAgICAgICAgICAvLyBwZXJvIGVzIGltcG9ydGFudGUgdGVuZXJsbyBlbiBjdWVudGEuXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlIGluaWNpYSBsYSBjYXJnYSBkZSBkYXRvcyBhZGljaW9uYWxlcy5cclxuICAgIHRoaXMuX2xvYWQob3B0aW9ucyk7XHJcblxyXG4gICAgLy8gU2UgZGV2dWVsdmUgbGEgaW5zdGFuY2lhIGRlbCBwcm9waW8gY2xpcC5cclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlcml6YSBlbCBjbGlwLiBQb3IgZGVmZWN0byBpbnRlbnRhcsOhIHJlbmRlcml6YXIgbGEgcGxhbnRpbGxhIHBvciBkZWZlY3RvICgvbGF5b3V0LmVqcykgbG9jYWxpemFkYSBlbiBsYSBtaXNtYSBcclxuICogdWJpY2FjacOzbiBxdWUgZWwgbWFuZWphZG9yIGRlbCBjbGlwLiBcclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcGNpb25lcyBhZGljaW9uYWxlcyBkZSByZW5kZXJpemFkby5cclxuICogQHJldHVybnMge1Byb21pc2U8RG9jdW1lbnRGcmFnbWVudHxFbGVtZW50fHN0cmluZz59IERldnVlbHZlIHVuIGZyYWdtZW50bywgdW4gZWxlbWVudG8gbyBkaXJlY3RhbWVudGUgY8OzZGlnbyBIVE1MLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUucmVuZGVyID0gYXN5bmMgZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gICAgcmV0dXJuIGNsaXBzLnJlbmRlcih0aGlzLCBgJHt0aGlzLmNsaXBOYW1lfS8ke0NsaXAuZGVmYXVsdFRlbXBsYXRlTmFtZX1gLCBvcHRpb25zKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDbGlwIHByZXBhcmFkbyBkZXNwdcOpcyBkZSBsYSBwcmltZXJhIHJlbmRlcml6YWNpw7NuLiBJbXBsZW1lbnRhIGFxdcOtIGxhIGluaWNpYWxpemFjacOzbiBkZSBsYSBlc3RydWN0dXJhIERPTSB5IGHDsWFkZSBlbCBcclxuICogdHJhdGFtaWVudG8gZGUgZXZlbnRvcyBuZWNlc2FyaW8uICBcclxuICovXHJcbkNsaXAucHJvdG90eXBlLnJlYWR5ID0gZnVuY3Rpb24ob3B0aW9ucykge307XHJcblxyXG4vKipcclxuICogQ2FyZ2EgZGUgZGF0b3MuXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUubG9hZCA9IGFzeW5jIGZ1bmN0aW9uKG9wdGlvbnMpIHt9O1xyXG5cclxuLyoqXHJcbiAqIENhcmdhIGRlIGRhdG9zIChlbnZvbHRvcmlvKS4gTGxhbWEgYSBsYSBjYXJnYSwgYWN0dWFsaXphIGVsIHRpZW1wbyBkZSBjYXJnYSB5IGxsYW1hIGEgbGEgYWN0dWFsaXphY2nDs24uXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuX2xvYWQgPSBhc3luYyBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5sb2FkKG9wdGlvbnMpO1xyXG4gICAgdGhpcy5fbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlKGRhdGEgPT09IHVuZGVmaW5lZCA/IG9wdGlvbnMgOiB7IC4uLm9wdGlvbnMsIGRhdGEgfSk7XHJcbn07XHJcblxyXG4vKipcclxuICogQWN0dWFsaXphIGxhIHJlcHJlc2VudGFjacOzbiB2aXN1YWwgZGVsIGNsaXAuXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUudXBkYXRlID0gYXN5bmMgZnVuY3Rpb24ob3B0aW9ucykge307XHJcblxyXG4vKipcclxuICogSW5pY2lhIGxhIHJlY2FyZ2EgZGVsIGNsaXAuXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wY2lvbmVzIGFkaWNpb25hbGVzLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUucmVsb2FkID0gYXN5bmMgZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gICAgdGhpcy5jbGVhcihvcHRpb25zKTtcclxuICAgIHJldHVybiB0aGlzLl9sb2FkKG9wdGlvbnMpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIExpbXBpYSBlbCBjb250ZW5pZG8gZGVsIGNsaXAgeSBsbGFtYSBkZSBudWV2byBhIGxhIHJlbmRlcml6YWNpw7NuLlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcGNpb25lcyBhZGljaW9uYWxlcy5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gICAgaWYgKCF0aGlzLnJvb3QpIHtcclxuICAgICAgICB0aHJvdyBuZXcgQ2xpcEVycm9yKCdObyByb290IGVsZW1lbnQnLCB7IGNvZGU6IENsaXBFcnJvci5ST09UX1JFUVVJUkVEIH0pO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgcm9vdCA9IHRoaXMucmVuZGVyKCk7XHJcbiAgICB0aGlzLl9jbGVhckFsbCgpO1xyXG5cclxuICAgIC8vIHRyeSB7XHJcbiAgICAvLyAgICAgLy8gU2UgY29tcHJ1ZWJhIHF1ZSBoYXlhIHJhw616LlxyXG4gICAgLy8gICAgIGlmICghdGhpcy5yb290KSB7XHJcbiAgICAvLyAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcm9vdCBlbGVtZW50Jyk7XHJcbiAgICAvLyAgICAgfVxyXG4gICAgLy8gICAgIC8vIFNlIHJlbmRlcml6YSBudWV2YW1lbnRlIGxhIHZpc3RhLlxyXG4gICAgLy8gICAgIC8qKiBAdHlwZSB7SFRNTEVsZW1lbnR9ICovXHJcbiAgICAvLyAgICAgY29uc3Qgcm9vdCA9IHRoaXMucmVuZGVyKG9wdGlvbnMpO1xyXG4gICAgLy8gICAgIC8vIFNlIHN1c3RpdHV5ZSBlbCBjb250ZW5pZG8gYW50ZXJpb3IgZGUgbGEgdmlzdGEgcG9yIGVsIG51ZXZvIHNpbiBtb2RpZmljYXIgbGEgcmHDrXouXHJcbiAgICAvLyAgICAgdGhpcy5fY2xlYXJBbGwoKTtcclxuICAgIC8vICAgICB0aGlzLnJvb3QuYXBwZW5kKC4uLnJvb3QuY2hpbGROb2Rlcyk7XHJcbiAgICAvLyAgICAgLy8gU2UgbGxhbWEgYSBsYSBmdW5jacOzbiByZWFkeSBkZSBudWV2by5cclxuICAgIC8vICAgICB0aGlzLnJlYWR5KHRoaXMucm9vdCwgb3B0aW9ucyk7XHJcbiAgICAvLyAgICAgdGhpcy5maXJlKCdyZWFkeScpO1xyXG4gICAgLy8gfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAvLyAgICAgY29uc29sZS5lcnJvcihgVW5hYmxlIHRvIHVwZGF0ZSB2aWV3IFwiJHt0aGlzLl9fbmFtZX1cIjpgLCBlcnIpO1xyXG4gICAgLy8gICAgIHRoaXMuX2ZpcmVFcnJvcihlcnIpO1xyXG4gICAgLy8gfSBcclxufTtcclxuXHJcbi8qKlxyXG4gKiAuLi5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLnRvZ2dsZSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHt9O1xyXG5cclxuLyoqXHJcbiAqIC4uLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuaXNWaXNpYmxlID0gZnVuY3Rpb24ob3B0aW9ucykge307XHJcblxyXG4vKipcclxuICogLi4uXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihvcHRpb25zKSB7fTtcclxuXHJcbi8qKlxyXG4gKiBBw7FhZGUgdW4gbnVldm8gc3ViY2xpcC5cclxuICogQHBhcmFtIHtDbGlwfSBjbGlwIENsaXAgZXNwZWNpZmljYWRvLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuX2FwcGVuZENsaXAgPSBmdW5jdGlvbihjbGlwKSB7XHJcbiAgICBpZiAoY2xpcC5fcGFyZW50Q2xpcCkge1xyXG4gICAgICAgIGNsaXAuX3BhcmVudENsaXAuX3JlbW92ZUNsaXAoY2xpcCk7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9jaGlsZENsaXBzLmFkZChjbGlwKTtcclxuICAgIGNsaXAuX3BhcmVudENsaXAgPSB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVsaW1pbmEgZWwgc3ViY2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7Q2xpcH0gY2xpcCBDbGlwIGVzcGVjaWZpY2Fkby5cclxuICogQHByaXZhdGVcclxuICovXHJcbkNsaXAucHJvdG90eXBlLl9yZW1vdmVDbGlwID0gZnVuY3Rpb24oY2xpcCkge1xyXG4gICAgaWYgKHRoaXMuX2NoaWxkQ2xpcHMuZGVsZXRlKGNsaXApKSB7XHJcbiAgICAgICAgY2xpcC5fcGFyZW50Q2xpcCA9IG51bGw7XHJcbiAgICB9XHJcbn07XHJcblxyXG4vKipcclxuICogLi4uXHJcbiAqL1xyXG5DbGlwLnByb3RvdHlwZS5yZW1vdmVBbGwgPSBmdW5jdGlvbigpIHtcclxuICAgIGZvciAobGV0IGMgb2YgdGhpcy5fY2hpbGRDbGlwcykge1xyXG4gICAgICAgIHRoaXMuX2NoaWxkQ2xpcHMuZGVsZXRlKGMpO1xyXG4gICAgICAgIGMuX3BhcmVudENsaXAgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgLy8gbGV0IGM7XHJcbiAgICAvLyB3aGlsZSAoYyA9IHRoaXMuY2hpbGRDbGlwcy5zaGlmdCgpKSB7XHJcbiAgICAvLyAgICAgaWYgKHVpeC5jb250YWlucyh0aGlzLl9yb290LCB2LnJvb3QpKSB7XHJcbiAgICAvLyAgICAgICAgIGMuZGVzdHJveSgpO1xyXG4gICAgLy8gICAgIH1cclxuICAgIC8vIH1cclxuICAgIC8vIHVpeC5lbXB0eSh0aGlzLl9yb290KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiAuLi5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAvLyBUT0RPOiAuLi5cclxufTtcclxuXHJcblxyXG4vLyBTY3JvbGxcclxuQ2xpcC5wcm90b3R5cGUuc2F2ZVNjcm9sbCA9IGZ1bmN0aW9uKCkge307XHJcblxyXG5DbGlwLnByb3RvdHlwZS5yZXN0b3JlU2Nyb2xsID0gZnVuY3Rpb24oKSB7fTtcclxuXHJcblxyXG4vKiBSZW5kZXIgQ29udGV4dFxyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIENvbnRleHRvIGRlIHJlbmRlcml6YWRvLlxyXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wY2lvbmVzIGRlIGNyZWFjacOzbi5cclxuICovXHJcbmZ1bmN0aW9uIFJlbmRlckNvbnRleHQob3B0aW9ucyA9IHt9KSB7XHJcbiAgICB0aGlzLmluY2x1ZGVzID0gW107XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBw7FhZGUgdW5hIG51ZXZhIGluY2x1c2nDs24gZGUgY2xpcCBhbCBjb250ZXh0byBkZSByZW5kZXJpemFkby5cclxuICogQHBhcmFtIHsqfSBuYW1lIFxyXG4gKiBAcGFyYW0geyp9IG9wdGlvbnMgXHJcbiAqIEByZXR1cm5zIFxyXG4gKi9cclxuUmVuZGVyQ29udGV4dC5wcm90b3R5cGUuaW5jbHVkZSA9IGZ1bmN0aW9uKG5hbWUsIG9wdGlvbnMpIHtcclxuICAgIHRoaXMuaW5jbHVkZXMucHVzaCh7IG5hbWUsIG9wdGlvbnMgfSk7XHJcbiAgICByZXR1cm4gJzxjbGlwLXNsb3Q+PC9jbGlwLXNsb3Q+JztcclxufTtcclxuXHJcblxyXG4vKiBET00tTGlrZSBFdmVudCBNb2RlbFxyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIENsaXAgZXZlbnQuXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIEV2ZW50IHR5cGUuXHJcbiAqIEBwYXJhbSB7eyBkZXRhaWw/OiBhbnksIGNhbmNlbGFibGU/OiBib29sZWFuIH09fSBbb3B0aW9uc10gT3B0aW9ucy5cclxuICovXHJcbmZ1bmN0aW9uIENsaXBFdmVudCh0eXBlLCBvcHRpb25zPXt9KSB7XHJcbiAgICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnIHx8IHR5cGUubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBldmVudCB0eXBlOiBhIG5vbi1lbXB0eSBzdHJpbmcgaXMgcmVxdWlyZWQuJyk7XHJcbiAgICB9XHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyh0aGlzLCB7XHJcbiAgICAgICAgdHlwZToge1xyXG4gICAgICAgICAgICB2YWx1ZTogdHlwZSxcclxuICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgd3JpdGFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRhaWw6IHtcclxuICAgICAgICAgICAgdmFsdWU6IG9wdGlvbnMuZGV0YWlsLFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICB3cml0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICB0YXJnZXQ6IHtcclxuICAgICAgICAgICAgdmFsdWU6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXHJcbiAgICAgICAgICAgIHdyaXRhYmxlOiBmYWxzZSxcclxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjdXJyZW50VGFyZ2V0OiB7XHJcbiAgICAgICAgICAgIHZhbHVlOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgICB3cml0YWJsZTogZmFsc2UsXHJcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogQcOxYWRlIHVuIG51ZXZvIG1hbmVqYWRvciBwYXJhIGVsIGV2ZW50byBkZWwgdGlwbyBvIG5vbWJyZSBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIFRpcG8gbyBub21icmUgZGUgZXZlbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHsoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkfSBjYWxsYmFjayBGdW5jacOzbiBtYW5lamFkb3JhIGRlbCB0aXBvIGRlIGV2ZW50byBlc3BlY2lmaWNhZG8gYSBhw7FhZGlyLlxyXG4gKi9cclxuQ2xpcC5wcm90b3R5cGUuYWRkRXZlbnRMaXN0ZW5lciA9IENsaXAucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgY2FsbGJhY2spIHtcclxuICAgIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycgfHwgdHlwZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGV2ZW50IHR5cGU6IGEgbm9uLWVtcHR5IHN0cmluZyBpcyByZXF1aXJlZC4nKTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGV2ZW50IGxpc3RlbmVyOiBhIGNhbGxiYWNrIGZ1bmN0aW9uIGlzIHJlcXVpcmVkLicpO1xyXG4gICAgfVxyXG4gICAgbGV0IGJ1Y2tldCA9IHRoaXNbRVZFTlRfTElTVEVORVJTXS5nZXQodHlwZSk7XHJcbiAgICBpZiAoIWJ1Y2tldCkge1xyXG4gICAgICAgIHRoaXNbRVZFTlRfTElTVEVORVJTXS5zZXQodHlwZSwgYnVja2V0ID0gbmV3IFNldCgpKTtcclxuICAgIH1cclxuICAgIGJ1Y2tldC5hZGQoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVsaW1pbmEgZWwgbWFuZWphZG9yIGRlIGV2ZW50byBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIFRpcG8gbyBub21icmUgZGUgZXZlbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHsoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkfSBjYWxsYmFjayBGdW5jacOzbiBtYW5lamFkb3JhIGRlbCB0aXBvIGRlIGV2ZW50byBlc3BlY2lmaWNhZG8gYSBlbGltaW5hci5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLnJlbW92ZUV2ZW50TGlzdGVuZXIgPSBDbGlwLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbih0eXBlLCBjYWxsYmFjaykge1xyXG4gICAgaWYgKHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJyB8fCB0eXBlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgZXZlbnQgdHlwZTogYSBub24tZW1wdHkgc3RyaW5nIGlzIHJlcXVpcmVkLicpO1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgZXZlbnQgbGlzdGVuZXI6IGEgY2FsbGJhY2sgZnVuY3Rpb24gaXMgcmVxdWlyZWQuJyk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBidWNrZXQgPSB0aGlzW0VWRU5UX0xJU1RFTkVSU10uZ2V0KHR5cGUpO1xyXG4gICAgaWYgKGJ1Y2tldCkge1xyXG4gICAgICAgIGJ1Y2tldC5kZWxldGUoY2FsbGJhY2spO1xyXG4gICAgICAgIGlmIChidWNrZXQuc2l6ZSA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzW0VWRU5UX0xJU1RFTkVSU10uZGVsZXRlKHR5cGUpO1xyXG4gICAgICAgIH1cclxuICAgIH0gICAgXHJcbn07XHJcblxyXG4vKipcclxuICogRW1pdGUgZWwgZXZlbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtzdHJpbmd8Q2xpcEV2ZW50fHsgdHlwZTogc3RyaW5nLCBkZXRhaWw/OiBhbnkgfX0gRXZlbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHBhcmFtIHtib29sZWFufCdwb3N0J30gW3NwcmVhZF0gSW5kaWNhIHNpIHByb3BhZ2FyIGVsIGV2ZW50byBhIGxvcyBjbGlwcyBjb250ZW5pZG9zIHkgY8OzbW8gaGFjZXIgZWwgcmVjb3JyaWRvLCBcclxuICogc2kgZW4gcHJlLW9yZGVuIChjdWFscXVpZXIgdmFsb3IgXCJ0cnVseVwiKSBvIGVuIHBvc3Qtb3JkZW4gKFwicG9zdFwiKS5cclxuICovXHJcbkNsaXAucHJvdG90eXBlLmRpc3BhdGNoRXZlbnQgPSBDbGlwLnByb3RvdHlwZS5maXJlID0gZnVuY3Rpb24oZXZlbnQsIHNwcmVhZCkge1xyXG4gICAgLy8gTm9ybWFsaXphY2nDs24gZGVsIHBhcsOhbWV0cm8gXCJldmVudFwiLlxyXG4gICAgaWYgKCEoZXZlbnQgaW5zdGFuY2VvZiBDbGlwRXZlbnQpKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBldmVudCA9PT0gJ3N0cmluZycgJiYgZXZlbnQubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBldmVudCA9IG5ldyBDbGlwRXZlbnQoZXZlbnQpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGV2ZW50ID09PSAnb2JqZWN0JyAmJiBldmVudCAhPT0gbnVsbCBcclxuICAgICAgICAgICAgICAgICYmIHR5cGVvZiBldmVudC50eXBlID09PSAnc3RyaW5nJyAmJiBldmVudC50eXBlLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgY29uc3QgZXYgPSBuZXcgQ2xpcEV2ZW50KGV2ZW50LnR5cGUsIHsgZGV0YWlsOiBldmVudC5kZXRhaWwgfSk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGV2ZW50KSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKFsndHlwZScsICd0YXJnZXQnLCAnY3VycmVudFRhcmdldCddLmluY2x1ZGVzKGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEV2ZW50IHByb3BlcnR5IFwiJHtrZXl9XCIgaXMgcmVzZXJ2ZWQuYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBldltrZXldID0gZXZlbnRba2V5XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBldmVudCA9IGV2O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgZXZlbnQgZm9ybWF0OiBhIG5vbi1lbXB0eSBzdHJpbmcsIGFuIG9iamVjdCB3aXRoIGEgc3RyaW5nIFwidHlwZVwiIHByb3BlcnR5LCBvciBhbiBpbnN0YW5jZSBvZiBDbGlwRXZlbnQgaXMgcmVxdWlyZWQuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNvbG8gc2UgZGVmaW5lIGxhIHByb3BpZWRhZCBcInRhcmdldFwiIGVuIGxhIHByaW1lcmEgbGxhbWFkYSB5IHNlIG1hbnRpZW5lIGVuIHRvZG8gZWwgcHJvY2VzYW1pZW50byBkZWwgZXZlbnRvLlxyXG4gICAgaWYgKCEoJ3RhcmdldCcgaW4gZXZlbnQpIHx8IGV2ZW50LnRhcmdldCA9PSBudWxsKSB7XHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGV2ZW50LCAndGFyZ2V0Jywge1xyXG4gICAgICAgICAgICB2YWx1ZTogdGhpcyxcclxuICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlIGV2YWx1YSBzaSBwcm9wYWdhciBlbCBldmVudG8gcHJpbWVybyBhIGxvcyBjbGlwcyBjb250ZW5pZG9zIChwb3N0LW9yZGVyKS5cclxuICAgIGlmIChzcHJlYWQgPT09ICdwb3N0Jykge1xyXG4gICAgICAgIF9zcHJlYWRFdmVudC5jYWxsKHRoaXMsIGV2ZW50LCBzcHJlYWQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlIHByb2Nlc2EgZWwgZXZlbnRvLlxyXG4gICAgY29uc3QgYnVja2V0ID0gdGhpc1tFVkVOVF9MSVNURU5FUlNdLmdldChldmVudC50eXBlKTsgXHJcbiAgICBpZiAoYnVja2V0KSB7XHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGV2ZW50LCAnY3VycmVudFRhcmdldCcsIHtcclxuICAgICAgICAgICAgdmFsdWU6IHRoaXMsXHJcbiAgICAgICAgICAgIHdyaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjYWxsYmFjayBvZiBbLi4uYnVja2V0XSkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzLCBldmVudCk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgY2FsbGluZyBldmVudCBsaXN0ZW5lciBcIiR7ZXZlbnQudHlwZX1cIiBpbiBjbGlwIFwiJHt0aGlzLmNsaXBOYW1lfVwiOmAsIGVycik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZXZlbnQuY3VycmVudFRhcmdldCA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2UgZXZhbHVhIHNpIHByb3BhZ2FyIGVsIGV2ZW50byBhIGxvcyBjbGlwcyBjb250ZW5pZG9zIChwcmUtb3JkZXIpLiBcclxuICAgIGlmIChzcHJlYWQgJiYgc3ByZWFkICE9PSAncG9zdCcpIHtcclxuICAgICAgICBfc3ByZWFkRXZlbnQuY2FsbCh0aGlzLCBldmVudCwgc3ByZWFkKTtcclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9wYWdhIGVsIGV2ZW50byBlc3BlY2lmaWNhZG8gYSBsb3MgY2xpcHMgY29udGVuaWRvcyBlbiBlbCBjbGlwICh0aGlzKS5cclxuICogQHBhcmFtIHtDbGlwRXZlbnR9IGV2ZW50IEV2ZW50byBkZSBjbGlwLlxyXG4gKiBAcGFyYW0ge2Jvb2xlYW58J3Bvc3QnfSBbc3ByZWFkPWZhbHNlXSBJbmRpY2Egc2kgcHJvcGFnYXIgZWwgZXZlbnRvIHkgY8OzbW8gcmVjb3JyZXIgbGEgamVyYXJxdWlhIGRlIGNsaXBzLCBzaSBlbiBwcmUtb3JkZW4gXHJcbiAqIChjdWFscXVpZXIgdmFsb3IgXCJ0cnVseVwiKSBvIGVuIHBvc3Qtb3JkZW4gKGxpdGVyYWwgXCJwb3N0XCIpLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gX3NwcmVhZEV2ZW50KGV2ZW50LCBzcHJlYWQpIHtcclxuICAgIGZvciAoY29uc3QgY2xpcCBvZiBbLi4udGhpcy5fY2hpbGRDbGlwc10pIHtcclxuICAgICAgICBjbGlwLmZpcmUoZXZlbnQsIHNwcmVhZCk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vKiBDb25zdGFudHNcclxuICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXHJcbi8qKlxyXG4gKiBGb3JtYXRvIGRlbCBub21icmUgZGUgbG9zIGNsaXBzIChwYXRoLWxpa2UpLCB1bm8gbyB2YXJpb3Mgc2VnbWVudG9zIHNlcGFyYWRvcyBcclxuICogcG9yIFwiL1wiLCBjYWRhIHNlZ21lbnRvOiBbQS1aYS16MC05Xy1dK1xyXG4gKiBAdHlwZSB7UmVnRXhwfVxyXG4gKiBAY29uc3RhbnRcclxuICovIFxyXG5jb25zdCBDTElQX05BTUVfUkUgPSAvXltBLVphLXowLTlfLV0rKD86XFwvW0EtWmEtejAtOV8tXSspKiQvO1xyXG5cclxuLyoqXHJcbiAqIExvbmdpdHVkIG3DoXhpbWEgcGVybWl0aWRhIHBhcmEgbG9zIG5vbWJyZXMgZGUgY2xpcC5cclxuICogQHR5cGUge251bWJlcn1cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5jb25zdCBDTElQX05BTUVfTUFYX0xFTkdUSCA9IDI1NjtcclxuXHJcbi8qKlxyXG4gKiBQcmVmaWpvIHBhcmEgZXNwZWNpZmljYXIgcmVmZXJlbmNpYXMgYSBjbGlwcyBlbiBpbmNsdXNpb25lcy5cclxuICogQHR5cGUge3N0cmluZ31cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5jb25zdCBDTElQX1BSRUZJWCA9ICdjbGlwOic7XHJcblxyXG4vKipcclxuICogRXhwcmVzacOzbiBwYXJhIHZlcmlmaWNhciBzaSB1bmEgY2FkZW5hIHNvbG8gY29udGllbmUgZXNwYWNpb3MuXHJcbiAqIEB0eXBlIHtSZWdFeHB9XHJcbiAqIEBjb25zdGFudCAgXHJcbiAqL1xyXG5jb25zdCBXU19SRSA9IC9eXFxzKiQvO1xyXG5cclxuLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXHJcbi8qKlxyXG4gKiBDbGlwIEVycm9yLlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSBEZXNjcmlwY2nDs24gZGVsIGVycm9yLlxyXG4gKiBAcGFyYW0ge3sgY29kZT86IHN0cmluZywgY2F1c2U/OiBhbnkgfT19IFtvcHRpb25zXSBPcGNpb25lcyBhZGljaW9uYWxlcy5cclxuICovXHJcbmZ1bmN0aW9uIENsaXBFcnJvcihtZXNzYWdlLCB7IGNvZGUgPSBudWxsLCBjYXVzZSB9ID0ge30pIHtcclxuICAgIHRoaXMubmFtZSA9ICdDbGlwRXJyb3InO1xyXG4gICAgdGhpcy5tZXNzYWdlID0gU3RyaW5nKG1lc3NhZ2UpO1xyXG4gICAgdGhpcy5jb2RlID0gY29kZTtcclxuXHJcbiAgICBpZiAoY2F1c2UgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRoaXMuY2F1c2UgPSBjYXVzZTtcclxuICAgIH1cclxuXHJcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSA/IEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIENsaXBFcnJvcikgOiB0aGlzLnN0YWNrID0gKG5ldyBFcnJvcihtZXNzYWdlKSkuc3RhY2s7XHJcbn1cclxuQ2xpcEVycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlKTtcclxuQ2xpcEVycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IENsaXBFcnJvcjtcclxuXHJcbi8vIEPDs2RpZ29zIGRlIGVycm9yLlxyXG5DbGlwRXJyb3IuUk9PVF9SRVFVSVJFRCA9ICdyb290X3JlcXVpcmVkJztcclxuQ2xpcEVycm9yLkxPQURfRkFJTEVEICAgPSAnbG9hZF9mYWlsZWQnO1xyXG5DbGlwRXJyb3IuTk9UX0RFRklORUQgICA9ICdub3RfZGVmaW5lZCc7XHJcbkNsaXBFcnJvci5OT1RfRk9VTkQgICAgID0gJ25vdF9mb3VuZCc7XHJcblxyXG5cclxuLyogVGVtcGxhdGUgZnVuY3Rpb25zIFxyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIENhcmdhIGxhIHBsYW50aWxsYSBlc3BlY2lmaWNhZGEuXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBvIHJ1dGEgZGUgbGEgcGxhbnRpbGxhIGVzcGVjaWZpY2FkYS5cclxuICogQHJldHVybiB7RnVuY3Rpb259IEZ1bmNpw7NuIGRlIGxhIHBsYW50aWxsYSBjYXJnYWRhLlxyXG4gKi9cclxuY29uc3QgX2xvYWRUZW1wbGF0ZSA9IGFzeW5jIGZ1bmN0aW9uKG5hbWUpIHtcclxuICAgIGNvbnN0IHBhdGggPSBgJHtfc2V0dGluZ3MuYmFzZVBhdGh9LyR7bmFtZX0uZWpzYDtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHBhdGgsIHsgY2FjaGU6IFwibm8tc3RvcmVcIiB9KTsgLy8gZXZpdGEgY2FjaGUgZW4gZGV2XHJcbiAgICBpZiAoIXJlcy5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGxvYWQgdGVtcGxhdGU6ICR7cGF0aH0gKCR7cmVzLnN0YXR1c30pYCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gX3RlbXBsYXRlc1tuYW1lXSA9IGVqcy5jb21waWxlKGF3YWl0IHJlcy50ZXh0KCkpO1xyXG59XHJcblxyXG4vKipcclxuICogRnVlcnphIGVsIHJlZmxvdyBkZWwgZWxlbWVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGVsIEVsZW1lbnRvIGVzcGVjaWZpY2Fkby5cclxuICogQHByaXZhdGVcclxuICovXHJcbmZ1bmN0aW9uIF9yZWZsb3coZWwpIHtcclxuICAgIHJldHVybiBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxufVxyXG5cclxuXHJcbi8qIE1haW4gT2JqZWN0IFxyXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLyoqXHJcbiAqIFNldHRpbmdzLlxyXG4gKiBAdHlwZSB7T2JqZWN0fVxyXG4gKiBAcHJpdmF0ZVxyXG4gKiBAY29uc3RhbnRcclxuICovXHJcbmNvbnN0IF9zZXR0aW5ncyA9IHtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEluZGljYSBzaSBhY3RpdmFyIGVsIG1vZG8gZGVidWcuXHJcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cclxuICAgICAqIEBkZWZhdWx0IGZhbHNlXHJcbiAgICAgKi9cclxuICAgIGRlYnVnOiBmYWxzZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJ1dGEgYmFzZSBkb25kZSBzZSBsb2NhbGl6YSBsYSBkZWZpbmljacOzbiBkZSBsb3MgY2xpcHMuXHJcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxyXG4gICAgICogQGRlZmF1bHQgJy9jbGlwcydcclxuICAgICAqL1xyXG4gICAgYmFzZVBhdGg6ICcvY2xpcHMnLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5kaWNhIHNpIGxvcyBlc3RpbG9zIGVzdMOhbiBwcmUtZW1wYXF1ZXRhZG9zLlxyXG4gICAgICogQHR5cGUge2Jvb2xlYW59XHJcbiAgICAgKiBAZGVmYXVsdCBmYWxzZVxyXG4gICAgICovXHJcbiAgICBzdHlsZXNCdW5kbGVkOiBmYWxzZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEluZGljYSBzaSBsYXMgcGxhbnRpbGxhcyBlc3TDoW4gcHJlLWVtcGFxdWV0YWRhcy5cclxuICAgICAqIEB0eXBlIHtib29sZWFufVxyXG4gICAgICogQGRlZmF1bHQgZmFsc2VcclxuICAgICAqL1xyXG4gICAgdGVtcGxhdGVzQnVuZGxlZDogZmFsc2VcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNYW5lamFkb3JlcyBkZSBDbGlwcyBkZWZpbmlkb3MuXHJcbiAqIEB0eXBlIHtPYmplY3QuPHN0cmluZywgQ2xpcD59XHJcbiAqIEBjb25zdGFudFxyXG4gKi9cclxuY29uc3QgX2hhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcclxuXHJcbi8qKlxyXG4gKiBGdW5jaW9uZXMgZGUgcGxhbnRpbGxhIGHDsWFkaWRhcy5cclxuICogQHR5cGUge09iamVjdC48c3RyaW5nLCAoLi4uKSA9PiBIVE1MRWxlbWVudH1cclxuICogQGNvbnN0YW50XHJcbiAqL1xyXG5jb25zdCBfdGVtcGxhdGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcclxuXHJcbi8qKlxyXG4gKiBNYXBhIGRlIGFzb2NpYWNpw7NuIGVudHJlIGVsZW1lbnRvcyBlIGluc3RhbmNpYXMgZGUgY2xpcHMuXHJcbiAqIEB0eXBlIHtXZWFrTWFwLjxFbGVtZW50LCBDbGlwPn1cclxuICogQGNvbnN0YW50XHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5jb25zdCBfZWxlbWVudENsaXBzID0gbmV3IFdlYWtNYXAoKTtcclxuXHJcbi8qKlxyXG4gKiBSZWZlcmVuY2lhIGFsIGVsZW1lbnRvIGRlIGVzdGlsb3MgZG9uZGUgc2UgaW1wb3J0YW4gbG9zIGVzdGlsb3MgZGUgbG9zIGRpZmVyZW50ZXMgY2xpcHMgZGVmaW5pZG9zLlxyXG4gKiBAdHlwZSB7SFRNTFN0eWxlRWxlbWVudH1cclxuICogQHByaXZhdGVcclxuICovXHJcbmxldCBfc3R5bGVFbGVtZW50O1xyXG5cclxuLyoqXHJcbiAqIERldnVlbHZlIGVsIHByaW1lciBjbGlwIHZpbmN1bGFkbyBhIHVubyBkZSBsb3MgYXNjZW5kaWVudGVzIGRlbCBlbGVtZW50byBlc3BlY2lmaWNhZG8uXHJcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWwgRWxlbWVudG8gZXNwZWNpZmljYWRvLlxyXG4gKiBAcmV0dXJucyB7Q2xpcHxudWxsfSBDbGlwIGVuY29udHJhZG8gbyBudWxsIHNpIG5vIHNlIGVuY3VlbnRyYS5cclxuICogQHByaXZhdGVcclxuICovXHJcbmNvbnN0IF9jbG9zZXN0Q2xpcCA9IGZ1bmN0aW9uKGVsKSB7XHJcbiAgICBmb3IgKGxldCBuID0gZWw/LnBhcmVudEVsZW1lbnQsIGM7IG47IG4gPSBuLnBhcmVudEVsZW1lbnQpIHtcclxuICAgICAgICBpZiAoYyA9IF9lbGVtZW50Q2xpcHMuZ2V0KG4pKSByZXR1cm4gYztcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEltcG9ydGEgbG9zIGVzdGlsb3MgZGVsIGNsaXAgZXNwZWNpZmljYWRvLlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBOb21icmUgZGVsIGNsaXAuXHJcbiAqIEBwYXJhbSB7c3RyaW5nfGZ1bmN0aW9ufEhUTUxTdHlsZUVsZW1lbnR8Q1NTU3R5bGVTaGVldH0gc3R5bGVzIEVzdGlsb3MgZGVsIGNsaXAuXHJcbiAqL1xyXG5jb25zdCBfaW1wb3J0Q2xpcFN0eWxlcyA9IGFzeW5jIGZ1bmN0aW9uKG5hbWUsIHN0eWxlcykge1xyXG4gICAgLy8gTG9zIGVzdGlsb3Mgc2UgcHVlZGVuIGRlZmluaXIgY29tbyBwcm9waWVkYWQgbyBjb21vIGZ1bmNpw7NuLlxyXG4gICAgaWYgKHR5cGVvZiBzdHlsZXMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBzdHlsZXMgPSBzdHlsZXMoKTtcclxuICAgIH1cclxuICAgIC8vIFNpIHNlIGRlZmluZW4gY29tbyBIVE1MU3R5bGVFbGVtZW50LCBzZSBhw7FhZGVuIGRpcmVjdGFtZW50ZSBhbCBoZWFkLlxyXG4gICAgaWYgKHN0eWxlcyBpbnN0YW5jZW9mIEhUTUxTdHlsZUVsZW1lbnQpIHtcclxuICAgICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlcyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgLy8gU2kgc2UgZGVmaW5lbiBjb21vIENTU1N0eWxlU2hlZXQsIHNlIGHDsWFkZW4gYSBsYXMgaG9qYXMgZGUgZXN0aWxvIGFkb3B0YWRhcy5cclxuICAgIGlmIChzdHlsZXMgaW5zdGFuY2VvZiBDU1NTdHlsZVNoZWV0KSB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRvcHRlZFN0eWxlU2hlZXRzID0gWy4uLmRvY3VtZW50LmFkb3B0ZWRTdHlsZVNoZWV0cywgc3R5bGVzXTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBTaSBlbCBjbGlwIG5vIGRlZmluZSBlc3RpbG9zIGVuIGPDs2RpZ28geSBubyBlc3TDoW4gZW1wYXF1ZXRhZG9zLCBzZSBpbnRlbnRhIGNhcmdhciBsYSBob2phIGRlIGVzdGlsb3MgcG9yIGRlZmVjdG8gXHJcbiAgICAvLyB1YmljYWRhIGVuIGxhIG1pc21hIHViaWNhY2nDs24gcXVlIGVsIGNsaXAuXHJcbiAgICBpZiAoIXN0eWxlcyAmJiAhX3NldHRpbmdzLnN0eWxlc0J1bmRsZWQpIHtcclxuICAgICAgICAvLyBUT0RPOiBNw6FzIHF1ZSB1biBmbGFnIHF1ZSBub3MgaW5kaXF1ZSBzaSBsb3MgZXN0aWxvcyBlc3TDoW4gZW1wYXF1ZXRhZG9zIG8gbm8sIGxvIHF1ZSByZWFsbWVudGUgbmVjZXNpdGFtb3MgZXMgXHJcbiAgICAgICAgLy8gdW5hIGRlZmluaWNpw7NuIGRlIGJ1bmRsZXMgY29uIGxhIGVzcGVjaWZpY2FjacOzbiBkZSBub21icmVzIG8gcGF0cm9uZXMgZGUgY2xpcHMgaW5jbHVpZG9zIGVuIGNhZGEgYnVuZGxlLCBkZSBcclxuICAgICAgICAvLyBmb3JtYSBxdWUgcG9kYW1vcyBpbnRyb2R1Y2lyIGFxdcOtIGxhIGzDs2dpY2EgZGUgY2FyZ2EgYWRlY3VhZGEuXHJcbiAgICAgICAgY29uc3QgcGF0aCA9IGAke19zZXR0aW5ncy5iYXNlUGF0aH0vJHtuYW1lfS8ke0NsaXAuZGVmYXVsdFN0eWxlc05hbWV9LmNzc2A7XHJcbiAgICAgICAgbGV0IHJlcztcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICByZXMgPSBhd2FpdCBmZXRjaChwYXRoKTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IENsaXBFcnJvcihgRmFpbGVkIHRvIGZldGNoIHN0eWxlcyBmb3IgY2xpcCBcIiR7bmFtZX1cIiBmcm9tIFwiJHtwYXRofVwiOiAke2Vyci5tZXNzYWdlfWAsIHtcclxuICAgICAgICAgICAgICAgIGNvZGU6IENsaXBFcnJvci5MT0FEX0ZBSUxFRCxcclxuICAgICAgICAgICAgICAgIGNhdXNlOiBlcnJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChyZXMub2spIHtcclxuICAgICAgICAgICAgc3R5bGVzID0gYXdhaXQgcmVzLnRleHQoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHJlcy5zdGF0dXMgIT09IDQwNCAmJiByZXMuc3RhdHVzICE9PSA0MTApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IENsaXBFcnJvcihgRmFpbGVkIHRvIGxvYWQgc3R5bGVzIGZvciBjbGlwIFwiJHtuYW1lfVwiIGZyb20gXCIke3BhdGh9XCI6ICR7cmVzLnN0YXR1c1RleHR9ICgke3Jlcy5zdGF0dXN9KWAsIHtcclxuICAgICAgICAgICAgICAgIGNvZGU6IENsaXBFcnJvci5MT0FEX0ZBSUxFRFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2UgaWYgKF9zZXR0aW5ncy5kZWJ1Zykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYE5vIHN0eWxlcyBmb3VuZCBmb3IgY2xpcCBcIiR7bmFtZX1cIiBhdCBcIiR7cGF0aH1cIi5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoc3R5bGVzICYmIChzdHlsZXMgPSBzdHlsZXMudHJpbSgpKSkge1xyXG4gICAgICAgIGlmICghX3N0eWxlRWxlbWVudCkge1xyXG4gICAgICAgICAgICBfc3R5bGVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcclxuICAgICAgICAgICAgX3N0eWxlRWxlbWVudC5pZCA9ICdjbGlwcy1zdHlsZXMnO1xyXG4gICAgICAgICAgICBfc3R5bGVFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1zb3VyY2UnLCAnY2xpcHMnKTtcclxuICAgICAgICAgICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChfc3R5bGVFbGVtZW50KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgX3N0eWxlRWxlbWVudC50ZXh0Q29udGVudCArPSBgXFxuLyogJHtuYW1lfSAqL1xcbiR7c3R5bGVzfVxcbmA7XHJcbiAgICB9XHJcbn07XHJcblxyXG4vKipcclxuICogQ2FyZ2EgZWwgbWFuZWphZG9yIGRlbCBjbGlwIGVzcGVjaWZpY2FkbyBwb3Igbm9tYnJlLlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBOb21icmUgZGVsIGNsaXAgZXNwZWNpZmljYWRvLlxyXG4gKiBAcmV0dXJuIHtDbGlwfSBNYW5lamFkb3IgZGVsIGNsaXAgZXNwZWNpZmljYWRvLlxyXG4gKi9cclxuY29uc3QgX2xvYWRIYW5kbGVyID0gYXN5bmMgZnVuY3Rpb24obmFtZSkge1xyXG4gICAgLy8gVE9ETzogSW50cm9kdWNpciBhcXXDrSBwb3NpYmxlcyBtYXBlb3MgcGFyYSBidW5kbGVzLlxyXG4gICAgLy8gU2UgY2FyZ2EgZWwgcHJvdG90aXBvIGRlbCBtYW5lamFkb3IuXHJcbiAgICBjb25zdCBwYXRoID0gYCR7X3NldHRpbmdzLmJhc2VQYXRofS8ke25hbWV9LyR7Q2xpcC5kZWZhdWx0SGFuZGxlck5hbWV9LmpzYDtcclxuICAgIGxldCBtb2R1bGU7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIG1vZHVsZSA9IGF3YWl0IGltcG9ydChwYXRoKTtcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgIHRocm93IG5ldyBDbGlwRXJyb3IoYENsaXAgXCIke25hbWV9XCIgY291bGQgbm90IGJlIGxvYWRlZCBmcm9tICR7cGF0aH0uYCwge1xyXG4gICAgICAgICAgICBjb2RlOiBDbGlwRXJyb3IuTE9BRF9GQUlMRUQsXHJcbiAgICAgICAgICAgIGNhdXNlOiBlcnJcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZSBkZWZpbmUgZWwgY2xpcCBjb24gZWwgcHJvdG90aXBvIGNhcmdhZG8uXHJcbiAgICBjb25zdCBwcm90byA9IG1vZHVsZSAmJiBtb2R1bGUuZGVmYXVsdDtcclxuICAgIGlmIChwcm90byA9PT0gbnVsbCB8fCB0eXBlb2YgcHJvdG8gIT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IENsaXBFcnJvcihgQ2xpcCBcIiR7bmFtZX1cIiBoYXMgbm8gZGVmYXVsdCBleHBvcnQuYCwge1xyXG4gICAgICAgICAgICBjb2RlOiBDbGlwRXJyb3IuTk9UX0RFRklORURcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBhd2FpdCBjbGlwcy5kZWZpbmUobmFtZSwgcHJvdG8pO1xyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBNYWluIE9iamVjdC5cclxuICogQG5hbWVzcGFjZVxyXG4gKi9cclxuY29uc3QgY2xpcHMgPSB7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBY3R1YWxpemEgbG9zIGFqdXN0ZXMgZGUgY29uZmlndXJhY2nDs24gZXNwZWNpZmljYWRvcy5cclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzZXR0aW5ncyBBanVzdGVzIGRlIGNvbmZpZ3VyYWNpw7NuLlxyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbc2V0dGluZ3MuZGVidWddIEluZGljYSBzaSBhY3RpdmFyIGVsIG1vZG8gZGVidWcuXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gIFtzZXR0aW5ncy5iYXNlUGF0aF0gUnV0YSBiYXNlIGRvbmRlIHNlIGxvY2FsaXphIGxhIGRlZmluaWNpw7NuIGRlIGxvcyBjbGlwcy5cclxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NldHRpbmdzLnN0eWxlc0J1bmRsZWRdIEluZGljYSBzaSBsb3MgZXN0aWxvcyBlc3TDoW4gcHJlLWVtcGFxdWV0YWRvcy5cclxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NldHRpbmdzLnRlbXBsYXRlc0J1bmRsZWRdIEluZGljYSBzaSBsYXMgcGxhbnRpbGxhcyBlc3TDoW4gcHJlLWVtcGFxdWV0YWRhcy5cclxuICAgICAqL1xyXG4gICAgc2V0dXA6IGZ1bmN0aW9uKHNldHRpbmdzKSB7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbihfc2V0dGluZ3MsIHNldHRpbmdzKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIC8qKlxyXG4gICAgICogRGVmaW5lIHVuIG51ZXZvIHRpcG8gZGUgY2xpcC5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBkZWwgY2xpcCAow7puaWNvKS5cclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwcm90byBQcm90b3RpcG8gZGVsIGNsaXAuXHJcbiAgICAgKiBAcmV0dXJuIHtuZXcgKG9wdGlvbnM6IENsaXBPcHRpb25zKSA9PiBDbGlwfSBDb25zdHJ1Y3RvciBkZWwgbnVldm8gdGlwbyBkZSBjbGlwLlxyXG4gICAgICovXHJcbiAgICBkZWZpbmU6IGFzeW5jIGZ1bmN0aW9uKG5hbWUsIHByb3RvKSB7XHJcbiAgICAgICAgLy8gTm9tYnJlIGRlbCBjbGlwLlxyXG4gICAgICAgIGlmICh0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBjbGlwIG5hbWU6IHN0cmluZyByZXF1aXJlZC4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbmFtZSA9IG5hbWUudHJpbSgpO1xyXG4gICAgICAgIGlmICghbmFtZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGNsaXAgbmFtZTogZW1wdHkgc3RyaW5nLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobmFtZS5sZW5ndGggPiBDTElQX05BTUVfTUFYX0xFTkdUSCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCBjbGlwIG5hbWU6IHRvbyBsb25nICgke25hbWUubGVuZ3RofSA+ICR7Q0xJUF9OQU1FX01BWF9MRU5HVEh9KS5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCFDTElQX05BTUVfUkUudGVzdChuYW1lKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGNsaXAgbmFtZTogZXhwZWN0ZWQgcGF0aC1saWtlIHN0cmluZyB3aXRob3V0IGxlYWRpbmcgb3IgdHJhaWxpbmcgc2xhc2guJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChfaGFuZGxlcnNbbmFtZV0pIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDbGlwIFwiJHtuYW1lfVwiIGFscmVhZHkgZGVmaW5lZC5gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE9iamV0byBwcm90b3RpcG8uXHJcbiAgICAgICAgaWYgKHByb3RvID09PSBudWxsIHx8IHR5cGVvZiBwcm90byAhPT0gJ29iamVjdCcgfHwgT2JqZWN0LmdldFByb3RvdHlwZU9mKHByb3RvKSAhPT0gT2JqZWN0LnByb3RvdHlwZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIHByb3RvdHlwZTogcGxhaW4gb2JqZWN0IHJlcXVpcmVkLicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2UgY29tcHJ1ZWJhIGxhIHZhbGlkZXogZGUgbGEgcHJvcGllZGFkIFwiZXh0ZW5kc1wiIHNpIHNlIGhhIGVzcGVjaWZpY2Fkby5cclxuICAgICAgICBsZXQgYmFzZSA9IHByb3RvLmV4dGVuZHM7XHJcbiAgICAgICAgaWYgKGJhc2UgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGJhc2UgIT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBJbnZhbGlkIGV4dGVuZHM6IHN0cmluZyByZXF1aXJlZC5gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBiYXNlID0gYmFzZS50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICghYmFzZSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgSW52YWxpZCBleHRlbmRzOiBlbXB0eSBzdHJpbmcuYCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFfaGFuZGxlcnNbYmFzZV0pIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IF9sb2FkSGFuZGxlcihiYXNlKTtcclxuICAgICAgICAgICAgICAgIGlmICghX2hhbmRsZXJzW2Jhc2VdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJlZmVyZW5jZUVycm9yKGBJbnZhbGlkIGV4dGVuZHM6IGNsaXAgXCIke2Jhc2V9XCIgbm90IGRlZmluZWQuYCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNlIGRldGVybWluYSBlbCBjb25zdHJ1Y3RvciBiYXNlIHNpIHNlIGhhIGVzcGVjaWZpY2Fkby5cclxuICAgICAgICBjb25zdCBCID0gYmFzZSA/IF9oYW5kbGVyc1tiYXNlXSA6IENsaXA7XHJcblxyXG4gICAgICAgIC8vIFNlIGNyZWEgbGEgZnVuY2nDs24gY29uc3RydWN0b3JhIGRlbCBudWV2byBjbGlwLlxyXG4gICAgICAgIGNvbnN0IEMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIEIuY2FsbCh0aGlzLCBvcHRpb25zKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBTZSBoZXJlZGFuIGxvcyBlc3TDoXRpY29zIGRlbCBjb25zdHJ1Y3RvciBiYXNlLlxyXG4gICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihDLCBCKTtcclxuXHJcbiAgICAgICAgLy8gU2UgZXh0cmFlbiBsb3MgZGVzY3JpcHRvcmVzIGRlbCBwcm90b3RpcG8sIGV4Y2x1eWVuZG8gXCJleHRlbmRzXCIgeSBcInN0eWxlc1wiLlxyXG4gICAgICAgIGNvbnN0IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyhwcm90byk7XHJcbiAgICAgICAgZGVsZXRlIGRlc2MuZXh0ZW5kcztcclxuICAgICAgICBkZWxldGUgZGVzYy5zdHlsZXM7XHJcblxyXG4gICAgICAgIC8vIFNlIGNyZWEgZWwgcHJvdG90aXBvIGRlbCBudWV2byBjbGlwIGEgcGFydGlyIGRlbCBwcm90b3RpcG8gYmFzZS5cclxuICAgICAgICBDLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoQi5wcm90b3R5cGUpO1xyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKEMucHJvdG90eXBlLCBkZXNjKTtcclxuXHJcbiAgICAgICAgLy8gU2UgZGVmaW5lIGxhIHByb3BpZWRhZCBcImNvbnN0cnVjdG9yXCIgbm8gZW51bWVyYWJsZS5cclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQy5wcm90b3R5cGUsICdjb25zdHJ1Y3RvcicsIHtcclxuICAgICAgICAgICAgdmFsdWU6IEMsXHJcbiAgICAgICAgICAgIHdyaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNlIGHDsWFkZSBsYSBwcm9waWVkYWQgXCJjbGlwTmFtZVwiIGFsIGNvbnN0cnVjdG9yIHkgZWwgbcOpdG9kbyBkZSBhY2Nlc28gcGFyYSBmYWNpbGl0YXIgZWwgYWNjZXNvIGRlc2RlIGxhcyBpbnN0YW5jaWFzLlxyXG4gICAgICAgIGNvbnN0IENMSVBfTkFNRSA9IFN5bWJvbCgnY2xpcHMubmFtZScpO1xyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShDLCBDTElQX05BTUUsIHtcclxuICAgICAgICAgICAgdmFsdWU6IG5hbWVcclxuICAgICAgICB9KTtcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQy5wcm90b3R5cGUsICdjbGlwTmFtZScsIHtcclxuICAgICAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uc3RydWN0b3JbQ0xJUF9OQU1FXTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZSBkZWZpbmUgbGEgcHJvcGllZGFkIFwiZGlzcGxheU5hbWVcIiBwYXJhIGRlcHVyYWNpw7NuLlxyXG4gICAgICAgIEMuZGlzcGxheU5hbWUgPSBuYW1lO1xyXG5cclxuICAgICAgICAvLyBTZSBhw7FhZGUgbGEgcmVmZXJlbmNpYSBhbCBwcm90b3RpcG8gYmFzZS5cclxuICAgICAgICBjb25zdCBCQVNFID0gU3ltYm9sKCdjbGlwcy5iYXNlJyk7XHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEMsIEJBU0UsIHtcclxuICAgICAgICAgICAgdmFsdWU6IEJcclxuICAgICAgICB9KTtcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQy5wcm90b3R5cGUsICdiYXNlUHJvdG90eXBlJywge1xyXG4gICAgICAgICAgICBnZXQoKSB7IHJldHVybiB0aGlzLmNvbnN0cnVjdG9yW0JBU0VdLnByb3RvdHlwZTsgfSxcclxuICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gU2UgZ3VhcmRhIGVsIGNvbnN0cnVjdG9yIHBvciBub21icmUuXHJcbiAgICAgICAgX2hhbmRsZXJzW25hbWVdID0gQztcclxuXHJcbiAgICAgICAgLy8gU2UgaW1wb3J0YW4gbGEgaG9qYSBkZSBlc3RpbG9zIGFzb2NpYWRhLlxyXG4gICAgICAgIF9pbXBvcnRDbGlwU3R5bGVzKG5hbWUsIHByb3RvLnN0eWxlcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2UgZGV2dWVsdmUgZWwgY29uc3RydWN0b3IgZGVsIG51ZXZvIGNsaXAuXHJcbiAgICAgICAgcmV0dXJuIEM7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYSB1bmEgbnVldmEgaW5zdGFuY2lhIGRlbCB0aXBvIGRlIGNsaXAgZXNwZWNpZmljYWRvIHBvciBub21icmUuXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBOb21icmUgZGVsIHRpcG8gZGUgY2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAgICAgKiBAcGFyYW0ge0NsaXBPcHRpb25zfSBbb3B0aW9uc10gT3BjaW9uZXMgZGUgY3JlYWNpw7NuIGRlbCBjbGlwLlxyXG4gICAgICogQHJldHVybiB7Q2xpcH0gSW5zdGFuY2lhIGRlbCBjbGlwIGNyZWFkYS5cclxuICAgICAqL1xyXG4gICAgY3JlYXRlOiBhc3luYyBmdW5jdGlvbihuYW1lLCBvcHRpb25zID0ge30pIHtcclxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgIShuYW1lID0gbmFtZS50cmltKCkpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgY2xpcCBuYW1lOiBub24tZW1wdHkgc3RyaW5nIHJlcXVpcmVkLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoIV9oYW5kbGVyc1tuYW1lXSkge1xyXG4gICAgICAgICAgICBhd2FpdCBfbG9hZEhhbmRsZXIobmFtZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGhhbmRsZXIgPSBfaGFuZGxlcnNbbmFtZV07XHJcbiAgICAgICAgaWYgKCFoYW5kbGVyKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBDbGlwRXJyb3IoYENsaXAgXCIke25hbWV9XCIgaXMgbm90IGRlZmluZWQuYCwge1xyXG4gICAgICAgICAgICAgICAgY29kZTogQ2xpcEVycm9yLk5PVF9ERUZJTkVEXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3IGhhbmRsZXIob3B0aW9ucyk7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVuZGVyaXphIGxhIHBsYW50aWxsYSBlc3BlY2lmaWNhZGEgcG9yIG5vbWJyZSBlbiBlbCBjb250ZXh0byBkZWwgY2xpcCBlc3BlY2lmaWNhZG8uXHJcbiAgICAgKiBAcGFyYW0ge0NsaXB9IGNsaXAgUmVmZXJlbmNpYSBhbCBjbGlwIGFjdHVhbC5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBvIHJ1dGEgZGUgbGEgcGxhbnRpbGxhIGEgcmVuZGVyaXphci5cclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3BjaW9uZXMgYWRpY2lvbmFsZXMgZGUgcmVuZGVyaXphZG8uXHJcbiAgICAgKiBAcmV0dXJuIHtEb2N1bWVudEZyYWdtZW50fSBGcmFnbWVudG8gZ2VuZXJhZG8uIFxyXG4gICAgICovXHJcbiAgICByZW5kZXI6IGFzeW5jIGZ1bmN0aW9uKGNsaXAsIG5hbWUsIG9wdGlvbnMpIHtcclxuICAgICAgICAvLyBTZSBjb21wcnVlYmEgc2kgbGEgZnVuY2nDs24gZGUgcGxhbnRpbGxhIGVzdMOhIGRlZmluaWRhLlxyXG4gICAgICAgIGxldCB0ZW1wbGF0ZUZuID0gX3RlbXBsYXRlc1tuYW1lXTtcclxuICAgICAgICBpZiAoIXRlbXBsYXRlRm4gJiYgIV9zZXR0aW5ncy50ZW1wbGF0ZXNCdW5kbGVkKSB7XHJcbiAgICAgICAgICAgIC8vIFNpIG5vIGV4aXN0ZSBsYSBwbGFudGlsbGEsIHkgbm8gc2UgaGFuIHByZS1lbXBhcXVldGFkbyBsYXMgcGxhbnRpbGxhcywgc2UgaW50ZW50YSBjYXJnYXIuXHJcbiAgICAgICAgICAgIHRlbXBsYXRlRm4gPSBhd2FpdCBfbG9hZFRlbXBsYXRlKG5hbWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoIXRlbXBsYXRlRm4pIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUZW1wbGF0ZSBcIiR7bmFtZX1cIiBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvKiogXHJcbiAgICAgICAgICogQnVmZmVyIGRlIHNhbGlkYS5cclxuICAgICAgICAgKiBAdHlwZSB7c3RyaW5nW119XHJcbiAgICAgICAgICovXHJcbiAgICAgICAgY29uc3Qgb3V0ID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgLyoqIFxyXG4gICAgICAgICAqIEluY2x1ZGVzIGHDsWFkaWRvcyBkdXJhbnRlIGxhIGVqZWN1Y2nDs24gZGUgbGEgcGxhbnRpbGxhLlxyXG4gICAgICAgICAqIENhZGEgZW50cmFkYSBjb250aWVuZSBlbCBub21icmUgeSBsYXMgb3BjaW9uZXMgZXNwZWNpZmljYWRhcy5cclxuICAgICAgICAgKiBAdHlwZSB7e25hbWU6IHN0cmluZywgb3B0aW9ucz86IGFueX1bXX1cclxuICAgICAgICAgKi9cclxuICAgICAgICBjb25zdCBpbmNsdWRlcyA9IFtdO1xyXG5cclxuICAgICAgICAvKiogXHJcbiAgICAgICAgICogQ29udGV4dG8gbG9jYWwgcGFzYWRvIGEgbGEgZnVuY2nDs24gZGUgcGxhbnRpbGxhLiBDb250aWVuZSBlbCBidWZmZXIgZGUgc2FsaWRhIHkgbGFzIHV0aWxpZGFkZXMgYsOhc2ljYXMgXHJcbiAgICAgICAgICogKGVzY2FwZSwgcHJpbnQsIGluY2x1ZGUuLi4pLlxyXG4gICAgICAgICAqIEB0eXBlIHt7XHJcbiAgICAgICAgICogIGVzY2FwZTogKHZhbHVlOiBhbnkpID0+IHN0cmluZyxcclxuICAgICAgICAgKiAgcHJpbnQ6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcclxuICAgICAgICAgKiAgcHJpbnRSYXc6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcclxuICAgICAgICAgKiAgaW5jbHVkZTogKG5hbWU6IHN0cmluZywgb3B0aW9ucz86IE9iamVjdCkgPT4gdm9pZFxyXG4gICAgICAgICAqIH19XHJcbiAgICAgICAgICovXHJcbiAgICAgICAgY29uc3QgbG9jYWxzID0ge1xyXG4gICAgICAgICAgICBvcHRpb25zLCAvLyBUT0RPOiBFdmFsdWFyIHNpIGRlZmluaXIgc29sbyBcImRhdGFcIiBvIHF1ZSBoYWNlcj9cclxuICAgICAgICAgICAgZXNjYXBlOiBlc2MuaHRtbCxcclxuICAgICAgICAgICAgcHJpbnQ6ICguLi5hcmdzKSA9PiBvdXQucHVzaCguLi5hcmdzLm1hcCh2ID0+IGVzYy5odG1sKFN0cmluZyh2KSkpKSxcclxuICAgICAgICAgICAgcHJpbnRSYXc6ICguLi5hcmdzKSA9PiBvdXQucHVzaCguLi5hcmdzLm1hcCh2ID0+IFN0cmluZyh2KSkpLFxyXG4gICAgICAgICAgICBpbmNsdWRlOiBmdW5jdGlvbihuYW1lLCBvcHRpb25zID0ge30pIHtcclxuICAgICAgICAgICAgICAgIGluY2x1ZGVzLnB1c2goeyBuYW1lLCBvcHRpb25zIH0pO1xyXG4gICAgICAgICAgICAgICAgb3V0LnB1c2goJzxjbGlwLXNsb3Q+PC9jbGlwLXNsb3Q+Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBTZSBlamVjdXRhIGxhIHBsYW50aWxsYSBjb24gZWwgY29udGV4dG8gYW50ZXJpb3IuXHJcbiAgICAgICAgdGVtcGxhdGVGbi5jYWxsKGNsaXAsIG91dCwgbG9jYWxzKTtcclxuXHJcbiAgICAgICAgLy8gU2UgY3JlYSB1biBlbGVtZW50byBcInRlbXBsYXRlXCIgcGFyYSBwYXJzZWFyIGVsIGPDs2RpZ28gSFRNTCBnZW5lcmFkby5cclxuICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RlbXBsYXRlJyk7XHJcbiAgICAgICAgdGVtcGxhdGUuaW5uZXJIVE1MID0gb3V0LmpvaW4oJycpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJlc29sdmVtb3MgbGFzIGluY2x1c2lvbmVzIGHDsWFkaWRhcy5cclxuICAgICAgICBjb25zdCBzbG90cyA9IHRlbXBsYXRlLmNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnY2xpcC1zbG90Jyk7XHJcbiAgICAgICAgaWYgKHNsb3RzLmxlbmd0aCAhPT0gaW5jbHVkZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW5jbHVkZXMgbWlzbWF0Y2g6ICR7c2xvdHMubGVuZ3RofSB2cyAke2luY2x1ZGVzLmxlbmd0aH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGMsIGZyYWdtZW50OyBpIDwgaW5jbHVkZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKGluY2x1ZGVzW2ldLm5hbWUuc3RhcnRzV2l0aChDTElQX1BSRUZJWCkpIHtcclxuICAgICAgICAgICAgICAgIGMgPSBhd2FpdCBjbGlwcy5jcmVhdGUoaW5jbHVkZXNbaV0ubmFtZS5zdWJzdHJpbmcoQ0xJUF9QUkVGSVgubGVuZ3RoKSwgaW5jbHVkZXNbaV0ub3B0aW9ucyk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjLmluY2x1ZGUoc2xvdHNbaV0sIHsgLi4uaW5jbHVkZXNbaV0ub3B0aW9ucywgcG9zaXRpb246IENsaXAuUG9zaXRpb24uUkVQTEFDRSwgcGFyZW50Q2xpcDogY2xpcCB9KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZyYWdtZW50ID0gYXdhaXQgY2xpcHMucmVuZGVyKGNsaXAsIGluY2x1ZGVzW2ldLm5hbWUsIGluY2x1ZGVzW2ldLm9wdGlvbnMpO1xyXG4gICAgICAgICAgICBzbG90c1tpXS5yZXBsYWNlV2l0aChmcmFnbWVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZSBkZXZ1ZWx2ZSBlbCBjb250ZW5pZG8gZ2VuZXJhZG8uXHJcbiAgICAgICAgcmV0dXJuIHRlbXBsYXRlLmNvbnRlbnQ7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5jbHV5ZSB1biBjbGlwIG8gdW5hIHBsYW50aWxsYSBlbiBlbCBlbGVtZW50byBvIHNlbGVjdG9yIGVzcGVjaWZpY2Fkby5cclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIE5vbWJyZSBkZWwgY2xpcCBvIHBsYW50aWxsYSBlc3BlY2lmaWNhZG8uXHJcbiAgICAgKiBAcGFyYW0ge0VsZW1lbnR9IHRhcmdldCBFbGVtZW50byBlc3BlY2lmaWNhZG8uIFxyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcGNpb25lcyBhZGljaW9uYWxlcy5cclxuICAgICAqIEBzZWUgQ2xpcCNjcmVhdGVcclxuICAgICAqIEBzZWUgQ2xpcCNpbmNsdWRlXHJcbiAgICAgKi9cclxuICAgIGluY2x1ZGU6IGFzeW5jIGZ1bmN0aW9uKG5hbWUsIHRhcmdldCwgb3B0aW9ucykge1xyXG4gICAgICAgIHJldHVybiAoYXdhaXQgdGhpcy5jcmVhdGUobmFtZSwgb3B0aW9ucykpLmluY2x1ZGUodGFyZ2V0LCBvcHRpb25zKTsgXHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogRGV2dWVsdmUgZWwgY2xpcCBhc29jaWFkbyBjb24gZWwgZWxlbWVudG8gZXNwZWNpZmljYWRvLlxyXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudHxzdHJpbmd9IGVsIEVsZW1lbnRvIG8gc2VsZWN0b3IuXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW3NlbGVjdG9yXSBTZWxlY3RvciBhZGljaW9uYWwgZGVudHJvIGRlbCBlbGVtZW50byBlc3BlY2lmaWNhZG8uXHJcbiAgICAgKiBAcmV0dXJucyB7Q2xpcHxudWxsfSBDbGlwIG8gbnVsbyBzaSBubyBzZSBlbmN1ZW50cmEuXHJcbiAgICAgKi9cclxuICAgIGZpbmQ6IGZ1bmN0aW9uKGVsLCBzZWxlY3Rvcikge1xyXG4gICAgICAgIGlmICh0eXBlb2YgZWwgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlbCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChlbCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgc2VsZWN0b3IpIHtcclxuICAgICAgICAgICAgZWwgPSBlbC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIChlbCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgX2VsZW1lbnRDbGlwcy5nZXQoZWwpKSB8fCBudWxsO1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEZpamEgbGEgcnV0YSBiYXNlIGRlIGRvbmRlIGNhcmdhciBsb3MgY2xpcHMuXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcGF0aCBSdXRhIGVzcGVjaWZpY2FkYS5cclxuICAgICAqL1xyXG4gICAgYmFzZVBhdGg6IGZ1bmN0aW9uKHBhdGgpIHtcclxuICAgICAgICBpZiAodHlwZW9mIHBhdGggPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIHBhdGggPSBwYXRoLnRyaW0oKS5yZXBsYWNlKC9cXC8kLywgJycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBfc2V0dGluZ3MuYmFzZVBhdGggPSBwYXRoO1xyXG4gICAgfVxyXG5cclxufTtcclxuXHJcblxyXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuLy8gU2UgZXhwb25lIGdsb2JhbG1lbnRlIGNvbW8gcHJvcGllZGFkIGRlIHdpbmRvdy5cclxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgd2luZG93LmNsaXBzID0gY2xpcHM7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsaXBzO1xyXG4iLCJpbXBvcnQgY2xpcHMgZnJvbSAnLi4vY2xpcHMuanMnO1xyXG5cclxuLyoqXHJcbiAqIFRpcG8gZGUgY2xpcCBiYXNlIHBhcmEgbGEgZGVmaW5pY2nDs24gZGUgdmlzdGFzIHF1ZSBzZSBwdWVkZW4gYWJyaXIgZGVudHJvIGRlIHVuIHZpZXdwb3J0LlxyXG4gKiBAY2xhc3MgVmlld0NsaXBcclxuICovXHJcbmNsaXBzLmRlZmluZSgndmlldycsIHtcclxuXHJcbiAgICAvKiogQHNlZSBDbGlwI2NyZWF0ZSAqL1xyXG4gICAgY3JlYXRlOiBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAgICAgLy8gLi4uXHJcbiAgICB9LFxyXG5cclxuICAgIC8qKiBAdHlwZSB7c3RyaW5nfSAqL1xyXG4gICAgc3R5bGVzOiAvKmNzcyovYFxyXG4gICAgICAgIC52aWV3IHtcclxuICAgICAgICAgICAgZGlzcGxheTogYmxvY2s7XHJcbiAgICAgICAgfVxyXG4gICAgYFxyXG5cclxufSk7XHJcblxyXG4vKipcclxuICogTm9kbyBkZSBydXRhLlxyXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBWaWV3cG9ydFJvdXRlTm9kZVxyXG4gKiBAcHJvcGVydHkge3N0cmluZ30gcGF0aFxyXG4gKiBAcHJvcGVydHkge3N0cmluZ30gdmlld1xyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBDbGlwIGVzcGVjaWFsaXphZG8gZW4gbGEgZ2VzdGnDs24gZGUgcnV0YXMgeSB2aXN0YXMuIFBlcm1pdGUgZGVmaW5pciB1biBjb25qdW50byBkZSBydXRhcyBhc29jaWFkYXMgYSB2aXN0YXMgeSBcclxuICogYWJyaXJsYXMgZGluw6FtaWNhbWVudGUuIEVzIGVzcGVjaWFsbWVudGUgw7p0aWwgcGFyYSBsYSBnZXN0acOzbiBkZSB2aXN0YXMgZW4gYXBsaWNhY2lvbmVzIFNQQS5cclxuICogQGNsYXNzIFZpZXdwb3J0Q2xpcFxyXG4gKiBAZXh0ZW5kcyBWaWV3Q2xpcFxyXG4gKi9cclxuY2xpcHMuZGVmaW5lKCd2aWV3cG9ydCcsIHtcclxuXHJcbiAgICAvKiogQHR5cGUge3N0cmluZ30gKi9cclxuICAgIGV4dGVuZHM6ICd2aWV3JyxcclxuXHJcbiAgICAvKiogQHNlZSBDbGlwI2NyZWF0ZSAqL1xyXG4gICAgY3JlYXRlOiBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAgICAgdGhpcy5iYXNlUHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiBNYXBlbyBkZSBydXRhcy5cclxuICAgICAgICAgKiBAdHlwZSB7Vmlld3BvcnRSb3V0ZU5vZGVbXX1cclxuICAgICAgICAgKi9cclxuICAgICAgICB0aGlzLnJvdXRlcyA9IG9wdGlvbnMucm91dGVzIHx8IFtdO1xyXG4gICAgfSxcclxuXHJcbiAgICAvKiogQHNlZSBDbGlwI3JlbmRlciAqL1xyXG4gICAgcmVuZGVyOiBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAgICAgcmV0dXJuIC8qaHRtbCovYFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwidmlld3BvcnRcIj48L2Rpdj5cclxuICAgICAgICBgO1xyXG4gICAgfSxcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLyoqXHJcbiAgICAgKiBBYnJlIGxhIHJ1dGEgZXNwZWNpZmljYWRhLlxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHBhdGggUnV0YSBhIGFicmlyLlxyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcGNpb25lcyBhZGljaW9uYWxlcy5cclxuICAgICAqIEByZXR1cm4ge1Byb21pc2U8Q2xpcD59IENsaXAgZGUgbGEgcnV0YSBhYmllcnRhLlxyXG4gICAgICogQHRocm93cyB7RXJyb3J9IFNpIG5vIHNlIGVuY3VlbnRyYSBsYSBydXRhIGVzcGVjaWZpY2FkYS5cclxuICAgICAqL1xyXG4gICAgb3BlbjogYXN5bmMgZnVuY3Rpb24ocGF0aCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICAgICAgY29uc3Qgcm91dGUgPSB0aGlzLnJvdXRlcy5maW5kKHIgPT4gci5wYXRoID09PSBwYXRoKTtcclxuICAgICAgICBpZiAoIXJvdXRlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUm91dGUgbm90IGZvdW5kOiAke3BhdGh9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjbGlwcy5pbmNsdWRlKHJvdXRlLnZpZXcsIHRoaXMucm9vdCwgeyBwYXJlbnRDbGlwOiB0aGlzLCAuLi5vcHRpb25zIH0pO1xyXG4gICAgfSxcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLyoqIFxyXG4gICAgICogQ2xpcCBzdHlsZXMuXHJcbiAgICAgKiBAdHlwZSB7c3RyaW5nfVxyXG4gICAgICovXHJcbiAgICBzdHlsZXM6IC8qY3NzKi9gXHJcbiAgICAgICAgLnZpZXdwb3J0IHtcclxuICAgICAgICAgICAgZGlzcGxheTogYmxvY2s7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgdG9wOiAwO1xyXG4gICAgICAgICAgICBsZWZ0OiAwO1xyXG4gICAgICAgICAgICB3aWR0aDogMTAwJTtcclxuICAgICAgICAgICAgaGVpZ2h0OiAxMDAlO1xyXG5cclxuICAgICAgICAgICAgPiAudmlldyB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBibG9jaztcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgICAgIHRvcDogMDtcclxuICAgICAgICAgICAgICAgIGxlZnQ6IDA7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogMTAwJTtcclxuICAgICAgICAgICAgICAgIGhlaWdodDogMTAwJTtcclxuICAgICAgICAgICAgICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICBgXHJcblxyXG59KTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9OyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxNQUFNLFlBQVksR0FBRztBQUNyQixJQUFJLEdBQUcsRUFBRSxPQUFPO0FBQ2hCLElBQUksR0FBRyxFQUFFLE1BQU07QUFDZixJQUFJLEdBQUcsRUFBRSxNQUFNO0FBQ2YsSUFBSSxHQUFHLEVBQUUsUUFBUTtBQUNqQixJQUFJLEdBQUcsRUFBRSxPQUFPO0FBQ2hCLENBQUMsQ0FBQztBQUNGO0FBQ0EsVUFBZTtBQUNmO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxLQUFLLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN4RTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDLENBQUM7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzdDO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsU0FBUyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDaEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxTQUFTLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM3QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxTQUFTLElBQUksRUFBRTtBQUM1QyxJQUFJLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUMxQixRQUFRLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNDLElBQUksQ0FBQztBQUNMLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0IsSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztBQUM1QixDQUFDLENBQUM7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxTQUFTLElBQUksRUFBRTtBQUM1QyxJQUFJLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDdkMsUUFBUSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztBQUNoQyxJQUFJLENBQUM7QUFDTCxDQUFDLENBQUM7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLFdBQVc7QUFDdEMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLElBQUksQ0FB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
