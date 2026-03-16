const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export default {

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