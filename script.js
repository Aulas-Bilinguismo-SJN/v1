// --- CONFIGURACIÓN ---
const items = Array.from({ length: 50 }, (_, i) => ({
  id: `item_${i + 1}`,
  nombre: `${i + 1}`,
  documento: "",
  profesor: "",
  materia: "",
  nombreCompleto: "",
  curso: ""
}));

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyuGDm29g7Xs3OE_vF1NyQyMYcucZpWIwxL2KMJU5BYL4nZCvo1R86m8dSQFpYEW8UYcA/exec';

// --- UTILIDAD FECHAS ---
function parseSpanishDateTime(str) {
  const [datePart, timePart] = str.split(' ');
  if (!datePart || !timePart) return new Date('1970-01-01');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

// --- API FUNCTIONS ---
const api = {
  async cargarEquipos() {
    try {
      const response = await fetch(`${SCRIPT_URL}?action=getBaseB`);
      const data = await response.json();

      items.forEach(item => Object.assign(item, {
        documento: "",
        profesor: "",
        materia: "",
        nombreCompleto: "",
        curso: ""
      }));

      const estadosEquipos = {};
      data?.forEach(fila => {
        if (fila.length >= 8) {
          const numeroEquipo = fila[1]?.toString();
          const tipo = fila[7]?.toString();
          const timestamp = fila[0];

          if (numeroEquipo && tipo) {
            if (!estadosEquipos[numeroEquipo] ||
              parseSpanishDateTime(timestamp) > parseSpanishDateTime(estadosEquipos[numeroEquipo].timestamp)) {
              estadosEquipos[numeroEquipo] = {
                timestamp,
                nombreCompleto: fila[2] || "",
                documento: fila[3] || "",
                curso: fila[4] || "",
                profesor: fila[5] || "",
                materia: fila[6] || "",
                tipo,
                comentario: fila[8] || ""
              };
            }
          }
        }
      });

      Object.entries(estadosEquipos).forEach(([numeroEquipo, estado]) => {
        if (estado.tipo === "Préstamo") {
          const item = items.find(i => i.nombre === numeroEquipo);
          if (item) {
            Object.assign(item, {
              documento: estado.documento,
              profesor: estado.profesor,
              materia: estado.materia,
              nombreCompleto: estado.nombreCompleto,
              curso: estado.curso
            });
          }
        }
      });

      actualizarVista();
    } catch (error) {
      console.error("Error al cargar equipos:", error);
    }
  },

  async buscarEstudiante(documento) {
    try {
      if (!documento || documento.trim() === '') {
        return { encontrado: false, error: 'Documento requerido' };
      }
      const url = `${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento)}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error('Error en la respuesta:', response.status, response.statusText);
        return { encontrado: false, error: 'Error en la respuesta del servidor' };
      }
      const data = await response.json();

      if (data && data.encontrado) {
        return {
          nombreCompleto: data.nombreCompleto || 'Sin nombre',
          documento: data.documento || documento,
          curso: data.curso || 'Sin curso',
          encontrado: true
        };
      } else {
        return { encontrado: false, error: data?.error || 'No encontrado' };
      }
    } catch (error) {
      console.error('Error al buscar estudiante:', error);
      return { encontrado: false, error: error.message };
    }
  },

  async guardarPrestamo(item, datosEstudiante) {
    const datos = {
      action: 'saveToBaseB',
      marcaTemporal: new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }) + ' ' + new Date().toLocaleTimeString('es-ES', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      }),
      equipo: item.nombre,
      nombreCompleto: datosEstudiante.nombreCompleto || '',
      documento: datosEstudiante.documento || item.documento,
      curso: datosEstudiante.curso || '',
      profesorEncargado: item.profesor,
      materia: item.materia,
      tipo: 'Préstamo',
      comentario: ''
    };

    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
    } catch (error) {
      console.error("Error al guardar préstamo:", error);
    }
  },

  async guardarDevolucion(item, comentario = '') {
    const datos = {
      action: 'saveToBaseB',
      marcaTemporal: new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }) + ' ' + new Date().toLocaleTimeString('es-ES', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      }),
      equipo: item.nombre,
      nombreCompleto: item.nombreCompleto || '',
      documento: item.documento,
      curso: item.curso || '',
      profesorEncargado: item.profesor,
      materia: item.materia,
      tipo: 'Devuelto',
      comentario
    };

    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
    } catch (error) {
      console.error("Error al guardar devolución:", error);
    }
  }
};

// --- VISTA ---
function actualizarVista() {
  const contenedor = document.getElementById('malla');
  contenedor.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'ramo';
    div.innerHTML = `
      <div>Equipo ${item.nombre}</div>
      <div>${item.documento ? 'Prestado' : 'Disponible'}</div>
    `;
    if (item.documento) {
      div.style.backgroundColor = "rgb(212, 237, 218)";
    }
    div.onclick = () => abrirModal(item);
    contenedor.appendChild(div);
  });
}

function abrirModal(item) {
  const modal = document.getElementById('modalMetodos');
  const lista = document.getElementById('listaMetodos');
  document.querySelector('#modalMetodos h2').textContent = `Equipo ${item.nombre}`;

  lista.innerHTML = `
    ${crearInput("documento", "Documento", "text", "", false, item.documento)}
    ${crearInput("profesor", "Profesor", "text", "", false, item.profesor)}
    ${crearInput("materia", "Materia", "text", "", false, item.materia)}
    ${crearInput("nombreCompleto", "Nombre Completo", "text", "", true, item.nombreCompleto)}
    ${crearInput("curso", "Curso", "text", "", true, item.curso)}
    <div class="modal-actions">
      <button onclick="guardarPrestamoDesdeModal(${item.nombre})" style="background-color: rgb(0, 123, 255);">Guardar Préstamo</button>
      <button onclick="guardarDevolucionDesdeModal(${item.nombre})" style="background-color: rgb(108, 117, 125);">Registrar Devolución</button>
    </div>
  `;

  modal.style.display = 'block';
}

function cerrarModal() {
  document.getElementById('modalMetodos').style.display = 'none';
}

function guardarPrestamoDesdeModal(numero) {
  const item = items.find(i => i.nombre === numero.toString());
  if (!item) return;
  item.documento = document.getElementById('documento').value;
  item.profesor = document.getElementById('profesor').value;
  item.materia = document.getElementById('materia').value;

  api.buscarEstudiante(item.documento).then(estudiante => {
    if (estudiante.encontrado) {
      item.nombreCompleto = estudiante.nombreCompleto;
      item.curso = estudiante.curso;
    }
    api.guardarPrestamo(item, estudiante);
    cerrarModal();
    actualizarVista();
  });
}

function guardarDevolucionDesdeModal(numero) {
  const item = items.find(i => i.nombre === numero.toString());
  if (!item) return;

  api.guardarDevolucion(item);
  Object.assign(item, {
    documento: "",
    profesor: "",
    materia: "",
    nombreCompleto: "",
    curso: ""
  });
  cerrarModal();
  actualizarVista();
}

// --- INPUT GENERADOR ---
function crearInput(id, label, type = 'text', placeholder = '', readonly = false, value = '') {
  if (type === 'textarea') {
    return `<div>
      <label for="${id}">${label}:</label>
      <textarea id="${id}" placeholder="${placeholder}" ${readonly ? 'readonly' : ''} rows="3">${value}</textarea>
      ${id === 'documento' ? '<small id="buscarInfo" style="color: #6c757d;">Ingrese el Documento para buscar automáticamente</small>' : ''}
    </div>`;
  } else {
    return `<div>
      <label for="${id}">${label}:</label>
      <input type="${type}" id="${id}" placeholder="${placeholder}" ${readonly ? 'readonly' : ''} value="${value}">
      ${id === 'documento' ? '<small id="buscarInfo" style="color: #6c757d;">Ingrese el Documento para buscar automáticamente</small>' : ''}
    </div>`;
  }
}

// --- DEVOLUCIÓN MASIVA ---
async function resetearMalla() {
  if (confirm("\u26a0\ufe0f ATENCIÓN: Esto registrará la devolución de TODOS los equipos prestados. ¿Estás seguro?")) {
    const comentarioMasivo = prompt("Comentario para devolución masiva (opcional):", "Devolución masiva - Fin de jornada");
    for (const item of items) {
      if (item.documento) {
        await api.guardarDevolucion(item, comentarioMasivo || '');
        Object.assign(item, {
          documento: "",
          profesor: "",
          materia: "",
          nombreCompleto: "",
          curso: ""
        });
      }
    }
    actualizarVista();
  }
}

// --- INICIALIZAR ---
document.addEventListener('DOMContentLoaded', () => {
  api.cargarEquipos();
});
