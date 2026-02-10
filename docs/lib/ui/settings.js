import GUI from 'lil-gui';

/**
 * @typedef {Object} SettingDef
 * @property {string} key
 * @property {string} type - 'slider' | 'color' | 'toggle' | 'dropdown'
 * @property {*} defaultValue
 * @property {Object} [guiParams] - Extra params for lil-gui .add()
 */

export class SettingsPanel {
    /** @type {string} */            sceneId;
    /** @type {GUI} */               gui;
    /** @type {Object<string, *>} */ values = {};
    /** @type {Object<string, *>} */ defaults = {};
    /** @type {Object<string, Function[]>} */ #listeners = {};
    /** @type {Object<string, *>} */         #controllers = {};

    /**
     * @param {string} sceneId - Used as localStorage namespace
     * @param {Object} [options]
     * @param {string} [options.title='Settings']
     * @param {HTMLElement} [options.container]
     */
    constructor(sceneId, options = {}) {
        this.sceneId = sceneId;
        this.gui = new GUI({
            title: options.title || 'Settings',
            container: options.container,
        });
    }

    /** @returns {string} localStorage key for a setting */
    #storageKey(key) {
        return `scenes:${this.sceneId}:${key}`;
    }

    /** Load a single value from localStorage, falling back to default */
    #loadValue(key) {
        const stored = localStorage.getItem(this.#storageKey(key));
        if (stored !== null) {
            try {
                this.values[key] = JSON.parse(stored);
            } catch {
                this.values[key] = this.defaults[key];
            }
        }
    }

    /** Save a single value to localStorage */
    #saveValue(key) {
        localStorage.setItem(this.#storageKey(key), JSON.stringify(this.values[key]));
    }

    /** Notify listeners for a key */
    #notify(key, value) {
        (this.#listeners[key] || []).forEach(fn => fn(value));
    }

    /** Wire up a lil-gui controller to save on change and notify listeners */
    #wire(controller, key) {
        this.#controllers[key] = controller;
        controller.onChange((value) => {
            this.values[key] = value;
            this.#saveValue(key);
            this.#notify(key, value);
        });
        return this;
    }

    /**
     * Get the lil-gui controller for a key.
     * Useful for calling .enable() / .disable() to grey out dependent settings.
     * @param {string} key
     * @returns {*} lil-gui controller
     */
    controller(key) {
        return this.#controllers[key];
    }

    /**
     * @param {string} key
     * @param {string} label
     * @param {number} min
     * @param {number} max
     * @param {number} step
     * @param {number} defaultValue
     * @returns {this}
     */
    addSlider(key, label, min, max, step, defaultValue) {
        this.defaults[key] = defaultValue;
        this.values[key] = defaultValue;
        this.#loadValue(key);
        const obj = { [label]: this.values[key] };
        const ctrl = this.gui.add(obj, label, min, max, step);
        return this.#wire(ctrl, key);
    }

    /**
     * @param {string} key
     * @param {string} label
     * @param {string} defaultValue - hex color string, e.g. '#ff0000'
     * @returns {this}
     */
    addColor(key, label, defaultValue) {
        this.defaults[key] = defaultValue;
        this.values[key] = defaultValue;
        this.#loadValue(key);
        const obj = { [label]: this.values[key] };
        const ctrl = this.gui.addColor(obj, label);
        return this.#wire(ctrl, key);
    }

    /**
     * @param {string} key
     * @param {string} label
     * @param {boolean} defaultValue
     * @returns {this}
     */
    addToggle(key, label, defaultValue) {
        this.defaults[key] = defaultValue;
        this.values[key] = defaultValue;
        this.#loadValue(key);
        const obj = { [label]: this.values[key] };
        const ctrl = this.gui.add(obj, label);
        return this.#wire(ctrl, key);
    }

    /**
     * @param {string} key
     * @param {string} label
     * @param {string[]|Object<string, *>} options
     * @param {*} defaultValue
     * @returns {this}
     */
    addDropdown(key, label, options, defaultValue) {
        this.defaults[key] = defaultValue;
        this.values[key] = defaultValue;
        this.#loadValue(key);
        const obj = { [label]: this.values[key] };
        const ctrl = this.gui.add(obj, label, options);
        return this.#wire(ctrl, key);
    }

    /**
     * @param {string} label
     * @param {Function} callback
     * @returns {this}
     */
    addButton(label, callback) {
        this.gui.add({ [label]: callback }, label);
        return this;
    }

    /** @returns {this} */
    addSeparator() {
        // lil-gui doesn't have native separators; use a folder trick or skip
        return this;
    }

    /**
     * @param {string} key
     * @returns {*}
     */
    get(key) {
        return this.values[key];
    }

    /**
     * @param {string} key
     * @param {Function} callback
     */
    onChange(key, callback) {
        if (!this.#listeners[key]) this.#listeners[key] = [];
        this.#listeners[key].push(callback);
    }

    /** Reset all values to defaults and clear localStorage */
    reset() {
        for (const key of Object.keys(this.defaults)) {
            this.values[key] = this.defaults[key];
            localStorage.removeItem(this.#storageKey(key));
        }
        // Rebuild GUI to reflect defaults
        this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    }

    /** Get the GUI's DOM element (for ChromeController registration) */
    get domElement() {
        return this.gui.domElement;
    }

    destroy() {
        this.gui.destroy();
    }
}
