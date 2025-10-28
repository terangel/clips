import clips from '../../../clips.js';

clips.setup({
    basePath: new URL('../clips', import.meta.url)
});

const app = {

    start: async function() {
        console.log('Starting app...');
        const page = document.getElementById('page');
        const homeClip = await clips.create('home');
        homeClip.include(page);
        // Alternativa: clips.include('home', page, {});
    }

};

document.addEventListener('DOMContentLoaded', () => {
    app.start();
});