// ==UserScript==
// @name           Travian wave builder (presets)
// @namespace      peterpage-travian-scripts
// @updateURL      none
// @downloadURL    none
// @description    Wave builder for Travian Legends and Travian Shores of War
// @author         adipiciu (based on Travian wave builder 0.5 by Serj_LV)
// @license        GPL version 3 or any later version; http://www.gnu.org/copyleft/gpl.html
// @contributionURL https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=56E2JM7DNDHGQ&item_name=Travian+wave+builder+script&currency_code=EUR
// @match          https://*.travian.com/build.php*

// @version        2.11.1
// ==/UserScript==

function allInOneOpera () {

var version = '2.11.1';
var scriptURL = 'https://github.com/adipiciu/Travian-scripts';
var defInterval = 200;
var sLang = detectLanguage();
var langStrings = ["Add attack", "Remove attack", "Move attack up", "Move attack down", "Add multiple attacks (1-12 attacks)", "Interval between attacks, in milliseconds. Minimum interval is 100 ms.", "Attack type", "Interval", "ms"];

/*********************** localization ****************************/

switch(sLang) {
	case "ar-ae": //Arabic (U.A.E)
	case "ar-eg": //Arabic (Egypt)
	case "ar-sa": //Arabic (Saudi Arabia)
	case "ar-sy": //Arabic (Syria)
		langStrings = ["إضافة هجوم","إزالة الهجوم","تحريك الهجوم لأعلى","تحريك الهجوم لأسفل","إضافة هجمات متعددة (الهجمات من 1 إلى 12)","الفاصل الزمني بين الهجمات بالمللي ثانية. الحد الأدنى للفاصل الزمني هو 100 مللي ثانية.","نوع الهجوم","الفاصل الزمني","ملي ثانية"];
		break;
	case "fr-fr": //French
		langStrings = ["Ajouter une attaque", "Supprimer l'attaque", "Déplacer l'attaque vers le haut", "Déplacer l'attaque vers le bas", "Ajoutez plusieurs attaques (1-12 attaques).", "Intervalle entre les attaques, en millisecondes. L'intervalle minimum est de 100 ms.", "Type d'attaque", "Intervalle", "ms"];
		break;
	case "hu-hu": //Hungarian
		langStrings = ["Támadás hozzáadása", "Támadás törlése", "Támadás mozgatása fel", "Támadás mozgatása le", "Támadások hozzáadása (1-12 támadások)", "Támadások közötti intervallum (ms). Minimum intervallum 100 ms.", "Támadás típusa", "Intervallum", "ms"];
		break;
	case "it-it": //Italian
		langStrings = ["Aggiungi attacco", "Rimuovi l'attacco", "Sposta l'attacco in alto", "Sposta l'attacco in basso", "Aggiungi più attacchi (1-12 attacchi).", "Intervallo tra attacchi, in millisecondi. L'intervallo minimo è 100 ms.", "Tipo di attacco", "Intervallo", "ms"];
		break;
	case "pt-pt": //Portuguese
	case "pt-br": //Brazilian Portuguese
		langStrings = ["Adicionar ataque", "Remover ataque", "Mover ataque para cima", "Mover ataque para baixo", "Adicionar multiplos ataques (1-12 ataques)", "Intervalo entre ataques, em milisegundos. Intervalo mínimo de 100 ms.", "Tipo de ataque", "Intervalo", "ms"];
		break;
	case "ro-ro": //Romanian
		langStrings = ["Adaugă atac", "Șterge atacul", "Mută atacul în sus", "Mută atacul în jos", "Adaugă mai multe atacuri (1-12 atacuri)", "Intervalul dintre atacuri în milisecunde. Intervalul minim este de 100 ms.", "Tipul atacului", "Interval", "ms"];
		break;
	case "ru-ru": //Russian
		langStrings = ["Добавить атаку", "Удалите атаку", "Переместить атаки вверх", "Переместить атаку вниз", "Добавьте несколько атак (1-12 атаки)", "Интервал между атаками, в миллисекундах. Минимальный интервал составляет 100 мс.", "Тип атаки", "Интервал", "мс"];
		break;
	case "tr-tr": //Turkish
		langStrings = ["Saldırı ekle", "Saldırı çıkar", "saldırıyı yukarı kaydır", "saldırıyı asagı kaydır", "Çoklu saldırı ekle (1-12x saldırı)", "Saldırılar arasındaki aralık, milisaniye. en az aralık 100 ms'dir.", "Saldırı tipi", "aralık", "ms"];
		break;
	case "zh-cn": //Chinese
		langStrings = ["添加攻击","移除攻击","上移攻击","下移攻击","添加多个攻击 (1-12 次攻击)","攻击间隔 以毫秒为单位。最小间隔为 100 毫秒。","攻击类型","间隔","毫秒"];
		break;
	default: //English
}

/*********************** common library ****************************/

function RB_addStyle(css) {
	var head = document.getElementsByTagName('head')[0];
	if (head) {
	  var style = document.createElement("style");
	  style.appendChild($t(css));
	  head.appendChild(style);
	}
}

function ajaxRequest(url, aMethod, param, onSuccess, onFailure) {
	var aR = new XMLHttpRequest();
	param = encodeURI(param);
	aR.onreadystatechange = function() {
		if( aR.readyState == 4 && (aR.status == 200 || aR.status == 304)) { onSuccess(aR); }
		else if (aR.readyState == 4 && aR.status != 200) { onFailure(aR); }
	};
	aR.open(aMethod, url, true);
	if (aMethod == 'POST') aR.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	aR.send(param);
}

Number.prototype.NaN0 = function(){return isNaN(this)?0:this;};
function $g(aID,m) {return (typeof m == 'undefined' ? document:m).getElementById(aID);}
function $gn(aID) {return (aID != '' ? document.getElementsByName(aID) : null);}
function $gt(str,m) { return (typeof m == 'undefined' ? document:m).getElementsByTagName(str); }
function $gc(str,m) { return (typeof m == 'undefined' ? document:m).getElementsByClassName(str); }
function $at(aElem, att) {if (att !== undefined) {for (var xi = 0; xi < att.length; xi++) {aElem.setAttribute(att[xi][0], att[xi][1]); if (att[xi][0].toUpperCase() == 'TITLE') aElem.setAttribute('alt', att[xi][1]);}}}
function $t(iHTML) {return document.createTextNode(iHTML);}
function $e(nElem, att) {var Elem = document.createElement(nElem); $at(Elem, att); return Elem;}
function $ee(nElem, oElem, att) {var Elem = $e(nElem, att); if (oElem !== undefined) if( typeof(oElem) == 'object' ) Elem.appendChild(oElem); else Elem.innerHTML = oElem; return Elem;}
function $c(iHTML, att) { return $ee('TD',iHTML,att); }
function $a(iHTML, att) { return $ee('A',iHTML,att); }
function $am(Elem, mElem) { if (mElem !== undefined) for(var i = 0; i < mElem.length; i++) { if( typeof(mElem[i]) == 'object' ) Elem.appendChild(mElem[i]); else Elem.appendChild($t(mElem[i])); } return Elem;}
function $em(nElem, mElem, att) {var Elem = $e(nElem, att); return $am(Elem, mElem);}
function dummy() {return;}
var jsNone = 'return false;';

function trImg ( cl, et ) {
	var ecl = [['class', cl],['src', 'img/x.gif']];
	if( typeof et != 'undefined' ) ecl.push(['title',et]);
	return $e('IMG',ecl);
}

function getRandom ( x ) {
	x = Math.round(x*0.8);
	return x+Math.round(Math.random()*x*0.5);
}

function detectLanguage() {
	var lang = "en-us";
	try { 
		lang = $gn("content-language")[0].getAttribute("content").toLowerCase(); 
	} catch(e) { }
	try {
		lang = $g("mainLayout").getAttribute("lang").toLowerCase();
	} catch(e) { }
	return lang;
}

/********** begin of main code block ************/

function ok () {
	showPresetUnits();
	tFormFL = true;
	plus.textContent = '+';
	$g('twb_multi').disabled = false;
	wNr += 1;
	if( wNr < $g('twb_multi').value && wNr < 12 ) addWave();
	else {
		wNr = 0;
		if( seqQueue.length ) { fillWave(seqQueue.shift()); addWave(); }
	}
}

function addWave () {
	if( tFormFL ) {
		tFormFL = false;
		plus.textContent = 'x';
		$g('twb_multi').disabled = true;
	} else return;

	var tInputs = $gt('INPUT',tForm);
	var sParams = '';
	var cDescr = '';

	for( var i=0; i<tInputs.length; i++ ) {
		var t = tInputs[i].name;
		if( /redeployHero/.test(t) ) {
			if( tInputs[i].checked ) {
				sParams += "redeployHero=1&";
			}
		} else if ( t == "eventType" ) {
			if( tInputs[i].checked ) {
				sParams += "eventType=" + tInputs[i].value + "&";
				cDescr = tInputs[i].parentNode.textContent.trim();
			}
		} else if ( /^t\d/.test(t) || /x|y/.test(t) ) {
			sParams += t + "=" + $gn(t)[0].value + "&";
		} else {
			sParams += t + "=" + tInputs[i].value + "&";
		}
	}
	var okBtn = $g('ok');
	sParams += okBtn.name + "=" + okBtn.value;

	ajaxRequest(fullName + a2bURL, "POST", sParams, function(ajaxResp) {
		var parser = new DOMParser();
		var rpPage = parser.parseFromString(ajaxResp.responseText, "text/html");
		var bld = $g('build',rpPage);
		var err = $gc('error',bld);
		if( err.length > 0 && err[0].textContent.length > 1 ) {
			seqQueue = [];
			ok();
			alert( err[0].textContent );
			return;
		}
		err = $gc('alert',bld);
		if( err.length > 0 ) {
			for( i=0; i<err.length; i++ ) {
				if (err[i].hasAttribute("id") && err[i].getAttribute("id")=="l4") {
				} else {
					if( ! confirm(err[i].textContent) ) {
						seqQueue = [];
						ok();
						return;
					}
				}
			}
		}
		tInputs = $gt('INPUT',bld);
		var sParams = '';
		var tc = new Array(12);
		for( i=0; i<tInputs.length; i++ ) {
			var t = tInputs[i].name;
			if( /\[t\d/.test(t) ) {
				tc[t.match(/\[t(\d+)/)[1]] = tInputs[i].value;
			} if (tInputs[i].className == "radio") continue;
			if ( /useShip/.test(t) ) continue;
			sParams += t + "=" + tInputs[i].value + "&";
		}

		var okBtn = $gc('rallyPointConfirm',rpPage);
		var sOnclick = okBtn[0].getAttribute('onclick');
		var checkSum = sOnclick.split(';')[1].split('value = \'')[1].split('\'')[0];
		sParams += "checksum=" + checkSum;

		var remBtn = $a('-',[['href','#'],['class','twb-btn'],['title',langStrings[1]],['onclick',jsNone]]);
		remBtn.addEventListener('click',remWave,false);

		var moveUpBtn = $a('&uarr;',[['href','#'],['class','twb-btn'],['title',langStrings[2]],['onclick',jsNone],['style','margin:0 6px;']]);
		moveUpBtn.addEventListener('click',moveWaveUp,false);

		var moveDownBtn = $a('&darr;',[['href','#'],['class','twb-btn'],['title',langStrings[3]],['onclick',jsNone]]);
		moveDownBtn.addEventListener('click',moveWaveDown,false);

		var firstCol = $c(remBtn,[['rowspan',2],['style','text-align:center;user-select:none;']]);
		firstCol.appendChild(moveUpBtn);
		firstCol.appendChild(moveDownBtn);
		firstCol.appendChild($e('INPUT',[['type','hidden'],['value',sParams]]));

		var nrow = $ee('TR',firstCol);
		for( i=1; i<12; i++ ) {
			nrow.appendChild($c(tc[i]));
		}
		nrow.appendChild($c(cDescr,[['title',cDescr]]));
		var nbody = $ee('TBODY',nrow);
		tInputs = $gt('SELECT',bld);
		var tSpy = $gc('radio',bld);
		var ships = $gc('useShip',bld);
		nrow = $e('TR');
		if (tInputs.length>0) {
			nrow.appendChild($c(tInputs[0],[['colspan',6]]));
		} else if (tSpy.length>0) {
			tSpy[0].name = tSpy[0].name+"twb"+tbl.tBodies.length;
			if (tSpy.length>1) tSpy[1].name = tSpy[1].name+"twb"+tbl.tBodies.length;
			tSpy[0].parentNode.parentNode.colSpan = 6;
			nrow.appendChild(tSpy[0].parentNode.parentNode);
		} else {
			nrow.appendChild($c('-',[['colspan',6]]));
		}
		nrow.appendChild($c(tInputs.length>0 ? tInputs[0]: '-',[['colspan',5]]));
		if (ships.length>0) {
			var shipsRow = $gc('shipAvailability',bld)[0].cloneNode(true);
			var shipsDiv = ships[0].cloneNode(true);
			shipsDiv.style.margin = "0px";
			var shipsInp = $gt('input',shipsDiv);
			shipsInp[0].name = shipsInp[0].name+"twb"+tbl.tBodies.length;
			shipsInp[0].removeAttribute("onchange");
			shipsRow.appendChild(shipsDiv.cloneNode(true));
			nrow.appendChild($c(shipsRow,[['style','text-align:right;']]));
		} else {
			nrow.appendChild($e('TD'));
		}
		nbody.appendChild(nrow);
		tbl.appendChild(nbody);
		setTimeout(ok, getRandom(1200));
		}, function() { seqQueue = []; setTimeout(ok, getRandom(1200)); } 
	);
}

function remWave () {
	var tb = this.parentNode.parentNode.parentNode;
	tb.parentNode.removeChild(tb);
	showPresetUnits();
}

function moveWaveUp () {
	var wave = this.parentNode.parentNode.parentNode;
    var previousElem = wave.previousElementSibling;
    if (previousElem && previousElem.tagName!='TFOOT') {
        wave.parentNode.insertBefore(wave, previousElem);
    }
}

function moveWaveDown () {
	var wave = this.parentNode.parentNode.parentNode;
    var nextElem = wave.nextElementSibling;
    if (nextElem && nextElem.tagName!='TFOOT') {
        wave.parentNode.insertBefore(wave, nextElem.nextElementSibling);
    }
}

function sendTroops (x) {
	var wBody = tbl.tBodies[x];
	var sParams = $gt('INPUT',wBody)[0].value;
	var	tInputs = $gt('SELECT',wBody);
	sParams += tInputs.length>0 ? "&" + tInputs[0].name + "=" + tInputs[0].value : '';
	sParams += tInputs.length>1 ? "&" + tInputs[1].name + "=" + tInputs[1].value : '';
	var tSpy = $gc('radio',wBody);
	sParams += tSpy.length>0 ? "&" + tSpy[0].name.substring(0, tSpy[0].name.indexOf('twb')) + "=" + (tSpy[0].checked ? '1' : '2') : '';
	var ShipsInp = $gc('useShips',wBody);
	sParams += (ShipsInp.length>0 && ShipsInp[0].checked) ? "&" + ShipsInp[0].name.substring(0, ShipsInp[0].name.indexOf('twb')) + "=1" : '';

	function logWaves (a,b) {
		wlog += "<span style='color:"+(b?'green':'red')+"'> "+a+" </span>";
		cLog.innerHTML = wlog;
	}

	if( x == wCount-1 ) {
		setTimeout(function(){ document.location.href = fullName +'build.php?gid=16&tt=1'; }, getRandom(2000));
	}
	ajaxRequest(fullName + a2bURL, "POST", sParams, function() { return function(x) { return logWaves(x,1); }(x+1); }, 
		function() { return function(x) { return logWaves(x,0); }(x+1); } );
}

function sendWaves () {
	cLog = $c(wlog,[['colspan',13],['style','background-color: transparent;']]);
	tbl.tFoot.appendChild($ee('TR',cLog));
	wCount = tbl.tBodies.length;
	var nextWave = 10;
	var intWave = parseInt(interval.value).NaN0();
	if( intWave < 100 ) intWave = defInterval;
	for( var i=0; i<wCount; i++ ) {
		setTimeout(function(x){return function(){ sendTroops(x); };}(i), nextWave);
		nextWave += getRandom(intWave);
	}
}

/********** presets: troops + attack type + wave count, stored per server in localStorage ************/

var presetKey = 'twb_presets';

function loadPresets () {
	try { return JSON.parse(localStorage.getItem(presetKey)) || {}; } catch(e) { return {}; }
}

function fillPresetSelect (selected) {
	var p = loadPresets();
	presetSel.innerHTML = '';
	presetSel.appendChild(new Option('-- preset --', ''));
	for( var n in p ) presetSel.appendChild(new Option(n, n));
	presetSel.value = selected || '';
}

// troop inputs keyed 't1'..'t11'; live form uses "troop[t1]" (t11 = hero, only when the hero is home), old one "t1"
function troopInputs () {
	var r = {};
	var ins = $gt('INPUT',tForm);
	for( var i=0; i<ins.length; i++ ) {
		var m = ins[i].name.match(/(?:^|\[)t(\d+)\]?$/);
		if( m && ! r['t'+m[1]] ) r['t'+m[1]] = ins[i];
	}
	return r;
}

// fire input/change so page scripts listening on the troop fields see the new value
function setInputValue (inp, v) {
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inp, v);
	inp.dispatchEvent(new Event('input',{bubbles:true}));
	inp.dispatchEvent(new Event('change',{bubbles:true}));
}

// troops of type t<i> already put into queued waves (row cells 1..11 = t1..t11)
function plannedTroops ( i ) {
	var n = 0;
	for( var b=0; b<tbl.tBodies.length; b++ ) n += parseInt(tbl.tBodies[b].rows[0].cells[i].textContent) || 0;
	return n;
}

function unitIcons ( troops, el ) {
	for( var i=1; i<12; i++ ) {
		var v = parseInt(troops['t'+i]);
		if( v > 0 ) $am(el || presetView,[trImg(i == 11 ? 'unit uhero' : 'unit u'+(nation*10+i)),' '+v+'  ']);
	}
}

function showPresetUnits () {
	var s = loadPresets()[presetSel.value];
	presetView.innerHTML = '';
	if( s && s.waves ) {
		// queue preset: identical neighbouring waves collapsed, e.g. "1. ...  2-8. ..."
		for( var k=0; k<s.waves.length; ) {
			var j = k;
			while( j+1 < s.waves.length && JSON.stringify(s.waves[j+1]) == JSON.stringify(s.waves[k]) ) j++;
			var g = $e('SPAN',[['style','white-space:nowrap;margin-right:10px;']]);
			presetView.appendChild(g);
			g.appendChild($ee('B',(k == j ? (k+1) : (k+1)+'–'+(j+1))+'. ',[['style','margin-left:6px;']]));
			unitIcons(s.waves[k].troops, g);
			k = j+1;
		}
	} else if( s ) {
		unitIcons(s.troops);
		presetView.appendChild($t(presetView.childNodes.length ? ' x'+(parseInt(multi.value) || 1) : '(empty)'));
	}
	showSummary(s);
}

// totals per unit: what "+" would add (preset x waves), what queued waves take, what the village has, what stays
// one shared box under the send button, used by both ResourceBar+ and Wave builder; CSS 'order' fixes the section order
function rallyPanel () {
	var p = document.getElementById('rally-panel');
	if( !p ) {
		var ok = document.getElementById('ok');
		p = document.createElement('div');
		p.id = 'rally-panel';
		ok.parentNode.insertBefore(p, ok.nextSibling);
	}
	return p;
}

function showSummary ( s ) {
	var ins = troopInputs(), want = parseInt(multi.value) || 1, rows = [];
	for( var i=1; i<12; i++ ) {
		var add = 0, queued = plannedTroops(i);
		if( s && s.waves ) s.waves.forEach(function (w) { add += parseInt(w.troops['t'+i]) || 0; });
		else if( s ) add = (parseInt(s.troops['t'+i]) || 0) * want;
		if( !add && !queued ) continue;
		var inp = ins['t'+i];
		var avail = inp ? parseInt(inp.parentNode.textContent.split('/').pop().replace(/\D/g,'')) || 0 : 0;
		var left = avail - queued - add;
		rows.push($em('TR',[$em('TD',[trImg(i == 11 ? 'unit uhero' : 'unit u'+(nation*10+i))]),
			$em('TD',[add ? ''+add : '–']), $em('TD',[queued ? ''+queued : '–']), $em('TD',[''+avail]),
			$em('TD',[''+left],[['class',left < 0 ? 'twb-neg' : 'twb-pos']])]));
	}
	summary.innerHTML = '';
	summary.style.display = rows.length ? '' : 'none';
	if( !rows.length ) return;
	var head = [];
	if( s ) head.push(s.waves ? 'kolejka „'+presetSel.value+'” ('+s.waves.length+' fal)' : 'preset „'+presetSel.value+'” × '+want);
	if( tbl.tBodies.length ) head.push('w tabeli: '+tbl.tBodies.length+' fal');
	summary.appendChild($em('DIV',['Wojsko – '+head.join(' · ')],[['class','rbp-sec-h']]));
	summary.appendChild($em('TABLE',[$em('TR',[$e('TH'),$em('TH',['dodasz']),$em('TH',['w tabeli']),$em('TH',['w osadzie']),$em('TH',['zostanie'])])].concat(rows)));
}

function savePreset () {
	var name = prompt('Preset name', presetSel.value);
	if( ! name ) return;
	var troops = {}, ins = troopInputs();
	for( var t in ins ) troops[t] = ins[t].value;
	if( ! Object.keys(ins).length ) { alert('Troop inputs not found, preset not saved.'); return; }
	var ev = tForm.querySelector('input[name="eventType"]:checked');
	var p = loadPresets();
	p[name] = {troops: troops, eventType: ev ? ev.value : '', multi: multi.value};
	localStorage.setItem(presetKey, JSON.stringify(p));
	fillPresetSelect(name);
	showPresetUnits();
}

function fillWave ( w ) {
	var ins = troopInputs();
	for( var t in ins ) setInputValue(ins[t], w.troops[t] || '');
	var ev = tForm.querySelector('input[name="eventType"][value="'+w.eventType+'"]');
	if( ev && ! ev.checked ) ev.click();
}

function applyPreset () {
	var s = loadPresets()[presetSel.value];
	if( s ) {
		fillWave(s.waves ? s.waves[0] : s);
		multi.value = s.waves ? 1 : s.multi;
	}
	showPresetUnits();
}

// saves the current wave table (troops + attack type of every wave, in order) as a queue preset
function saveQueue () {
	if( ! tbl.tBodies.length ) { alert('Tabela fal jest pusta – najpierw dodaj fale.'); return; }
	var name = prompt('Nazwa kolejki fal', presetSel.value);
	if( ! name ) return;
	var waves = [];
	for( var b=0; b<tbl.tBodies.length; b++ ) {
		var body = tbl.tBodies[b], troops = {};
		for( var i=1; i<12; i++ ) troops['t'+i] = ''+(parseInt(body.rows[0].cells[i].textContent) || '');
		var ev = $gt('INPUT',body)[0].value.match(/(?:^|&)eventType=(\d+)/);
		waves.push({troops: troops, eventType: ev ? ev[1] : ''});
	}
	var p = loadPresets();
	p[name] = {waves: waves};
	localStorage.setItem(presetKey, JSON.stringify(p));
	fillPresetSelect(name);
	showPresetUnits();
}

// "+": a queue preset adds all its waves in order (one copy each), otherwise the usual multi copies
function plusClick () {
	var s = loadPresets()[presetSel.value];
	if( tFormFL && s && s.waves ) {
		multi.value = 1;
		fillWave(s.waves[0]);
		seqQueue = s.waves.slice(1);
	}
	addWave();
}

function delPreset () {
	if( ! presetSel.value || ! confirm('Delete preset "'+presetSel.value+'"?') ) return;
	var p = loadPresets();
	delete p[presetSel.value];
	localStorage.setItem(presetKey, JSON.stringify(p));
	fillPresetSelect();
	showPresetUnits();
}

twb_css = "table#twbtable { background-color: transparent; border-collapse: collapse; } " +
"table#twbtable thead td, table#twbtable tbody td, table#twbtable tfoot td { border: 1px solid silver; } " +
"table#twbtable a.twb-btn { display:inline-block; min-width:26px; line-height:26px; font-size:20px; font-weight:bold; text-align:center; border-radius:4px; text-decoration:none; } " +
"table#twbtable a.twb-btn:hover { background-color: rgba(0,0,0,0.1); } " +
"table#twbtable thead a { white-space:nowrap; } " +
"#rally-panel { display:grid; grid-template-columns:max-content minmax(0,1fr); align-items:stretch; box-sizing:border-box; width:100%; margin:8px 0; border:1px solid #c9b78f; border-radius:6px; overflow:hidden; background:#fdf8ea; font-size:12px; color:#3b2f17; } #rally-panel .rbp-sec-h { box-sizing:border-box; height:24px; line-height:17px; background:linear-gradient(#ebdcb4,#d5c18d); color:#4b3a1a; font-weight:bold; padding:3px 8px; border-bottom:1px solid #c9b78f; } " +
"#twb_summary { grid-column:1 / -1; grid-row:3; border-top:1px solid #c9b78f; } " +
"#twb_summary table { width:100%; border-collapse:collapse; background:transparent; margin:0; } " +
"#twb_summary table th, #twb_summary table td { padding:1px 8px; text-align:right; border:0; border-bottom:1px solid #e5dcc0; background:transparent; } " +
"#twb_summary table th { font-weight:bold; font-size:11px; color:#6b5a36; } " +
"#twb_summary table tr:last-child td { border-bottom:0; } " +
"#twb_summary .twb-pos { color:#2e7d32; font-weight:bold; } #twb_summary .twb-neg { color:#c62828; font-weight:bold; } "

var build = $g('build');
if( ! build ) return;
if( build.getAttribute('class').indexOf('gid16') == -1 ) return;

var snd = $gc('a2b');
if( $gc('a2b').length != 1 ) return;

if( ! $g('troops') ) return;

var nation = Math.floor(parseInt($gc('unit')[0].getAttribute('class').match(/\d+/)[0])/10);
if( nation < 0 ) return;

RB_addStyle(twb_css);

var a2bURL = "build.php?gid=16&tt=2";
var wCount = 0;
var wNr = 0;
var seqQueue = [];
var wlog = '';
var cLog;
var tForm = snd[0];
var tFormFL = true;
var fullName = window.location.origin + "/";

// build table header
var tbl = $e('TABLE',[['id','twbtable']]);
var plus = $a('+',[['href','#'],['onclick',jsNone],['class','twb-btn'],['title',langStrings[0]]]);
plus.addEventListener('click',plusClick,false);
var multi = $e('INPUT',[['id','twb_multi'],['type','number'],['value',1],['title',langStrings[4]],['min',1],['max',12],['style','width:40px;margin:0 8px;']]);
var hrow = $ee('TR',$am($e('TD',[['style','white-space:nowrap;']]),[multi,plus]));
for( var i=1; i<11; i++ ) {
	hrow.appendChild($c(trImg('unit u'+(nation*10+i))));
}
$am(hrow,[$c(trImg('unit uhero')),$c(langStrings[6])]);
var presetSel = $e('SELECT',[['style','margin:0 8px;']]);
presetSel.addEventListener('change',applyPreset,false);
var presetSave = $a('Save',[['href','#'],['onclick',jsNone],['title','Save current troops, attack type and wave count as preset'],['style','margin-right:8px;']]);
presetSave.addEventListener('click',savePreset,false);
var queueSave = $a('Zapisz kolejkę',[['href','#'],['onclick',jsNone],['title','Zapisz wszystkie fale z tabeli (w tej kolejności) jako preset-kolejkę'],['style','margin-right:8px;']]);
queueSave.addEventListener('click',saveQueue,false);
var presetDel = $a('Delete',[['href','#'],['onclick',jsNone],['title','Delete selected preset']]);
presetDel.addEventListener('click',delPreset,false);
var presetView = $e('DIV',[['style','margin-top:4px;line-height:20px;']]);
multi.addEventListener('input',showPresetUnits,false);
fillPresetSelect();
var prow = $ee('TR',$em('TD',['Preset:',presetSel,presetSave,queueSave,presetDel,presetView],[['colspan',13],['style','background-color: transparent;padding:3px;']]));
tbl.appendChild($em('THEAD',[prow,hrow]));

var sendBtn = $g('ok').cloneNode(true);
sendBtn.removeAttribute('name');
sendBtn.removeAttribute('id');
sendBtn.addEventListener('click',sendWaves,false);

var interval = $e('INPUT',[['type','text'],['value',defInterval],['title',langStrings[5]],['size',4],['maxlength',4],['style','text-align:right']]);
var intervaltxt = $ee('SPAN',langStrings[7],[['style','display:inline-block;padding:0 5px;']]);
var unitTimetxt = $ee('SPAN',langStrings[8],[['style','display:inline-block;padding:0 5px;']]);
tbl.appendChild($ee('TFOOT',$ee('TR',$em('TD',[intervaltxt,interval,unitTimetxt,sendBtn,
	$a(' (v'+version+') ',[['href',scriptURL],['target','_blank']])],
	[['colspan',13],['style','background-color: transparent;text-align:center !important;padding:3px;']]))));

build.appendChild(tbl);

// summary box in the free space under the game's own send button
var summary = $e('DIV',[['id','twb_summary'],['style','display:none;']]);
rallyPanel().appendChild(summary);

/********** end of main code block ************/
}

allInOneOpera();
