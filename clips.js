export class Clip extends EventTarget {

    static clipName

    #root = null

    #parentClip = null

    #childClips = new Set()

    #loadTime = 0

    constructor(options = {}) {
        super()
    }

    get root() {
        return this.#root
    }

    get parentClip() {
        return this.#parentClip
    }

    get childClips() {
        return [...this.#childClips]
    }

    get childCount() {
        return this.#childClips.size
    }

    appendClip(clip) {
        if (clip.#parentClip) {
            clip.#parentClip.removeClip(clip)
        }
        this.#childClips.add(clip)
        clip.#parentClip = this
    }

    removeClip(clip) {
        if (this.#childClips.delete(clip)) {
            clip.#parentClip = null
        }
    }

    /**
     * TODO: Descripción del método.
     * @param {HTMLElement} target 
     * @param {*} [options]
     * @param {clips.Position} [position=clips.Position.end]
     * @returns {}
     */
    async include(target, options = {}) {
        // Se comprueba que el target sea de tipo Element.
        if (!target || target.nodeType !== Node.ELEMENT_NODE) {
            throw new TypeError('Invalid target: must be an Element.')
        }
        // Si todavía no se ha generado el elemento raíz se llama al render.
        if (!this.root) {
            let out;
            try {
                out = await this.render(options);
            } catch (err) {
                throw new Error(`Unable to render clip "${this.clipName}": ${err.message}`, {
                    cause: err
                });
            }

            if (out?.nodeType === Node.ELEMENT_NODE) {
                this.root = out;
            } else {
                let root;
                if (typeof out === 'string') {
                    const template = document.createElement('template')
                    template.innerHTML = out
                    out = template.content
                }
                if (out?.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    for (let n = out.firstChild; n; n = n.nextSibling) {
                        if (n.nodeType === Node.ELEMENT_NODE) {
                            if (root) {
                                throw new Error('Multiple root elements are not allowed.')
                            }
                            root = n
                        } else if (n.nodeType === Node.TEXT_NODE) {
                            if (!WS_RE.test(n.data)) {
                                throw new Error('Text outside the root element is not allowed.')
                            }
                        } else if (n.nodeType !== Node.COMMENT_NODE) {
                            throw new Error(`Unsupported node type (${n.nodeType}) outside the root element.`)
                        }
                    }
                }
                if (!root) {
                    throw new Error(`Missing clip root. Ensure render() returns an Element, or a DocumentFragment/HTML string with a single-root Element.`)
                }
                this.root = root
            }

            // Se guarda la vinculación del clip con su elemento raíz.
            _elementClips.set(this.root, this)

            // Se guarda como propiedad del elemento para mejorar la visibilidad en depuración.
            Object.defineProperty(this.root, '__clip', {
                value: this,
                writable: false,
                configurable: true
            })
        }

        // TODO: Añadir propiedades de estilo adicionales (options.style) y clases (options.class).

        // TODO: Evaluar si incluir el parámetro hide o hidden para ocultar el elemento inicialmente.

        // Se inserta el elemento en la posición especificada.
        const position = options.position ?? Clip.Position.end
        switch (position) {
            case Clip.Position.after:
                target.after(this._root)
                break;
            case Clip.Position.before:
                target.before(this._root)
            break;
            case Clip.Position.replace:
                if (this._root.contains(target)) {
                    target.before(this._root)
                    target.remove()
                } else {
                    target.replaceWith(this._root)
                }
                break;
            case Clip.Position.start:
                target.prepend(this._root)
                break;
            case Clip.Position.end:
                target.append(this._root)
                break;
            default:
                throw new RangeError(`Invalid position: ${position}.`)
        }

        // Se añade al clip padre o contenedor. Si no se especifica, se busca en los elementos ascendientes.
        (options.parentClip || _closestClip(this._root))?._appendClip(this)

        // Llamada al método ready.
        this.ready(options)

        // Se evalua si emitir el evento "attach".
        // window.cancelAnimationFrame(this._attachReq)
        // if (this.root.isConnected) {
        //     const parent = this.root.parentNode
        //     this._attachReq = window.requestAnimationFrame(() => {
        //         if (!this.root || !this.root.isConnected || this.root.parentNode !== parent) {
        //             return
        //         }
        //         _reflow(this.root)
        //         this._attachReq = window.requestAnimationFrame(() => {
        //             if (!this.root || !this.root.isConnected || this.root.parentNode !== parent) {
        //                 return
        //             }
        //             this.fire('attach', true)
        //             // TODO: Al propagar el evento habría que asegurarse que los clips contenidos siguen enganchados, si no 
        //             // habría que evitar la emisión del evento. En principio si el elemento se ha desenganchado del elemento
        //             // padre, la vinculación entre clips no debería existir tampoco de forma que el evento no se propagaría,
        //             // pero es importante tenerlo en cuenta.
        //         });
        //     });
        // }

        // Se inicia la carga de datos adicionales.
        this.#load(options);

        // Se devuelve la instancia del propio clip.
        return this;
    }

    async render(options = {}) {}

    ready(options = {}) {}

    async #load(options = {}) {
        const data = await this.load(options)
        this.#loadTime = Date.now()
        return this.update(data === undefined ? options : { ...options, data })
    }

    async load(options = {}) {}

    async update(options = {}) {}

    get clipName() {
        return this.constructor.clipName
    }

}

/**
 * Posiciones donde se puede incluir un clip con respecto al elemento objetivo (target).
 * @enum {string}
 * @constant
 */
Clip.Position = Object.freeze({
    start:      'start',
    end:        'end',
    before:     'before',
    after:      'after',
    replace:    'replace'
})


// =====================================================================================================================
/**
 * Formato del nombre de los clips (path-like), uno o varios segmentos separados 
 * por "/", cada segmento: [A-Za-z0-9_-]+
 * @type {RegExp}
 * @constant
 */ 
const clipNameRegexp = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

/**
 * Longitud máxima permitida para los nombres de clip.
 * @type {number}
 * @constant
 */
const clipNameMaxLength = 256;

/**
 * Prefijo para especificar referencias a clips en inclusiones.
 * @type {string}
 * @constant
 */
const clipPrefix = 'clip:';

/**
 * Expresión para verificar si una cadena solo contiene espacios.
 * @type {RegExp}
 * @constant  
 */
const whitespaceRegexp = /^\s*$/;




/**
 * Ajustes de configuración.
 * @type {Object}
 * @private
 * @constant
 */
const _settings = {

    /**
     * Indica si activar el modo de depuración.
     * @type {boolean}
     * @default false
     */
    debug: false,

    /**
     * Ruta base donde se ubica la definición de los clips.
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
}

/**
 * Tipos de clip definidos.
 * @type {Map<string, typeof Clip>}
 * @private
 * @constant
 */
const _clipTypes = new Map()

/**
 * Mapa de asociación entre elementos e instancias de clips.
 * @type {WeakMap<Element, Clip>}
 * @constant
 * @private
 */
const _elementClips = new WeakMap();


/**
 * Carga la definición de un clip especificado por nombre.
 * @param {string} name Nombre del clip.
 * @returns {Promise<typeof Clip>} Clase del clip cargada.
 * @private
 */
async function _loadClip(name) {
    // TODO: Introducir aquí posibles mapeos para bundles.
    /*
        _settings.bundles?.forEach(bundle => {
            if (bundle.pattern.test(name)) {
                loadBundle(bundle.path);
            }
        });
    */

    const paths = [
        `${_settings.basePath}/${name}.js`,
        `${_settings.basePath}/${name}/index.js`
    ]

    const errors = []

    for (const path of paths) {
        let module

        try {
            module = await import(path)
        } catch (cause) {
            errors.push(new ClipError(`Failed to import clip "${name}" from "${path}".`, {
                code: ClipError.loadFailed,
                cause
            }))
            continue
        }

        const type = module.default

        // Si la definición cargada no es válida, no se intenta la siguiente ruta.
        if (typeof type !== 'function' || !Clip.isPrototypeOf(type)) {
            throw new ClipError(`Invalid clip "${name}" in "${path}": default export must be a subclass of Clip.`, {
                code: ClipError.loadFailed
            })
        }

        return type
    }

    throw new ClipError(`All import attempts for clip "${name}" failed.`, {
        code: ClipError.loadFailed,
        cause: errors
    })
}

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
}


/**
 * TODO: ...
 * @namespace
 */
const clips = {

    /**
     * Clase base para definir tipos de clip.
     * @type {typeof Clip}
     */
    Clip,

    /**
     * ...
     */
    Position: Clip.Position,


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
     * @param {string} name Nombre del clip.
     * @param {typeof Clip} type Tipo o clase del clip.
     * @returns {Promise<typeof Clip>} Tipo o clase del clip definido.
     */
    define: async function(name, type) {
        // Se valida el nombre.
        if (typeof name !== 'string') {
            throw new TypeError('Invalid clip name: string required.')
        }

        name = name.trim()

        if (!name) {
            throw new TypeError('Invalid clip name: empty string.')
        }

        if (name.length > clipNameMaxLength) {
            throw new RangeError(`Invalid clip name: too long (${name.length} > ${clipNameMaxLength}).`)
        }

        if (!clipNameRegexp.test(name)) {
            throw new TypeError('Invalid clip name: expected path-like string without leading or trailing slash.')
        }

        if (_clipTypes.has(name)) {
            throw new Error(`Clip "${name}" already defined.`)
        }

        // Se valida la clase.
        if (typeof type !== 'function' || !Clip.isPrototypeOf(type)) {
            throw new TypeError('Invalid clip class: subclass of Clip required.')
        }
        if (!Clip.isPrototypeOf(type)) {
            throw new TypeError('Invalid clip class.')
        }

        // Se añade el nombre asignado a la clase.
        Object.defineProperty(type, 'clipName', {
            value: name,
            writable: false,
            configurable: false,
            enumerable: false
        })

        // Se registra la clase.
        _clipTypes.set(name, type)

        // TODO: Importación de estilos!
        // _importClipStyles(name, type)

        // Se devuelve el tipo
        return type 
    },

    /**
     * TODO: Creación de clips.
     * @param {*} name 
     * @param {*} options 
     */
    create: async function(name, options) {
        let type = _clipTypes.get(name)
        if (!type) {
            type = await _loadClip(name)
        }
        return new type()
    },

    include: async function(name, target, options) {
        const clip = await this.create(name, options)
        await clip.include(target, options)
        return clip
    },


    
}




/**
 * Clip Error.
 */
class ClipError extends Error {

    // Códigos de error:
    static rootRequired = 'root_required'
    static loadFailed   = 'load_failed'
    static notDefined   = 'not_defined'
    static notFound     = 'not_found'

    /**
     * Constructor.
     * @param {string} message Descripción del error.
     * @param {{ code?: string, cause?: Error | Error[] }} [options] Opciones adicionales.
     */
    constructor(message, { code = null, cause } = {}) {
        super(String(message), cause !== undefined ? { cause } : undefined)

        this.name = 'ClipError'
        this.code = code

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ClipError)
        }
    }
}

export default clips 
