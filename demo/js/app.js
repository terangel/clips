import clips from '../../clips.js';

clips.basePath(new URL('../clips', import.meta.url));

const app = {

    start: async function() {
        console.log('Starting app...');
        const page = document.getElementById('page');

        const homeClip = await clips.create('home', {});
        console.log(`homeClip: ${homeClip}`);
        homeClip.include(page);
    }

};

document.addEventListener('DOMContentLoaded', () => {
    app.start();
});