/**
 * Laufzeitumgebung: sichtbare Kennzeichnung und sicherer lokaler Wechsel.
 * Die Profile kommen ausschließlich aus der ignorierten config.local.js.
 */
const environmentService = {
    backendVersion: '',

    profiles() {
        return CONFIG.ENVIRONMENT_PROFILES || {};
    },

    render() {
        const banner = document.getElementById('environment-banner');
        const label = document.getElementById('environment-banner-label');
        const meta = document.getElementById('environment-banner-meta');
        const select = document.getElementById('environment-switch');
        if (!banner || !label || !meta || !select) return;

        const environment = CONFIG.ENVIRONMENT;
        const profile = this.profiles()[environment] || {};
        banner.hidden = false;
        banner.className = `environment-banner environment-banner-${environment}`;
        label.textContent = profile.label || CONFIG.ENVIRONMENT_LABEL || environment;
        meta.textContent = this.backendVersion
            ? `Backend ${this.backendVersion}`
            : (CONFIG.API_CONFIGURED ? 'Backend wird geprüft' : 'Keine API konfiguriert');

        const environments = Object.keys(this.profiles());
        select.innerHTML = '';
        if (environments.length < 2) {
            select.hidden = true;
            return;
        }

        environments.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = this.profiles()[name].label || name;
            select.appendChild(option);
        });
        select.value = environment;
        select.hidden = false;
        select.onchange = () => this.switchTo(select.value);
    },

    setBackendVersion(version) {
        this.backendVersion = String(version || '').trim();
        this.render();
    },

    switchTo(environment) {
        const target = String(environment || '').trim().toLowerCase();
        const profiles = this.profiles();
        if (!profiles[target] || target === CONFIG.ENVIRONMENT) {
            this.render();
            return false;
        }

        if (target === 'production' && typeof confirm === 'function'
            && !confirm('Du wechselst auf PRODUKTION. Dort arbeitest Du mit echten Daten. Fortfahren?')) {
            this.render();
            return false;
        }

        try {
            localStorage.setItem('hv_environment', target);
        } catch (error) {
            console.warn('Umgebung konnte nicht gespeichert werden:', error);
            this.render();
            return false;
        }
        location.reload();
        return true;
    }
};
