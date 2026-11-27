const DEFAULTS = {
  name: "Счётчики воды",
  hot_label: "ГВС",
  cold_label: "ХВС",
  hot_color: [229, 57, 53],
  cold_color: [30, 136, 229],
  show_correction: true,
  show_zero_correction: false,
  show_battery_signal_values: false,
  secondary_info: "last-changed",
  hot_coefficient: 1,
  cold_coefficient: 1
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
function sameValue(a,b) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  var aKeys = Object.keys(a).sort();
  var bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (var i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i] || !sameValue(a[aKeys[i]],b[bKeys[i]])) return false;
  }
  return true;
}

function cleanConfig(config) {
  var result = Object.assign({},config || {});
  Object.keys(result).forEach(function(key) {
    if (result[key] === undefined) delete result[key];
  });
  return result;
}

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
    return { name: "Счётчики воды", hot_label: "ГВС", cold_label: "ХВС", hot_coefficient: 1, cold_coefficient: 1, show_correction: true, show_zero_correction: false, show_battery_signal_values: false };
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
    var coefficient = Number(c[hot ? "hot_coefficient" : "cold_coefficient"]);
    if (!Number.isFinite(coefficient) || coefficient <= 0) coefficient = 1;
    var value = num(this._hass,sensor);
    var correction = num(this._hass,correctionEntity) || 0;
    var nativeValue = num(this._hass,numberEntity);
    var correctionAttributes = this._hass && this._hass.states[correctionEntity]
      ? this._hass.states[correctionEntity].attributes || {}
      : {};
    var correctionMin = Number(correctionAttributes.min);
    var correctionMax = Number(correctionAttributes.max);
    var correctionStep = Number(correctionAttributes.step);
    if (!Number.isFinite(correctionMin)) correctionMin = 0;
    if (!Number.isFinite(correctionMax)) correctionMax = Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(correctionStep) || correctionStep <= 0) correctionStep = 1;
    return {
      key:key,
      label:c[hot ? "hot_label" : "cold_label"],
      color:cssColor(c[hot ? "hot_color" : "cold_color"],hot ? "#e53935" : "#1e88e5"),
      meter:c[hot ? "hot_meter" : "cold_meter"] || "",
      sensor:sensor,
      correctionEntity:correctionEntity,
      numberEntity:numberEntity,
      value:value,
      correction:correction,
      correctionMin:correctionMin,
      correctionMax:correctionMax,
      correctionStep:correctionStep,
      nativeValue:nativeValue,
      coefficient:coefficient,
      displayCorrection:correction * coefficient,
      totalValue:value == null ? null : value + correction * coefficient,
      nativeDisplayValue:nativeValue == null ? null : nativeValue * coefficient,
      unit:(this._hass && this._hass.states[sensor] && this._hass.states[sensor].attributes && this._hass.states[sensor].attributes.unit_of_measurement) || "",
      lastChanged:(this._hass && this._hass.states[sensor] && this._hass.states[sensor].last_changed) || "",
      lastUpdated:(this._hass && this._hass.states[sensor] && this._hass.states[sensor].last_updated) || ""
    };
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    var c = this._config, hot = this._channel("hot"), cold = this._channel("cold");
    var battery = num(this._hass,c.battery_sensor), signal = num(this._hass,c.signal_sensor);
    var showNumbers = c.show_battery_signal_values === true, info = "";
    if (c.battery_sensor) info += this._renderIndicator("battery",battery,showNumbers,c.battery_sensor);
    if (c.signal_sensor) info += this._renderIndicator("signal",signal,showNumbers,c.signal_sensor);
    var canSave = [hot,cold].every(function(d){return !!d.sensor && !!d.correctionEntity && !!d.numberEntity;});
    var html = '<style>' +
      ':host{display:block;color:var(--primary-text-color)}ha-card{padding:16px;overflow:hidden}' +
      '.head{display:flex;align-items:center;gap:10px;min-height:30px}.room{font-size:16px;font-weight:600;flex:1;min-width:0;overflow-wrap:anywhere}' +
      '.device{display:flex;gap:10px;color:var(--secondary-text-color);font-size:12px;align-items:center}.info{display:flex;align-items:center;gap:4px}.indicator{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center}.indicator svg{width:22px;height:22px;display:block}' +
      '.save{border:0;background:transparent;color:var(--primary-color);cursor:pointer;padding:4px}.save ha-icon{--mdc-icon-size:22px}.save:disabled{opacity:.35;cursor:default}' +
      '.meters{display:flex;flex-direction:column;gap:10px;margin-top:14px}.meter-block{min-width:0}.meter{display:flex;align-items:center;gap:7px;min-height:32px;white-space:nowrap}.drop{width:20px;height:24px;flex:0 0 20px}.drop svg{width:19px;height:23px;display:block}.label{font-weight:400;font-size:16px;min-width:0;overflow:hidden;text-overflow:ellipsis}.meter-no{font-size:16px;font-weight:400;color:var(--secondary-text-color)}.clickable{cursor:pointer}' +
      '.adjustment{display:flex;align-items:center;gap:5px;margin-left:auto;flex:0 0 auto}.correction{font-size:16px;font-weight:400;white-space:nowrap}.buttons{display:flex;gap:3px;flex:0 0 auto}.buttons button{width:25px;height:25px;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:17px;cursor:pointer;padding:0;line-height:1}' +
      'button:disabled{opacity:.4;cursor:default}.reading{display:flex;align-items:baseline;gap:4px;min-width:0;margin-left:1.5em}.value{font-size:16px;font-weight:400;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.unit{font-size:11px;color:var(--secondary-text-color)}.secondary{font-size:10px;color:var(--secondary-text-color);margin-top:1px}.secondary ha-relative-time{font-size:inherit}' +
      '.backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.dialog{width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--card-background-color,var(--primary-background-color));color:var(--primary-text-color);border-radius:14px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,.28)}' +
      '.dialog h2{margin:0 0 8px;font-size:18px}.note{color:var(--secondary-text-color);font-size:13px;margin-bottom:16px}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 6px;border-bottom:1px solid var(--divider-color);text-align:right;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}th{color:var(--secondary-text-color);font-weight:500}' +
      '.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.actions button{border:0;border-radius:8px;padding:9px 16px;cursor:pointer;font:inherit}.cancel{background:var(--secondary-background-color);color:var(--primary-text-color)}.confirm{background:var(--primary-color);color:var(--text-primary-color,#fff)}' +
      '@media(max-width:420px){ha-card{padding:12px}.head{gap:7px}.device{gap:6px}.meter{gap:5px}.label,.meter-no,.correction,.value{font-size:14px}.buttons button{width:23px;height:23px}}' +
      '</style><ha-card><div class="head"><div class="room">' + esc(c.name) + '</div><div class="device">' + info + '</div>' +
      '<button class="save" title="Зафиксировать показания" aria-label="Зафиксировать показания" ' + (!canSave || this._busy ? "disabled" : "") + '><ha-icon icon="mdi:content-save"></ha-icon></button></div>' +
      '<div class="meters">' + this._renderChannel(hot) + this._renderChannel(cold) + '</div></ha-card>' +
      (this._dialog ? this._renderDialog(hot,cold) : "");
    this.shadowRoot.innerHTML = html;
    var self = this, save = this.shadowRoot.querySelector(".save");
    if (save) save.addEventListener("click",function(){if(!save.disabled){self._dialog=true;self._render();}});
    this.shadowRoot.querySelectorAll("[data-adjust]").forEach(function(btn){btn.addEventListener("click",function(){self._adjust(btn.dataset.entity,Number(btn.dataset.delta));});});
    this.shadowRoot.querySelectorAll("[data-more-info]").forEach(function(el){el.addEventListener("click",function(){self._showMoreInfo(el.dataset.moreInfo);});});
    var cancel = this.shadowRoot.querySelector(".cancel");
    if (cancel) cancel.addEventListener("click",function(){if(!self._busy){self._dialog=false;self._render();}});
    var confirm = this.shadowRoot.querySelector(".confirm");
    if (confirm) confirm.addEventListener("click",function(){self._confirm();});
    this.shadowRoot.querySelectorAll("ha-relative-time").forEach(function(el){
      el.hass=self._hass;
      el.datetime=new Date(el.getAttribute("datetime"));
    });
  }

  _showMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId:entityId},bubbles:true,composed:true}));
  }

  _renderIndicator(type,value,showNumber,entityId) {
    var color,level;
    if(type==="battery"){color=value==null?"var(--secondary-text-color)":value>70?"#43a047":value>=30?"#f9a825":"#e53935";level=value==null?0:value>70?3:value>=30?2:1;}
    else {color=value==null?"var(--secondary-text-color)":value>120?"#43a047":value>=60?"#f9a825":"#e53935";level=value==null?0:value>120?4:value>=60?2:1;}
    var svg=type==="battery"
      ? '<svg viewBox="0 0 26 18" aria-label="Батарея"><path d="M3 3h18v12H3z M22 7h2v4h-2" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linejoin="round"/>'+[0,1,2].map(function(i){return '<rect x="'+(5+i*5)+'" y="5" width="3.5" height="8" rx=".5" fill="'+(i<level?color:"var(--divider-color)")+'"/>';}).join("")+'</svg>'
      : '<svg viewBox="0 0 24 22" aria-label="Сигнал"><path d="M3 19h18" stroke="'+color+'" stroke-width="1.6"/>'+[0,1,2,3].map(function(i){var h=5+i*4;return '<rect x="'+(3+i*5)+'" y="'+(19-h)+'" width="3.5" height="'+h+'" rx=".5" fill="'+(i<level?color:"var(--divider-color)")+'"/>';}).join("")+'</svg>';
    return '<span class="info clickable" data-more-info="'+esc(entityId)+'" title="Открыть сенсор"><span class="indicator">'+svg+'</span>'+(showNumber&&value!=null?'<span>'+fmt(value)+(type==="battery"?"%":" dBm")+'</span>':"")+'</span>';
  }

  _renderChannel(d) {
    var correction=d.displayCorrection!==0||this._config.show_zero_correction===true
      ? '<span class="correction" style="color:'+(d.displayCorrection>0?"#43a047":d.displayCorrection<0?"#e53935":"var(--secondary-text-color)")+'">'+(d.displayCorrection>0?"+":d.displayCorrection<0?"−":"")+fmt(Math.abs(d.displayCorrection))+'</span>'
      : "";
    var unavailable=!d.correctionEntity||d.correction==null||this._busy;
    var minusDisabled=unavailable||d.correction<=d.correctionMin?"disabled":"";
    var plusDisabled=unavailable||d.correction>=d.correctionMax?"disabled":"";
    var icon='<span class="drop"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.8C9.2 6.1 3.4 12.2 3.4 17.1a8.6 8.6 0 0 0 17.2 0C20.6 12.2 14.8 6.1 12 1.8Z" fill="'+esc(d.color)+'"/></svg></span>';
    var adjustment=(correction||"")+'<span class="buttons"><button type="button" data-adjust data-entity="'+esc(d.correctionEntity)+'" data-delta="-1" aria-label="Уменьшить" '+minusDisabled+'>−</button>'+
      '<button type="button" data-adjust data-entity="'+esc(d.correctionEntity)+'" data-delta="1" aria-label="Увеличить" '+plusDisabled+'>+</button></span>';
    var secondary=this._renderSecondary(d);
    return '<div class="meter-block"><div class="meter">'+icon+'<span class="label clickable" data-more-info="'+esc(d.sensor)+'" title="Открыть сенсор">'+esc(d.label)+'</span><span class="meter-no clickable" data-more-info="'+esc(d.sensor)+'" title="Открыть сенсор">'+esc(d.meter)+'</span>'+
      '<span class="adjustment">'+adjustment+'</span><span class="reading clickable" data-more-info="'+esc(d.sensor)+'" title="Открыть сенсор"><span class="value">'+fmt(d.value)+'</span>'+(d.unit?'<span class="unit">'+esc(d.unit)+'</span>':"")+'</span></div>'+
      (secondary?'<div class="secondary">'+secondary+'</div>':"")+'</div>';
  }

  _renderSecondary(d) {
    var mode=this._config.secondary_info || "last-changed";
    if (mode === "none") return "";
    if (mode === "entity-id") return esc(d.sensor || "");
    var timestamp=mode === "last-updated" ? d.lastUpdated : d.lastChanged;
    if (!timestamp) return "—";
    return '<ha-relative-time class="relative-time" datetime="'+esc(timestamp)+'"></ha-relative-time>';
  }

  _renderDialog(hot,cold) {
    var rows = [hot,cold].map(function(d){
      var unit = d.unit ? ' ' + esc(d.unit) : "";
      return '<tr><td>' + esc(d.label) + '</td><td>' + fmt(d.totalValue) + unit + '</td><td>' + fmt(d.nativeDisplayValue) + unit + '</td><td>' + fmt(d.displayCorrection) + unit + '</td></tr>';
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
    var entityState = this._hass.states[entityId];
    var attributes = entityState && entityState.attributes || {};
    var min = Number(attributes.min);
    var max = Number(attributes.max);
    var step = Number(attributes.step);
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(step) || step <= 0) step = 1;
    if (current == null) {
      alert("Проверьте сущность корректировки и шаг софт-корректировки.");
      return;
    }
    try {
      var target = round(Math.max(min,Math.min(max,current + direction * step)));
      if (target === current) return;
      await this._hass.callService("input_number","set_value",{entity_id:entityId,value:target});
    } catch(e) {
      alert("Не удалось изменить корректировку: " + (e.message || e));
    }
  }

  async _confirm() {
    if (this._busy) return;
    var self = this;
    var channels = [this._channel("hot"),this._channel("cold")];
    if (channels.some(function(d){return !d.sensor || !d.numberEntity || !d.correctionEntity || d.totalValue == null;})) {
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
          var w = {entityId:d.numberEntity,target:round(d.totalValue / d.coefficient),resolve:resolve,done:false};
          w.timer = setTimeout(function(){if(!w.done){w.done=true;resolve(false);}},20000);
          waiters.push(w);
        });
      });

      var calls = await Promise.allSettled(channels.map(function(d){
        return self._hass.callService("number","set_value",{entity_id:d.numberEntity,value:round(d.totalValue / d.coefficient)});
      }));
      var confirmed = await Promise.all(confirmations);
      if (unsubscribe) unsubscribe();

      var reset = await Promise.all(channels.map(async function(d,i){
        if (!confirmed[i]) return false;
        try {
          await self._hass.callService("input_number","set_value",{entity_id:d.correctionEntity,value:d.correctionMin});
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
    this._config = {};
    this._hass = null;
    this._form = null;
  }
  set hass(value) {
    this._hass = value;
    if (this._form) {
      this._form.hass = value;
    } else {
      this._createForm();
    }
  }
  setConfig(config) {
    var nextConfig = cleanConfig(config);
    var changed = !sameValue(this._config,nextConfig);
    this._config = nextConfig;
    if (!this._form) {
      this._createForm();
      return;
    }
    if (changed) {
      this._form.data = Object.assign({},DEFAULTS,nextConfig);
    }
  }
  _schema() {
    var entity=function(domain){return {entity:{domain:domain}};};
    return [
      {name:"name",label:"Название карточки",selector:{text:{}}},
      {name:"battery_sensor",label:"Сенсор заряда батареи",selector:entity("sensor")},
      {name:"signal_sensor",label:"Сенсор уровня сигнала",selector:entity("sensor")},

      {name:"hot_meter",label:"Номер счётчика",selector:{text:{}}},
      {name:"hot_sensor",label:"Сенсор показаний",selector:entity("sensor")},
      {name:"hot_correction",label:"Корректировка",selector:entity("input_number")},
      {name:"hot_number",label:"Целевой канал прибора (L3)",selector:entity("number")},
      {name:"hot_coefficient",label:"Коэффициент пересчёта",selector:{number:{min:0.001,max:1000000,step:0.001,mode:"box"}}},
      {name:"hot_label",label:"Название счётчика",selector:{text:{}}},
      {name:"hot_color",label:"Цвет счётчика",selector:{color_rgb:{}}},

      {name:"cold_meter",label:"Номер счётчика",selector:{text:{}}},
      {name:"cold_sensor",label:"Сенсор показаний",selector:entity("sensor")},
      {name:"cold_correction",label:"Корректировка",selector:entity("input_number")},
      {name:"cold_number",label:"Целевой канал прибора (L5)",selector:entity("number")},
      {name:"cold_coefficient",label:"Коэффициент пересчёта",selector:{number:{min:0.001,max:1000000,step:0.001,mode:"box"}}},
      {name:"cold_label",label:"Название счётчика",selector:{text:{}}},
      {name:"cold_color",label:"Цвет счётчика",selector:{color_rgb:{}}},

      {name:"show_zero_correction",label:"Показывать нулевые значения корректировки",selector:{boolean:{}}},
      {name:"show_battery_signal_values",label:"Показывать числовые значения заряда батареи и уровня сигнала",selector:{boolean:{}}},
      {name:"secondary_info",label:"Secondary info",selector:{select:{mode:"dropdown",options:[
        {value:"last-changed",label:"Last changed"},
        {value:"last-updated",label:"Last updated"},
        {value:"entity-id",label:"Entity ID"},
        {value:"none",label:"Не показывать"}
      ]}}}
    ];
  }

  _createForm() {
    if (!this.shadowRoot || !this._hass || this._form) return;
    this.shadowRoot.innerHTML = "<ha-form></ha-form>";
    this._form = this.shadowRoot.querySelector("ha-form");
    this._form.hass = this._hass;
    this._form.schema = this._schema();
    this._form.data = Object.assign({},DEFAULTS,this._config);
    this._form.computeLabel = function(schema){return schema.label || schema.name;};
    this._form.addEventListener("value-changed",event => {
      var formConfig = Object.assign({},event.detail.value);
      this._schema().forEach(function(item) {
        if (item.selector && item.selector.text && formConfig[item.name] === undefined) {
          formConfig[item.name] = "";
        }
      });
      this._config = cleanConfig(formConfig);
      this.dispatchEvent(new CustomEvent("config-changed",{
        detail:{config:this._config},
        bubbles:true,
        composed:true
      }));
    });
  }
}

if (!customElements.get("ha-water-meter-card")) customElements.define("ha-water-meter-card",WaterMeterCard);
if (!customElements.get("ha-water-meter-card-editor")) customElements.define("ha-water-meter-card-editor",WaterMeterCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:"ha-water-meter-card",name:"Water Meter Card",description:"Карточка двухканального счётчика воды с софт-корректировками и ручной фиксацией показаний."});
