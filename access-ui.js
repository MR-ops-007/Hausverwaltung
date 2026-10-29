/**
 * ACCESS-UI: Dialog zur Eingabe des Zugangsschlüssels.
 * Wird nur bei Bedarf angezeigt (wenn das Backend UNAUTHORIZED meldet).
 */
const accessUi = {
    pending: null,

    /** Zeigt den Dialog und liefert den eingegebenen Schlüssel oder null bei Abbruch. */
    prompt(message) {
        if (this.pending) return this.pending;

        this.pending = new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'access-overlay';
            overlay.innerHTML = `
                <div class="access-dialog" role="dialog" aria-modal="true" aria-labelledby="access-title">
                    <h2 id="access-title">Zugangsschlüssel</h2>
                    <p class="access-message"></p>
                    <input id="access-key" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-label="Zugangsschlüssel">
                    <div class="access-actions">
                        <button type="button" class="access-cancel">Abbrechen</button>
                        <button type="button" class="access-save">Speichern</button>
                    </div>
                </div>`;
            overlay.querySelector('.access-message').textContent = message || '';

            const input = overlay.querySelector('#access-key');
            const save = overlay.querySelector('.access-save');
            const close = value => {
                overlay.remove();
                this.pending = null;
                resolve(value);
            };

            save.addEventListener('click', () => {
                const value = input.value.trim();
                if (value) close(value);
                else input.focus();
            });
            overlay.querySelector('.access-cancel').addEventListener('click', () => close(null));
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') save.click();
                if (event.key === 'Escape') close(null);
            });

            document.body.appendChild(overlay);
            input.focus();
        });

        return this.pending;
    }
};
