import esc from './escape.js';

/**
 * Expresión regular para detectar las etiquetas EJS.
 * @type {RegExp}
 * @constant
 */
const ejsTagsRe = /<%[-=]?[\s\S]*?%>/g;

export default {

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