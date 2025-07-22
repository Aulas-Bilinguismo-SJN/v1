// --- CONFIGURACIÓN ---
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

// --- UTILIDAD FECHAS ---
// Convierte "DD/MM/YYYY HH:mm:ss" a objeto Date
function parseSpanishDateTime(str) {
    if (!str) return new Date('1970-01-01');
    const [datePart, timePart] = str.split(' ');
    if (!datePart || !timePart) return new Date('1970-01-01');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    
    // Validar que los valores sean válidos
    if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
        return new Date('1970-01-01');
    }
    
    return new Date(year, month - 1, day, hour, minute, second);
}

// --- API FUNCTIONS ---
const api = {
    // Sincroniza estado de equipos con BaseB (Google Sheets)
    async cargarEquipos() {
        console.log('Iniciando carga de equipos desde BaseB...');
        try {
            const response = await fetch(`${SCRIPT_URL}?action=getBaseB`, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Datos recibidos de BaseB:', data);

            // Resetear todos los items
            items.forEach(item => Object.assign(item, {
                documento: "", 
                profesor: "", 
                materia: "",
                nombreCompleto: "",
                curso: ""
            }));

            if (!data || !Array.isArray(data)) {
                console.warn('No se recibieron datos válidos de BaseB');
                actualizarVista();
                return;
            }

            // Procesar registros para encontrar el estado más reciente de cada equipo
            const estadosEquipos = {};
            
            data.forEach((fila, index) => {
                console.log(`Procesando fila ${index}:`, fila);
                
                // Estructura esperada: marcaTemporal, equipo, nombreCompleto, documento, curso, profesorEncargado, materia, tipo, comentario
                if (!Array.isArray(fila) || fila.length < 8) {
                    console.warn(`Fila ${index} no tiene suficientes campos:`, fila);
                    return;
                }

                const [marcaTemporal, equipo, nombreCompleto, documento, curso, profesorEncargado, materia, tipo, comentario] = fila;
                
                const numeroEquipo = equipo?.toString()?.trim();
                const tipoOperacion = tipo?.toString()?.trim();

                if (!numeroEquipo || !tipoOperacion) {
                    console.warn(`Fila ${index} - Datos incompletos. Equipo: "${numeroEquipo}", Tipo: "${tipoOperacion}"`);
                    return;
                }

                // Usar parseSpanishDateTime para comparar fechas correctamente
                const fechaActual = parseSpanishDateTime(marcaTemporal);
                
                if (!estadosEquipos[numeroEquipo] || 
                    fechaActual > parseSpanishDateTime(estadosEquipos[numeroEquipo].timestamp)) {
                    
                    estadosEquipos[numeroEquipo] = {
                        timestamp: marcaTemporal,
                        nombreCompleto: nombreCompleto?.toString()?.trim() || "",
                        documento: documento?.toString()?.trim() || "",
                        curso: curso?.toString()?.trim() || "",
                        profesor: profesorEncargado?.toString()?.trim() || "",
                        materia: materia?.toString()?.trim() || "",
                        tipo: tipoOperacion,
                        comentario: comentario?.toString()?.trim() || ""
                    };
                    
                    console.log(`Estado actualizado para equipo ${numeroEquipo}:`, estadosEquipos[numeroEquipo]);
                }
            });

            console.log('Estados finales de equipos:', estadosEquipos);

            // Solo los equipos que están en "Préstamo" se marcan como ocupados
            let equiposActualizados = 0;
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
                        equiposActualizados++;
                        console.log(`Equipo ${numeroEquipo} marcado como prestado a ${estado.nombreCompleto}`);
                    } else {
                        console.warn(`No se encontró el item para el equipo ${numeroEquipo}`);
                    }
                }
            });

            console.log(`Se actualizaron ${equiposActualizados} equipos con préstamos activos`);
            actualizarVista();

        } catch (error) { 
            console.error("Error al cargar equipos:", error);
            // Mostrar error en la UI
            mostrarError(`Error al cargar datos: ${error.message}`);
        }
    },

    // Sincroniza consulta de estudiante con BaseA (Google Sheets)
    async buscarEstudiante(documento) {
        console.log(`Buscando estudiante con documento: ${documento}`);
        try {
            if (!documento || documento.trim() === '') {
                return {encontrado: false, error: 'Documento requerido'};
            }

            const url = `${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento.trim())}`;
            console.log('URL de búsqueda:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                console.error('Error en la respuesta:', response.status, response.statusText);
                return {encontrado: false, error: `Error del servidor: ${response.status}`};
            }

            const data = await response.json();
            console.log('Respuesta de búsqueda:', data);

            // El endpoint devuelve {encontrado, documento, nombreCompleto, curso} o error
            if (data && data.encontrado) {
                return {
                    nombreCompleto: data.nombreCompleto || 'Sin nombre',
                    documento: data.documento || documento,
                    curso: data.curso || 'Sin curso',
                    encontrado: true
                };
            } else {
                return {encontrado: false, error: data?.error || 'Estudiante no encontrado'};
            }
        } catch (error) {
            console.error('Error al buscar estudiante:', error);
            return {encontrado: false, error: `Error de conexión: ${error.message}`};
        }
    },

    // Guarda registro de préstamo en BaseB
    async guardarPrestamo(item, datosEstudiante) {
        console.log('Guardando préstamo:', item, datosEstudiante);
        
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: new Date().toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric'
            }) + ' ' + new Date().toLocaleTimeString('es-ES', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
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

        console.log('Datos a enviar:', datos);

        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }, 
                body: JSON.stringify(datos)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const resultado = await response.json();
            console.log('Respuesta del servidor (préstamo):', resultado);

            if (resultado.success) {
                console.log('Préstamo registrado exitosamente');
                mostrarMensaje('Préstamo registrado correctamente', 'success');
            } else {
                throw new Error(resultado.error || 'Error desconocido al registrar préstamo');
            }

        } catch (error) {
            console.error("Error al guardar préstamo:", error);
            mostrarError(`Error al registrar préstamo: ${error.message}`);
            throw error; // Re-lanzar para que el llamador pueda manejar el error
        }
    },

    // Guarda registro de devolución en BaseB
    async guardarDevolucion(item, comentario = '') {
        console.log('Guardando devolución:', item, comentario);
        
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: new Date().toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric'
            }) + ' ' + new Date().toLocaleTimeString('es-ES', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }),
            equipo: item.nombre,
            nombreCompleto: item.nombreCompleto || '',
            documento: item.documento,
            curso: item.curso || '',
            profesorEncargado: item.profesor,
            materia: item.materia,
            tipo: 'Devuelto',
            comentario: comentario
        };

        console.log('Datos a enviar:', datos);

        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }, 
                body: JSON.stringify(datos)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const resultado = await response.json();
            console.log('Respuesta del servidor (devolución):', resultado);

            if (resultado.success) {
                console.log('Devolución registrada exitosamente');
                mostrarMensaje('Devolución registrada correctamente', 'success');
            } else {
                throw new Error(resultado.error || 'Error desconocido al registrar devolución');
            }

        } catch (error) {
            console.error("Error al guardar devolución:", error);
            mostrarError(`Error al registrar devolución: ${error.message}`);
            throw error; // Re-lanzar para que el llamador pueda manejar el error
        }
    }
};

// --- FUNCIONES DE MENSAJES ---
function mostrarMensaje(mensaje, tipo = 'info') {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; 
        top: 20px; 
        right: 20px; 
        padding: 15px; 
        border-radius: 5px; 
        color: white; 
        z-index: 10000;
        font-weight: bold;
        background-color: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : '#007bff'};
    `;
    div.textContent = mensaje;
    document.body.appendChild(div);
    
    setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
    }, 3000);
}

function mostrarError(mensaje) {
    mostrarMensaje(mensaje, 'error');
}

// --- MODAL & UI FUNCTIONS ---
function crearInput(id, label, type = 'text', placeholder = '', readonly = false, value = '') {
    return `<div><label for="${id}">${label}:</label>
            <${type === 'textarea' ? 'textarea' : 'input'} ${type === 'textarea' ? 'rows="3"' : `type="${type}"`} 
            id="${id}" placeholder="${placeholder}" ${readonly ? 'readonly' : ''} value="${value}">${type === 'textarea' ? value : ''}</${type === 'textarea' ? 'textarea' : 'input'}>
            ${id === 'documento' ? '<small id="buscarInfo" style="color: #6c757d;">Ingrese el Documento para buscar automáticamente</small>' : ''}
            </div>`;
}

function crearBotones(guardarText, guardarClass, onGuardar) {
    const div = document.createElement('div');
    div.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';
    div.innerHTML = `<button id="btnGuardar" class="${guardarClass}" style="background-color: ${guardarClass === 'delete-modal-btn' ? '#dc3545' : '#007bff'}; color: white;">${guardarText}</button>
                     <button id="btnCancelar" style="background-color: #6c757d; color: white;">Cancelar</button>`;
    div.querySelector('#btnGuardar').onclick = onGuardar;
    div.querySelector('#btnCancelar').onclick = cerrarModal;
    return div;
}

function mostrarModalItem(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    if (item.documento.trim()) return mostrarModalDesmarcar(itemId);

    const modal = document.getElementById('modalMetodos');
    const container = document.getElementById('listaMetodos');

    document.querySelector('.modal-header h2').textContent = `Equipo ${item.nombre}`;
    document.querySelector('.modal-body p').textContent = 'Complete la información del Préstamo:';

    const form = document.createElement('div');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 15px;';
    form.innerHTML = [
        crearInput('documento', 'Documento del Estudiante', 'text', 'Ingrese el número de documento...'),
        crearInput('profesor', 'Profesor(a) Encargado', 'text', 'Ingrese el nombre del profesor(a)...', false, item.profesor),
        crearInput('materia', 'Materia', 'text', 'Ingrese la materia...', false, item.materia)
    ].join('');

    // Variables para almacenar datos del estudiante
    let datosEstudiante = {};

    // Búsqueda automática mejorada
    let timer;
    form.querySelector('#documento').oninput = async (e) => {
        const doc = e.target.value.trim();
        const info = document.getElementById('buscarInfo');

        clearTimeout(timer);
        datosEstudiante = {}; // Reset datos

        if (doc.length >= 3) {
            info.textContent = 'Validando documento...';
            info.style.color = '#ffc107';

            timer = setTimeout(async () => {
                try {
                    const result = await api.buscarEstudiante(doc);
                    if (result.encontrado) {
                        datosEstudiante = {
                            nombreCompleto: result.nombreCompleto,
                            documento: result.documento,
                            curso: result.curso,
                            encontrado: true
                        };
                        info.textContent = `✓ Estudiante: ${result.nombreCompleto} - Curso: ${result.curso}`;
                        info.style.color = '#28a745';
                    } else {
                        datosEstudiante = { encontrado: false };
                        info.textContent = `⚠ ${result.error || 'Documento no encontrado'}`;
                        info.style.color = '#dc3545';
                    }
                } catch (error) {
                    datosEstudiante = { encontrado: false };
                    info.textContent = '⚠ Error en validación - Intente nuevamente';
                    info.style.color = '#dc3545';
                }
            }, 800);

        } else if (!doc.length) {
            info.textContent = 'Ingrese el Documento para buscar automáticamente';
            info.style.color = '#6c757d';
        }
    };

    form.appendChild(crearBotones('Registrar Préstamo', '', async () => {
        const [doc, prof, mat] = ['documento', 'profesor', 'materia'].map(id => document.getElementById(id).value.trim());

        if (!doc || !prof || !mat) {
            return alert('Complete todos los campos: Documento, Profesor y Materia');
        }

        // Verificar si encontró el estudiante
        if (!datosEstudiante.encontrado && Object.keys(datosEstudiante).length === 0) {
            const confirmacion = confirm('No se encontró información del estudiante. ¿Desea continuar con el registro manual?');
            if (!confirmacion) return;

            // Datos mínimos para registro manual
            datosEstudiante = {
                documento: doc,
                nombreCompleto: 'Registro Manual',
                curso: 'Por verificar'
            };
        } else if (datosEstudiante.encontrado === false) {
            const confirmacion = confirm('No se encontró el estudiante en la base de datos. ¿Desea continuar con el registro manual?');
            if (!confirmacion) return;

            datosEstudiante = {
                documento: doc,
                nombreCompleto: 'Registro Manual',
                curso: 'Por verificar'
            };
        }

        try {
            // Actualizar item local primero
            item.documento = doc;
            item.profesor = prof;
            item.materia = mat;
            item.nombreCompleto = datosEstudiante.nombreCompleto;
            item.curso = datosEstudiante.curso;

            // Registrar préstamo en BaseB
            await api.guardarPrestamo(item, datosEstudiante);

            cerrarModal();
            actualizarVista();

            // Recargar datos después de un momento para sincronizar
            setTimeout(() => api.cargarEquipos(), 1000);

        } catch (error) {
            // Revertir cambios locales si falla el guardado
            item.documento = "";
            item.profesor = "";
            item.materia = "";
            item.nombreCompleto = "";
            item.curso = "";
            
            alert('Error al registrar el préstamo. Intente nuevamente.');
        }
    }));

    container.innerHTML = '';
    container.appendChild(form);
    modal.style.display = 'block';
}

function mostrarModalDesmarcar(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const modal = document.getElementById('modalMetodos');
    const container = document.getElementById('listaMetodos');

    document.querySelector('.modal-header h2').textContent = `Devolver Equipo ${item.nombre}`;
    document.querySelector('.modal-body p').textContent = 'Información del Préstamo Activo:';

    const form = document.createElement('div');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 15px;';
    form.innerHTML = `<div class="readonly-info">
        <p><strong>Estudiante:</strong></p><div class="info-content">${item.nombreCompleto || 'Sin información'}</div>
        <p><strong>Documento:</strong></p><div class="info-content">${item.documento || 'Sin información'}</div>
        <p><strong>Curso:</strong></p><div class="info-content">${item.curso || 'Sin información'}</div>
        <p><strong>Profesor(a):</strong></p><div class="info-content">${item.profesor || 'Sin profesor'}</div>
        <p><strong>Materia:</strong></p><div class="info-content">${item.materia || 'Sin materia'}</div>
    </div>
    <div><label for="comentario">Comentario de Devolución (opcional):</label>
    <textarea id="comentario" rows="4" placeholder="Observaciones sobre el estado del equipo..."></textarea></div>`;

    form.appendChild(crearBotones('Registrar Devolución', 'delete-modal-btn', async () => {
        const comentario = document.getElementById('comentario').value.trim();
        if (confirm(`¿Confirma la devolución del equipo ${item.nombre}?`)) {

            try {
                // Registrar devolución en BaseB con comentario
                await api.guardarDevolucion(item, comentario);

                // Limpiar item local
                Object.assign(item, {
                    documento: "", 
                    profesor: "", 
                    materia: "",
                    nombreCompleto: "",
                    curso: ""
                });

                if (comentario) {
                    console.log(`Devolución equipo ${item.nombre} - Comentario: ${comentario}`);
                }

                cerrarModal();
                actualizarVista();

                // Recargar datos después de un momento para sincronizar
                setTimeout(() => api.cargarEquipos(), 1000);

            } catch (error) {
                alert('Error al registrar la devolución. Intente nuevamente.');
            }
        }
    }));

    container.innerHTML = '';
    container.appendChild(form);
    modal.style.display = 'block';
}

// --- UI FUNCTIONS ---
const actualizarVista = () => crearGrilla();

function crearGrilla() {
    const contenedor = document.getElementById("malla");
    if (!contenedor) {
        console.error("No se encontró el elemento con ID 'malla'");
        return;
    }
    
    contenedor.innerHTML = items.map(item => {
        const ocupado = !!item.documento;
        return `<div class="ramo" style="background-color: ${ocupado ? '#d4edda' : '#f8f9fa'}; border-color: ${ocupado ? '#28a745' : '#ccc'};" onclick="mostrarModalItem('${item.id}')">
                    <div style="font-weight: bold;">${item.nombre}</div>
                    <div style="color: ${ocupado ? 'green' : '#6c757d'};">${ocupado ? '✓' : '○'}</div>
                    ${ocupado ? `<div style="font-size: 0.8em; color: #666; margin-top: 5px;">${item.nombreCompleto}</div>` : ''}
                </div>`;
    }).join('');
}

function resetearMalla() {
    if (confirm("⚠️ ATENCIÓN: Esto registrará la devolución de TODOS los equipos prestados. ¿Estás seguro?")) {
        const comentarioMasivo = prompt("Comentario para devolución masiva (opcional):", "Devolución masiva - Fin de jornada");
        
        // Contar equipos a devolver
        const equiposADevolver = items.filter(item => item.documento);
        let devueltos = 0;
        
        if (equiposADevolver.length === 0) {
            alert("No hay equipos prestados para devolver.");
            return;
        }

        // Procesar devoluciones
        equiposADevolver.forEach(async (item, index) => {
            try {
                await api.guardarDevolucion(item, comentarioMasivo || '');
                Object.assign(item, {
                    documento: "", 
                    profesor: "", 
                    materia: "",
                    nombreCompleto: "",
                    curso: ""
                });
                devueltos++;
                
                // Actualizar vista cuando termine el último
                if (devueltos === equiposADevolver.length) {
                    setTimeout(() => {
                        actualizarVista();
                        api.cargarEquipos();
                        mostrarMensaje(`Se devolvieron ${devueltos} equipos correctamente`, 'success');
                    }, 1000);
                }
            } catch (error) {
                console.error(`Error al devolver equipo ${item.nombre}:`, error);
            }
        });
    }
}

const cerrarModal = () => {
    const modal = document.getElementById('modalMetodos');
    if (modal) {
        modal.style.display = 'none';
    }
};

// --- EVENT LISTENERS ---
window.onclick = e => e.target === document.getElementById('modalMetodos') && cerrarModal();
document.addEventListener('keydown', e => e.key === 'Escape' && cerrarModal());
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, iniciando aplicación...');
    
    // Cargar equipos inmediatamente
    api.cargarEquipos();
    
    // Configurar actualización automática cada 30 segundos (en lugar de 2 segundos para evitar sobrecarga)
    setInterval(api.cargarEquipos, 30000);
    
    // Agregar indicador de estado de conexión
    window.addEventListener('online', () => {
        mostrarMensaje('Conexión restaurada', 'success');
        api.cargarEquipos();
    });
    
    window.addEventListener('offline', () => {
        mostrarError('Sin conexión a internet');
    });
});
