import clips from '../clips.js';

const app = {

    start: async function() {
        const page = document.getElementById('page');

        const homeClip = clips.create('home', {});
        homeClip.appendTo(page);
    }

};

app.start();