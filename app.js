(() => {
  'use strict';

  const ALL_GROUPS = 'Alle Materialgruppen';
  const CUSTOM_ITEM = 'Sonstiges / freie Eingabe';
  const QUANTITIES = [1,2,3,4,6,10,20,30];
  const materials = (window.MATERIALS || []).filter(x => x.active !== false);
  const byName = new Map(materials.map(x => [x.name.toLocaleLowerCase('de-DE'), x]));
  const groups = [...new Set(materials.map(x => x.group))];

  const $ = id => document.getElementById(id);
  const els = {
    customer: $('customer'), project: $('project'), installer: $('installer'), captureDate: $('captureDate'),
    groupSelect: $('groupSelect'), materialSearch: $('materialSearch'), suggestions: $('suggestions'),
    customMaterialField: $('customMaterialField'), customMaterial: $('customMaterial'), selectedInfo: $('selectedInfo'),
    selectedUnit: $('selectedUnit'), selectedGroup: $('selectedGroup'), favoriteButton: $('favoriteButton'),
    quantity: $('quantity'), minusButton: $('minusButton'), plusButton: $('plusButton'), quickQuantities: $('quickQuantities'),
    addButton: $('addButton'), favorites: $('favorites'), entries: $('entries'), countBadge: $('countBadge'),
    saveButton: $('saveButton'), newButton: $('newButton'), finalCheckButton: $('finalCheckButton'),
    finalDialog: $('finalDialog'), finalSummary: $('finalSummary'), exportButton: $('exportButton'),
    installButton: $('installButton'), installDialog: $('installDialog'), toast: $('toast'), networkBadge: $('networkBadge')
  };

  let entries = [];
  let favorites = new Set();
  let selectedItem = null;
  let installPrompt = null;
  let toastTimer = null;

  function todayISO(){
    const d=new Date(); const off=d.getTimezoneOffset();
    return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }

  function toGermanDate(iso){
    if(!iso) return '';
    const [y,m,d]=iso.split('-'); return y&&m&&d ? `${d}.${m}.${y}` : iso;
  }

  function showToast(message){
    clearTimeout(toastTimer); els.toast.textContent=message; els.toast.hidden=false;
    toastTimer=setTimeout(()=>els.toast.hidden=true,2400);
  }

  function normalizeQuantity(raw){
    const value=Number(String(raw).trim().replace(',','.'));
    if(!Number.isFinite(value)||value<=0) return null;
    return String(Number(value.toFixed(3))).replace('.',',');
  }

  function quantityNumber(raw){ return Number(String(raw).replace(',','.')) || 0; }
  function formatQuantity(n){ return String(Number(Number(n).toFixed(3))).replace('.',','); }

  function saveState(showMessage=false){
    const state={
      customer:els.customer.value, project:els.project.value, installer:els.installer.value,
      date:els.captureDate.value, entries
    };
    localStorage.setItem('ollinger_material_capture_v1',JSON.stringify(state));
    localStorage.setItem('ollinger_material_favorites_v1',JSON.stringify([...favorites]));
    if(showMessage) showToast('Entwurf auf diesem Gerät gespeichert');
  }

  function loadState(){
    try{
      const state=JSON.parse(localStorage.getItem('ollinger_material_capture_v1')||'null');
      if(state){
        els.customer.value=state.customer||''; els.project.value=state.project||''; els.installer.value=state.installer||'';
        els.captureDate.value=state.date||todayISO(); entries=Array.isArray(state.entries)?state.entries:[];
      } else els.captureDate.value=todayISO();
    }catch{ els.captureDate.value=todayISO(); entries=[]; }
    try{ favorites=new Set(JSON.parse(localStorage.getItem('ollinger_material_favorites_v1')||'[]')); }catch{ favorites=new Set(); }
    const valid=new Set(materials.map(x=>x.name)); favorites=new Set([...favorites].filter(x=>valid.has(x)));
  }

  function catalogItemForName(name){ return byName.get(String(name||'').trim().toLocaleLowerCase('de-DE')) || null; }

  function renderGroups(){
    els.groupSelect.innerHTML='';
    [ALL_GROUPS,...groups].forEach(g=>{ const o=document.createElement('option'); o.value=g; o.textContent=g; els.groupSelect.appendChild(o); });
  }

  function searchMaterials(term=''){
    const q=term.trim().toLocaleLowerCase('de-DE'); const group=els.groupSelect.value||ALL_GROUPS;
    let list=materials.filter(x=>group===ALL_GROUPS||x.group===group);
    if(q){
      // Search globally once the user types, matching the Android behavior.
      list=materials.filter(x=>[x.name,x.longName,x.group,x.articleNumber,x.efg].some(v=>String(v||'').toLocaleLowerCase('de-DE').includes(q)));
    }
    return list.slice(0,60);
  }

  function renderSuggestions(){
    const list=searchMaterials(els.materialSearch.value);
    els.suggestions.innerHTML='';
    if(!list.length){ els.suggestions.hidden=true; return; }
    list.forEach(item=>{
      const b=document.createElement('button'); b.type='button'; b.className='suggestion';
      const strong=document.createElement('strong'); strong.textContent=item.name;
      const meta=document.createElement('span'); meta.textContent=`${item.group} · ${item.unit}${item.articleNumber?` · ${item.articleNumber}`:''}`;
      b.append(strong,meta); b.addEventListener('click',()=>selectMaterial(item)); els.suggestions.appendChild(b);
    });
    els.suggestions.hidden=false;
  }

  function selectMaterial(item){
    selectedItem=item; els.materialSearch.value=item.name; els.suggestions.hidden=true;
    els.selectedInfo.hidden=false; els.selectedUnit.textContent=`Einheit: ${item.unit}`; els.selectedGroup.textContent=item.group;
    const custom=item.name===CUSTOM_ITEM; els.customMaterialField.hidden=!custom;
    if(!custom) els.customMaterial.value='';
    els.favoriteButton.hidden=custom; updateFavoriteButton();
  }

  function clearMaterialSelection(){
    selectedItem=null; els.materialSearch.value=''; els.customMaterial.value=''; els.customMaterialField.hidden=true;
    els.selectedInfo.hidden=true; els.suggestions.hidden=true; els.quantity.value='1';
  }

  function updateFavoriteButton(){
    if(!selectedItem||selectedItem.name===CUSTOM_ITEM) return;
    els.favoriteButton.textContent=favorites.has(selectedItem.name)?'★ Favorit entfernen':'☆ Als Favorit';
  }

  function toggleFavorite(){
    if(!selectedItem||selectedItem.name===CUSTOM_ITEM) return;
    if(favorites.has(selectedItem.name)){ favorites.delete(selectedItem.name); showToast('Favorit entfernt'); }
    else{ favorites.add(selectedItem.name); showToast('Als Favorit gespeichert'); }
    updateFavoriteButton(); renderFavorites(); saveState();
  }

  function renderFavorites(){
    els.favorites.innerHTML='';
    const list=materials.filter(x=>favorites.has(x.name));
    if(!list.length){ const p=document.createElement('div'); p.className='empty-chip'; p.textContent='Noch keine Favoriten. Material auswählen und ☆ Als Favorit antippen.'; els.favorites.appendChild(p); return; }
    list.forEach(item=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=`★ ${item.name}`; b.addEventListener('click',()=>selectMaterial(item)); els.favorites.appendChild(b); });
  }

  function adjustMainQuantity(delta){
    const current=quantityNumber(els.quantity.value)||1; const next=current+delta;
    if(next<=0){ showToast('Die Menge muss größer als 0 bleiben'); return; }
    els.quantity.value=formatQuantity(next);
  }

  function addEntry(){
    const typed=els.materialSearch.value.trim();
    if(!selectedItem || selectedItem.name!==typed){
      const found=catalogItemForName(typed); if(found) selectedItem=found;
    }
    if(!selectedItem){ showToast('Bitte Material aus der Liste auswählen'); els.materialSearch.focus(); renderSuggestions(); return; }
    let materialName=selectedItem.name;
    const custom=selectedItem.name===CUSTOM_ITEM;
    if(custom){ materialName=els.customMaterial.value.trim(); if(!materialName){ showToast('Bitte eigene Materialbezeichnung eingeben'); els.customMaterial.focus(); return; } }
    const qty=normalizeQuantity(els.quantity.value); if(!qty){ showToast('Bitte eine Menge größer als 0 eingeben'); els.quantity.focus(); return; }
    const existing=entries.find(x=>x.group.toLocaleLowerCase('de-DE')===selectedItem.group.toLocaleLowerCase('de-DE') && x.material.toLocaleLowerCase('de-DE')===materialName.toLocaleLowerCase('de-DE') && x.unit.toLocaleLowerCase('de-DE')===selectedItem.unit.toLocaleLowerCase('de-DE'));
    if(existing){ existing.quantity=formatQuantity(quantityNumber(existing.quantity)+quantityNumber(qty)); showToast(`Bereits vorhanden – Menge auf ${existing.quantity} ${existing.unit} erhöht`); }
    else entries.push({ group:selectedItem.group, material:materialName, unit:selectedItem.unit, quantity:qty, catalogName:custom?null:selectedItem.name });
    clearMaterialSelection(); renderEntries(); saveState();
  }

  function updateEntryQuantity(index,value){
    const normalized=normalizeQuantity(value); if(!normalized){ renderEntries(); showToast('Menge muss größer als 0 sein'); return; }
    entries[index].quantity=normalized; renderEntries(); saveState();
  }

  function stepEntry(index,delta){
    const next=quantityNumber(entries[index].quantity)+delta; if(next<=0){ showToast('Die Menge muss größer als 0 bleiben'); return; }
    entries[index].quantity=formatQuantity(next); renderEntries(); saveState();
  }

  function renderEntries(){
    els.entries.innerHTML=''; els.countBadge.textContent=entries.length===1?'1 Position':`${entries.length} Positionen`;
    if(!entries.length){ const p=document.createElement('div'); p.className='empty-state'; p.textContent='Noch kein Material erfasst. Füge oben die erste Position hinzu.'; els.entries.appendChild(p); return; }
    entries.forEach((entry,index)=>{
      const card=document.createElement('article'); card.className='entry';
      const head=document.createElement('div'); head.className='entry-head';
      const info=document.createElement('div'); const name=document.createElement('div'); name.className='entry-name'; name.textContent=entry.material;
      const group=document.createElement('div'); group.className='entry-group'; group.textContent=entry.group; info.append(name,group);
      const badge=document.createElement('div'); badge.className='qty-badge'; badge.textContent=`${entry.quantity} ${entry.unit}`; head.append(info,badge);
      const controls=document.createElement('div'); controls.className='entry-controls';
      const minus=document.createElement('button'); minus.type='button'; minus.className='entry-step'; minus.textContent='−'; minus.addEventListener('click',()=>stepEntry(index,-1));
      const input=document.createElement('input'); input.inputMode='decimal'; input.value=entry.quantity; input.setAttribute('aria-label',`Menge ${entry.material}`); input.addEventListener('change',()=>updateEntryQuantity(index,input.value));
      const plus=document.createElement('button'); plus.type='button'; plus.className='entry-step'; plus.textContent='+'; plus.addEventListener('click',()=>stepEntry(index,1));
      const remove=document.createElement('button'); remove.type='button'; remove.className='entry-remove'; remove.textContent='Löschen'; remove.addEventListener('click',()=>{ entries.splice(index,1); renderEntries(); saveState(); });
      controls.append(minus,input,plus,remove); card.append(head,controls); els.entries.appendChild(card);
    });
  }

  function collectCheck(){
    const checks=[
      ['Kunde',els.customer.value.trim()], ['Baustellenadresse',els.project.value.trim()],
      ['Monteur',els.installer.value.trim()], ['Datum',els.captureDate.value?toGermanDate(els.captureDate.value):''],
      ['Materialpositionen',entries.length?`${entries.length}`:'']
    ];
    return checks;
  }

  function showFinalCheck(){
    saveState(); const checks=collectCheck(); const missing=checks.filter(([,v])=>!v);
    els.finalSummary.innerHTML=''; checks.forEach(([label,value])=>{ const d=document.createElement('div'); d.className=`check-line ${value?'ok':'missing'}`; d.textContent=value?`✓ ${label}: ${value}`:`✗ ${label}: fehlt`; els.finalSummary.appendChild(d); });
    if(missing.length){ const d=document.createElement('div'); d.className='check-line missing'; d.textContent=`Bitte ergänzen: ${missing.map(x=>x[0]).join(', ')}`; els.finalSummary.appendChild(d); }
    els.exportButton.disabled=missing.length>0; els.exportButton.style.opacity=missing.length?'.45':'1'; els.finalDialog.showModal();
  }

  function csvCell(value){
    const s=String(value??'').replaceAll('"','""'); return /[;\n\r"]/.test(s)?`"${s}"`:s;
  }

  function exportCatalog(entry){
    if(!entry.catalogName) return { longName:entry.material, articleNumber:'', efg:'' };
    const item=catalogItemForName(entry.catalogName)||catalogItemForName(entry.material);
    return item?{longName:item.longName||item.name,articleNumber:item.articleNumber||'',efg:item.efg||''}:{longName:entry.material,articleNumber:'',efg:''};
  }

  function buildCsv(){
    const lines=[];
    lines.push(`Kunde;${csvCell(els.customer.value.trim())}`);
    lines.push(`Baustellenadresse;${csvCell(els.project.value.trim())}`);
    lines.push(`Monteur;${csvCell(els.installer.value.trim())}`);
    lines.push(`Datum;${csvCell(toGermanDate(els.captureDate.value))}`);
    lines.push(''); lines.push('Materialgruppe;Material;Artikelnummer;EFG;Einheit;Menge');
    entries.forEach(entry=>{ const ex=exportCatalog(entry); lines.push([entry.group,ex.longName,ex.articleNumber,ex.efg,entry.unit,entry.quantity].map(csvCell).join(';')); });
    return '\uFEFF'+lines.join('\r\n');
  }

  function safeFilePart(value){
    const s=String(value||'Eintrag').replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,35); return s||'Eintrag';
  }

  function filename(){
    const d=new Date(); const pad=n=>String(n).padStart(2,'0');
    const stamp=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `Materialerfassung_${safeFilePart(els.project.value||'Baustelle')}_${safeFilePart(els.customer.value||'Kunde')}_${stamp}.csv`;
  }

  async function exportCsv(){
    const blob=new Blob([buildCsv()],{type:'text/csv;charset=utf-8'}); const name=filename();
    const file=new File([blob],name,{type:'text/csv'});
    try{
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({title:'Materialerfassung',text:`Materialerfassung ${els.customer.value.trim()||els.project.value.trim()}`,files:[file]});
        showToast('CSV bereitgestellt'); els.finalDialog.close(); return;
      }
    }catch(err){ if(err && err.name==='AbortError') return; }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
    showToast('CSV gespeichert'); els.finalDialog.close();
  }

  function newCapture(){
    if(!confirm('Die aktuelle Erfassung wird gelöscht. Fortfahren?')) return;
    els.customer.value=''; els.project.value=''; els.installer.value=''; els.captureDate.value=todayISO(); entries=[]; clearMaterialSelection(); els.groupSelect.value=ALL_GROUPS; localStorage.removeItem('ollinger_material_capture_v1'); renderEntries(); showToast('Neue Erfassung gestartet');
  }

  function updateNetworkBadge(){
    const online=navigator.onLine; els.networkBadge.textContent=online?'Online':'Offline'; els.networkBadge.classList.toggle('offline',!online);
  }

  async function installApp(){
    if(installPrompt){ installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; return; }
    els.installDialog.showModal();
  }

  function bind(){
    [els.customer,els.project,els.installer,els.captureDate].forEach(el=>el.addEventListener('input',()=>saveState()));
    els.groupSelect.addEventListener('change',()=>{ clearMaterialSelection(); });
    els.materialSearch.addEventListener('focus',renderSuggestions);
    els.materialSearch.addEventListener('input',()=>{ selectedItem=null; els.selectedInfo.hidden=true; els.customMaterialField.hidden=true; renderSuggestions(); });
    document.addEventListener('click',e=>{ if(!e.target.closest('.autocomplete-wrap')) els.suggestions.hidden=true; });
    els.favoriteButton.addEventListener('click',toggleFavorite); els.minusButton.addEventListener('click',()=>adjustMainQuantity(-1)); els.plusButton.addEventListener('click',()=>adjustMainQuantity(1));
    els.addButton.addEventListener('click',addEntry); els.saveButton.addEventListener('click',()=>saveState(true)); els.newButton.addEventListener('click',newCapture); els.finalCheckButton.addEventListener('click',showFinalCheck); els.exportButton.addEventListener('click',exportCsv); els.installButton.addEventListener('click',installApp);
    window.addEventListener('online',updateNetworkBadge); window.addEventListener('offline',updateNetworkBadge);
    window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installPrompt=e; els.installButton.hidden=false; });
    window.addEventListener('appinstalled',()=>{ els.installButton.hidden=true; showToast('App installiert'); });
  }

  function renderQuickQuantities(){
    QUANTITIES.forEach(q=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=q; b.addEventListener('click',()=>els.quantity.value=String(q)); els.quickQuantities.appendChild(b); });
  }

  function registerServiceWorker(){
    if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }
  }

  function init(){
    loadState(); renderGroups(); renderQuickQuantities(); renderFavorites(); renderEntries(); updateNetworkBadge(); bind(); registerServiceWorker();
    if(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true) els.installButton.hidden=true;
  }
  init();
})();
