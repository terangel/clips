import clips from '../../../clips.js';

clips.define('today', {

    styles: /*css*/`
        today-clip {
            display: block;
            padding: 16px;
        }

        .today-item {
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 8px;
            background-color: #2228;
        }

        .today-item__top-bar {
            display: block;
            height: 24px;
        }

        .today-item__mark {
            display: block;
            width: 16px;
            height: 16px;
            background-color: #2228;
        }
            
        .today-item__body {
            
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
            this.root.innerHTML += `
                <div class="today-item">
                    <div class="today-item__top-bar">
                        <div class="today-item__mark${item.status === 'completed' ? " today-item__mark--on" : ""}"></div>
                    </div>
                    <div class="today-item__body">
                        ${item.description}
                    </div>                    
                </div>`;
        }
    }
    
});