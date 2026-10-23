const DESTINOS = [
  { n: 'Cusco', d: 'Valle Sagrado y Machu Picchu', c: '#0A2540' },
  { n: 'Tarapoto', d: 'Cataratas y selva alta', c: '#1456D6' },
  { n: 'Arequipa', d: 'Cañón del Colca y centro histórico', c: '#0E6BA8' },
  { n: 'Paracas', d: 'Costa, islas y desierto', c: '#274690' },
];
const VENTAJAS = [
  ['Salidas confirmadas', 'Solo mostramos salidas activas y con fecha futura, sin sorpresas.'],
  ['Cupos al día', 'Ves cuántos lugares quedan antes de elegir tu fecha.'],
  ['Reserva en línea', 'Paga desde la web y recibe tu comprobante digital.'],
];

function Montanas() {
  return (
    <svg className="hero-art" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle cx="1130" cy="190" r="70" fill="#FFB547" />
      <path d="M0 400 L180 270 L320 360 L520 200 L720 380 L900 250 L1100 390 L1280 280 L1440 360 V560 H0Z" fill="#17407C" />
      <path d="M0 470 L200 350 L380 450 L600 300 L820 460 L1020 340 L1240 470 L1440 400 V560 H0Z" fill="#103766" />
      <path d="M0 530 L260 440 L520 520 L800 430 L1100 525 L1440 450 V560 H0Z" fill="#fff" />
      <path d="M120 150 C 420 40, 720 60, 980 130" stroke="#fff" strokeOpacity=".7" strokeWidth="2" strokeDasharray="4 10" fill="none" />
      <path d="M0 0 L26 11 L0 22 L6 11Z" fill="#fff" transform="translate(980 119) rotate(14)" />
    </svg>
  );
}

export default function Inicio() {
  function buscar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const p = new URLSearchParams();
    ['lugar', 'fecha_desde', 'fecha_hasta'].forEach((k) => {
      const v = String(f.get(k) || '').trim();
      if (v) p.set(k, v);
    });
    window.location.hash = '#/paquetes' + (p.toString() ? '?' + p : '');
  }

  return (
    <>
      <section className="portada">
        <Montanas />
        <div className="wrap hero-txt">
          <h1>Tu próximo destino está en el Perú</h1>
          <p>Paquetes turísticos con salida confirmada. Elige, reserva y viaja.</p>
        </div>
      </section>

      <div className="wrap">
        <form className="buscador" onSubmit={buscar} role="search">
          <label className="fld lg">¿A dónde quieres ir?<input name="lugar" type="text" placeholder="Ej. Tarapoto" /></label>
          <label className="fld">Desde<input name="fecha_desde" type="date" /></label>
          <label className="fld">Hasta<input name="fecha_hasta" type="date" /></label>
          <button className="btn" type="submit">Buscar paquetes</button>
        </form>

        <section className="sec">
          <h2 className="h2">Destinos para empezar</h2>
          <div className="destinos">
            {DESTINOS.map((x) => (
              <a key={x.n} className="destino" style={{ background: x.c }} href={`#/paquetes?lugar=${encodeURIComponent(x.n)}`}>
                <strong>{x.n}</strong>
                <span>{x.d}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="sec">
          <h2 className="h2">Viaja tranquilo con ViajaPeru</h2>
          <div className="ventajas">
            {VENTAJAS.map(([t, d]) => (
              <div key={t}><h3>{t}</h3><p className="muted">{d}</p></div>
            ))}
          </div>
        </section>

        <section className="cta">
          <h2>¿Listo para elegir tu salida?</h2>
          <a className="btn claro" href="#/paquetes">Ver todos los paquetes</a>
        </section>
      </div>
    </>
  );
}