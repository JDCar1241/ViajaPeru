// Pide a las extensiones de corrección de texto (Grammarly, LanguageTool y similares) que no se
// metan en los campos de la app. Algunas modifican el formulario mientras React lo dibuja y dejan
// la página en blanco. No todas respetan estos atributos (QuillBot no los documenta): por eso
// además existe componentes/AtrapaErrores.jsx, que muestra un aviso si la pantalla falla.
//
// React no maneja estos atributos, así que agregarlos desde aquí no interfiere con él.

const ATRIBUTOS = {
  'data-gramm': 'false',            // Grammarly
  'data-gramm_editor': 'false',     // Grammarly
  'data-enable-grammarly': 'false', // Grammarly
  'data-lt-active': 'false',        // LanguageTool
};

const CAMPOS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

function marcar(el) {
  for (const [nombre, valor] of Object.entries(ATRIBUTOS)) {
    if (el.getAttribute(nombre) !== valor) el.setAttribute(nombre, valor);
  }
}

function marcarDentro(nodo) {
  if (nodo.nodeType !== 1) return;
  if (nodo.matches(CAMPOS)) marcar(nodo);
  nodo.querySelectorAll(CAMPOS).forEach(marcar);
}

export function sinCorrectores(raiz = document.body) {
  marcar(raiz); // algunas extensiones revisan también los contenedores
  marcarDentro(raiz);

  // Campos que aparecen después (otra pantalla, un acompañante nuevo, etc.)
  new MutationObserver((cambios) => {
    for (const c of cambios) c.addedNodes.forEach(marcarDentro);
  }).observe(raiz, { childList: true, subtree: true });
}
