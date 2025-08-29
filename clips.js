/**
 * @typedef {Object} ClipOptions
 * @property {Clip} [parentClip=null] Referencia al Clip padre.
 * ...
 */

/**
 * Tipo Clip.
 * @param {ClipOptions} [options] Opciones de creación de clips.
 * @constructor
 */
function Clip(options = {}) {
    this.root = null;
    this.parentClip = options.parentClip || null;
    this.childClips = [];
    this.loadTime = 0;
    this.eventListeners = {};
    this.create(options);
}

/**
 * Diferentes posiciones en las que incluir un clip en el DOM con respecto al elemento objetivo.
 * @readonly
 * @enum {string}
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
Clip.defaultTemplateName = 'layout';

/**
 * Función de creación de nuevas instancias.
 * @param {ClipOptions} options Opciones de creación.
 */
Clip.prototype.create = function(options = {}) {};

/**
 * Función para incluir el clip con respecto al elemento (target) especificado.
 * @param {Element} target Elemento especificado.
 * @param {Object} [options] Opciones de inclusión.
 * @param {Clip.Position} [options.position=Clip.Position.END] Posición de inclusión del clip con respecto al elemento (target) 
 * especificado. 
 */
Clip.prototype.include = async function(target, options = {}) {
    if (!(target instanceof Element)) {
        throw new TypeError('Invalid target: must be an Element.');
    }
    // Se comprueba si ya se ha generado la raíz del clip.
    if (!this.root) {
        await this.render();
    }
    // Se comprueba que el nodo generado sea un elemento.
    if (!this.root || !(this.root instanceof Element)) {
        throw new Error(`Invalid clip root: must be an Element.`);
    }
    // Se inserta el elemento en la posición especificada.
    const position = options.position || Clip.Position.END; 
    switch (position) {
        case Clip.Position.AFTER:
            target.after(this.root);
            break;
        case Clip.Position.BEFORE:
            target.before(this.root);
        break;
        case Clip.Position.REPLACE:
            target.replaceWith(this.root)
            break;
        case Clip.Position.START:
            target.prepend(this.root);
            break;
        case Clip.Position.END:
            target.append(this.root);
            break;
        default:
            throw new RangeError(`Invalid position: ${position}.`);
    }
};

/**
 * Renderiza el clip.
 * @param {Object} [options] Opciones adicionales de renderizado.
 * @return {Element} Devuelve el elemento raíz.
 */
Clip.prototype.render = async function(options) {
    return this.root = await clips.render(`${this.clipName}/${this.defaultClipName}`, options);
};

/**
 * ...
 */
Clip.prototype.load = async function(options) {};

/**
 * ...
 */
Clip.prototype.ready = function(options) {};

/**
 * ...
 */
Clip.prototype.update = function(options) {};

/**
 * ...
 */
Clip.prototype.reload = function(options) {};

/**
 * ...
 */
Clip.prototype.clear = function(options) {};

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
 * ...
 */
Clip.prototype.destroy = function(options) {};

/**
 * ...
 */
Clip.prototype.appendClip = function(options) {};

/**
 * ...
 */
Clip.prototype.removeClip = function(options) {};

/**
 * ...
 */
Clip.prototype.clearAll = function(options) {};

/**
 * ...
 */
Clip.prototype.destroy = function(options) {};


// Scroll
Clip.prototype.saveScroll = function() {};

Clip.prototype.restoreScroll = function() {};

// Events
Clip.prototype.addEventListener = Clip.prototype.on = function(name, listener) {};

Clip.prototype.removeEventListener = Clip.prototype.off = function(name, listener) {};

Clip.prototype.fire = Clip.prototype.dispatchEvent = function(event, spread) {};




// ---------------------------------------------------------------------------------------------------
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
 * Ruta base de donde cargar los clips.
 * @type {string}
 */
let _basePath = '/clips';

/**
 * Manejadores de Clips definidos.
 * @type {Object.<string, Clip>}
 */
const _handlers = Object.create(null);

/**
 * Funciones de plantilla añadidas.
 * @type {Object.<string, (...) => HTMLElement}
 */
const _templates = Object.create(null);

/**
 * Carga la plantilla especificada.
 * @param {string} Nombre o ruta de la plantilla especificada.
 * @return {Function} Función de la plantilla cargada.
 */
const _loadTemplate = async function(name) {
    const path = `${_basePath}/${name}.ejs`;
    const res = await fetch(path, { cache: "no-store" }); // evita cache en dev
    if (!res.ok) {
        throw new Error(`Unable to load template: ${path} (${res.status})`);
    }
    return _templates[name] = _compileTemplate(await res.text());
}

const _escLit = (str) => str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\r/g, "\\r");

const _ejsTagsRE = /<%[-=]?[\s\S]*?%>/g;

const _esc = (x) => String(x)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");

/**
 * ...
 */
const _compileTemplate = async function(src) {
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
 * Librería clips.
 * @namespace
 */
const clips = {    
    
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
            const url = `${_basePath}/${name}/handler.js`;
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
     * Renderiza la plantilla especificada por nombre.
     * @param {string} name Nombre o ruta de la plantilla a renderizar.
     * @param {Object} options Opciones adicionales de renderizado.
     * @return {DocumentFragment} Fragmento generado. 
     */
    render: async function(name, options) {
        let templateFunc = _templates[name];
        if (!templateFunc) {
            templateFunc = await _loadTemplate(name);
        }
        // Se ejecuta la plantilla.
        const includes = [];
        const locals = {
            out: [],
            escape: _esc,
            print: (...args) => locals.out.push(...args.map(_esc)),
            printRaw: (...args) => locals.out.push(...args.map(String)),
            include: function(name, options = {}) {
                includes.push({
                    name, options
                });
                locals.out.push(`<clip-slot/>`);
            }            
        };
        templateFunc(locals);

        // Se crea un elemento "template" para añadir el código HTML.
        const template = document.createElement('template');
        template.innerHTML = locals.out.join('');
        
        // Resolvemos los includes añadidos.
        const slots = template.content.querySelectorAll('clip-slot');
        if (slots.length !== includes.length) {
            throw new Error(`Includes mismatch: ${slots.length} vs ${includes.length}`);
        }
        for (let i = 0, c, fragment; i < includes.length; i++) {
            if (includes[i].name.startsWith(CLIP_PREFIX)) {
                c = await clips.create(includes[i].name.substring(CLIP_PREFIX.length), includes[i].options);
                await c.include(slots[i], { ...includes[i].options, position: Clip.Position.REPLACE });
                continue;
            }
            fragment = await clips.render(includes[i].name, includes[i].options);
            slots[i].replaceWith(fragment);
        }

        // Se devuelve el contenido generado.
        return template.content;
    },

    /**
     * Fija la ruta base de donde cargar los clips.
     * @param {string} path Ruta especificada.
     */
    basePath: function(path) {
        if (typeof path === 'string') {
            path = path.trim().replace(/\/$/, '');
        }
        _basePath = path;
    }

};

export default clips;
