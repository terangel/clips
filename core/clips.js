// clips.js

/**
 * Stores private state for clips.
 * 
 * @private
 * @type {WeakMap<Clip, {
 *     root: HTMLElement|null,
 *     loadStarted: false
 *     loadTime: 0,
 *     listeners: Map
 * }>}
 */
const _states = new WeakMap()

/**
 * Maps root elements to clips.
 * 
 * @private
 * @type {WeakMap<HTMLElement, Clip>}
 */
const _roots = new WeakMap()


/**
 * Creates a Clip instance.
 * 
 * @constructor
 * @param {Object} [options={}] Creation options.
 */
function Clip(options = {}) {

    const state = {
        root: null,
        listeners: new Map()
    };

    _states.set(this, state);
}


/* CONSTANTS
 * ================================================================================================================== */
/**
 * Available inclusion positions.
 *
 * @enum {string}
 */
Clip.Position = Object.freeze({
    start:      'start',
    end:        'end',
    before:     'before',
    after:      'after',
    replace:    'replace'
});


/* PROTOTYPE PROPERTIES
 * ================================================================================================================== */

Object.defineProperty(Clip.prototype, 'root', {
    get() {
        return _states.get(this).root;
    },
    enumerable: true
})

Object.defineProperty(Clip.prototype, 'parentClip', {

    get() {
        for (let element = this.root?.parentElement; element; element = element.parentElement) {
            const clip = _roots.get(element)
            if (clip) {
                return clip
            }
        }
        return null
    },

    enumerable: true

})

Object.defineProperty(Clip.prototype, 'childClips', {

    get() {
        const clips = []
        const collect = element => {
            const clip = _roots.get(element)
            if (clip) {
                clips.push(clip)
                return
            }
            for (const child of element.children) {
                collect(child)
            }
        }
        const root = this.root
        if (root) {
            for (const child of root.children) {
                collect(child)
            }
        }
        return clips
    },

    enumerable: true

})

Object.defineProperty(Clip.prototype, 'childCount', {

    get() {
        return this.childClips.length
    },
    
    enumerable: true

})

Object.defineProperty(Clip.prototype, 'loadTime', {
    get() {
        return _states.get(this).loadTime;
    },
    enumerable: true
})


/* PROTOTYPE FUNCTIONS
 * ================================================================================================================== */
/**
 * Initializes the clip instance. Called by the constructor.
 * 
 * @param {Object} options Initialization options.
 */
Clip.prototype.create = function(options) {};

/**
 * Includes the clip relative to the specified target element.
 * 
 * @param {Element} target Target element.
 * @param {Object} [options] Additional options.
 * @param {Clip.Position} [options.position=Clip.Position.end] Position relative to the target element.
 * @returns {Promise<Clip>} Resolves to this clip after ready() completes.
 */
Clip.prototype.include = async function(target, options = {}) {
    options = { ...options }

    const state = _states.get(this);
    const previous = state.includePromise ?? Promise.resolve();

    return await (state.includePromise = previous.catch(() => {}).then(() => 
        _include.call(this, target, options)));
}

/**
 * Performs the clip inclusion.
 *
 * @private
 * @this {Clip}
 * @see Clip#include
 */
async function _include(target, options = {}) {
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
    if ([Clip.Position.before, Clip.Position.after, Clip.Position.replace].includes(position) && !target.parentNode) {
        throw new ClipError('The target element must have a parent for this inclusion position.')
    }

    // Se recupera el estado del clip.
    const state = _states.get(this)

    // Se genera la raíz si todavía no existe.    
    let root = state.root, fresh = false
    if (!root) {
        let out
        
        try {
            out = await this.render(options)
        } catch (err) {
            throw new ClipError(`Unable to render clip "${this.clipName}".`, {
                cause: err
            });
        }
        if (out == null) {
            throw new ClipError(`Missing render output for clip "${this.clipName}".`)
        }

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
            throw new ClipError('Missing clip root: render() must return an Element, ' + 
                'or a DocumentFragment/HTML string containing a single root element.')
        }

        // Se comprueba que el mismo elemento no esté asociado a otro clip.
        const c = _roots.get(root)
        if (c && c !== this) {
            throw new ClipError('Clip root already belongs to another clip.')
        }

        // Se identifica el elemento raíz del clip.
        root.setAttribute('data-clip', this.clipName)

        // Se indica que la raíz es de reciente creación.
        fresh = true
    }

    // El destino puede haber cambiado durante el renderizado.
    if ([Clip.Position.before, Clip.Position.after, Clip.Position.replace].includes(position) && !target.parentNode) {
        throw new ClipError('The target element must have a parent for this inclusion position.')
    }

    // Se rechazan destinos dentro de la propia raíz.
    if (root.contains(target)) {
        throw new ClipError('The target element cannot be contained within the clip root.')
    }

    if (fresh) {
        // Se vincula el elemento raíz con la instancia del clip. 
        _roots.set(root, this)

        // Se guarda el elemento raíz en el estado interno de la instancia.
        state.root = root

        // Referencia para depuración.
        Object.defineProperty(root, '__clip', {
            value: this,
            configurable: true
        })
    } 

    // Se guarda si la raíz estaba conectada antes de incluirla en el destino.
    const wasConnected = root.isConnected

    // Receptores de eventos.
    const eventTargets = {
        detach: [], attach: []        
    }

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
                const collect = element => {
                    for (const child of [...element.children]) {
                        collect(child)
                    }
                    
                    const clip = _roots.get(element)
                    if (clip) {
                        eventTargets.detach.push(clip)
                    }
                }

                collect(target);
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
        const collect = element => {
            const clip = _roots.get(element)

            if (clip && isConnected) {
                eventTargets.attach.push(clip);
            }

            for (const child of element.children) {
                collect(child)
            }

            if (clip && !isConnected) {
                eventTargets.detach.push(clip);
            }
        }

        collect(root)
    }

    // Se emiten los eventos correspondientes.
    for (const event of Object.keys(eventTargets)) {
        for (const clip of eventTargets[event]) {
            // TODO: Evaluar que pasa si la propagación del evento falla.
            clip.fire(event);
        }    
    }

    // Se llama al ready en cada inclusión.
    try {
        await this.ready({ ...options, fresh, reload: false })
    } catch (err) {
        throw new ClipError(`Unable to ready clip "${this.clipName}".`, { cause: err })
    }

    // Se inicia la carga de datos adicionales.
    if (!state.loadStarted) {
        state.loadStarted = true;

        void (async () => {
            try {
                options.data = await this.load(options)
                state.loadTime = Date.now()            
            } catch (err) {
                console.error(`Unable to load clip "${this.clipName}".`, err)
            }

            // TODO: Evaluar que hacer si el load falla.

            try {
                await this.update(options)
            } catch (err) {
                console.error(`Unable to update clip "${this.clipName}".`, err)
            }
        })();
    }
    
    // Se devuelve la propia instancia.
    return this
}

/**
 * Renders the clip. 
 * 
 * @param {Object} [options] Additional rendering options.
 * @returns {Promise<DocumentFragment|Element|string>} Returns a fragment, an element, or HTML code directly.
 */
Clip.prototype.render = function() {
    // TODO: Creo que la implementación por defecto debería intentar renderizar la plantilla por defecto.
    return /*html*/`<div data-clip="${this.clipName}"></div>`
}

/**
 * Initializes the generated content after rendering and adds the necessary event handlers.
 * 
 * @param {Object} [options] Additional options.
 * @param {boolean} [options.fresh=false] Whether the root element was newly created.
 */
Clip.prototype.ready = async function(options) {};

/**
 * Loads additional data.
 * 
 * @param {Object} options Additional options.
 */
Clip.prototype.load = async function(options) {};

/**
 * Carga de datos (envoltorio). Llama a la carga, actualiza el tiempo de carga y llama a la actualización.
 * 
 * @param {Object} options Opciones adicionales.
 * @private
 */
Clip.prototype._load = async function(options) {
    // const data = await this.load(options);
    // this._loadTime = Date.now();
    // return this.update(data === undefined ? options : { ...options, data });
};

/**
 * Updates the content of the clip after loading additional data.
 * 
 * @param {Object} options Additional options.
 */
Clip.prototype.update = async function(options) {};

/**
 * Initiates the reload of the clip.
 * 
 * @param {Object} options Additional options.
 */
Clip.prototype.reload = async function(options) {
    // ...
}

/**
 * Limpia el contenido del clip y llama de nuevo a la renderización.
 * @param {Object} options Opciones adicionales.
 */
Clip.prototype.clear = function(options) {
    // ... 
}

/**
 * Shows or hides the clip.
 * 
 * @param {boolean} [show] Whether to show the clip. If omitted, toggles its visibility.
 */
Clip.prototype.toggle = function(show) {}

/**
 * Checks whether the clip is visible.
 * 
 * @returns {boolean} Whether the clip is visible.
 */
Clip.prototype.isVisible = function() {}

/**
 * Removes the clip from the DOM.
 */
Clip.prototype.remove = function() {
    // ...
}

/**
 * Destroys the clip and releases its resources.
 */
Clip.prototype.destroy = function() {
    // ...
}


/* EVENTS
 * ================================================================================================================== */
/**
 * Internal event states.
 * 
 * @private
 * @type {WeakMap<ClipEvent, {
 *     target: ?Clip,
 *     currentTarget: ?Clip
 * }>}
 */
const _eventStates = new WeakMap()


/**
 * Creates a clip event.
 *
 * @constructor
 * @param {string} type Event type.
 * @param {*} [detail] Event data.
 */
function ClipEvent(type, detail) {
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


Object.defineProperties(Clip.prototype, {

    /**
     * Registers an event listener.
     *
     * @param {string} type Event type.
     * @param {function(ClipEvent): void} listener Event listener.
     * @returns {Clip} This clip.
     */
    on: {
        value: function(type, listener) {
            if (typeof type !== 'string' || type.length === 0) {
                throw new TypeError('Invalid event type: a non-empty string is required.')
            }

            if (typeof listener !== 'function') {
                throw new TypeError('Invalid event listener: a function is required.')
            }

            const state = _states.get(this)

            let listeners = state.listeners.get(type)

            if (!listeners) {
                state.listeners.set(type, listeners = new Set())
            }

            listeners.add(listener)

            return this
        }
    },

    /**
     * Removes an event listener.
     *
     * @param {string} type Event type.
     * @param {function(ClipEvent): void} listener Event listener.
     * @returns {Clip} This clip.
     */
    off: {
        value: function(type, listener) {
            if (typeof type !== 'string' || type.length === 0) {
                throw new TypeError('Invalid event type: a non-empty string is required.')
            }

            if (typeof listener !== 'function') {
                throw new TypeError('Invalid event listener: a function is required.')
            }

            const state = _states.get(this)

            const listeners = state.listeners.get(type)

            if (listeners) {
                listeners.delete(listener)

                if (listeners.size === 0) {
                    state.listeners.delete(type)
                }
            }

            return this
        }
    },

    /**
     * Fires an event.
     * 
     * @param {string | ClipEvent | {
     *     type: string,
     *     detail?: *
     * }} event Event to fire.
     * @param {Object} [options={}] Dispatch options.
     * @param {boolean | 'post'} [options.spread=false] Whether to propagate to descendants: true for preorder, 'post' 
     * for postorder.
     * @returns {Clip} This clip.
     */
    fire: {
        value: function(event, { spread = false } = {}) {
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

            const eventState = _eventStates.get(event);

            // Se impide emitir la misma instancia del evento mientras se está procesando.
            if (eventState.target !== null) {
                throw new ClipError('The event is already being dispatched.');
            }

            const dispatch = clip => {
                // Se propaga en postorden.
                if (spread === 'post') {
                    for (const child of clip.childClips) {
                        dispatch(child);
                    }
                }

                // Se ejecutan los listeners de este clip.
                const state = _states.get(clip);
                const listeners = state.listeners.get(event.type);

                if (listeners) {
                    const previousTarget = eventState.currentTarget;
                    eventState.currentTarget = clip;

                    try {
                        for (const listener of [...listeners]) {
                            try {
                                listener.call(clip, event);
                            } catch (err) {
                                console.error(`Error calling event listener "${event.type}" in clip "${clip.clipName}":`, err);
                            }
                        }
                    } finally {
                        eventState.currentTarget = previousTarget;
                    }
                }

                // Se propaga en preorden.
                if (spread === true) {
                    for (const child of clip.childClips) {
                        dispatch(child);
                    }
                }
            };

            eventState.target = this;

            try {
                dispatch(this);
            } finally {
                eventState.target = null;
                eventState.currentTarget = null;
            }

            return this;
        }
    }
})


/* ERRORS
 * ================================================================================================================== */
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