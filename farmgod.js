// Optimized for old Hardware & Network Bottlenecks
ScriptAPI.register('FarmGod', true, 'Warre', 'nl.tribalwars@coma.innogames.de');

window.FarmGod = {};
window.FarmGod.Library = (function () {
  /**** TribalWarsLibrary.js ****/
  if (typeof window.twLib === 'undefined') {
    window.twLib = {
      queues: null,
      init: function () {
        if (this.queues === null) {
          this.queues = this.queueLib.createQueues(5);
        }
      },
      queueLib: {
        maxAttempts: 3,
        Item: function (action, arg, promise = null) {
          this.action = action;
          this.arguments = arg;
          this.promise = promise;
          this.attempts = 0;
        },
        Queue: function () {
          this.list = [];
          this.working = false;
          this.length = 0;
          this.doNext = function () {
            let item = this.dequeue();
            let self = this;
            if (item.action == 'openWindow') {
              window.open(...item.arguments).addEventListener('DOMContentLoaded', () => self.start());
            } else {
              $[item.action](...item.arguments)
                .done(function () { item.promise.resolve.apply(null, arguments); self.start(); })
                .fail(function () {
                  item.attempts += 1;
                  if (item.attempts < twLib.queueLib.maxAttempts) { self.enqueue(item, true); } 
                  else { item.promise.reject.apply(null, arguments); }
                  self.start();
                });
            }
          };
          this.start = function () { if (this.length) { this.working = true; this.doNext(); } else { this.working = false; } };
          this.dequeue = function () { this.length -= 1; return this.list.shift(); };
          this.enqueue = function (item, front = false) {
            front ? this.list.unshift(item) : this.list.push(item);
            this.length += 1;
            if (!this.working) { this.start(); }
          };
        },
        createQueues: function (amount) {
          let arr = [];
          for (let i = 0; i < amount; i++) { arr[i] = new twLib.queueLib.Queue(); }
          return arr;
        },
        addItem: function (item) {
          let leastBusyQueue = twLib.queues.map((q) => q.length).reduce((next, curr) => (curr < next ? curr : next), 0);
          twLib.queues[leastBusyQueue].enqueue(item);
        },
        orchestrator: function (type, arg) {
          let promise = $.Deferred();
          let item = new twLib.queueLib.Item(type, arg, promise);
          twLib.queueLib.addItem(item);
          return promise;
        },
      },
      ajax: function () { return twLib.queueLib.orchestrator('ajax', arguments); },
      get: function () { return twLib.queueLib.orchestrator('get', arguments); },
      post: function () { return twLib.queueLib.orchestrator('post', arguments); },
    };
    twLib.init();
  }

  const getUnitSpeeds = function () { return JSON.parse(localStorage.getItem('FarmGod_unitSpeeds')) || false; };
  if (!getUnitSpeeds()) {
      $.get('/interface.php?func=get_unit_info').then((xml) => {
          let unitSpeeds = {};
          $(xml).find('config').children().each((i, el) => { unitSpeeds[el.nodeName] = $(el).find('speed').text().toNumber(); });
          localStorage.setItem('FarmGod_unitSpeeds', JSON.stringify(unitSpeeds));
      });
  }

  const determineNextPage = function (page, $html) {
    let navSelect = $html.find('.paged-nav-item').first().closest('td').find('select').first();
    let navLength = $html.find('#am_widget_Farm').length > 0
        ? parseInt($('#plunder_list_nav').first().find('a.paged-nav-item, strong.paged-nav-item').last().text().replace(/\D/g, '') || 1) - 1
        : navSelect.length > 0 ? navSelect.find('option').length - 1 : $html.find('.paged-nav-item').not('[href*="page=-1"]').length;
    return page < navLength ? page + 1 : false;
  };

  const processPage = function (url, page, wrapFn) {
    let pageText = url.match('am_farm') ? `&Farm_page=${page}` : `&page=${page}`;
    return twLib.ajax({ url: url + pageText }).then((html) => {
        // Performance-Fix: Schnelleres HTML-Parsing ohne Skript-Ausführung
        let $parsed = $($.parseHTML(html, null, false));
        return wrapFn(page, $parsed);
    });
  };

  const processAllPages = function (url, processorFn, label) {
    let page = url.match('am_farm') ? 0 : -1;
    let wrapFn = function (page, $html) {
      if(label) $('#PlanningProgress span').text(`${label} (Seite ${page + 1})...`);
      let dnp = determineNextPage(page, $html);
      processorFn($html);
      return dnp ? processPage(url, dnp, wrapFn) : true;
    };
    return processPage(url, page, wrapFn);
  };

  const getDistance = (origin, target) => {
    let a = origin.toCoord(true).x - target.toCoord(true).x;
    let b = origin.toCoord(true).y - target.toCoord(true).y;
    return Math.hypot(a, b);
  };

  const subtractArrays = (a1, a2) => {
    let res = a1.map((v, i) => v - a2[i]);
    return res.some(v => v < 0) ? false : res;
  };

  const timestampFromString = (str) => {
    let d = $('#serverDate').text().split('/').map(x => +x);
    let t = str.match(/\d+:\d+:\d+/)[0].split(':');
    let date = new Date(d[2], d[1]-1, d[0], t[0], t[1], t[2]);
    if (str.includes(window.lang['57d28d1b211fddbb7a499ead5bf23079'])) date.setDate(date.getDate() + 1);
    return date.getTime();
  };

  String.prototype.toCoord = function (obj) {
    let c = (this.match(/\d{1,3}\|\d{1,3}/g) || [false]).pop();
    return c && obj ? { x: c.split('|')[0], y: c.split('|')[1] } : c;
  };
  String.prototype.toNumber = function () { return parseFloat(this) || 0; };

  return { getUnitSpeeds, processPage, processAllPages, getDistance, subtractArrays, timestampFromString };
})();

window.FarmGod.Main = (function (lib) {
  let curVillage = null;
  let farmBusy = false;

  const init = async function () {
    if (!game_data.features.Premium.active || !game_data.features.FarmAssistent.active) return UI.ErrorMessage("Premium & FA benötigt!");
    if (game_data.screen !== 'am_farm') return location.href = game_data.link_base_pure + 'am_farm';

    let options = JSON.parse(localStorage.getItem('farmGod_options')) || { optionGroup: 0, optionDistance: 25, optionTime: 10, optionWall: false };
    
    // UI Zeigen
    let groupHtml = await $.get(TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })).then(g => {
        let h = `<select class="optionGroup">`;
        g.result.forEach(v => { if(v.type !== 'separator') h += `<option value="${v.group_id}" ${v.group_id == options.optionGroup ? 'selected' : ''}>${v.name}</option>`; });
        return h + `</select>`;
    });

    let dialogHtml = `
        <div id="FarmGodUI" style="padding:10px;">
            <h3>FarmGod Mobile Optimiert</h3>
            <div class="optionsContent">
                <table class="vis" style="width:100%">
                    <tr><td>Gruppe:</td><td>${groupHtml}</td></tr>
                    <tr><td>Distanz:</td><td><input type="number" class="optionDistance" value="${options.optionDistance}"></td></tr>
                    <tr><td>Wall-Filter:</td><td><input type="checkbox" class="optionWall" ${options.optionWall ? 'checked' : ''}></td></tr>
                </table>
                <button class="btn optionButton" style="width:100%; margin-top:10px;">Planung Starten</button>
            </div>
        </div>`;
    
    Dialog.show('FarmGod', dialogHtml);

    $('.optionButton').on('click', async () => {
        let opt = {
            optionGroup: $('.optionGroup').val(),
            optionDistance: $('.optionDistance').val().toNumber(),
            optionTime: 10,
            optionWall: $('.optionWall').prop('checked')
        };
        localStorage.setItem('farmGod_options', JSON.stringify(opt));

        $('.optionsContent').html(`
            <div id="PlanningProgress" class="progress-bar live-progress-bar" style="width:100%; height:20px; border:1px solid #000;">
                <div style="background: #218838; width:0%; height:100%;"></div>
                <span class="label" style="position:absolute; width:100%; text-align:center; color:black; font-weight:bold;">Initialisiere...</span>
            </div>`);

        let data = await loadData(opt);
        let plan = await createPlanning(opt, data);
        
        Dialog.close();
        $('.farmGodContent').remove();
        $('#am_widget_Farm').before(buildTable(plan));
    });
  };

  const loadData = async (opt) => {
    let data = { villages: {}, commands: {}, farms: { templates: {}, entries: {} } };
    
    // 1. Eigene Dörfer
    await lib.processAllPages(TribalWars.buildURL('GET', 'overview_villages', { mode: 'combined', group: opt.optionGroup }), ($h) => {
        $h.find('.quickedit-vn').each((i, el) => {
            let row = $(el).closest('tr');
            let coord = $(el).text().toCoord();
            let units = row.find('.unit-item').map((i, e) => $(e).text().toNumber()).get();
            data.villages[coord] = { id: $(el).data('id'), name: $(el).data('text'), units: units.slice(0, 8) };
        });
    }, "Lade Dörfer");

    // 2. Befehle (Checks)
    await lib.processAllPages(TribalWars.buildURL('GET', 'overview_villages', { mode: 'commands', type: 'attack' }), ($h) => {
        $h.find('#commands_table tr.row_a, tr.row_b').each((i, el) => {
            let coord = $(el).find('.quickedit-label').text().toCoord();
            if (coord) {
                if (!data.commands[coord]) data.commands[coord] = [];
                data.commands[coord].push(Math.round(lib.timestampFromString($(el).find('td').eq(2).text()) / 1000));
            }
        });
    }, "Lade Befehle");

    // 3. Farm-Assistent (Templates & Reports)
    const mobileCheck = $('#mobileHeader').length > 0;
    await lib.processAllPages(TribalWars.buildURL('GET', 'am_farm'), ($h) => {
        // Templates nur einmal lesen
        if ($.isEmptyObject(data.farms.templates)) {
            let speeds = lib.getUnitSpeeds();
            $h.find('form[action*="edit_all"] input[name*="[id]"]').closest('tr').each((i, el) => {
                let name = $(el).prev().find('a.farm_icon').attr('class').match(/farm_icon_(a|b)/)[1];
                let units = $(el).find('input[type="number"], input[type="text"]').map((i, e) => $(e).val().toNumber()).get();
                let maxSpeed = 0;
                $(el).find('input').each((i, e) => {
                    let uName = $(e).attr('name').split('[')[0];
                    if ($(e).val().toNumber() > 0 && speeds[uName]) maxSpeed = Math.max(maxSpeed, speeds[uName]);
                });
                data.farms.templates[name] = { id: $(el).find('input[name*="[id]"]').val(), units, speed: maxSpeed };
            });
        }
        // Reports
        $h.find('#plunder_list tr[id^="village_"]').each((i, el) => {
            let coord = $(el).find('a[href*="screen=report"]').first().text().toCoord();
            let wall = "?";
            if (mobileCheck) {
                wall = $(el).find('td').eq(1).text().trim().split(/\s+/)[3] || "?";
            } else {
                wall = $(el).find('td').eq(6).text().trim();
            }
            data.farms.entries[coord] = { 
                id: $(el).attr('id').split('_')[1], 
                max_loot: $(el).find('img[src*="max_loot/1"]').length > 0,
                wall: wall 
            };
        });
    }, "Lade Farm-Seiten");

    return data;
  };

  const createPlanning = async (opt, data) => {
    let plan = { counter: 0, farms: {} };
    let serverTime = Math.round(new Date().getTime() / 1000);
    let myCoords = Object.keys(data.villages);

    for (let i = 0; i < myCoords.length; i++) {
        let origin = myCoords[i];
        let percent = Math.round((i / myCoords.length) * 100);
        $('#PlanningProgress div').css('width', percent + '%');
        $('#PlanningProgress span').text(`Plane Dorf ${i+1}/${myCoords.length}`);
        
        await new Promise(r => setTimeout(r, 1)); // CPU Entlastung

        let targets = Object.keys(data.farms.entries)
            .map(c => ({ coord: c, dist: lib.getDistance(origin, c) }))
            .filter(t => t.dist <= opt.optionDistance)
            .sort((a, b) => a.dist - b.dist);

        targets.forEach(t => {
            let entry = data.farms.entries[t.coord];
            if (opt.optionWall && entry.wall !== "?" && parseInt(entry.wall) > 0) return;

            let tempName = entry.max_loot ? 'b' : 'a';
            let template = data.farms.templates[tempName];
            let unitsLeft = lib.subtractArrays(data.villages[origin].units, template.units);

            if (unitsLeft) {
                plan.counter++;
                if (!plan.farms[origin]) plan.farms[origin] = [];
                plan.farms[origin].push({
                    origin: { coord: origin, id: data.villages[origin].id, name: data.villages[origin].name },
                    target: { coord: t.coord, id: entry.id },
                    dist: t.dist,
                    template: { name: tempName, id: template.id }
                });
                data.villages[origin].units = unitsLeft;
            }
        });
    }
    return plan;
  };

  const buildTable = (plan) => {
      let h = `<div class="vis farmGodContent"><h4>Geplante Farms (${plan.counter})</h4><table class="vis" width="100%">`;
      for (let origin in plan.farms) {
          h += `<tr><th colspan="3">${plan.farms[origin][0].origin.name} (${origin})</th></tr>`;
          plan.farms[origin].forEach(f => {
              h += `<tr>
                <td>${f.target.coord}</td>
                <td>${f.dist.toFixed(1)} F</td>
                <td><button class="farm_icon farm_icon_${f.template.name}" onclick="window.FarmGod.Main.send('${f.origin.id}','${f.target.id}','${f.template.id}', this)"></button></td>
              </tr>`;
          });
      }
      return h + `</table></div>`;
  };

  window.FarmGod.Main.send = function(originId, targetId, templateId, btn) {
      if (farmBusy) return;
      farmBusy = true;
      TribalWars.post(Accountmanager.send_units_link.replace(/village=\d+/, 'village='+originId), null, 
      { target: targetId, template_id: templateId, source: originId }, 
      (r) => { UI.SuccessMessage(r.success); $(btn).closest('tr').remove(); farmBusy = false; },
      () => { UI.ErrorMessage("Fehler!"); farmBusy = false; });
  };

  return { init };
})(window.FarmGod.Library);

window.FarmGod.Main.init();
