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
            document.getElementById('sync-status').textContent = 'Sincronizando...';
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
            if (Array.isArray(data)) {
                data.forEach(fila => {
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
            }

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
        } finally {
            document.getElementById('sync-status').textContent = '';
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
            return { encontrado: false, error: error.message };
        }
    },

    async guardarPrestamo(item, datosEstudiante) {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: new Date().toLocaleDateString('es-ES') + ' ' + new Date().toLocaleTimeString('es-ES', { hour12: false }),
            equipo: item.nombre,
            nombreCompleto: datosEstudiante.nombreCompleto || 'Registro Manual',
            documento: datosEstudiante.documento || item.documento,
            curso: datosEstudiante.curso || 'Por verificar',
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
            console.log('Préstamo registrado:', datos);
        } catch (error) {
            console.error("Error al guardar préstamo:", error);
        }
    },

    async guardarDevolucion(item, comentario = '') {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: new Date().toLocaleDateString('es-ES') + ' ' + new Date().toLocaleTimeString('es-ES', { hour12: false }),
            equipo: item.nombre,
            nombreCompleto: item.nombreCompleto || '',
            documento: item.documento,
            curso: item.curso || '',
            profesorEncargado: item.profesor,
            materia: item.materia,
            tipo: 'Devuelto',
            comentario: comentario
        };

        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });
            console.log('Devolución registrada:', datos);
        } catch (error) {
            console.error("Error al guardar devolución:", error);
        }
    }
};

// --- EVENTOS INICIALES ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, iniciando aplicación...');
    api.cargarEquipos();
    setInterval(api.cargarEquipos, 10000); // 10s
});

window.onclick = e => e.target === document.getElementById('modalMetodos') && cerrarModal();
document.addEventListener('keydown', e => e.key === 'Escape' && cerrarModal());

// --- MODAL DE PRÉSTAMO ---
function mostrarModalPrestamo(item) {
    const modal = document.getElementById("modalMetodos");
    const contenido = modal.querySelector(".modal-contenido");
    contenido.innerHTML = '';

    const form = document.createElement("form");
    form.innerHTML = `
        <h2>Registrar Préstamo: Equipo ${item.nombre}</h2>
        <label>Documento del estudiante:<br><input type="text" id="inputDocumento" required></label><br>
        <label>Profesor encargado:<br><input type="text" id="inputProfesor"></label><br>
        <label>Materia:<br><input type="text" id="inputMateria"></label><br>
        <button type="submit">Registrar</button>
        <button type="button" onclick="cerrarModal()">Cancelar</button>
    `;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const documento = document.getElementById("inputDocumento").value.trim();
        const profesor = document.getElementById("inputProfesor").value.trim();
        const materia = document.getElementById("inputMateria").value.trim();

        const estudiante = await api.buscarEstudiante(documento);
        if (!estudiante.encontrado) {
            alert("Estudiante no encontrado: " + (estudiante.error || '')); return;
        }

        item.documento = estudiante.documento;
        item.nombreCompleto = estudiante.nombreCompleto;
        item.curso = estudiante.curso;
        item.profesor = profesor;
        item.materia = materia;

        await api.guardarPrestamo(item, estudiante);
        cerrarModal();
        await api.cargarEquipos();
    };

    contenido.appendChild(form);
    modal.style.display = "block";
}

// --- MODAL DE DEVOLUCIÓN ---
function mostrarModalDevolucion(item) {
    const modal = document.getElementById("modalMetodos");
    const contenido = modal.querySelector(".modal-contenido");
    contenido.innerHTML = '';

    const form = document.createElement("form");
    form.innerHTML = `
        <h2>Registrar Devolución: Equipo ${item.nombre}</h2>
        <p><strong>Estudiante:</strong> ${item.nombreCompleto}</p>
        <p><strong>Documento:</strong> ${item.documento}</p>
        <p><strong>Curso:</strong> ${item.curso}</p>
        <p><strong>Profesor:</strong> ${item.profesor}</p>
        <p><strong>Materia:</strong> ${item.materia}</p>
        <label>Comentario (opcional):<br><textarea id="inputComentario" rows="3"></textarea></label><br>
        <button type="submit">Registrar Devolución</button>
        <button type="button" onclick="cerrarModal()">Cancelar</button>
    `;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const comentario = document.getElementById("inputComentario").value.trim();
        await api.guardarDevolucion(item, comentario);
        cerrarModal();
        await api.cargarEquipos();
    };

    contenido.appendChild(form);
    modal.style.display = "block";
}

// --- ACTUALIZAR VISTA ---
function actualizarVista() {
    const contenedor = document.getElementById("contenedorEquipos");
    contenedor.innerHTML = '';

    items.forEach(item => {
        const equipoDiv = document.createElement("div");
        equipoDiv.className = "ramo";

        const ocupado = item.documento && item.nombreCompleto;

        equipoDiv.style.backgroundColor = ocupado ? "#f8d7da" : "#d4edda";
        equipoDiv.style.borderColor = ocupado ? "#dc3545" : "#28a745";

        equipoDiv.innerHTML = `
            <div><strong>Equipo:</strong> ${item.nombre}</div>
            ${ocupado ? `
                <div><strong>Estudiante:</strong> ${item.nombreCompleto}</div>
                <div><strong>Curso:</strong> ${item.curso}</div>
                <div><strong>Materia:</strong> ${item.materia}</div>
                <div><strong>Profesor:</strong> ${item.profesor}</div>
                <button onclick="mostrarModalDevolucion(items[${parseInt(item.nombre) - 1}])">Devolver</button>
            ` : `
                <button onclick="mostrarModalPrestamo(items[${parseInt(item.nombre) - 1}])">Prestar</button>
            `}
        `;

        contenedor.appendChild(equipoDiv);
    });
}

// --- MODAL CIERRE ---
function cerrarModal() {
    document.getElementById("modalMetodos").style.display = "none";
}
