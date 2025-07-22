
const items = Array.from({length: 50}, (_, i) => ({
    id: `item_${i+1}`,
    nombre: `${i+1}`,
    documento: "",
    profesor: "",
    materia: "",
    nombreCompleto: "",
    curso: ""
}));

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPkJVdzy3dmbyfT8jUbaBbETPQc4aDoUGJUVqcsCRYUR8iU48rVCpU2_Va_mz1wtKIJA/exec';

// --- API ---
const api = {
    async cargarEquipos() {
        try {
            const data = await fetch(`${SCRIPT_URL}?action=getBaseB`).then(r => r.json());
            
            // Reset items
            items.forEach(item => Object.assign(item, {
                documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""
            }));
            
            // Procesar último estado por equipo
            const estados = {};
            data?.forEach(fila => {
                if (fila.length >= 8) {
                    const [timestamp, equipo, nombreCompleto, documento, curso, profesor, materia, tipo] = fila;
                    if (equipo && tipo && (!estados[equipo] || new Date(timestamp) > new Date(estados[equipo].timestamp))) {
                        estados[equipo] = {timestamp, nombreCompleto, documento, curso, profesor, materia, tipo};
                    }
                }
            });
            
            // Aplicar solo préstamos activos
            Object.entries(estados).forEach(([numero, estado]) => {
                if (estado.tipo === "Préstamo") {
                    const item = items.find(i => i.nombre === numero);
                    if (item) Object.assign(item, estado);
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
            
            console.log('Respuesta completa de la API:', data); // Para debug
            
            // Tu API retorna directamente {encontrado: true/false, documento, nombreCompleto, curso}
            if (data && data.encontrado === true) {
                return {
                    nombreCompleto: data.nombreCompleto || 'Sin nombre',
                    documento: data.documento || documento,
                    curso: data.curso || 'Sin curso',
                    encontrado: true
                };
            }
            
            // Si no se encontró o hay error
            return {
                encontrado: false,
                error: data.error || 'Estudiante no encontrado'
            };
            
        } catch (error) {
            console.error('Error en búsqueda:', error);
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
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datos)
            });
        } catch (error) {
            console.error(`Error al guardar ${tipo}:`, error);
        }
    }
};

// --- MODAL ---
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
    const esDevolucion = !!item.documento.trim();
    
    document.querySelector('.modal-header h2').textContent = `${esDevolucion ? 'Devolver' : ''} Equipo ${item.nombre}`;
    document.querySelector('.modal-body p').textContent = esDevolucion ? 
        'Información del Préstamo Activo:' : 'Complete la información del Préstamo:';

    if (esDevolucion) {
        // Modal Devolución
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <div class="readonly-info">
                    <p><strong>Estudiante:</strong></p><div class="info-content">${item.nombreCompleto || 'Sin información'}</div>
                    <p><strong>Documento:</strong></p><div class="info-content">${item.documento}</div>
                    <p><strong>Curso:</strong></p><div class="info-content">${item.curso || 'Sin información'}</div>
                    <p><strong>Profesor(a):</strong></p><div class="info-content">${item.profesor || 'Sin profesor'}</div>
                    <p><strong>Materia:</strong></p><div class="info-content">${item.materia || 'Sin materia'}</div>
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
            if (confirm(`¿Confirma la devolución del equipo ${item.nombre}?`)) {
                await api.guardar(item, 'Devuelto', null, comentario);
                Object.assign(item, {documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""});
                cerrarModal();
                actualizarVista();
            }
        };
    } else {
        // Modal Préstamo
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
        
        document.getElementById('documento').oninput = async (e) => {
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
                        info.textContent = `✓ Estudiante: ${result.nombreCompleto} - Curso: ${result.curso}`;
                        info.style.color = '#28a745';
                    } else {
                        info.textContent = result.error ? `⚠ Error: ${result.error}` : '⚠ Documento no encontrado - Verifique el número';
                        info.style.color = '#dc3545';
                    }
                }, 800);
            } else if (!doc.length) {
                info.textContent = 'Ingrese el Documento para buscar automáticamente';
                info.style.color = '#6c757d';
            }
        };

        document.getElementById('btnGuardar').onclick = async () => {
            const [doc, prof, mat] = ['documento', 'profesor', 'materia'].map(id => document.getElementById(id).value.trim());
            
            if (!doc || !prof || !mat) {
                return alert('Complete todos los campos: Documento, Profesor y Materia');
            }
            
            if (!datosEstudiante.encontrado && Object.keys(datosEstudiante).length === 0) {
                const confirmacion = confirm('No se encontró información del estudiante. ¿Desea continuar con el registro manual?');
                if (!confirmacion) return;
                datosEstudiante = {documento: doc, nombreCompleto: 'Registro Manual', curso: 'Por verificar'};
            }
            
            Object.assign(item, {
                documento: doc, profesor: prof, materia: mat,
                nombreCompleto: datosEstudiante.nombreCompleto,
                curso: datosEstudiante.curso
            });
            
            await api.guardar(item, 'Préstamo', datosEstudiante);
            cerrarModal();
            actualizarVista();
        };
    }

    document.getElementById('btnCancelar').onclick = cerrarModal;
    modal.style.display = 'block';
}

// --- UI ---
const actualizarVista = () => {
    document.getElementById("malla").innerHTML = items.map(item => {
        const ocupado = !!item.documento;
        return `<div class="ramo" style="background-color: ${ocupado ? '#d4edda' : '#f8f9fa'}; border-color: ${ocupado ? '#28a745' : '#ccc'};" onclick="mostrarModalItem('${item.id}')">
                    <div style="font-weight: bold;">${item.nombre}</div>
                    <div style="color: ${ocupado ? 'green' : '#6c757d'};">${ocupado ? '✓' : '○'}</div>
                    ${ocupado ? `<div style="font-size: 0.8em; color: #666; margin-top: 5px;">${item.nombreCompleto}</div>` : ''}
                </div>`;
    }).join('');
};

function resetearMalla() {
    if (confirm("⚠️ ATENCIÓN: Esto registrará la devolución de TODOS los equipos prestados. ¿Estás seguro?")) {
        const comentario = prompt("Comentario para devolución masiva (opcional):", "Devolución masiva - Fin de jornada") || '';
        items.forEach(async item => {
            if (item.documento) {
                await api.guardar(item, 'Devuelto', null, comentario);
                Object.assign(item, {documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""});
            }
        });
        setTimeout(actualizarVista, 1000);
    }
}

const cerrarModal = () => document.getElementById('modalMetodos').style.display = 'none';

// --- EVENTOS ---
window.onclick = e => e.target === document.getElementById('modalMetodos') && cerrarModal();
document.addEventListener('keydown', e => e.key === 'Escape' && cerrarModal());
document.addEventListener('DOMContentLoaded', () => {
    api.cargarEquipos();
    setInterval(api.cargarEquipos, 2000);
});
