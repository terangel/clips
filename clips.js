function Clip(options) {
    // ...
}

const _clipHandlers = {};

const clips = {

    define: function(name, base, proto) {
        if (typeof base === 'object') {
            proto = base;
            base = null;
        }
        let B = base ? _clipHandlers[base] : View,
            V = function(settings) {
                B.call(this, settings);
            };
        V.prototype = Object.assign(Object.create(B.prototype), proto);
        V.prototype.constructor = V;

        /**
         * Reference to the base view.
         * @type {function}
         * @memberof View#
         */
        V.prototype.__base = B;
        // TODO: Ojo con usar esta referencia ya que si se usa en una clase y en una clase derivada no se sobrescribe
        //  podemos tener una llamada circular ya que la referencia a la base es ella misma.

        /**
         * The name of the view.
         * @type {string}.
         * @memberof View#
         */
        V.prototype.__name = name;

        // Se devuelve la función constructora de la vista.
        return viewHandlers[name] = V;
    },

    create: async function(name, options) {
        if (!this._handlers[name]) {
            await import(`clips/${name}/handler.js`);
        }
        const handler = this._handlers[name];
        if (!handler) {
            return null;
        }
        const clip = handler;
    },

};

export default clips;
