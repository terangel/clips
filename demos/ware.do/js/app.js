import clips from '../../../clips.js';

clips.setup({
    basePath: new URL('../clips', import.meta.url)
});

const app = {

    start: async function() {
        console.log('Starting app...');

        // Se incluye el clip "home":
        clips.include('home', document.getElementById('page'));

        // Alternativa: create/include
        // const homeClip = await clips.create('home');
        // homeClip.include(page);
    }

};

document.addEventListener('DOMContentLoaded', () => {
    app.start();
});