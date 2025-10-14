import clips from '../../../clips.js';

clips.define('card', {

    /**
     * @see Clip#render
     */
    render: function(options) {
        return /*html*/`
            <card-clip>
                <div class="card__top-bar">
                    <div class="card__check${options.data.status === 'completed' ? " card__check--on" : ""}"></div>
                </div>
                <div class="card__body">${options.data.description}</div>
            </card-clip>
        `;
    }

}, /*css*/`
    card-clip {
        display: block;
        padding: 8px;
        margin-bottom: 16px;
        background-color: #0002;
    }

    .card__top-bar {
        display: flex;
        justify-content: flex-end;
    }

    .card__check {
        width: 16px;
        height: 16px;
        border: 2px solid #0008;
        border-radius: 50%;
    }
`);