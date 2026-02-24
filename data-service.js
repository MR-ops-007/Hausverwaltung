// data-service.js
const dataService = {
    state: JSON.parse(localStorage.getItem('hv_app_state')) || {
        currentProperty: 'lokschuppen',
        data: { lokschuppen: { names: {}, rent: {} }, hauptstrasse: { names: {}, rent: {} } },
        history: [],
        queue: []
    },

    save() {
        localStorage.setItem('hv_app_state', JSON.stringify(this.state));
    },

    updateLocalTenant(unitId, name) {
        this.state.data[this.state.currentProperty].names[unitId] = name;
        this.save();
    }
};
