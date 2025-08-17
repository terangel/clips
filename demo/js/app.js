import clips from '../../clips.js';

clips.base(new URL('../clips', import.meta.url));

const app = {

    start: async function() {
        console.log('Starting app...')
        const page = document.getElementById('page');

        const homeClip = await clips.create('home', {});
        // homeClip.appendTo(page);
        console.log(`homeClip: ${homeClip}`);
    }

};

app.start();