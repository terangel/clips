
/*
 * Símbolo para la propiedad "eventListeners".
 * @type {Symbol}
 * @const
 */
const eventListenerSymbol = Symbol('eventListeners');


export class Clip {

    static clipName

    #root = null

    #loadTime = 0

    #attachRAF = 0

    /** @type {Map<string, Set<function(ClipEvent): void>>} */
    #listeners = new Map()

    constructor(options = {}) {}

    get root() {
        return this.#root
    }

    get parentClip() {
        for (let element = this.#root?.parentElement; element; element = element.parentElement) {
            const clip = _elementClips.get(element)
            if (clip) {
                return clip
            }
        }
        return null
    }

    get childClips() {        
        const clips = []
        const collect = element => {
            const clip = _elementClips.get(element)
            if (clip) {
                clips.push(clip)
                return
            }
            for (const child of element.children) {
                collect(child)
            }
        }
        if (this.#root) {
            for (const child of this.#root.children) {
                collect(child)
            }
        }
        return clips
    }

    get childCount() {
        return this.childClips.length
    }

    appendClip(clip) {
        // if (clip.#parentClip) {
        //     clip.#parentClip.removeClip(clip)
        // }
        // this.#childClips.add(clip)
        // clip.#parentClip = this
    }

    removeClip(clip) {
        // if (this.#childClips.delete(clip)) {
        //     clip.#parentClip = null
        // }
    }

    /**
     * Renderiza el clip cuando sea necesario y lo incluye en el elemento destino y posición especificada.
     * @param {Element} target Elemento de destino.
     * @param {object} [options] Opciones de renderización e inclusión.
     * @param {Clip.Position} [options.position=Clip.Position.end] Posición de inclusión respecto al destino.
     * @returns {Promise<Clip>} Instancia incluida.
     */
    async include(target, options = {}) {
        // Se valida el destino.
        if (!target || target.nodeType !== Node.ELEMENT_NODE) {
            throw new TypeError('Invalid target: must be an Element.')
        }

        // Se valida la posición especificada antes de renderizar.
        const position = options.position ?? Clip.Position.end
        if (!Object.values(Clip.Position).includes(position)) {
            throw new RangeError(`Invalid position: ${position}.`)
        }

        // Se comprueba las posiciones que requieren que el elemento destino esté contenido en otro elemento.
        if ([Clip.Position.before, Clip.Position.after, Clip.Position.replace].includes(position) && 
                !target.parentNode) {
            throw new ClipError('The target element must have a parent for this inclusion position.')
        }

        // Se genera la raíz si todavía no existe.
        if (!this.#root) {
            let out

            try {
                out = await this.render(options)
            } catch (err) {
                throw new ClipError(`Unable to render clip "${this.clipName}": ${err.message}`, {
                    cause: err
                });
            }
            if (out == null) {
                throw new ClipError(`Missing render output for clip "${this.clipName}".`)
            }

            let root

            if (out.nodeType === Node.ELEMENT_NODE) {
                root = out;
            } else {
                if (typeof out === 'string') {
                    const template = document.createElement('template')
                    template.innerHTML = out
                    out = template.content
                }

                if (out.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    for (const node of out.childNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (root) {
                                throw new ClipError('Multiple root elements are not allowed.')
                            }
                            root = node
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            if (node.data.trim().length > 0) {
                                throw new ClipError('Text outside the root element is not allowed.')
                            }
                        } else if (node.nodeType !== Node.COMMENT_NODE) {
                            throw new ClipError(`Unsupported node type (${node.nodeType}) outside the root element.`)
                        }
                    }
                }
            }

            if (!root) {
                throw new ClipError(`Missing clip root: render() must return an Element, or a DocumentFragment/HTML string containing a single root element.`)
            }

            // Se comprueba que el mismo elemento no esté asociado a otro clip.
            const existingClip = _elementClips.get(root)
            if (existingClip && existingClip !== this) {
                throw new ClipError('Clip root already belongs to another clip.')
            }

            // Se identifica y registra el elemento raíz del clip.
            root.setAttribute('data-clip', this.clipName)
            _elementClips.set(root, this)

            // Se asigna el nodo raíz.
            this.#root = root

            // Referencia para depuración.
            Object.defineProperty(root, '__clip', {
                value: this,
                configurable: true
            })
        }

        const root = this.#root

        // El destino puede haber cambiado durante el renderizado.
        if ([Clip.Position.before, Clip.Position.after, Clip.Position.replace].includes(position) && 
                !target.parentNode) {
            throw new ClipError('The target element must have a parent for this inclusion position.')
        }

        // Se rechazan destinos dentro de la propia raíz.
        if (root.contains(target)) {
            throw new ClipError('The target element cannot be contained within the clip root.')
        }

        // Se conserva la conexión anterior de la raíz.
        const wasConnected = root.isConnected

        // Se inserta la raíz.
        switch (position) {
            case Clip.Position.after:
                target.after(root)
                break

            case Clip.Position.before:
                target.before(root)
                break

            case Clip.Position.replace:
                const connected = target.isConnected

                if (target.contains(root)) {
                    target.before(root)
                    target.remove()
                } else {
                    target.replaceWith(root)
                }

                if (connected) {
                    const detach = element => {
                        for (const child of [...element.children]) {
                            detach(child)
                        }
                        
                        _elementClips.get(element)?.fire('detach')
                    }

                    detach(target)
                }
                break

            case Clip.Position.start:
                target.prepend(root)
                break

            case Clip.Position.end:
                target.append(root)
                break
        }

        // Se determina si emitir el evento "attach" o "detach" sobre el clip incluído y los clips contenidos.
        const isConnected = root.isConnected
        if (isConnected !== wasConnected) {
            const recipients = []

            const collect = element => {
                const clip = _elementClips.get(element)

                if (clip && isConnected) {
                    recipients.push(clip);
                }

                for (const child of element.children) {
                    collect(child)
                }

                if (clip && !isConnected) {
                    recipients.push(clip)
                }
            }

            collect(root)

            const event = root.isConnected ? 'attach' : 'detach'

            for (const clip of recipients) {
                clip.fire(event);
            }
        }

        // Se ejecuta ready en cada inclusión.
        await this.ready(options)

        // Se inicia la carga adicional sin bloquear la inclusión.
        try {
            Promise.resolve(this.#load(options)).catch(cause => {
                console.error(
                    `Unable to load clip "${this.clipName}".`,
                    cause
                )
            })
        } catch (cause) {
            console.error(
                `Unable to load clip "${this.clipName}".`,
                cause
            )
        }

        return this
    }



    /**
     * Renderiza el clip si es necesario e inserta su raíz en el destino.
     * @param {Element} target Elemento de destino.
     * @param {object} [options] Opciones de inclusión y renderización.
     * @param {Clip.Position} [options.position=Clip.Position.end]
     * Posición de inclusión respecto al destino.
     * @returns {Promise<this>} Instancia incluida.
     */
    async include2(target, options = {}) {
        if (!target || target.nodeType !== Node.ELEMENT_NODE) {
            throw new TypeError('Invalid target: an Element is required.')
        }

        const position = options.position ?? Clip.Position.end

        if (!Object.values(Clip.Position).includes(position)) {
            throw new RangeError(`Invalid position: ${position}.`)
        }

        const siblingPosition = (
            position === Clip.Position.before ||
            position === Clip.Position.after ||
            position === Clip.Position.replace
        )

        if (siblingPosition && !target.parentNode) {
            throw new ClipError(
                'The target element must have a parent for this inclusion position.'
            )
        }

        // Se genera y registra la raíz.
        if (!this.#root) {
            let out

            try {
                out = await this.render(options)
            } catch (cause) {
                throw new ClipError(
                    `Unable to render clip "${this.clipName}".`,
                    { cause }
                )
            }

            if (out == null) {
                throw new ClipError(
                    `Missing render output for clip "${this.clipName}".`
                )
            }

            let root

            if (out.nodeType === Node.ELEMENT_NODE) {
                root = out
            } else {
                if (typeof out === 'string') {
                    const template = document.createElement('template')
                    template.innerHTML = out
                    out = template.content
                }

                if (out.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    for (const node of out.childNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (root) {
                                throw new ClipError(
                                    'Multiple root elements are not allowed.'
                                )
                            }

                            root = node
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            if (node.data.trim().length > 0) {
                                throw new ClipError(
                                    'Text outside the root element is not allowed.'
                                )
                            }
                        } else if (node.nodeType !== Node.COMMENT_NODE) {
                            throw new ClipError(
                                `Unsupported node type (${node.nodeType}) outside the root element.`
                            )
                        }
                    }
                }
            }

            if (!root) {
                throw new ClipError(
                    'Missing clip root: render() must return an Element, or a DocumentFragment/HTML string containing a single root element.'
                )
            }

            const existingClip = _elementClips.get(root)

            if (existingClip && existingClip !== this) {
                throw new ClipError(
                    'Clip root already belongs to another clip.'
                )
            }

            Object.defineProperty(root, '__clip', {
                value: this,
                configurable: true
            })

            root.setAttribute('data-clip', this.clipName)
            _elementClips.set(root, this)
            this.#root = root
        }

        const root = this.#root

        // El destino puede haber cambiado durante el await de render().
        if (siblingPosition && !target.parentNode) {
            throw new ClipError(
                'The target element must have a parent for this inclusion position.'
            )
        }

        if (root.contains(target)) {
            throw new ClipError(
                'The target element cannot be contained within the clip root.'
            )
        }

        // Se captura el estado de conexión de los clips afectados.
        const states = new Map()
        const previousPostorder = []

        const collect = element => {
            const clip = _elementClips.get(element)

            if (clip) {
                states.set(clip, {
                    root: element,
                    connected: element.isConnected
                })
            }

            for (const child of element.children) {
                collect(child)
            }

            if (clip) {
                previousPostorder.push(clip)
            }
        }

        // Al reemplazar un antecesor, una sola búsqueda abarca
        // tanto los clips retirados como los que se conservan.
        if (
            position === Clip.Position.replace &&
            target.contains(root)
        ) {
            collect(target)
        } else {
            collect(root)

            if (position === Clip.Position.replace) {
                collect(target)
            }
        }

        // TODO: Aplicar options.style, options.class y options.hidden.

        // Se inserta la raíz.
        switch (position) {
            case Clip.Position.after:
                target.after(root)
                break

            case Clip.Position.before:
                target.before(root)
                break

            case Clip.Position.replace:
                if (target.contains(root)) {
                    target.before(root)
                    target.remove()
                } else {
                    target.replaceWith(root)
                }
                break

            case Clip.Position.start:
                target.prepend(root)
                break

            case Clip.Position.end:
                target.append(root)
                break
        }

        // Se calculan las desconexiones en el postorden anterior.
        const detached = previousPostorder.filter(clip => {
            const state = states.get(clip)
            return state.connected && !state.root.isConnected
        })

        // Se calculan las conexiones en el preorden actual.
        const attached = []

        const collectAttached = element => {
            const clip = _elementClips.get(element)
            const state = clip && states.get(clip)

            if (state && !state.connected && element.isConnected) {
                attached.push(clip)
            }

            for (const child of element.children) {
                collectAttached(child)
            }
        }

        collectAttached(root)

        // Cada clip recibe una notificación local.
        for (const clip of detached) {
            clip.fire('detach')
        }

        for (const clip of attached) {
            clip.fire('attach')
        }

        await this.ready(options)

        // La carga adicional no bloquea la inclusión.
        try {
            Promise.resolve(this.#load(options)).catch(cause => {
                console.error(
                    `Unable to load clip "${this.clipName}".`,
                    cause
                )
            })
        } catch (cause) {
            console.error(
                `Unable to load clip "${this.clipName}".`,
                cause
            )
        }

        return this
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

    destroy() {
        // TODO: Falta chicha!
        delete this.#root.__clip
        _elementClips.delete(this.#root)
    }

    get clipName() {
        return this.constructor.clipName
    }


    // EVENTS ----------------------------------------------------------------------------------------------------------
    /**
     * Registra un listener.
     * @param {string} type Tipo de evento.
     * @param {function(ClipEvent): void} listener Listener.
     * @param {object} [options] Reservado para futuras opciones.
     * @returns {this}
     */
    on(type, listener, options = {}) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('Invalid event type: a non-empty string is required.')
        }

        if (typeof listener !== 'function') {
            throw new TypeError('Invalid event listener: a function is required.')
        }

        let listeners = this.#listeners.get(type)

        if (!listeners) {
            listeners = new Set()
            this.#listeners.set(type, listeners)
        }

        listeners.add(listener)

        return this
    }

    /**
     * Elimina un listener.
     * @param {string} type Tipo de evento.
     * @param {function(ClipEvent): void} listener Listener.
     * @returns {this}
     */
    off(type, listener) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('Invalid event type: a non-empty string is required.')
        }

        if (typeof listener !== 'function') {
            throw new TypeError('Invalid event listener: a function is required.')
        }

        const listeners = this.#listeners.get(type)

        if (listeners) {
            listeners.delete(listener)

            if (listeners.size === 0) {
                this.#listeners.delete(type)
            }
        }

        return this
    }

    /**
     * Emite un evento.
     * @param {string | ClipEvent | {
     *     type: string,
     *     detail?: any
     * }} event Evento especificado.
     * @param {boolean | 'post'} [spread=false] Indica si propagar el evento a los clips descendientes: true en 
     * preorden, "post" en postorden.
     */
    fire(event, { spread = false } = {}) {
        // Se normaliza el evento.
        if (!(event instanceof ClipEvent)) {
            if (typeof event === 'string') {
                event = new ClipEvent(event);
            } else if (typeof event === 'object' && event !== null && typeof event.type === 'string') {
                event = new ClipEvent(event.type, event.detail);
            } else {
                throw new TypeError('Invalid event: expected a type string, a ClipEvent, or an object with a string "type" property.');
            }
        }

        // Se validan las opciones adicionales.
        if (spread !== false && spread !== true && spread !== 'post') {
            throw new TypeError(
                'Invalid event spread: expected false, true, or "post".'
            )
        }

        // Se conserva el primer emisor del evento.
        const state = _eventStates.get(event)

        if (state.target === null) {
            state.target = this
        }

        // Se propaga en postorden.
        if (spread === 'post') {
            for (const clip of [...this._childClips]) {
                clip.fire(event, { spread })
            }
        }

        // Se ejecutan los listeners de este clip.
        const listeners = this.#listeners.get(event.type);
        if (listeners) {
            const previousTarget = state.currentTarget
            state.currentTarget = this

            try {
                for (const listener of [...listeners]) {
                    try {
                        listener.call(this, event);
                    } catch (err) {
                        console.error(`Error calling event listener "${event.type}" in clip "${this.clipName}":`, err);
                    }
                }
            } finally {
                state.currentTarget = previousTarget
            }
        }

        // Se propaga en preorden.
        if (spread === true) {
            for (const clip of [...this._childClips]) {
                clip.fire(event, { spread })
            }
        }
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



/**
 * Estado interno de los eventos.
 * @type {WeakMap<ClipEvent, {
 *     target: Clip | null,
 *     currentTarget: Clip | null
 * }>}
 */
const _eventStates = new WeakMap()


class ClipEvent {

    constructor(type, detail) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new TypeError('Invalid event type: a non-empty string is required.')
        }

        _eventStates.set(this, {
            target: null,
            currentTarget: null
        })

        Object.defineProperties(this, {
            type: {
                value: type,
                enumerable: true
            },
            detail: {
                value: detail,
                enumerable: true
            },
            target: {
                get() {
                    return _eventStates.get(this).target
                },
                enumerable: true
            },
            currentTarget: {
                get() {
                    return _eventStates.get(this).currentTarget
                },
                enumerable: true
            }
        })

    }

} 


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
function _closestClip(el) {
    for (let n = el?.parentElement, c; n; n = n.parentElement) {
        if (c = _elementClips.get(n)) return c;
    }
    return null;
}

/**
 * Fuerza el reflow del elemento especificado.
 * @param {Element} el Elemento especificado.
 * @private
 */
function _reflow(el) {
    return el.getBoundingClientRect();
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
