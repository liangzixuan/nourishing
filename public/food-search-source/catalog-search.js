// Each visible catalog search owns its debounce, page history and request identity.
export class CatalogSearch {
  constructor({fetchPage, onChange, limit = 25, append = false}) {
    this.fetchPage = fetchPage;
    this.onChange = onChange;
    this.limit = limit;
    this.append = append;
    this.previousOffsets = [];
    this.state = {query: '', offset: 0, items: [], total: 0, nextOffset: null, status: 'idle', error: ''};
    this.result = null;
    this.generation = 0;
    this.timer = null;
    this.controller = null;
  }

  setQuery(query, delay = 250) {
    this.cancel();
    this.previousOffsets = [];
    this.state = {...this.state, query, offset: 0, items: [], nextOffset: null, status: 'loading', error: ''};
    this.onChange(this.state);
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.load(0, generation);
    }, delay);
  }

  async load(offset, expectedGeneration = this.generation, append = false) {
    if (expectedGeneration !== this.generation) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    const retained = append ? this.state.items : [];
    this.state = {...this.state, offset, items: retained, status: append ? 'loading-more' : 'loading', error: ''};
    this.onChange(this.state);
    try {
      const result = await this.fetchPage(this.state.query, {offset, limit: this.limit}, controller.signal);
      if (generation !== this.generation) return;
      this.result = result;
      this.state = {...this.state, items: [...retained, ...result.items], offset: result.offset, total: result.total, nextOffset: result.nextOffset, status: 'ready'};
    } catch (error) {
      if (generation !== this.generation || error.name === 'AbortError') return;
      this.state = {...this.state, items: retained, nextOffset: append ? offset : null, status: append ? 'more-error' : 'error', error: error.message || String(error)};
    } finally {
      if (generation === this.generation) {
        this.controller = null;
        this.onChange(this.state);
      }
    }
  }

  next() {
    if (this.state.status !== 'ready' || this.state.nextOffset == null) return;
    if (!this.append) this.previousOffsets.push(this.state.offset);
    return this.load(this.state.nextOffset, this.generation, this.append);
  }

  previous() {
    if (this.state.status !== 'ready' || !this.previousOffsets.length) return;
    return this.load(this.previousOffsets.pop());
  }

  retry() { return this.load(this.state.offset, this.generation, this.state.status === 'more-error'); }

  // Transient navigation retains completed pages, never a pending request.
  snapshot() {
    const state = structuredClone(this.state);
    if (state.status === 'loading-more' || state.status === 'more-error') {
      state.status = 'ready';
      state.error = '';
    }
    return {state, result: structuredClone(this.result), previousOffsets: [...this.previousOffsets]};
  }

  restore(snapshot) {
    this.cancel();
    if (snapshot.state.status !== 'ready') {
      this.setQuery(snapshot.state.query, 0);
      return;
    }
    this.state = structuredClone(snapshot.state);
    this.result = structuredClone(snapshot.result);
    this.previousOffsets = [...snapshot.previousOffsets];
    this.onChange(this.state);
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.generation++;
  }
}
