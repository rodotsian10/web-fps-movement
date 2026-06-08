// Helper for hot-reload event listener cleanup and duplicate loop prevention
if (window.gameListeners) {
  window.gameListeners.forEach(l => {
    l.target.removeEventListener(l.type, l.listener);
  });
}
window.gameListeners = [];

if (window.gameLoopId) {
  cancelAnimationFrame(window.gameLoopId);
  window.gameLoopId = null;
}

export function addGameListener(target, type, listener) {
  if (target) {
    target.addEventListener(type, listener);
    window.gameListeners.push({ target, type, listener });
  }
}
