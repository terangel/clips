// clips.js

/**
 * Stores private state for clips.
 * 
 * @private
 * @type {WeakMap<Clip, {
 *     root: HTMLElement|null
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


/* PROTOTYPE
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