import clips from '../../../../clips.js';

export default {

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
    update: async function(options) {
        const bodyEl = this.root.querySelector('.today-clip__body');
        bodyEl.replaceChildren();
        for (const item of options.data) {
            await clips.include('cards/activity', bodyEl, { data: item });
        }
    }
    
};