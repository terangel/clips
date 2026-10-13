import clips from '../../../clips.js';

export default class HomeClip extends clips.Clip {

    async render(options = {}) {
        return /*html*/`
            <div data-clip="home">[HOME-CLIP]</div>
        `
    }

    async styles(options = {}) {
        return /*css*/`
            home-clip {
                color: #fff;
                background-color: #333;
            }
        `
    }

}