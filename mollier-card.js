class MollierCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this.chartDiv) {
      this.attachShadow({ mode: 'open' });
      const div = document.createElement('div');
      div.style.width = '100%';
      div.style.height = '500px';
      this.shadowRoot.appendChild(div);
      this.chartDiv = div;

      if (!window.Plotly) {
        const script = document.createElement('script');
        script.src = "https://cdn.plot.ly/plotly-latest.min.js";
        script.onload = () => this._loadHistory();
        document.head.appendChild(script);
      } else {
        this._loadHistory();
      }
    } else {
      this._loadHistory();
    }
  }

  setConfig(config) {
    this.config = config || {};
    this.sensors = this.config.sensors || [
      { temperature_entity: 'sensor.temperature', humidity_entity: 'sensor.humidity', color: 'red', name: 'Capteur 1' }
    ];
    this.comfortZones = this.config.comfort_zones || [
      {t_min:20, t_max:25, rh_min:40, rh_max:60, color:'rgba(0,255,0,0.2)'}
    ];
    this.p_atm = this.config.pressure_atm || 101.325; // kPa par défaut
  }

  getCardSize() { return 1; }

  async _loadHistory() {
    const end = new Date();
    const start = new Date(end.getTime() - 24*60*60*1000);

    const traces = [];
    for (const sensor of this.sensors) {
      const tempData = await this._fetchHistory(sensor.temperature_entity, start, end);
      const humData = await this._fetchHistory(sensor.humidity_entity, start, end);

      const points = [];
      tempData.forEach(tItem => {
        const hItem = humData.find(h => h.last_updated === tItem.last_updated);
        if (hItem) points.push({ temp: parseFloat(tItem.state), hum: parseFloat(hItem.state) });
      });

      traces.push(this._createTrace(points, sensor.color, sensor.name));
    }

    const rhTraces = this._generateRHCurves(this.p_atm);
    const shapes = this._generateComfortZones(this.p_atm);

    const layout = {
      title: 'Diagramme de Mollier Multi-capteurs',
      xaxis: { title: 'Température (°C)' },
      yaxis: { title: 'Enthalpie (kJ/kg)' },
      margin: { t: 40 },
      hovermode: 'closest',
      shapes: shapes
    };

    Plotly.newPlot(this.chartDiv, [...traces, ...rhTraces], layout, {responsive: true});
  }

  async _fetchHistory(entity, start, end) {
    const url = `/api/history/period/${start.toISOString()}?filter_entity_id=${entity}`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${this._hass.auth.token}` } });
    const data = await resp.json();
    return data[0] || [];
  }

  _createTrace(points, color, name) {
    const x = [], y = [], text = [];
    points.forEach(p => {
      const h = this._calcEnthalpie(p.temp, p.hum, this.p_atm);
      const dewPoint = this._calcDewPoint(p.temp, p.hum);
      x.push(p.temp);
      y.push(h);
      text.push(`Temp: ${p.temp}°C<br>Hum: ${p.hum}%<br>Enthalpie: ${h.toFixed(1)} kJ/kg<br>Point de rosée: ${dewPoint.toFixed(1)}°C`);
    });

    return {
      x: x,
      y: y,
      mode: 'lines+markers',
      marker: { size: 6, color: color },
      line: { color: color },
      text: text,
      hoverinfo: 'text',
      name: name
    };
  }

  _calcEnthalpie(temp, hum, p_atm) {
    const p_sat = 0.61078 * Math.exp((17.27 * temp)/(temp + 237.3));
    const p_v = hum/100 * p_sat;
    const w = 0.622 * p_v / (p_atm - p_v);
    return 1.006*temp + w*(2501 + 1.86*temp);
  }

  _calcDewPoint(temp, hum) {
    const a = 17.27, b = 237.3;
    const alpha = ((a*temp)/(b+temp)) + Math.log(hum/100);
    return (b*alpha)/(a-alpha);
  }

  _generateRHCurves(p_atm) {
    const rhPercents = [10,20,30,40,50,60,70,80,90,100];
    const curves = [];
    for (const rh of rhPercents) {
      const x = [], y = [];
      for (let temp=-10; temp<=50; temp+=1) {
        x.push(temp);
        y.push(this._calcEnthalpie(temp, rh, p_atm));
      }
      curves.push({
        x: x,
        y: y,
        mode: 'lines',
        line: { dash: 'dot', width: 1, color: 'blue' },
        name: `RH ${rh}%`,
        hoverinfo: 'none'
      });
    }
    return curves;
  }

  _generateComfortZones(p_atm) {
    const shapes = [];
    this.comfortZones.forEach(zone => {
      const yMin = this._calcEnthalpie(zone.t_min, zone.rh_min, p_atm);
      const yMax = this._calcEnthalpie(zone.t_max, zone.rh_max, p_atm);
      shapes.push({
        type: 'rect',
        x0: zone.t_min,
        x1: zone.t_max,
        y0: yMin,
        y1: yMax,
        fillcolor: zone.color,
        line: { width: 0 },
        layer: 'below'
      });
    });
    return shapes;
  }
}

customElements.define('mollier-card', MollierCard);
