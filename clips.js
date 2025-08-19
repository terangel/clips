function Clip(options) {
    this.root = null;
    this.parentClip = options.parentClip || null;
    this.childClips = [];
    this.loadTime = 0;
    this.eventListeners = {};
    this.create(options);
}

Clip.prototype.create = function(options) {};

Clip.prototype.include = function(options) {};

Clip.prototype.load = function(options) {};

Clip.prototype.render = function(options) {};

Clip.prototype.ready = function(options) {};

Clip.prototype.update = function(options) {};

Clip.prototype.reload = function(options) {};

Clip.prototype.clear = function(options) {};

Clip.prototype.toggle = function(options) {};

Clip.prototype.isVisible = function(options) {};

Clip.prototype.remove = function(options) {};

Clip.prototype.destroy = function(options) {};

Clip.prototype.appendClip = function(options) {};

Clip.prototype.removeClip = function(options) {};

Clip.prototype.clearAll = function(options) {};

Clip.prototype.destroy = function(options) {};


// Scroll
Clip.prototype.saveScroll = function() {};

Clip.prototype.restoreScroll = function() {};

// Events

Clip.prototype.addEventListener = Clip.prototype.on = function(name, listener) {};

Clip.prototype.removeEventListener = Clip.prototype.off = function(name, listener) {};

Clip.prototype.fire = Clip.prototype.dispatchEvent = function(event, spread) {};




// ---------------------------------------------------------------------------------------------------

const _handlers = {};

const _templates = {};

let _base = '/clips';

const clips = {

    base: function(path) {
        _base = path; 
    },

    /**
     * ...
     */
    define: function(name, base, proto) {
        if (typeof name !== 'string' || !(name = name.trim())) {
            throw new TypeError(`Invalid clip name, non-empty string required.`);
        }
        if (_handlers[name]) {
            throw new Error(`Duplicate clip: ${name}`);
        }

        if (typeof base === 'object' && base !== null) {
            proto = base;
            base = null;
        } else if (typeof base === 'string') {
            base = base.trim();
            if (!base) {
                throw new TypeError(`Invalid base name, non-empty string required.`);
            }
            if (!_handlers[base]) {
                throw new ReferenceError(`Base clip "${base}" not defined.`);
            }
        } else {
            throw new TypeError('Invalid base, string or object required.');
        }

        if (proto === null || typeof proto !== 'object' || Object.getPrototypeOf(proto) !== Object.prototype) {
            throw new TypeError('Invalid proto object, plain object required.');
        }

        const B = base ? _handlers[base] : Clip,
            C = function(options) {
                B.call(this, options);
            };
        C.prototype = Object.assign(Object.create(B.prototype), proto);
        C.prototype.constructor = C;
        C.prototype.__base = B;
        C.prototype.__name = name;
        return _handlers[name] = C;
    },

    create: async function(name, options) {
        if (!_handlers[name]) {
            await import(`${_base}/${name}/handler.js`.toString());
        }
        const handler = _handlers[name];
        if (!handler) {
            return null;
        }
        return new handler(options);
    },

    setBasePath: function(path) {

    }

};

export default clips;
