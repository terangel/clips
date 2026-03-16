import clips from '../../../clips.js';

/*
function ejs(strings, ...values) {
	return String.raw(strings, ...values);
} */

clips.define('home', 'view', {

    styles: css`
        [data-clip="home"] {
            /* ... */
        }
    `,

    layout: ejs`
        <div data-clip='songs'>
            <ul>
            <% for (const song of songs) { %>
                <li><%= song.title %></li>
            <% } %>
            </ul>
        </div>
    `,

    /**
     * @see Clip#create 
     */
    create: function(options) {
        
        clips.template('home/layout', ejs`
            <div data-clip='songs'>
                <ul>
                <% for (const song of songs) { %>
                    <li><%= song.title %></li>
                <% } %>
                </ul>
            </div>
        `);

    },


    /**
     * @see Clip#render 
     */
    render: function(context, options) {
        return clips.render('home/layout', {});
        // return ejs`
        //     <div data-clip='songs'>
        //         <ul>
        //         <% for (const song of songs) { %>
        //             <li><%= song.title %></li>
        //         <% } %>
        //         </ul>
        //     </div>
        // `;

        /*

        ctx.print(/*html*`
            <div data-clip='songs'>
                <ul>`, 
                    () => {
                        for (const song of songs) {
                            ctx.print(`<li>${song.title}</li>`);
                        }
                    }, /*html*`
                </ul>
            </div>
        `);


        return /*html*`
            <div data-clip="home">
                <h1>HOME</h1>
                ${context.include('today', { theme: 'dark' })}
            </div>
        `;
        */
    },

    renderLine: function(context, options) {
        return ejs`
            <div class='line'></div>
        `;
    }
    
}, ejs`
    <div data-clip='songs'>
        <ul>
        <% for (const song of songs) { %>
            <li><%= song.title %></li>
        <% } %>
        </ul>
    </div>
`, /*css*/`
    [data-clip="home"] {
        /* ... */
    }
`);