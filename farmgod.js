// Hungarian translation provided by =Krumpli=

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
              window
                .open(...item.arguments)
                .addEventListener(
                  'DOMContentLoaded',
                  function () {
                    self.start();
                  }
                );
            } else {
              $[item.action](...item.arguments)
                .done(function () {
                  item.promise.resolve.apply(null, arguments);
                  self.start();
                })
                .fail(function () {
                  item.attempts += 1;
                  if (
                    item.attempts <
                    twLib.queueLib.maxAttempts
                  ) {
                    self.enqueue(item, true);
                  } else {
                    item.promise.reject.apply(
                      null,
                      arguments
                    );
                  }

                  self.start();
                });
            }
          };

          this.start = function () {
            if (this.length) {
              this.working = true;
              this.doNext();
            } else {
              this.working = false;
            }
          };

          this.dequeue = function () {
            this.length -= 1;
            return this.list.shift();
          };

          this.enqueue = function (item, front = false) {
            front ? this.list.unshift(item) : this.list.push(item);
            this.length += 1;

            if (!this.working) {
              this.start();
            }
          };
        },
        createQueues: function (amount) {
          let arr = [];
          for (let i = 0; i < amount; i++) {
            arr[i] = new twLib.queueLib.Queue();
          }

          return arr;
        },
        addItem: function (item) {
          let leastBusyQueue = twLib.queues
            .map((q) => q.length)
            .reduce((next, curr) => (curr < next ? curr : next), 0);
          twLib.queues[leastBusyQueue].enqueue(item);
        },
        orchestrator: function (type, arg) {
          let promise = $.Deferred();
          let item = new twLib.queueLib.Item(type, arg, promise);

          twLib.queueLib.addItem(item);

          return promise;
        },
      },
      ajax: function () {
        return twLib.queueLib.orchestrator('ajax', arguments);
      },
      get: function () {
        return twLib.queueLib.orchestrator('get', arguments);
      },
      post: function () {
        return twLib.queueLib.orchestrator('post', arguments);
      },
      openWindow: function () {
        let item = new twLib.queueLib.Item('openWindow', arguments);
        twLib.queueLib.addItem(item);
      },
    };

    twLib.init();
  }

  /**** Script Library ****/
  const setUnitSpeeds = function () {
    let unitSpeeds = {};
    $.when($.get('/interface.php?func=get_unit_info')).then((xml) => {
      $(xml)
        .find('config')
        .children()
        .map((i, el) => {
          unitSpeeds[$(el).prop('nodeName')] = $(el)
            .find('speed')
            .text()
            .toNumber();
        });

      localStorage.setItem(
        'FarmGod_unitSpeeds',
        JSON.stringify(unitSpeeds)
      );
    });
  };

  const getUnitSpeeds = function () {
    return JSON.parse(localStorage.getItem('FarmGod_unitSpeeds')) || false;
  };

  if (!getUnitSpeeds()) setUnitSpeeds();

  const determineNextPage = function (page, $html) {
    let villageLength =
      $html.find('#scavenge_mass_screen').length > 0
        ? $html.find('tr[id*="scavenge_village"]').length
        : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;
    let navSelect = $html
      .find('.paged-nav-item')
      .first()
      .closest('td')
      .find('select')
      .first();
    let navLength =
      $html.find('#am_widget_Farm').length > 0
        ? parseInt(
          $('#plunder_list_nav')
            .first()
            .find('a.paged-nav-item, strong.paged-nav-item')
          [
            $('#plunder_list_nav')
              .first()
              .find(
                'a.paged-nav-item, strong.paged-nav-item'
              ).length - 1
          ].textContent.replace(/\D/g, '')
        ) - 1
        : navSelect.length > 0
          ? navSelect.find('option').length - 1
          : $html.find('.paged-nav-item').not('[href*="page=-1"]').length;
    let pageSize =
      $('#mobileHeader').length > 0
        ? 10
        : parseInt($html.find('input[name="page_size"]').val());
    if (page == -1 && villageLength == 1000) {
      return Math.floor(1000 / pageSize);
    } else if (page < navLength) {
      return page + 1;
    }

    return false;
  };

  const processPage = function (url, page, wrapFn) {
    let pageText = url.match('am_farm')
      ? `&Farm_page=${page}`
      : `&page=${page}`;

    return twLib
      .ajax({
        url: url + pageText,
      })
      .then((html) => {
        // OPTIMIERTES PARSING
        return wrapFn(page, $($.parseHTML(html, null, false)));
      });
  };

  const processAllPages = function (url, processorFn) {
    let page = url.match('am_farm') || url.match('scavenge_mass') ? 0 : -1;
    let wrapFn = function (page, $html) {
      let dnp = determineNextPage(page, $html);
      if (dnp) {
        processorFn($html);
        return processPage(url, dnp, wrapFn);
      } else {
        return processorFn($html);
      }
    };
    return processPage(url, page, wrapFn);
  };

  const getDistance = function (origin, target) {
    let a = origin.toCoord(true).x - target.toCoord(true).x;
    let b = origin.toCoord(true).y - target.toCoord(true).y;

    return Math.hypot(a, b);
  };
  const subtractArrays = function (array1, array2) {
    let result = array1.map((val, i) => {
      return val - array2[i];
    });
    return result.some((v) => v < 0) ? false : result;
  };
  const getCurrentServerTime = function () {
    let [hour, min, sec, day, month, year] = $('#serverTime')
      .closest('p')
      .text()
      .match(/\d+/g);
    return new Date(year, month - 1, day, hour, min, sec).getTime();
  };
  const timestampFromString = function (timestr) {
    let d = $('#serverDate')
      .text()
      .split('/')
      .map((x) => +x);
    let todayPattern = new RegExp(
      window.lang['aea2b0aa9ae1534226518faaefffdaad'].replace(
        '%s',
        '([\\d+|:]+)'
      )
    ).exec(timestr);
    let tomorrowPattern = new RegExp(
      window.lang['57d28d1b211fddbb7a499ead5bf23079'].replace(
        '%s',
        '([\\d+|:]+)'
      )
    ).exec(timestr);
    let laterDatePattern = new RegExp(
      window.lang['0cb274c906d622fa8ce524bcfbb7552d']
        .replace('%1', '([\\d+|\\.]+)')
        .replace('%2', '([\\d+|:]+)')
    ).exec(timestr);
    let t, date;

    if (todayPattern !== null) {
      t = todayPattern[1].split(':');
      date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
    } else if (tomorrowPattern !== null) {
      t = tomorrowPattern[1].split(':');
      date = new Date(
        d[2],
        d[1] - 1,
        d[0] + 1,
        t[0],
        t[1],
        t[2],
        t[3] || 0
      );
    } else {
      d = (laterDatePattern[1] + d[2]).split('.').map((x) => +x);
      t = laterDatePattern[2].split(':');
      date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
    }

    return date.getTime();
  };

  String.prototype.toCoord = function (objectified) {
    let c = (this.match(/\d{1,3}\|\d{1,3}/g) || [false]).pop();
    return c && objectified
      ? { x: c.split('|')[0], y: c.split('|')[1] }
      : c;
  };
  String.prototype.toNumber = function () {
    return parseFloat(this);
  };
  Number.prototype.toNumber = function () {
    return parseFloat(this);
  };
  return {
    getUnitSpeeds,
    processPage,
    processAllPages,
    getDistance,
    subtractArrays,
    getCurrentServerTime,
    timestampFromString,
  };
})();

window.FarmGod.Translation = (function () {
  const msg = {
    int: {
      missingFeatures: 'Script requires a premium account and loot assistent!',
      options: {
        title: 'FarmGod Options',
        warning: '<b>Warning:</b><br>- Make sure A is set as your default microfarm and B as a larger microfarm<br>- Make sure the farm filters are set correctly before using the script',
        filterImage: 'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters.png',
        group: 'Send farms from group:',
        distance: 'Maximum fields for farms:',
        time: 'How much time in minutes should there be between farms:',
        losses: 'Send farm to villages with partial losses:',
        maxloot: 'Send a B farm if the last loot was full:',
        newbarbs: 'Add new barbs to farm:',
        button: 'Plan farms',
      },
      table: {
        noFarmsPlanned: 'No farms can be sent with the specified settings.',
        origin: 'Origin',
        target: 'Target',
        fields: 'fields',
        farm: 'Farm',
        goTo: 'Go to',
      },
      messages: {
        villageChanged: 'Successfully changed village!',
        villageError: 'All farms for the current village have been sent!',
        sendError: 'Error: farm not send!',
      },
    },
  };
  const get = function () {
    let lang = msg.hasOwnProperty(game_data.locale) ? game_data.locale : 'int';
    return msg[lang];
  };

  return { get };
})();

window.FarmGod.Main = (function (Library, Translation) {
  const lib = Library;
  const t = Translation.get();
  let curVillage = null;
  let farmBusy = false;

  const init = function () {
    if (game_data.features.Premium.active && game_data.features.FarmAssistent.active) {
      if (game_data.screen == 'am_farm') {
        $.when(buildOptions()).then((html) => {
          Dialog.show('FarmGod', html);
          $('.optionButton').off('click').on('click', () => {
            let optionGroup = parseInt($('.optionGroup').val());
            let optionDistance = parseFloat($('.optionDistance').val());
            let optionTime = parseFloat($('.optionTime').val());
            let optionLosses = $('.optionLosses').prop('checked');
            let optionMaxloot = $('.optionMaxloot').prop('checked');
            let optionNewbarbs = $('.optionNewbarbs').prop('checked') || false;
            let optionWall = $('.optionWall').prop('checked') || false;

            localStorage.setItem('farmGod_options', JSON.stringify({
              optionGroup: optionGroup, optionDistance: optionDistance, optionTime: optionTime, 
              optionLosses: optionLosses, optionMaxloot: optionMaxloot, optionNewbarbs: optionNewbarbs, optionWall: optionWall
            }));
            $('.optionsContent').html(UI.Throbber[0].outerHTML + '<br><br>');
            getData(optionGroup, optionNewbarbs, optionLosses).then((data) => {
              Dialog.close();
              let plan = createPlanning(optionDistance, optionTime, optionMaxloot, optionWall, data);
              $('.farmGodContent').remove();
              $('#am_widget_Farm').first().before(buildTable(plan.farms));
              bindEventHandlers();
              UI.InitProgressBars();
              UI.updateProgressBar($('#FarmGodProgessbar'), 0, plan.counter);
              $('#FarmGodProgessbar').data('current', 0).data('max', plan.counter);
            });
          });
          document.querySelector('.optionButton').focus();
        });
      } else {
        location.href = game_data.link_base_pure + 'am_farm';
      }
    } else {
      UI.ErrorMessage(t.missingFeatures);
    }
  };

  const bindEventHandlers = function () {
    $('.farmGod_icon').off('click').on('click', function () {
      if (game_data.market != 'nl' || $(this).data('origin') == curVillage) {
        sendFarm($(this));
      } else { UI.ErrorMessage(t.messages.villageError); }
    });
    $(document).off('keydown').on('keydown', (event) => {
      if ((event.keyCode || event.which) == 13) { $('.farmGod_icon').first().trigger('click'); }
    });
    $('.switchVillage').off('click').on('click', function () {
      curVillage = $(this).data('id');
      UI.SuccessMessage(t.messages.villageChanged);
      $(this).closest('tr').remove();
    });
  };

  const buildOptions = function () {
    let options = JSON.parse(localStorage.getItem('farmGod_options')) || {
      optionGroup: 0, optionDistance: 25, optionTime: 10, optionLosses: false, 
      optionMaxloot: true, optionNewbarbs: true, optionWall: false
    };
    return $.when(buildGroupSelect(options.optionGroup)).then((groupSelect) => {
      return `<style>#popup_box_FarmGod{text-align:center;width:550px;}</style>
              <h3>${t.options.title}</h3><br><div class="optionsContent">
              <div style="width:90%;margin:auto;background: url('graphic/index/main_bg.jpg') 100% 0% #E3D5B3;border: 1px solid #7D510F;border-collapse: separate !important;"><table class="vis" style="width:100%;text-align:left;font-size:11px;">
                <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
                <tr><td>${t.options.distance}</td><td><input type="text" size="5" class="optionDistance" value="${options.optionDistance}"></td></tr>
                <tr><td>${t.options.time}</td><td><input type="text" size="5" class="optionTime" value="${options.optionTime}"></td></tr>
                <tr><td>${t.options.losses}</td><td><input type="checkbox" class="optionLosses" ${options.optionLosses ? 'checked' : ''}></td></tr>
                <tr><td>${t.options.maxloot}</td><td><input type="checkbox" class="optionMaxloot" ${options.optionMaxloot ? 'checked' : ''}></td></tr>
                <tr><td>${t.options.newbarbs}</td><td><input type="checkbox" class="optionNewbarbs" ${options.optionNewbarbs ? 'checked' : ''}></td></tr>
                <tr><td>Wall-Filter (Wall 0 erzwingen)</td><td><input type="checkbox" class="optionWall" ${options.optionWall ? 'checked' : ''}></td></tr>
              </table></div><br><input type="button" class="btn optionButton" value="${t.options.button}"></div>`;
    });
  };

  const buildGroupSelect = function (id) {
    return $.get(TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })).then((groups) => {
      let html = `<select class="optionGroup">`;
      groups.result.forEach((val) => {
        if (val.type == 'separator') { html += `<option disabled=""/>`; }
        else { html += `<option value="${val.group_id}" ${val.group_id == id ? 'selected' : ''}>${val.name}</option>`; }
      });
      return html + `</select>`;
    });
  };

  const buildTable = function (plan) {
    let html = `<div class="vis farmGodContent"><h4>FarmGod</h4><table class="vis" width="100%">
                <tr><div id="FarmGodProgessbar" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;"><div style="background: rgb(146, 194, 0);"></div><span class="label" style="margin-top:0px;"></span></div></tr>
                <tr><th style="text-align:center;">${t.table.origin}</th><th style="text-align:center;">${t.table.target}</th><th style="text-align:center;">${t.table.fields}</th><th style="text-align:center;">${t.table.farm}</th></tr>`;
    if (!$.isEmptyObject(plan)) {
      for (let prop in plan) {
        if (game_data.market == 'nl') {
          html += `<tr><td colspan="4" style="background: #e7d098;"><input type="button" class="btn switchVillage" data-id="${plan[prop][0].origin.id}" value="${t.table.goTo} ${plan[prop][0].origin.name} (${plan[prop][0].origin.coord})" style="float:right;"></td></tr>`;
        }
        plan[prop].forEach((val, i) => {
          html += `<tr class="farmRow row_${i % 2 == 0 ? 'a' : 'b'}">
                    <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.origin.id}">${val.origin.name} (${val.origin.coord})</a></td>
                    <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.target.id}">${val.target.coord}</a></td>
                    <td style="text-align:center;">${val.fields.toFixed(2)}</td>
                    <td style="text-align:center;"><a href="#" data-origin="${val.origin.id}" data-target="${val.target.id}" data-template="${val.template.id}" class="farmGod_icon farm_icon farm_icon_${val.template.name}" style="margin:auto;"></a></td>
                  </tr>`;
        });
      }
    } else { html += `<tr><td colspan="4" style="text-align: center;">${t.table.noFarmsPlanned}</td></tr>`; }
    return html + `</table></div>`;
  };

  const getData = function (group, newbarbs, losses) {
    let data = { villages: {}, commands: {}, farms: { templates: {}, farms: {} } };
    
    let villagesProcessor = ($html) => {
      let skipUnits = ['ram', 'catapult', 'knight', 'snob', 'militia'];
      const mobileCheck = $('#mobileHeader').length > 0;
      if (mobileCheck) {
        $html.find('.overview-container > div').each((i, el) => {
            let villageId = $(el).find('.quickedit-vn').data('id');
            let coord = $(el).find('.quickedit-label').text().toCoord();
            let units = [];
            $(el).find('.overview-units-row > div.unit-row-item').each((_, ue) => {
                let unitType = $(ue).find('img').attr('src').split('unit_')[1].replace(/(@2x)?\.webp|\.png/, '');
                if (skipUnits.indexOf(unitType) === -1) units.push(parseInt($(ue).find('span').text()) || 0);
            });
            data.villages[coord] = { name: $(el).find('.quickedit-label').attr('data-text'), id: villageId, units: units };
        });
      } else {
        $html.find('#combined_table .row_a, .row_b').filter((i, el) => $(el).find('.bonus_icon_33').length == 0).map((i, el) => {
          let $qel = $(el).find('.quickedit-label').first();
          let units = $(el).find('.unit-item').filter((idx) => skipUnits.indexOf(game_data.units[idx]) == -1).map((idx, ele) => $(ele).text().toNumber()).get();
          data.villages[$qel.text().toCoord()] = { name: $qel.data('text'), id: parseInt($(el).find('.quickedit-vn').first().data('id')), units: units };
        });
      }
    };

    let commandsProcessor = ($html) => {
      $html.find('#commands_table .row_a, .row_ax, .row_b, .row_bx').map((i, el) => {
        let coord = $(el).find('.quickedit-label').first().text().toCoord();
        if (coord) {
          if (!data.commands.hasOwnProperty(coord)) data.commands[coord] = [];
          data.commands[coord].push(Math.round(lib.timestampFromString($(el).find('td').eq(2).text().trim()) / 1000));
        }
      });
    };

    let farmProcessor = ($html) => {
      if ($.isEmptyObject(data.farms.templates)) {
        let unitSpeeds = lib.getUnitSpeeds();
        $html.find('form[action*="action=edit_all"] input[name*="template"]').closest('tr').map((i, el) => {
          let name = $(el).prev('tr').find('a.farm_icon').first().attr('class').match(/farm_icon_(.*)\s/)[1];
          data.farms.templates[name] = {
            id: $(el).find('input[name*="[id]"]').val().toNumber(),
            units: $(el).find('input[type="text"], input[type="number"]').map((idx, ele) => $(ele).val().toNumber()).get(),
            speed: Math.max(...$(el).find('input[type="text"], input[type="number"]').map((idx, ele) => $(ele).val().toNumber() > 0 ? unitSpeeds[$(ele).attr('name').split('[')[0]] : 0).get())
          };
        });
      }
      const mobileCheck = $('#mobileHeader').length > 0;
      let wallIdx = mobileCheck ? -1 : ($html.find('#plunder_list tr').first().find('img[src*="wall.png"]').closest('td, th').index() || 6);
      $html.find('#plunder_list tr[id^="village_"]').map((i, el) => {
        let wallValue = mobileCheck ? ($(el).find('td').eq(1).text().trim().split(/\s+/)[3] || "?") : $(el).find('td').eq(wallIdx).text().trim();
        data.farms.farms[$(el).find('a[href*="screen=report"]').first().text().toCoord()] = {
          id: $(el).attr('id').split('_')[1].toNumber(),
          color: $(el).find('img[src*="graphic/dots/"]').attr('src').match(/dots\/(green|yellow|red|blue|red_blue)/)[1],
          max_loot: $(el).find('img[src*="max_loot/1"]').length > 0,
          wall: wallValue
        };
      });
    };

    let findNewbarbs = () => {
      return twLib.get('/map/village.txt').then((allVillages) => {
        allVillages.match(/[^\r\n]+/g).forEach((villageData) => {
          let [id, name, x, y, player_id] = villageData.split(',');
          let coord = `${x}|${y}`;
          if (player_id == 0 && !data.farms.farms.hasOwnProperty(coord)) { data.farms.farms[coord] = { id: id.toNumber() }; }
        });
        return data;
      });
    };

    let filterFarms = () => {
      data.farms.farms = Object.fromEntries(Object.entries(data.farms.farms).filter(([key, val]) => !val.hasOwnProperty('color') || (val.color != 'red' && val.color != 'red_blue' && (val.color != 'yellow' || losses))));
      return data;
    };

    // STRIKT KONDITIONALES LADEN DER VILLAGE.TXT
    let tasks = [
        lib.processAllPages(TribalWars.buildURL('GET', 'overview_villages', { mode: 'combined', group: group }), villagesProcessor),
        lib.processAllPages(TribalWars.buildURL('GET', 'overview_villages', { mode: 'commands', type: 'attack' }), commandsProcessor),
        lib.processAllPages(TribalWars.buildURL('GET', 'am_farm'), farmProcessor)
    ];
    if (newbarbs) { tasks.push(findNewbarbs()); }

    return Promise.all(tasks).then(filterFarms).then(() => data);
  };

  const createPlanning = function (optionDistance, optionTime, optionMaxloot, optionWall, data) {
    let plan = { counter: 0, farms: {} };
    let serverTime = Math.round(lib.getCurrentServerTime() / 1000);
    const customTargetIntervals = { "524|613": 1, "525|613": 4, "526|615": 1, "532|612": 1, "536|616": 1 };

    for (let prop in data.villages) {
      Object.keys(data.farms.farms).map((key) => ({ coord: key, dis: lib.getDistance(prop, key) }))
        .sort((a, b) => a.dis - b.dis).forEach((el) => {
          let farmIndex = data.farms.farms[el.coord];
          if (optionWall && farmIndex.wall !== "?" && parseInt(farmIndex.wall) > 0) return;
          let [targetX, targetY] = el.coord.split('|').map(Number);
          if (prop === '527|610' && (targetY >= 610 || targetX <= 515)) return;
          if (prop === '525|614' && targetX <= 515) return;
          if (prop === '509|607' && (targetX >= 516 || targetY >= 616)) return;
          if (prop === '509|613' && (targetX >= 516 || targetY <= 615)) return;
          if (prop === '543|610' && targetX <= 538) return;

          let tempName = optionMaxloot && farmIndex.max_loot ? 'b' : 'a';
          let template = data.farms.templates[tempName];
          let unitsLeft = lib.subtractArrays(data.villages[prop].units, template.units);
          let arrival = Math.round(serverTime + el.dis * template.speed * 60 + Math.round(plan.counter / 5));
          let maxTimeDiff = Math.round((customTargetIntervals[el.coord] || optionTime) * 60);
          let timeDiff = true;
          if (data.commands[el.coord]) {
            if (!farmIndex.hasOwnProperty('color') && data.commands[el.coord].length > 0) timeDiff = false;
            data.commands[el.coord].forEach((ts) => { if (Math.abs(ts - arrival) < maxTimeDiff) timeDiff = false; });
          } else { data.commands[el.coord] = []; }

          if (unitsLeft && timeDiff && el.dis < optionDistance) {
            plan.counter++;
            if (!plan.farms[prop]) plan.farms[prop] = [];
            plan.farms[prop].push({ origin: { coord: prop, name: data.villages[prop].name, id: data.villages[prop].id }, target: { coord: el.coord, id: farmIndex.id }, fields: el.dis, template: { name: tempName, id: template.id } });
            data.villages[prop].units = unitsLeft;
            data.commands[el.coord].push(arrival);
          }
        });
    }
    return plan;
  };

  const sendFarm = function ($this) {
    let n = Timing.getElapsedTimeSinceLoad();
    if (!farmBusy && !(Accountmanager.farm.last_click && n - Accountmanager.farm.last_click < 200)) {
      farmBusy = true;
      Accountmanager.farm.last_click = n;
      let $pb = $('#FarmGodProgessbar');
      TribalWars.post(Accountmanager.send_units_link.replace(/village=\d+/, 'village=' + $this.data('origin')), null, { target: $this.data('target'), template_id: $this.data('template'), source: $this.data('origin') }, function (r) {
        UI.SuccessMessage(r.success);
        $pb.data('current', $pb.data('current') + 1);
        UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
        $this.closest('.farmRow').remove(); farmBusy = false;
      }, function (r) {
        UI.ErrorMessage(r || t.messages.sendError);
        $pb.data('current', $pb.data('current') + 1);
        UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
        $this.closest('.farmRow').remove(); farmBusy = false;
      });
    }
  };

  return { init };
})(window.FarmGod.Library, window.FarmGod.Translation);

window.FarmGod.Main.init();
