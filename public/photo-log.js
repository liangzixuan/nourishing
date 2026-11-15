import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {mountFoodPicker} from './food-picker.js';
import {quantityFields, quantityValue} from './quantity.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const num = value => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits: 1}) : '—';
const quantityLabel = row => `${num(row.quantity ?? row.amount ?? 1)} ${row.unit === 'portion' ? row.portionLabel ?? 'portions' : row.unit ?? 'servings'}`;
const fileData = file => new Promise((resolve, reject) => {const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(Error('Could not open this photo.'));reader.readAsDataURL(file);});

/** Save is injected by the authenticated cloud owner; no photo draft is persisted. */
export function mountPhotoLog({show, close, header, content, date, groups, save, onChange = async () => {}}) {
  let disposed = false, serial = 0, abort, analysis, originalImage, rows = [], pickerCleanup, pendingSave = false;
  // Same default as the existing mobile photoDialog: uncategorized, then the current meal.
  const clock = new Date(), hour = clock.getHours(), meal = hour >= 6 && hour < 11 ? 'Breakfast' : hour >= 11 && hour < 16 ? 'Lunch' : hour >= 16 && hour < 22 ? 'Dinner' : 'Snacks';
  let group = groups.includes('Uncategorized') ? 'Uncategorized' : groups.includes(meal) ? meal : groups[0], time = clock.toTimeString().slice(0, 5), diaryDate = typeof date === 'function' ? date() : date;
  show(`<section class="photo-log">${header('Photo Log')}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-gallery><input type="file" accept="image/*" capture="environment" data-photo-camera><div class="photo-log-body"></div></section>`);
  const shell = content.querySelector('.photo-log'), body = shell.querySelector('.photo-log-body');
  const alive = () => !disposed && shell.isConnected;
  function dispose() { if (disposed) return; disposed = true; serial++; abort?.abort(); pickerCleanup?.(); observer.disconnect(); originalImage = null; analysis = null; rows = []; }
  const observer = new MutationObserver(() => {if (!shell.isConnected) dispose();});observer.observe(content, {childList: true, subtree: true});
  function replace(html) {pickerCleanup?.();pickerCleanup = null;body.innerHTML = html;body.scrollTop = 0;}
  const picker = camera => {if (!pendingSave) shell.querySelector(camera ? '[data-photo-camera]' : '[data-photo-gallery]').click();};
  shell.querySelectorAll('input[type=file]').forEach(input => {input.onchange = async () => {const file = input.files?.[0];input.value = '';if (!file) return;
    const id = ++serial;abort?.abort();analysis = null;originalImage = null;rows = [];
    if (file.size > MAX_IMAGE_BYTES) return errorView('Choose a photo smaller than 8 MB.');
    try {const image = await fileData(file);if (!alive() || id !== serial) return;originalImage = image;analyze();} catch (error) {if (alive() && id === serial) errorView(error.message);}
  };});
  function start() {replace('<div class="photo-start"><button type="button" class="primary" data-camera>Take photo</button><button type="button" class="more-results" data-gallery>Choose photo</button></div>');body.querySelector('[data-camera]').onclick = () => picker(true);body.querySelector('[data-gallery]').onclick = () => picker(false);}
  function errorView(message) {replace(`<div class="photo-error"><p class="sheet-message" role="status">${e(message)}</p>${originalImage ? '<button class="primary" type="button" data-retry>Try again</button>' : ''}<button class="more-results" type="button" data-gallery>Choose photo</button></div>`);body.querySelector('[data-gallery]').onclick = () => picker(false);if (originalImage) body.querySelector('[data-retry]').onclick = analyze;}
  async function analyze() {
    abort?.abort();abort = new AbortController();const signal = abort.signal, id = ++serial;analysis = null;rows = [];
    replace(`<div class="photo-scan" role="status"><img src="${e(originalImage)}" alt="Selected meal"><span class="photo-scan-line" aria-hidden="true"></span><p>Matching foods…</p></div><div class="photo-log-actions"><button type="button" class="more-results" data-gallery>Choose photo</button><button type="button" class="primary" data-camera>Take new photo</button></div>`);
    body.querySelector('[data-gallery]').onclick = () => picker(false);body.querySelector('[data-camera]').onclick = () => picker(true);
    try {
      const result = await request('/api/photos/analyze', {image: originalImage}, signal);
      if (!alive() || id !== serial) return;
      analysis = result;
      rows = result.suggestions.filter(row => row.kind === 'observation').map(suggestion => {
        const candidate = suggestion.candidates.find(row => row.ref.id === suggestion.selection?.id && row.ref.kind === suggestion.selection?.kind);
        return makeRow(suggestion, candidate);
      });
      review();
    } catch (error) {if (alive() && id === serial && error.name !== 'AbortError') errorView(error.message);}
  }
  function makeRow(suggestion, candidate) {
    const estimate = suggestion.portionEstimate;
    return {name: candidate?.name ?? suggestion.description, foodId: candidate?.ref.id ?? null, ...(Number.isFinite(candidate?.grams) && candidate.grams > 0 && estimate ? {quantity: estimate.grams, unit: 'g'} : {amount: 1}), ...(suggestion.observationIndex !== undefined ? {observationIndex: suggestion.observationIndex} : {}), ...(suggestion.additionIndex !== undefined ? {additionIndex: suggestion.additionIndex} : {}), estimate, suggestion};
  }
  function review() {
    const additions = analysis.suggestions.filter(suggestion => suggestion.kind === 'possible-addition' && !rows.some(row => row.additionIndex === suggestion.additionIndex));
    replace(`<div class="photo-thumb"><img src="${e(analysis.photo.dataUrl)}" alt="Meal photo"><div><strong>My Photo</strong><small>${e(time)}</small></div><button type="button" data-gallery aria-label="Choose another photo">＋</button></div><p class="photo-row-heading">Matched foods</p>${rows.map((row, index) => `<div class="photo-food-row"><div class="photo-food-main"><strong>${e(row.name)}</strong><button type="button" data-quantity="${index}">${row.foodId ? e(quantityLabel(row)) : 'Choose a match'}</button>${row.estimate ? '<small class="photo-estimate">Estimated portion</small>' : ''}</div><button type="button" class="icon-button" data-replace="${index}" aria-label="Replace ${e(row.name)}">↻</button><button type="button" class="photo-remove" data-remove="${index}" aria-label="Remove ${e(row.name)}">×</button></div>`).join('')}<button type="button" class="more-results" data-add>Search for more</button>${additions.length ? `<details class="photo-preview-details"><summary>Did you also have…?</summary>${additions.map(row => `<button type="button" class="more-results" data-addition="${row.additionIndex}">＋ ${e(row.description)}</button>`).join('')}</details>` : ''}<label class="field-row"><span>Group</span><select name="group" aria-label="Group">${groups.map(value => `<option ${value === group ? 'selected' : ''}>${e(value)}</option>`).join('')}</select></label><label class="field-row"><span>Date</span><input name="date" aria-label="Date" type="date" value="${e(diaryDate)}"></label><label class="field-row"><span>Time</span><input name="time" aria-label="Time" type="time" value="${e(time)}"></label><p class="sheet-message" role="status"></p><footer class="photo-log-actions"><button type="button" class="primary" data-save ${!rows.length || rows.some(row => !row.foodId) ? 'disabled' : ''}>Add to diary</button></footer>`);
    body.querySelector('[data-gallery]').onclick = () => picker(false);
    body.querySelector('[name=group]').onchange = event => group = event.target.value;
    body.querySelector('[name=date]').onchange = event => diaryDate = event.target.value;
    body.querySelector('[name=time]').onchange = event => time = event.target.value;
    body.querySelectorAll('[data-quantity]').forEach(button => button.onclick = () => {const index = Number(button.dataset.quantity);rows[index].foodId ? editQuantity(index) : chooseFood(index);});
    body.querySelectorAll('[data-replace]').forEach(button => button.onclick = () => chooseFood(Number(button.dataset.replace)));
    body.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {rows.splice(Number(button.dataset.remove), 1);review();});
    body.querySelector('[data-add]').onclick = () => chooseFood();
    body.querySelectorAll('[data-addition]').forEach(button => button.onclick = () => {const suggestion = additions.find(row => row.additionIndex === Number(button.dataset.addition)), candidate = suggestion.candidates.find(row => row.ref.id === suggestion.selection?.id);rows.push(makeRow(suggestion, candidate));if (candidate) review();else chooseFood(rows.length - 1);});
    const saveButton = body.querySelector('[data-save]');saveButton.onclick = async () => {
      if (pendingSave) return;pendingSave = true;body.querySelectorAll('button,input,select').forEach(element => element.disabled = true);
      const panel = body.firstElementChild, status = body.querySelector('[role=status]');
      try {
        await save({photo: {id: analysis.photo.id, dataUrl: analysis.photo.dataUrl}, reviewToken: analysis.reviewToken, date: diaryDate, time, group, rows: rows.map(({foodId, observationIndex, additionIndex, amount, quantity, unit, portionId}) => ({foodId, ...(observationIndex !== undefined ? {observationIndex} : {}), ...(additionIndex !== undefined ? {additionIndex} : {}), ...(quantity !== undefined ? {quantity, unit, ...(portionId ? {portionId} : {})} : {amount})}))});
        await onChange();if (alive() && panel.isConnected) {dispose();close();}
      } catch (error) {if (alive() && status.isConnected) status.textContent = error.message;}
      finally {pendingSave = false;if (saveButton.isConnected) body.querySelectorAll('button,input,select').forEach(element => element.disabled = false);}
    };
  }
  function chooseFood(index) {
    replace('<div class="photo-food-picker"></div><button type="button" class="more-results" data-back>Back to photo</button>');
    body.querySelector('[data-back]').onclick = review;
    const pickerRoot = body.querySelector('.photo-food-picker');
    pickerCleanup = mountFoodPicker(pickerRoot, {allowMeals: false, onPick: async (kind, id) => {
      if (kind !== 'food') return;
      editQuantity(index, id);
    }});
    pickerRoot.querySelector('[data-source=recipe]')?.remove();
  }
  async function editQuantity(index, replacementId = null) {
    replace('<p class="empty">Loading…</p>');const loading = body.querySelector('.empty'), row = rows[index] ?? {}, replacing = replacementId !== null;
    try {
      const item = await request('/api/library/item?' + new URLSearchParams({kind: 'food', id: replacementId ?? row.foodId}));
      if (!alive() || !loading.isConnected) return;
      const preferred = replacing && row.estimate && item.options.some(([id]) => id === 'g') ? {quantity: row.estimate.grams, unit: 'g'} : replacing ? {amount: 1} : row;
      replace(`<form class="entry-form"><p class="photo-edit-name">${e(item.resource.name)}</p>${quantityFields(item.options, preferred)}${row.estimate ? `<p class="photo-preview-details">Photo estimate: ${num(row.estimate.grams)} g</p>` : ''}<footer class="entry-actions"><button type="button" data-back>Back</button><button class="primary">Done</button></footer></form>`);
      const form = body.querySelector('form');form.querySelector('[data-back]').onclick = review;
      form.onsubmit = event => {event.preventDefault();const {amount, quantity, unit, portionId, ...rest} = row;const next = {...rest, foodId: item.resource.id, name: item.resource.name, ...quantityValue(form), portionLabel: item.resource.portions?.find(p => p.id === form.elements.unit.value.slice(8))?.label};if (index === undefined) rows.push(next);else rows[index] = next;review();};
    } catch (error) {if (alive() && loading.isConnected) {loading.textContent = error.message;const back = document.createElement('button');back.type = 'button';back.textContent = 'Back';back.onclick = review;body.append(back);}}
  }
  start();return {dispose};
}
