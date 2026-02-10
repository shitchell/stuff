/**
 * @typedef {Object} ChromeOptions
 * @property {number} [timeout=3000] - ms of inactivity before hiding
 * @property {Function} [onIdle] - called when inactivity timeout fires (used by AutoCamera)
 * @property {Function} [onActive] - called when user becomes active again
 */

export class ChromeController {
    /** @type {HTMLElement[]} */ #elements;
    /** @type {number} */       #timeout;
    /** @type {number|null} */  #timerId = null;
    /** @type {boolean} */      #visible = true;
    /** @type {Function|null} */ #onIdle;
    /** @type {Function|null} */ #onActive;

    /**
     * @param {HTMLElement[]} elements - DOM elements to show/hide
     * @param {ChromeOptions} [options]
     */
    constructor(elements, options = {}) {
        this.#elements = elements;
        this.#timeout = options.timeout ?? 3000;
        this.#onIdle = options.onIdle ?? null;
        this.#onActive = options.onActive ?? null;

        // Add chrome classes
        this.#elements.forEach(el => {
            el.classList.add('chrome', 'chrome-visible');
        });

        // Bind handlers
        this._onActivity = () => this.#handleActivity();
        this._onKeyDown = (e) => this.#handleKeyDown(e);
        this._onDblClick = () => this.#toggleFullscreen();

        document.addEventListener('mousemove', this._onActivity);
        document.addEventListener('keydown', this._onActivity);
        document.addEventListener('touchstart', this._onActivity);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('dblclick', this._onDblClick);

        this.resetTimer();
    }

    #handleActivity() {
        if (!this.#visible) {
            this.show();
            if (this.#onActive) this.#onActive();
        }
        this.resetTimer();
    }

    #handleKeyDown(e) {
        // Don't intercept F key when user is typing in a lil-gui input field
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.#toggleFullscreen();
        }
    }

    #toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }

    show() {
        this.#visible = true;
        this.#elements.forEach(el => {
            el.classList.remove('chrome-hidden');
            el.classList.add('chrome-visible');
        });
    }

    hide() {
        this.#visible = false;
        this.#elements.forEach(el => {
            el.classList.remove('chrome-visible');
            el.classList.add('chrome-hidden');
        });
        if (this.#onIdle) this.#onIdle();
    }

    resetTimer() {
        if (this.#timerId !== null) clearTimeout(this.#timerId);
        this.#timerId = setTimeout(() => this.hide(), this.#timeout);
    }

    destroy() {
        if (this.#timerId !== null) clearTimeout(this.#timerId);
        document.removeEventListener('mousemove', this._onActivity);
        document.removeEventListener('keydown', this._onActivity);
        document.removeEventListener('touchstart', this._onActivity);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('dblclick', this._onDblClick);
    }
}
