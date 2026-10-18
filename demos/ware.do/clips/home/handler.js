import clips from '../../../../clips.js';

export default {

    /** @see Clip#ready */
    ready: function(options) {
        console.log('[home] Ready!');
    }

};

/*

import clips from '../../../clips.js';

export default class HomeClip extends clips.Clip {

    static styles = /*css* /`
        home-clip {
            color: #fff;
            background-color: #333;
        }
    `

    async render(options = {}) {
        return /*html* /`
            <div data-clip="home">[HOME-CLIP]</div>
        `
    }

}

*/