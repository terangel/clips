import clips from '../../../clips.js';

clips.define('home', {

    render: function(options) {
        const template = document.createElement('template');
        template.innerHTML = '<div class="home-clip">HOME CLIP</div>';
        return template.content;
    }


});