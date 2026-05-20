(function () {
  const adapters = [];

  function register(adapter) {
    if (!adapter || !adapter.id) {
      throw new Error("No se puede registrar un adaptador sin id.");
    }

    const duplicated = adapters.some(item => item.id === adapter.id);
    if (duplicated) {
      throw new Error(`Ya existe un adaptador registrado con id ${adapter.id}.`);
    }

    adapters.push(adapter);
  }

  async function resolve(zip, context) {
    for (const adapter of adapters) {
      const match = await adapter.matches(zip, context);
      if (match) return adapter;
    }
    return null;
  }

  function list() {
    return adapters.slice();
  }

  window.MultiTraceRegistry = {
    register,
    resolve,
    list
  };
})();
