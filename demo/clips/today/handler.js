import clips from '../../../clips.js';

clips.define('today', {

    styles: /*css*/`
        today-clip {
            display: block
        }
    `,

    render: function(options) {
        return /*html*/`
            <today-clip>
                TODAY
            </today-clip>
        `;
    },

    load: async function(options) {
        const res = await fetch('sample-data/today.json');
        if (res.ok) {
            return res.json();
        }
    },

    update: function(options) {
        // Vaciamos el contenido del elemento raíz.
        this.root.replaceChildren();
        // Generamos las fichas.
        for (const item of options.data) {
            this.root.innerHTML += `<div class="today-item">${item.description}</div>`;
        }
    }
    
});