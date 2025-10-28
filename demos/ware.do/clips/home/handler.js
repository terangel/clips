import clips from '../../../../clips.js';

clips.define('home', {

    ready: function() {
        this.on('attach', () => {
            console.log('[HOME] Attach!');
        });
    },

    renderX: function(options) {
        const template = document.createElement('template');
        template.innerHTML = '<div class="home-clip">HOME CLIP</div>';
        return template.content; 
    }

    /*
    render: function(options) {
        const template = document.createElement('template');
        template.innerHTML = '<div class="home-clip">HOME CLIP</div>';
        const tpl = `
            <div class="card">
                <h2><%= title %></h2>
                <p><%- htmlIntro %></p>
                <ul>
                <% for (const item of items) { %>
                    <li><%= item %></li>
                <% } %>
                </ul>
            </div>
        `;

        return template.content;
    },

    template: function(name) {
        if (name)
    }
    clips.template('home', {})
    */

});