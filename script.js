const items = Array.from({ length: 50 }, (_, i) => ({
  id: `item_${i + 1}`,
  nombre: `${i + 1}`, // debe coincidir con "equipo" en tu hoja
  documento: "",
  profesor: "",
  materia: "",
  nombreCompleto: "",
  curso: ""
}));

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPkJVdzy3dmbyfT8jUbaBbETPQc4aDoUGJUVqcsCRYUR8iU48rVCpU2_Va_mz1wtKIJA/exec';

const api = {
  async cargarEquipos() {
    try {
      const data = await fetch(`${SCRIPT_URL}?action=getBaseB`)
        .then(r => r.json());

      console.log("📥 Datos recibidos de la API:", data);

      items.forEach(item => {
        item.documento = "";
        item.profesor = "";
        item.materia = "";
        item.nombreCompleto = "";
        item.curso = "";
      });

      const estados = {};
      data?.forEach(fila => {
        if (!Array.isArray(fila) || fila.length < 8) {
          console.warn("⚠️ Fila inválida:", fila);
          return;
        }
        const [timestamp, equipo, nombreCompleto, documento, curso, profesor, materia, tipo] = fila;
        const tsDate = new Date(timestamp);
        if (!estados[equipo] || tsDate > new Date(estados[equipo].timestamp)) {
          estados[equipo] = { timestamp, nombreCompleto, documento, curso, profesor, materia, tipo };
        }
      });

      console.log("📊 Últimos estados por equipo:", estados);

      Object.entries(estados).forEach(([numero, estado]) => {
        const item = items.find(i => i.nombre === numero);
        if (!item) {
          console.warn(`⚠️ No se encontró item con nombre="${numero}" (estado:`, estado, ")");
          return;
        }
        if (estado.tipo === "Préstamo") {
          console.log(`Asignando préstamo a item ${numero}:`, estado);
          Object.assign(item, estado);
        }
      });

      actualizarVista();
    } catch (error) {
      console.error("Error al cargar equipos:", error);
    }
  },

  async buscarEstudiante(documento) {
    try {
      const res = await fetch(`${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento)}`);
      const data = await res.json();
      console.log("Respuesta buscarEstudiante:", data);
      if (data.encontrado) {
        return {
          nombreCompleto: data.nombreCompleto || 'Sin nombre',
          documento: data.documento || documento,
          curso: data.curso || 'Sin curso',
          encontrado: true
        };
      }
      return { encontrado: false, error: data.error || 'No encontrado' };
    } catch (error) {
      console.error("Error en buscarEstudiante:", error);
      return { encontrado: false, error: `Error conexión: ${error.message}` };
    }
  },

  async guardar(item, tipo, datosEstudiante = null, comentario = '') {
    const datos = {
      action: 'saveToBaseB',
      marcaTemporal: new Date().toISOString(),
      equipo: item.nombre,
      nombreCompleto: datosEstudiante?.nombreCompleto || item.nombreCompleto || '',
      documento: datosEstudiante?.documento || item.documento,
      curso: datosEstudiante?.curso || item.curso || '',
      profesorEncargado: item.profesor,
      materia: item.materia,
      tipo,
      comentario
    };
    console.log("➡️ Guardando en API:", datos);
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
    } catch (error) {
      console.error(`Error al guardar ${tipo}:`, error);
    }
  }
};

function mostrarModalItem(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const esDevolucion = item.documento.trim() !== "";
  console.log(`Mostrar modal para "${item.nombre}" - devolución:`, esDevolucion);

  const modal = document.getElementById('modalMetodos');
  const container = document.getElementById('listaMetodos');
  if (!modal || !container) return;

  document.querySelector('.modal-header h2').textContent = `${esDevolucion ? 'Devolver' : 'Prestar'} Equipo ${item.nombre}`;
  document.querySelector('.modal-body p').textContent = esDevolucion
    ? 'Información del Préstamo Activo:'
    : 'Complete la información del Préstamo:';

  if (esDevolucion) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:15px;">
        <div class="readonly-info">
          <p><strong>Estudiante:</strong> ${item.nombreCompleto}</p>
          <p><strong>Documento:</strong> ${item.documento}</p>
          <p><strong>Curso:</strong> ${item.curso}</p>
          <p><strong>Profesor(a):</strong> ${item.profesor}</p>
          <p><strong>Materia:</strong> ${item.materia}</p>
        </div>
        <div>
          <label for="comentario">Comentario de Devolución (opcional):</label>
          <textarea id="comentario" rows="4" placeholder="Observaciones..."></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button id="btnGuardar" style="background:#dc3545;color:#fff;">Registrar Devolución</button>
          <button id="btnCancelar" style="background:#6c757d;color:#fff;">Cancelar</button>
        </div>
      </div>`;
    document.getElementById('btnGuardar').onclick = async () => {
      const comentario = document.getElementById('comentario').value.trim();
      if (confirm(`¿Confirmar devolución del equipo ${item.nombre}?`)) {
        await api.guardar(item, 'Devuelto', null, comentario);
        Object.assign(item, { documento: "", profesor: "", materia: "", nombreCompleto: "", curso: "" });
        cerrarModal(); actualizarVista();
      }
    };
  } else {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:15px;">
        ${crearInput('documento','Documento del Estudiante','text','Documento...')}
        ${crearInput('profesor','Profesor(a) Encargado','text','Profesor(a)...',false,item.profesor)}
        ${crearInput('materia','Materia','text','Materia...',false,item.materia)}
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button id="btnGuardar" style="background:#007bff;color:#fff;">Registrar Préstamo</button>
          <button id="btnCancelar" style="background:#6c757d;color:#fff;">Cancelar</button>
        </div>
      </div>`;

    let datosEstudiante = {};
    let timer;
    document.getElementById('documento').oninput = e => {
      const doc = e.target.value.trim();
      const info = document.getElementById('buscarInfo');
      clearTimeout(timer);
      datosEstudiante = {};
      if (doc.length >= 3) {
        info.textContent = 'Validando...';
        info.style.color = '#ffc107';
        timer = setTimeout(async () => {
          const result = await api.buscarEstudiante(doc);
          if (result.encontrado) {
            datosEstudiante = result;
            info.textContent = `✓ ${result.nombreCompleto} – Curso: ${result.curso}`;
            info.style.color = '#28a745';
          } else {
            info.textContent = `⚠ ${result.error}`;
            info.style.color = '#dc3545';
          }
        }, 800);
      } else {
        info.textContent = 'Ingrese el Documento para buscar automáticamente';
        info.style.color = '#6c757d';
      }
    };

    document.getElementById('btnGuardar').onclick = async () => {
      const doc = document.getElementById('documento').value.trim();
      const prof = document.getElementById('profesor').value.trim();
      const mat = document.getElementById('materia').value.trim();
      if (!doc || !prof || !mat) return alert('Complete todos los campos.');
      if (!datosEstudiante.encontrado) {
        if (!confirm('No se encontró el estudiante. ¿Continuar manualmente?')) return;
        datosEstudiante = { documento: doc, nombreCompleto: 'Registro Manual', curso: 'Por verificar', encontrado: true };
      }
      Object.assign(item, {
        documento: doc, profesor: prof, materia: mat,
        nombreCompleto: datosEstudiante.nombreCompleto,
        curso: datosEstudiante.curso
      });
      await api.guardar(item, 'Préstamo', datosEstudiante);
      cerrarModal(); actualizarVista();
    };
  }

  document.getElementById('btnCancelar').onclick = cerrarModal;
  modal.style.display = 'block';
}

const actualizarVista = () => {
  const malla = document.getElementById("malla");
  malla.innerHTML = items.map(item => {
    const ocupado = Boolean(item.documento);
    return `
      <div class="ramo" onclick="mostrarModalItem('${item.id}')"
           style="background:${ocupado ? '#d4edda' : '#f8f9fa'};
                  border:1px solid ${ocupado ? '#28a745' : '#ccc'};
                  cursor:pointer;">
        <div style="font-weight:bold">${item.nombre}</div>
        <div style="color:${ocupado ? 'green' : '#6c757d'}">
          ${ocupado ? '✓' : '○'}
        </div>
        ${ocupado ? `<div style="font-size:0.8em;color:#666;margin-top:5px;">
                      ${item.nombreCompleto}
                    </div>` : ''}
      </div>`;
  }).join('');
};

function resetearMalla() {
  if (confirm("⚠️ Esto devolverá TODOS los equipos. ¿Continuar?")) {
    const comentario = prompt("Comentario (opcional):", "Devolución masiva - Fin de jornada") || '';
    items.forEach(async item => {
      if (item.documento) {
        await api.guardar(item, 'Devuelto', null, comentario);
        Object.assign(item, { documento: "", profesor: "", materia: "", nombreCompleto: "", curso: "" });
      }
    });
    setTimeout(actualizarVista, 1200);
  }
}

function cerrarModal() {
  const modal = document.getElementById('modalMetodos');
  if (modal) modal.style.display = 'none';
}

window.mostrarModalItem = mostrarModalItem;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', () => {
  api.cargarEquipos();
  setInterval(api.cargarEquipos, 2000);
});
