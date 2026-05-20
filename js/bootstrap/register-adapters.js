(function () {
  const registry = window.MultiTraceRegistry;

  if (!registry) {
    throw new Error("MultiTraceRegistry no está disponible.");
  }

  if (window.MultiTraceRiseAdapter) {
    registry.register(window.MultiTraceRiseAdapter);
  }

  if (window.MultiTraceStorylineAdapter) {
    registry.register(window.MultiTraceStorylineAdapter);
  }

  // NUEVO: registrar adaptador de eXeLearning
  if (window.MultiTraceExeLearningAdapter) {
    registry.register(window.MultiTraceExeLearningAdapter);
  }
})();