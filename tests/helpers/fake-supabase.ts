// 记录型 fake Supabase 客户端：用于断言服务层发出的表查询、过滤条件与
// 写入目标，不依赖真实数据库。
export interface FakeFilter {
  column: string;
  operator: string;
  value: unknown;
}

export interface FakeCall {
  kind: 'from' | 'rpc';
  target: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  columns: string | null;
  filters: FakeFilter[];
  payload: unknown;
  single: boolean;
  maybeSingle: boolean;
  orders: Array<{ column: string; ascending: boolean }>;
  limit: number | null;
}

interface QueuedResponse {
  data: unknown;
  error: { code: string; message: string } | null;
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(
    private readonly store: FakeStore,
    private readonly call: FakeCall,
  ) {}

  select(columns: string) {
    this.call.operation = this.call.operation === 'select' ? 'select' : this.call.operation;
    this.call.columns = columns;
    return this;
  }

  insert(payload: unknown) {
    this.call.operation = 'insert';
    this.call.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.call.operation = 'update';
    this.call.payload = payload;
    return this;
  }

  delete() {
    this.call.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.filters.push({ column, operator: 'eq', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.call.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.call.filters.push({ column, operator: `not.${operator}`, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.call.filters.push({ column, operator: 'is', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.call.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.call.limit = count;
    return this;
  }

  single() {
    this.call.single = true;
    return this;
  }

  maybeSingle() {
    this.call.maybeSingle = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.store.calls.push(this.call);
    const response = this.store.queue.shift() ?? { data: null, error: null };
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

class FakeStore {
  calls: FakeCall[] = [];
  queue: QueuedResponse[] = [];

  pushResponse(data: unknown, error: { code: string; message: string } | null = null) {
    this.queue.push({ data, error });
  }
}

export function createFakeSupabase() {
  const store = new FakeStore();
  const client = {
    from(table: string) {
      const call: FakeCall = {
        kind: 'from',
        target: table,
        operation: 'select',
        columns: null,
        filters: [],
        payload: null,
        single: false,
        maybeSingle: false,
        orders: [],
        limit: null,
      };
      return new FakeQueryBuilder(store, call);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      store.calls.push({
        kind: 'rpc',
        target: fn,
        operation: 'select',
        columns: null,
        filters: [],
        payload: args ?? null,
        single: false,
        maybeSingle: false,
        orders: [],
        limit: null,
      });
      const response = store.queue.shift() ?? { data: null, error: null };
      return Promise.resolve(response);
    },
  };
  return { client, calls: store.calls, pushResponse: store.pushResponse.bind(store) };
}

export function tableCalls(calls: FakeCall[], table: string) {
  return calls.filter((call) => call.kind === 'from' && call.target === table);
}

export function rpcCalls(calls: FakeCall[], fn: string) {
  return calls.filter((call) => call.kind === 'rpc' && call.target === fn);
}
