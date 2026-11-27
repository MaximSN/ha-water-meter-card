const VERSION = "0.1.0";
const DEFAULTS = {
  name: "Счётчики воды",
  hot_label: "ГВС",
  cold_label: "ХВС",
  hot_color: [229, 57, 53],
  cold_color: [30, 136, 229],
  correction_step: 0.001,
  show_correction: true
};

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function num(hass, id) {
  if (!id || !hass || !hass.states[id]) return null;
  var s = hass.states[id].state;
  if (s === "unknown" || s === "unavailable") return null;
  var n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function fmt(n) {
  return n == null ? "—" : new Intl.NumberFormat("ru-RU", {maximumFractionDigits:3}).format(n);
}
function round(n) { return Number(Number(n).toFixed(6)); }
function cssColor(value,fallback) {
  if (Array.isArray(value) && value.length >= 3) return "rgb(" + value.slice(0,3).map(Number).join(",") + ")";
  return typeof value === "string" && value ? value : fallback;
}

class WaterMeterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null;
    this._hass = null;
    this._dialog = false;
    this._busy = false;
  }
  static getConfigElement() {
    return document.createElement("ha-water-meter-card-editor");
  }
  static getStubConfig() {
    return { name: "Счётчики воды", hot_label: "ГВС", cold_label: "ХВС", correction_step: 0.001, show_correction: true };
  }
  setConfig(config) {
    if (!config) throw new Error("Не задана конфигурация карточки");
    this._config = Object.assign({}, DEFAULTS, config);
    this._render();
  }
  set hass(value) {
    this._hass = value;
    this._render();
  }
  get hass() { return this._hass; }
  getCardSize() { return 2; }

  _channel(key) {
    var hot = key === "hot";
    var c = this._config;
    var sensor = c[hot ? "hot_sensor" : "cold_sensor"];
    var correctionEntity = c[hot ? "hot_correction" : "cold_correction"];
    var numberEntity = c[hot ? "hot_number" : "cold_number"];
    return {
      key:key,
      label:c[hot ? "hot_label" : "cold_label"],
      color:cssColor(c[hot ? "hot_color" : "cold_color"],hot ? "#e53935" : "#1e88e5"),
      meter:c[hot ? "hot_meter" : "cold_meter"] || "",
      sensor:sensor,
      correctionEntity:correctionEntity,
      numberEntity:numberEntity,
      value:num(this._hass,sensor),
      correction:num(this._hass,correctionEntity) || 0,
      nativeValue:num(this._hass,numberEntity)
    };
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    var c = this._config;
    var hot = this._channel("hot");
    var cold = this._channel("cold");
    var battery = num(this._hass,c.battery_sensor);
    var signal = num(this._hass,c.signal_sensor);
    var info = "";
    if (battery != null) info += '<span class="info"><ha-icon icon="mdi:battery"></ha-icon>' + fmt(battery) + '%</span>';
    if (signal != null) info += '<span class="info"><ha-icon icon="mdi:signal"></ha-icon>' + fmt(signal) + ' dBm</span>';

    var html = '<style>' +
      ':host{display:block;color:var(--primary-text-color)}ha-card{padding:16px;overflow:hidden}' +
      '.head{display:flex;align-items:center;gap:10px;min-height:28px}.room{font-size:16px;font-weight:600;flex:1;min-width:0;overflow-wrap:anywhere}' +
      '.device{display:flex;gap:9px;color:var(--secondary-text-color);font-size:12px;white-space:nowrap}.info{display:flex;align-items:center;gap:3px}' +
      '.save{border:0;background:transparent;color:var(--secondary-text-color);cursor:pointer;padding:4px}.save ha-icon{--mdc-icon-size:21px}' +
      '.meters{display:flex;flex-direction:column;gap:12px;margin-top:16px}.meter{display:grid;grid-template-columns:22px auto minmax(0,1fr) auto auto auto;align-items:center;gap:8px;min-height:34px}' +
      '.drop{width:20px;height:24px}.drop svg{width:19px;height:23px}.label{font-weight:600;white-space:nowrap}.meter-no{font-size:12px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.correction{font-size:12px;color:var(--secondary-text-color);white-space:nowrap}.buttons{display:flex;gap:4px}.buttons button{width:27px;height:27px;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:18px;cursor:pointer;padding:0}' +
      'button:disabled{opacity:.45;cursor:default}.value{font-size:16px;font-weight:600;text-align:right;white-space:nowrap;min-width:76px;font-variant-numeric:tabular-nums}' +
      '.backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.dialog{width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--card-background-color,var(--primary-background-color));color:var(--primary-text-color);border-radius:14px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,.28)}' +
      '.dialog h2{margin:0 0 8px;font-size:18px}.note{color:var(--secondary-text-color);font-size:13px;margin-bottom:16px}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 6px;border-bottom:1px solid var(--divider-color);text-align:right;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}th{color:var(--secondary-text-color);font-weight:500}' +
      '.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.actions button{border:0;border-radius:8px;padding:9px 16px;cursor:pointer;font:inherit}.cancel{background:var(--secondary-background-color);color:var(--primary-text-color)}.confirm{background:var(--primary-color);color:var(--text-primary-color,#fff)}' +
      '@media(max-width:420px){ha-card{padding:12px}.meter{grid-template-columns:20px auto minmax(0,1fr) auto auto;gap:6px}.meter-no{display:none}.value{min-width:68px;font-size:15px}.device{gap:6px;font-size:11px}}' +
      '</style><ha-card><div class="head"><div class="room">' + esc(c.name) + '</div><div class="device">' + info + '</div>' +
      '<button class="save" title="Зафиксировать показания" aria-label="Зафиксировать показания" ' + (this._busy ? "disabled" : "") + '><ha-icon icon="mdi:content-save"></ha-icon></button></div>' +
      '<div class="meters">' + this._renderChannel(hot) + this._renderChannel(cold) + '</div></ha-card>' +
      (this._dialog ? this._renderDialog(hot,cold) : "");
    this.shadowRoot.innerHTML = html;

    var self = this;
    var save = this.shadowRoot.querySelector(".save");
    if (save) save.addEventListener("click",function(){self._dialog=true;self._render();});
    this.shadowRoot.querySelectorAll("[data-adjust]").forEach(function(b){
      b.addEventListener("click",function(){self._adjust(b.dataset.entity,Number(b.dataset.delta));});
    });
    var cancel = this.shadowRoot.querySelector(".cancel");
    if (cancel) cancel.addEventListener("click",function(){if(!self._busy){self._dialog=false;self._render();}});
    var confirm = this.shadowRoot.querySelector(".confirm");
    if (confirm) confirm.addEventListener("click",function(){self._confirm();});
  }

  _renderChannel(d) {
    var correction = this._config.show_correction === false ? "" :
      '<span class="correction">' + (d.correction >= 0 ? "+" : "") + fmt(d.correction) + '</span>';
    var drop = '<span class="drop"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.8C9.2 6.1 3.4 12.2 3.4 17.1a8.6 8.6 0 0 0 17.2 0C20.6 12.2 14.8 6.1 12 1.8Z" fill="' + esc(d.color) + '"/></svg></span>';
    var disabled = !d.correctionEntity || this._busy ? "disabled" : "";
    return '<div class="meter">' + drop + '<span class="label">' + esc(d.label) + '</span>' +
      '<span class="meter-no">' + esc(d.meter) + '</span>' + correction +
      '<span class="buttons"><button type="button" data-adjust data-entity="' + esc(d.correctionEntity) + '" data-delta="-1" aria-label="Уменьшить" ' + disabled + '>−</button>' +
      '<button type="button" data-adjust data-entity="' + esc(d.correctionEntity) + '" data-delta="1" aria-label="Увеличить" ' + disabled + '>+</button></span>' +
      '<span class="value">' + fmt(d.value) + '</span></div>';
  }

  _renderDialog(hot,cold) {
    var rows = [hot,cold].map(function(d){
      return '<tr><td>' + esc(d.label) + '</td><td>' + fmt(d.value) + '</td><td>' + fmt(d.nativeValue) + '</td><td>' + fmt(d.correction) + '</td></tr>';
    }).join("");
    return '<div class="backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-label="Фиксация показаний">' +
      '<h2>Фиксация показаний</h2><div class="note">После подтверждения итоговые значения будут отправлены в прибор. Поправка каждого канала обнулится только после подтверждения записи этого канала.</div>' +
      '<table><thead><tr><th></th><th>Итог</th><th>В приборе</th><th>Поправка</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="actions"><button class="cancel" type="button" ' + (this._busy ? "disabled" : "") + '>Отмена</button>' +
      '<button class="confirm" type="button" ' + (this._busy ? "disabled" : "") + '>' + (this._busy ? "Ожидание…" : "Подтвердить запись") + '</button></div></section></div>';
  }

  async _adjust(entityId,direction) {
    if (!entityId || this._busy) return;
    var current = num(this._hass,entityId);
    var step = Number(this._config.correction_step);
    if (current == null || !Number.isFinite(step) || step <= 0) {
      alert("Проверьте сущность корректировки и шаг софт-корректировки.");
      return;
    }
    try {
      await this._hass.callService("input_number","set_value",{entity_id:entityId,value:round(current + direction * step)});
    } catch(e) {
      alert("Не удалось изменить корректировку: " + (e.message || e));
    }
  }

  async _confirm() {
    if (this._busy) return;
    var self = this;
    var channels = [this._channel("hot"),this._channel("cold")];
    if (channels.some(function(d){return !d.sensor || !d.numberEntity || !d.correctionEntity || d.value == null;})) {
      alert("Для фиксации выберите итоговые сенсоры, сущности number и input_number для обоих каналов.");
      return;
    }
    this._busy = true;
    this._render();

    var waiters = [];
    var unsubscribe = null;
    try {
      unsubscribe = await this._hass.connection.subscribeEvents(function(event){
        var entityId = event && event.data && event.data.entity_id;
        var state = event && event.data && event.data.new_state && event.data.new_state.state;
        var value = Number(state);
        if (!Number.isFinite(value)) return;
        waiters.forEach(function(w){
          if (!w.done && w.entityId === entityId && Math.abs(value-w.target) < 0.000001) {
            w.done = true;
            clearTimeout(w.timer);
            w.resolve(true);
          }
        });
      },"state_changed");

      var confirmations = channels.map(function(d){
        return new Promise(function(resolve){
          var w = {entityId:d.numberEntity,target:d.value,resolve:resolve,done:false};
          w.timer = setTimeout(function(){if(!w.done){w.done=true;resolve(false);}},20000);
          waiters.push(w);
        });
      });

      var calls = await Promise.allSettled(channels.map(function(d){
        return self._hass.callService("number","set_value",{entity_id:d.numberEntity,value:d.value});
      }));
      var confirmed = await Promise.all(confirmations);
      if (unsubscribe) unsubscribe();

      var reset = await Promise.all(channels.map(async function(d,i){
        if (!confirmed[i]) return false;
        try {
          await self._hass.callService("input_number","set_value",{entity_id:d.correctionEntity,value:0});
          return true;
        } catch(e) { return false; }
      }));

      this._busy = false;
      this._dialog = false;
      this._render();
      var messages = channels.map(function(d,i){
        if (!confirmed[i] || calls[i].status !== "fulfilled") return d.label + ": прибор не подтвердил запись. Поправка сохранена.";
        if (!reset[i]) return d.label + ": показание записано, но поправку не удалось обнулить. Проверьте её вручную.";
        return d.label + ": запись подтверждена, поправка обнулена.";
      });
      alert(messages.join("\n"));
    } catch(e) {
      waiters.forEach(function(w){clearTimeout(w.timer);if(!w.done){w.done=true;w.resolve(false);}});
      if (unsubscribe) unsubscribe();
      this._busy = false;
      this._render();
      alert("Ошибка фиксации: " + (e.message || e));
    }
  }
}

class WaterMeterCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = Object.assign({},DEFAULTS);
    this._hass = null;
  }
  set hass(value) { this._hass=value; this._render(); }
  setConfig(config) { this._config=Object.assign({},DEFAULTS,config); this._render(); }
  _schema() {
    var entity = function(domain){return {entity:{domain:domain}};};
    return [
      {name:"name",label:"Название помещения",selector:{text:{}}},
      {name:"hot_sensor",label:"Сенсор итогового показания ГВС",selector:entity("sensor")},
      {name:"cold_sensor",label:"Сенсор итогового показания ХВС",selector:entity("sensor")},
      {name:"battery_sensor",label:"Сенсор заряда батареи",selector:entity("sensor")},
      {name:"signal_sensor",label:"Сенсор уровня сигнала",selector:entity("sensor")},
      {name:"hot_correction",label:"Поправка ГВС (input_number)",selector:entity("input_number")},
      {name:"cold_correction",label:"Поправка ХВС (input_number)",selector:entity("input_number")},
      {name:"hot_number",label:"Сущность записи ГВС (L3)",selector:entity("number")},
      {name:"cold_number",label:"Сущность записи ХВС (L5)",selector:entity("number")},
      {name:"hot_meter",label:"Номер счётчика ГВС",selector:{text:{}}},
      {name:"cold_meter",label:"Номер счётчика ХВС",selector:{text:{}}},
      {name:"hot_label",label:"Подпись ГВС",selector:{text:{}}},
      {name:"cold_label",label:"Подпись ХВС",selector:{text:{}}},
      {name:"hot_color",label:"Цвет ГВС",selector:{color_rgb:{}}},
      {name:"cold_color",label:"Цвет ХВС",selector:{color_rgb:{}}},
      {name:"correction_step",label:"Шаг софт-корректировки (м³)",selector:{number:{min:0.000001,max:100,step:0.001,mode:"box"}}},
      {name:"show_correction",label:"Показывать накопленную корректировку",selector:{boolean:{}}}
    ];
  }
  _render() {
    if (!this.shadowRoot || !this._hass) return;
    this.shadowRoot.innerHTML="<ha-form></ha-form>";
    var form=this.shadowRoot.querySelector("ha-form");
    form.hass=this._hass;
    form.data=Object.assign({},DEFAULTS,this._config);
    form.schema=this._schema();
    form.computeLabel=function(schema){return schema.label || schema.name;};
    var self=this;
    form.addEventListener("value-changed",function(event){
      self._config=Object.assign({},self._config,event.detail.value);
      self.dispatchEvent(new CustomEvent("config-changed",{detail:{config:self._config},bubbles:true,composed:true}));
    });
  }
}

if (!customElements.get("ha-water-meter-card")) customElements.define("ha-water-meter-card",WaterMeterCard);
if (!customElements.get("ha-water-meter-card-editor")) customElements.define("ha-water-meter-card-editor",WaterMeterCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:"ha-water-meter-card",name:"Water Meter Card",description:"Карточка двухканального счётчика воды с софт-корректировками и ручной фиксацией показаний."});
console.info("%c WATER METER CARD %c "+VERSION,"color:white;background:#039be5;font-weight:bold;","color:#039be5;background:white;font-weight:bold;");
