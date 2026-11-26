import { Component } from 'react';

// Si una pantalla falla al dibujarse (por un error nuestro o porque una extensión del navegador,
// como QuillBot o Grammarly, modificó los campos del formulario), se muestra este aviso en lugar
// de dejar la página en blanco. El encabezado y el pie de página siguen visibles.
//
// En App.jsx se usa con key={hash}: al ir a otra pantalla se vuelve a intentar desde cero.
export default class AtrapaErrores extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Una pantalla falló al dibujarse:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main>
        <div className="error" role="alert">
          <strong>Algo interfirió con esta página</strong>
          <p className="muted">
            Puede ser una extensión del navegador que modifica los formularios (por ejemplo QuillBot o
            Grammarly). Recarga la página; si vuelve a pasar, desactiva esa extensión para este sitio o
            ábrelo en una ventana de incógnito.
          </p>
          <p>
            <button className="btn" type="button" onClick={() => window.location.reload()}>
              Recargar la página
            </button>
          </p>
        </div>
      </main>
    );
  }
}
