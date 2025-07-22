const items = Array.from({ length: 50 }, (_, i) => ({
  id: `item_${i + 1}`,
  nombre: `${i + 1}`,
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
      const data = await fetch(`${SCRIPT_URL}?action=getBaseB`).then(r => r.json());

      items.forEach(item => {
        item.documento = "";
        item.profesor = "";
        item.materia = "";
        item.nombreCompleto = "";
        item.curso = "";
      });

      const estados = {};
      data?.forEach(fila => {
        if (Array.isArray(fila) && fila.length >= 8) {
          const [timestamp, equipo, nombreCompleto, documento, curso, profesor, materia, tipo] = fila;
          const tsDate = new Date(timestamp);
          if (!estados[equipo] || tsDate > new Date(estados[equipo].timestamp)) {
            estados[equipo] = { timestamp, nombreCompleto, documento, curso, profesor, materia, tipo };
          }
        }
      });

      Object.entries(estados).forEach(([numero, estado]) => {
        if (estado.tipo === "Préstamo") {
          const item = items.find(i => i.nombre === numero);
          if (item) {
            Object.assign(item, estado);
          }
        }
      });

      actualizarVista();
    } catch (error) {
      console.error("Error al cargar:", error);
    }
  },

  async buscarEstudiante(documento) {
    try {
      const response = await fetch(`${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento)}`);
      const data = await response.json();

      if (data && data.encontrado === true) {
        return {
          nombreCompleto: data.nombreCompleto || 'Sin nombre',
          documento: data.documento || documento,
          curso: data.curso || 'Sin curso',
          encontrado: true
        };
      }

      return {
        encontrado: false,
        error: data.error || 'Estudiante no encontrado'
      };

    } catch (error) {
      return {
        encontrado: false,
        error: `Error de conexión: ${error.message}`
      };
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

const crearInput = (id, label, type = 'text', placeholder = '', readonly = false, value = '') =>
  `<div><label for="${id}">${label}:</label>
     <${type === 'textarea' ? 'textarea' : 'input'} ${type === 'textarea' ? 'rows="3"' : `type="${type}"`} 
     id="${id}" placeholder="${placeholder}" ${readonly ? 'readonly' : ''} value="${value}">${type === 'textarea' ? value : ''}</${type === 'textarea' ? 'textarea' : 'input'}>
     ${id === 'documento' ? '<small id="buscarInfo" style="color: #6c757d;">Ingrese el Documento para buscar automáticamente</small>' : ''}
   </div>`;

function mostrarModalItem(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const modal = document.getElementById('modalMetodos');
  const container = document.getElementById('listaMetodos');
  const header = document.querySelector('.modal-header h2');
  const mensaje = document.querySelector('.modal-body p');

  if (!modal || !container || !header || !mensaje) {
    console.error("❌ No se encontró el modal o sus componentes internos.");
    return;
  }

  const esDevolucion = item.documento && item.documento.trim() !== "";

  header.textContent = `${esDevolucion ? 'Devolver' : 'Prestar'} Equipo ${item.nombre}`;
  mensaje.textContent = esDevolucion
    ? 'Información del Préstamo Activo:'
    : 'Complete la información del Préstamo:';

  if (esDevolucion) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <div class="readonly-info">
          <p><strong>Estudiante:</strong> ${item.nombreCompleto || 'Sin información'}</p>
          <p><strong>Documento:</strong> ${item.documento}</p>
          <p><strong>Curso:</strong> ${item.curso || 'Sin información'}</p>
          <p><strong>Profesor(a):</strong> ${item.profesor || 'Sin profesor'}</p>
          <p><strong>Materia:</strong> ${item.materia || 'Sin materia'}</p>
        </div>
        <div><label for="comentario">Comentario de Devolución (opcional):</label>
        <textarea id="comentario" rows="4" placeholder="Observaciones sobre el estado del equipo..."></textarea></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="btnGuardar" style="background-color: #dc3545; color: white;">Registrar Devolución</button>
          <button id="btnCancelar" style="background-color: #6c757d; color: white;">Cancelar</button>
        </div>
      </div>`;

    document.getElementById('btnGuardar').onclick = async () => {
      const comentario = document.getElementById('comentario').value.trim();
      if (confirm(`¿Confirmar devolución del equipo ${item.nombre}?`)) {
        await api.guardar(item, 'Devuelto', null, comentario);
        Object.assign(item, {
          documento: "", profesor: "", materia: "",
          nombreCompleto: "", curso: ""
        });
        cerrarModal();
        actualizarVista();
      }
    };
  } else {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 15px;">
        ${crearInput('documento', 'Documento del Estudiante', 'text', 'Ingrese el número de documento...')}
        ${crearInput('profesor', 'Profesor(a) Encargado', 'text', 'Ingrese el nombre del profesor(a)...', false, item.profesor)}
        ${crearInput('materia', 'Materia', 'text', 'Ingrese la materia...', false, item.materia)}
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="btnGuardar" style="background-color: #007bff; color: white;">Registrar Préstamo</button>
          <button id="btnCancelar" style="background-color: #6c757d; color: white;">Cancelar</button>
        </div>
      </div>`;

    let datosEstudiante = {};
    let timer;

    document.getElementById('documento').oninput = (e) => {
      const doc = e.target.value.trim();
      const info = document.getElementById('buscarInfo');

      clearTimeout(timer);
      datosEstudiante = {};

      if (doc.length >= 3) {
        info.textContent = 'Validando documento...';
        info.style.color = '#ffc107';

        timer = setTimeout(async () => {
          const result = await api.buscarEstudiante(doc);
          if (result.encontrado) {
            datosEstudiante = result;
            info.textContent = `✓ ${result.nombreCompleto} - Curso: ${result.curso}`;
            info.style.color = '#28a745';
          } else {
            info.textContent = result.error || 'No encontrado';
            info.style.color = '#dc3545';
          }
        }, 700);
      } else {
        info.textContent = 'Ingrese el Documento para buscar automáticamente';
        info.style.color = '#6c757d';
      }
    };

    document.getElement
