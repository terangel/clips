import clips from '../../../../clips.js';

export default {

    /* @type {string} */
    extends: 'view',

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
        const bodyEl = this.root.querySelector('.today-view__body');
        bodyEl.replaceChildren();
        for (const item of options.data) {
            await clips.include('card/activity', bodyEl, { data: item });
        }
    }
    
};