import { useId, useRef, useState } from 'react';
import { pedir } from '../../servicios/api.js';

// HU-009 · Foto del paquete: se elige del dispositivo (o se toma con la cámara del celular),
// se reduce en el navegador y se sube al Backend, que la guarda en Supabase Storage.
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_ORIGINAL = 15 * 1024 * 1024; // lo que acepta el selector antes de reducir
const MAX_SUBIDA = 5 * 1024 * 1024;    // límite del Backend y del bucket
const LADO_MAX = 1600;                 // px: suficiente para la portada del detalle

// Reduce la imagen a LADO_MAX px como máximo y la convierte a JPEG (las fotos del celular pesan mucho).
async function reducir(archivo) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close?.();
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No pudimos procesar la imagen.'))), 'image/jpeg', 0.85));
}

export default function SubirFoto({ url, error, onChange }) {
  const id = useId();
  const entrada = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');

  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;

    setAviso('');
    if (!TIPOS.includes(archivo.type)) return setAviso('Elige una imagen JPG, PNG o WebP.');
    if (archivo.size > MAX_ORIGINAL) return setAviso('La imagen es demasiado grande (máximo 15 MB).');

    setSubiendo(true);
    try {
      let cuerpo = archivo;
      try { cuerpo = await reducir(archivo); } catch { /* si el navegador no puede reducirla, se sube tal cual */ }
      if (cuerpo.size > MAX_SUBIDA) throw new Error('La imagen pesa más de 5 MB. Prueba con una más pequeña.');

      const r = await pedir('/admin/imagenes', {
        method: 'POST',
        body: cuerpo,
        headers: { 'Content-Type': cuerpo.type || archivo.type },
      });
      onChange(r.url);
    } catch (err) {
      setAviso(err.message || 'No pudimos subir la imagen.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="ad-campo">
      <label htmlFor={id}>Foto del paquete</label>

      <div className="ad-foto">
        {url
          ? <img className="ad-vista" src={url} alt="Foto del paquete" />
          : <div className="ad-vista ad-vista--vacia">Sin foto</div>}

        <div className="ad-foto__acciones">
          <input ref={entrada} id={id} type="file" accept={TIPOS.join(',')} hidden onChange={elegir} />
          <button type="button" className="btn sec sm" disabled={subiendo} onClick={() => entrada.current?.click()}>
            {subiendo ? 'Subiendo…' : url ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {url && !subiendo && (
            <button type="button" className="btn sec sm ad-peligro" onClick={() => onChange('')}>Quitar foto</button>
          )}
          <small className="muted">JPG, PNG o WebP. Se guarda al pulsar "Guardar cambios".</small>
        </div>
      </div>

      {(aviso || error) && <span className="vp-error" role="alert">{aviso || error}</span>}
    </div>
  );
}
