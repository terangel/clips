class Clip extends EventTarget {

    #root = null;
    #parentClip = null;
    #childClips = new Set();
    #loadTime = 0;

    constructor(options = {}) {
        super();
    }

    get root() {
        return this.#root;
    }

    get parentClip() {
        return this.#parentClip;
    }

    get childClips() {
        return [...this.#childClips];
    }

    get childCount() {
        return this.#childClips.size;
    }

    async render(options = {}) {
    }

    ready(options = {}) {
    }

    async load(options = {}) {
    }

    async update(options = {}) {
    }
}
}
