import clips from '../../../clips.js';

clips.define('today', {

    /**
     * @see Clip#render 
     */
    render: function(options) {
        return /*html*/`
            <today-clip>
                <div class="today-clip__head">
                    <div class="title">TODAY</div>
                    <div class="date">${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div> 
                </div>
                <div class="today-clip__body">
                    <!-- TODO: Representar esquéleto de carga -->
                </div>
            </today-clip>
        `;
    },

    /**
     * @see Clip#load 
     */
    load: async function(options) {
        const res = await fetch('sample-data/today.json');
        if (res.ok) {
            return res.json();
        }
    },

    /**
     * @see Clip#update 
     */
    update: function(options) {
        const bodyEl = this.root.querySelector('.today-clip__body');
        bodyEl.replaceChildren();
        for (const item of options.data) {
            clips.include('card', bodyEl, { data: item });
        }
    }
    
}, /*css*/`
    today-clip {
        display: block;
        padding: 16px;
    }

    .today-clip__head {
        margin-bottom: 16px;

        > .title {
            color: #ff0;
            font-size: 18px;
            font-weight: bold;
        }

        > .date {
            color: #fffa;
            font-size: 14px;            
        }
    }

`);