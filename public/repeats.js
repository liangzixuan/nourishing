import {request, command} from './diary-api.js';
import {escape as e} from './html.js';
import {mountFoodPicker} from './food-picker.js';
import {quantityFields, quantityValue} from './quantity.js';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = value => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits: 2}) : '—';
const quantity = row => `${num(row.quantity ?? row.amount ?? 1)} ${row.unit === 'portion' ? row.portionLabel ?? 'portions' : row.unit ?? 'servings'}`;
const reviewQuantity = row => `${num(row.value)} ${row.label ?? row.unit ?? (row.kind === 'batch' ? 'batch' : 'servings')}`;

export function mountRepeats({page, show, close, header, content, date, onChange = async () => {}}) {
  let data, disposed = false, serial = 0, pickerCleanup;
  const root = document.createElement('section');
  root.className = 'repeat-page';
  page.replaceChildren(root);
  const alive = () => !disposed && root.isConnected;
  function open(html) { pickerCleanup?.(); pickerCleanup = null; show(html); }
  async function reload() {
    const id = ++serial;
    root.innerHTML = '<p class="empty">Loading…</p>';
    try {
      const result = await request('/api/repeats?' + new URLSearchParams({date: date()}));
      if (!alive() || id !== serial) return;
      data = result;
      render();
    } catch (error) {
      if (alive() && id === serial) {
        root.innerHTML = `<p class="sheet-message" role="status">${e(error.message)}</p><button type="button" class="more-results">Try again</button>`;
        root.querySelector('button').onclick = reload;
      }
    }
  }
  function render() {
    root.innerHTML = `<div class="repeat-heading"><h1>Repeat Items</h1><button type="button" data-new>＋ New</button></div><p class="repeat-date">${e(data.date)}</p><p class="sheet-message repeat-status" role="status"></p>${data.items.length ? data.items.map(item => `<div class="repeat-card"><button type="button" data-edit="${e(item.id)}"><strong>${e(item.name)}</strong><small>${e(quantity(item))} · ${e(item.group)} · ${e(item.time ?? '')}</small><small>${item.days.map(day => days[day]).join(' · ')}</small></button><label class="repeat-toggle"><input type="checkbox" data-enabled="${e(item.id)}" aria-label="Enable ${e(item.name)}" ${item.enabled !== false ? 'checked' : ''}></label></div>`).join('') : '<p class="empty">No repeat items yet.</p>'}<div class="repeat-actions"><button type="button" class="primary" data-review ${!data.preview.items.length || data.completed ? 'disabled' : ''}>${data.completed ? 'Day completed' : `Review ${data.preview.items.length} due`}</button></div>${data.preview.alreadyLogged ? `<p class="repeat-date">${data.preview.alreadyLogged} already logged</p>` : ''}`;
    root.querySelector('[data-new]').onclick = () => chooseItem();
    root.querySelector('[data-review]').onclick = review;
    root.querySelectorAll('[data-edit]').forEach(button => { button.onclick = () => editItem(data.items.find(item => item.id === button.dataset.edit)); });
    root.querySelectorAll('[data-enabled]').forEach(input => { input.onchange = async () => {
      const previous = !input.checked;
      input.disabled = true;
      try { await command(data.revision, 'repeat.setEnabled', {id: input.dataset.enabled, enabled: input.checked}); await reload(); }
      catch (error) { if (alive()) { input.checked = previous; root.querySelector('[role=status]').textContent = error.message; } }
      finally { input.disabled = false; }
    }; });
  }
  function chooseItem(existing, draft) {
    open(`${header('Repeat Item')}<div class="repeat-picker"></div>${existing || draft ? '<button type="button" class="more-results" data-back>Back</button>' : ''}`);
    if (existing || draft) content.querySelector('[data-back]').onclick = () => editItem(existing, draft);
    pickerCleanup = mountFoodPicker(content.querySelector('.repeat-picker'), {onPick: (kind, id) => editItem(existing, {...draft, foodId: undefined, recipeId: undefined, mealId: undefined, [kind + 'Id']: id, amount: 1, quantity: undefined, unit: undefined, portionId: undefined})});
  }
  async function editItem(existing, draft) {
    const value = draft ?? existing;
    if (!value) return chooseItem();
    const kind = value.recipeId ? 'recipe' : value.mealId ? 'meal' : 'food', id = value[kind + 'Id'];
    open(`${header('Repeat Item')}<p class="empty">Loading…</p>`);
    const loading = content.querySelector('.empty');
    try {
      const item = await request('/api/library/item?' + new URLSearchParams({kind, id}));
      if (disposed || !loading.isConnected) return;
      editor(existing, value, item);
    } catch (error) { if (!disposed && loading.isConnected) loading.textContent = error.message; }
  }
  function editor(existing, draft, item) {
    const value = {startDate: data.date, days: [0, 1, 2, 3, 4, 5, 6], time: new Date().toTimeString().slice(0, 5), group: data.groups.includes('Uncategorized') ? 'Uncategorized' : data.groups[0], enabled: true, ...draft};
    open(`${header('Repeat Item')}<form class="entry-form"><button type="button" class="more-results" data-change>${e(item.resource.name)} ↻</button>${quantityFields(item.options, value)}<label class="field-row"><span>Group</span><select name="group" aria-label="Group">${data.groups.map(group => `<option ${group === value.group ? 'selected' : ''}>${e(group)}</option>`).join('')}</select></label><label class="field-row"><span>Time</span><input type="time" name="time" aria-label="Time" value="${e(value.time ?? '')}"></label><fieldset class="repeat-weekdays"><legend>Repeat on</legend><div>${days.map((day, i) => `<label><input type="checkbox" name="day" value="${i}" ${value.days.includes(i) ? 'checked' : ''}>${day}</label>`).join('')}</div></fieldset><label class="field-row"><span>Starts</span><input type="date" name="startDate" aria-label="Starts" value="${e(value.startDate)}" required></label><label class="field-row"><span>Ends</span><input type="date" name="endDate" aria-label="Ends" value="${e(value.endDate ?? '')}"></label><p class="sheet-message" role="status"></p><footer class="entry-actions">${existing ? '<button type="button" class="danger" data-delete>Delete</button>' : ''}<button type="submit" class="primary">Save</button></footer></form>`);
    const form = content.querySelector('form'), revision = data.revision;
    const read = () => ({...(existing ? {id: existing.id} : {}), [item.kind + 'Id']: item.resource.id, ...quantityValue(form), group: form.elements.group.value, time: form.elements.time.value, days: [...form.querySelectorAll('[name=day]:checked')].map(input => Number(input.value)), startDate: form.elements.startDate.value, endDate: form.elements.endDate.value || null, enabled: value.enabled !== false});
    form.querySelector('[data-change]').onclick = () => chooseItem(existing, read());
    form.onsubmit = event => { event.preventDefault(); save(form, revision, 'repeat.save', read()); };
    if (existing) form.querySelector('[data-delete]').onclick = () => {
      const draft = read();
      open(`${header('Delete Repeat Item')}<div class="repeat-delete"><p class="repeat-date">${e(item.resource.name)}</p><p class="sheet-message" role="status"></p><div class="entry-actions"><button type="button" data-back>Cancel</button><button type="button" class="danger" data-confirm>Delete</button></div></div>`);
      const panel = content.querySelector('.repeat-delete');
      content.querySelector('[data-back]').onclick = () => editor(existing, draft, item);
      content.querySelector('[data-confirm]').onclick = () => save(panel, revision, 'repeat.delete', {id: existing.id});
    };
  }
  function review() {
    const preview = data.preview, revision = data.revision;
    open(`${header('Review Repeat Items')}<form class="entry-form"><p class="repeat-date">${e(preview.date)}</p>${preview.items.map(row => `<label class="repeat-review"><input type="checkbox" name="repeat" value="${e(row.id)}" checked><span><strong>${e(row.name)}</strong><small>${e(reviewQuantity(row.quantity))} · ${e(row.group)} · ${e(row.time ?? '')}</small><small>${num(row.nutrients.calories)} kcal</small></span></label>`).join('')}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Add to diary</button></footer></form>`);
    const form = content.querySelector('form');
    form.onsubmit = event => {
      event.preventDefault();
      const ids = new Set([...form.querySelectorAll('[name=repeat]:checked')].map(input => input.value));
      save(form, revision, 'repeat.apply', {date: preview.date, items: preview.items.filter(row => ids.has(row.id)).map(({id, fingerprint}) => ({id, fingerprint}))});
    };
  }
  async function save(panel, revision, type, payload) {
    panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
    const status = panel.querySelector('[role=status]');
    status.textContent = '';
    try { await command(revision, type, payload); await onChange(); if (panel.isConnected) close(); if (alive()) await reload(); }
    catch (error) { if (panel.isConnected) { status.textContent = error.message; if (error.status === 409) { const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Reload repeats'; button.onclick = () => { close(); reload(); }; status.append(button); } } }
    finally { panel.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  }
  reload();
  return {reload, dispose() { disposed = true; serial++; pickerCleanup?.(); data = null; }};
}
