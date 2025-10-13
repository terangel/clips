


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


    // Se definen los accesores de las propiedades anteriores.
    Object.defineProperties(this, {
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

    // Se llama a la función create.
    this.create(options);
}


/* Constants of Clip
 * ------------------------------------------------------------------------------------------------------------------ */
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
 * Nombre de plantilla por defecto.
 * @type {string}
 * @constant
 */
Clip.prototype.defaultTemplateName = 'layout';
// TODO: Porqué no definirla a nivel de Clip?

/**
 * Nombre de hoja de estilos por defecto.
 * @type {string}
 * @constant
 */
Clip.prototype.defaultStylesName = 'styles';
// TODO: Porqué no definirla a nivel de Clip?


/* Prototype functions
 * ------------------------------------------------------------------------------------------------------------------ */
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
 * @param {Clip.Position} [options.position=Clip.Position.END] Posición de inclusión del clip con respecto al elemento (target) 
 * especificado. 
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
    return clips.render(this, `${this.clipName}/${this.defaultTemplateName}`, options);
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
        throw new ClipError('No root element', ClipError.ROOT_REQUIRED);
    }
    const root = this.render();
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
 * ------------------------------------------------------------------------------------------------------------------ */
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
 * @param {string} message
 * @param {string} [code]
 */
function ClipError(message, code) {
  this.name = 'ClipError';
  this.message = message;
  this.code = code;
  Error.captureStackTrace ? Error.captureStackTrace(this, ClipError) : this.stack = (new Error(message)).stack;
}
ClipError.prototype = Object.create(Error.prototype);
ClipError.prototype.constructor = ClipError;

// Códigos de error.
ClipError.ROOT_REQUIRED = 'root_required';


/* Template functions 
 * ================================================================================================================== */
/**
 * Expresión regular para detectar las etiquetas EJS.
 * @type {RegExp}
 * @constant
 * @private
 */
const _ejsTagsRE = /<%[-=]?[\s\S]*?%>/g;

/**
 * Escapa los caracteres especiales en HTML.
 * @param {*} x Valor especificado. 
 * @returns {string} Cadena escapada.
 * @private
 */
const _esc = (x) => String(x)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");

/**
 * Escapa los caracteres especiales en literales de plantilla.
 * @param {string} str Cadena especificada. 
 * @returns {string} Cadena escapada.
 * @private
 */
const _escLit = (str) => str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\r/g, "\\r");

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
    return _templates[name] = _compileTemplate(await res.text());
}

/**
 * Compila el código fuente de una plantilla EJS.
 * @param {string} src Código fuente de la plantilla.
 * @returns {Function} Función de plantilla compilada.
 * @private
 */
const _compileTemplate = function(src) {
    let offset = 0, match;
    let body = '';
    const addText = (text) => { if (text) body += `out.push(\`${_escLit(text)}\`);`; };
    while ((match = _ejsTagsRE.exec(src)) !== null) {
      addText(src.slice(offset, match.index));
      offset = match.index + match[0].length;

      const mark = match[0][2]; // '%', '=', '-'
      const code = match[0].slice(2 + (mark === '=' || mark === '-' ? 1 : 0), -2).trim();

      if (mark === '=') {
        body += `out.push(escape((${code}))); \n`;
      } else if (mark === '-') {
        body += `out.push(String((${code}))); \n`;
      } else {
        body += code + '\n';
      }
    }
    addText(src.slice(offset));
    return new Function('locals', `with (locals) { ${body} }`);
}

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
 * @param {typeof Clip} clipDef Definición del clipClip definido. 
 */
const _importClipStyles = async function(clipDef) {
    // Los estilos se pueden definir como propiedad o como función.
    let styles = clipDef.prototype.styles;
    if (typeof styles === 'function') {
        styles = styles();
    }
    // Si se definen como elemento de tipo <style>, se añaden directamente al head.
    if (styles instanceof HTMLStyleElement) {
        document.head.appendChild(styles);
        return;
    }
    // Si se definen los estilos como CSSStyleSheet, se añaden a las hojas de estilo adoptadas.
    if (styles instanceof CSSStyleSheet) {
        document.adoptedStyleSheets = [
            ...document.adoptedStyleSheets,
            styles
        ];
        return;
    }
    // Si el clip no define estilos en código y no están empaquetados, se intenta cargar la hoja de estilos por defecto 
    // ubicada en la misma localización que el clip.
    if (!styles && !_settings.stylesBundled) {
        try {
            styles = await _loadStyles(`${clipDef.prototype.clipName}/${clipDef.prototype.defaultStylesName}`);        
        } catch (err) {
            // Se ignoran los errores de carga.
            if (_settings.debug) {
                console.warn(`Unable to load styles for clip "${clipDef.prototype.clipName}":`, err);
            }
        }
    }
    // Finalmente, si se han definido estilos, se importan.
    if (typeof styles === 'string' && (styles = styles.trim())) {
        if (!_styleElement) {
            _styleElement = document.createElement('style');
            _styleElement.id = 'clips-styles';
            _styleElement.setAttribute('data-source', 'clips');
            document.head.appendChild(_styleElement);
        }
        _styleElement.textContent += `\n/* ${clipDef.prototype.clipName} */\n${styles}\n`;
    }
};

/**
 * Carga la hoja de estilos vinculada por nombre y localización con el clip especificado.
 * @param {typeof Clip} clipType Referencia al tipo de clip especificado.
 */
const _loadStyles = async function(name) {
    const res = await fetch(`${_settings.basePath}/${name}.css`, {
        // TODO: Evita cache solo en debug?
        cache: "no-store"
    });
    if (!res.ok) {
        throw new Error(`Unable to load styles: ${path} (${res.status})`);
    }
    return await res.text();
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
     * @param {string|Object} [base] Nombre del clip base o prototipo del nuevo clip.
     * @param {Object} proto Prototipo del clip.
     * @return {new (options: ClipOptions) => Clip} Constructor del nuevo tipo de clip.
     */
    define: function(name, base, proto) {
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
            throw new TypeError('Invalid clip name: expected path-like without leading/trailing slash, e.g. "home" or "user/profile".');
        }
        if (_handlers[name]) {
            throw new Error(`Duplicate clip: ${name}`);
        }

        // Nombre del tipo de clip base.
        if (typeof base === 'object' && base !== null) {
            proto = base;
            base = null;
        } else if (typeof base === 'string') {
            base = base.trim();
            if (!base) {
                throw new TypeError(`Invalid base name: empty string.`);
            }
            if (!_handlers[base]) {
                throw new ReferenceError(`Base clip "${base}" not defined.`);
            }
        } else {
            throw new TypeError('Invalid base: string or object required.');
        }

        // Objeto prototipo.
        if (proto === null || typeof proto !== 'object' || Object.getPrototypeOf(proto) !== Object.prototype) {
            throw new TypeError('Invalid proto object: plain object required.');
        }

        // Se determina el constructor base si se ha especificado.
        const B = base ? _handlers[base] : Clip;

        // Se crea la función constructora del nuevo clip.
        const C = function(options) {
            B.call(this, options);
        };

        // Se heredan los estáticos del constructor base.
        Object.setPrototypeOf(C, B);

        // Se crea el prototipo del nuevo clip a partir del prototipo base.
        C.prototype = Object.create(B.prototype);
        Object.defineProperties(C.prototype, Object.getOwnPropertyDescriptors(proto));

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
            get() { return this.constructor[BASE]?.prototype ?? null; },
            enumerable: false
        });

        // Se importan los estilos definidos por el clip.
        _importClipStyles(C);

        // Se devuelve el constructor del nuevo clip.
        return _handlers[name] = C;
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
            const url = `${_settings.basePath}/${name}/handler.js`;
            try {
                await import(url);
            } catch (err) {
                throw new ReferenceError(`Clip "${name}" could not be loaded from ${url}.`, {
                    cause: err
                });
            }
        }
        const handler = _handlers[name];
        if (!handler) {
            throw new ReferenceError(`Clip "${name}" is not defined.`);
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
         * Includes añadidos durante la ejecución de la plantilla.
         * Cada entrada contiene el nombre y las opciones especificadas.
         * @type {{name: string, options?: any}[]}
         */
        const includes = [];

        /** 
         * Contexto local pasado a la función de plantilla. Contiene el buffer de salida y las utilidades básicas 
         * (escape, print, include...).
         * @type {{
         *  out: string[],
         *  escape: (value: any) => string,
         *  print: (...args: any[]) => void,
         *  printRaw: (...args: any[]) => void,
         *  include: (name: string, options?: Object) => void
         * }}
         */
        const locals = {
            out: [],
            escape: _esc,
            print: (...args) => locals.out.push(...args.map(v => _esc(String(v)))),
            printRaw: (...args) => locals.out.push(...args.map(v => String(v))),
            include: function(name, options = {}) {
                includes.push({ name, options });
                locals.out.push('<clip-slot></clip-slot>');
            }
        };

        // Se ejecuta la plantilla con el contexto anterior.
        templateFn.call(clip, locals);

        // Se crea un elemento "template" para parsear el código HTML generado.
        const template = document.createElement('template');
        template.innerHTML = locals.out.join('');
        
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


// Se expone globalmente como propiedad de window.
if (typeof window !== 'undefined') {
  window.clips = clips;
}

export default clips;
