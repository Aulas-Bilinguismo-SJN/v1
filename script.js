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

// Variables para control de actualizaciones
let ultimaActualizacion = 0;
const INTERVALO_ACTUALIZACION = 2000; // 30 segundos

// --- UTILIDADES ---
function mostrarNotificacion(mensaje, tipo = 'info') {
    const notif = document.createElement('div');
    notif.className = `notificacion notificacion-${tipo}`;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        max-width: 300px;
        background-color: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : '#007bff'};
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notif.textContent = mensaje;
    
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

function generarTimestamp() {
    return new Date().toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function validarDatosPrestamo(doc, prof, mat) {
    const errores = [];
    
    if (!doc || doc.length < 5) {
        errores.push('El documento debe tener al menos 5 caracteres');
    }
    
    if (!prof || prof.length < 3) {
        errores.push('El nombre del profesor debe tener al menos 3 caracteres');
    }
    
    if (!mat || mat.length < 3) {
        errores.push('El nombre de la materia debe tener al menos 3 caracteres');
    }
    
    return errores;
}

// --- API FUNCTIONS ---
const api = {
    async cargarEquipos() {
        const ahora = Date.now();
        
        // Evitar actualizaciones muy frecuentes en modo automático
        if (ahora - ultimaActualizacion < INTERVALO_ACTUALIZACION && ultimaActualizacion > 0) {
            return;
        }

        try {
            const response = await fetch(`${SCRIPT_URL}?action=getBaseB`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(`Server error: ${data.error}`);
            }

            // Resetear todos los items
            items.forEach(item => Object.assign(item, {
                documento: "", 
                profesor: "", 
                materia: "",
                nombreCompleto: "",
                curso: ""
            }));

            // Procesar registros para encontrar el último estado de cada equipo
            const estadosEquipos = {};

            data?.forEach(fila => {
                if (fila.length >= 8) {
                    const numeroEquipo = fila[1]?.toString(); // Equipo
                    const tipo = fila[7]?.toString(); // Tipo
                    const timestamp = fila[0]; // Marca temporal

                    if (numeroEquipo && tipo) {
                        // Guardar solo el registro más reciente por equipo
                        if (!estadosEquipos[numeroEquipo] || 
                            new Date(timestamp) > new Date(estadosEquipos[numeroEquipo].timestamp)) {
                            estadosEquipos[numeroEquipo] = {
                                timestamp: timestamp,
                                nombreCompleto: fila[2] || "", // Nombre Completo
                                documento: fila[3] || "",       // Documento
                                curso: fila[4] || "",           // Curso
                                profesor: fila[5] || "",        // Profesor Encargado
                                materia: fila[6] || "",         // Materia
                                tipo: tipo,                     // Tipo
                                comentario: fila[8] || ""       // Comentario
                            };
                        }
                    }
                }
            });

            // Aplicar solo los equipos que están en "Préstamo" (último registro)
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
            ultimaActualizacion = ahora;
            
        } catch (error) { 
            console.error("Error al cargar equipos:", error);
            mostrarNotificacion(`Error al cargar equipos: ${error.message}`, 'error');
        }
    },

    async buscarEstudiante(documento, reintentos = 2) {
        for (let intento = 1; intento <= reintentos; intento++) {
            try {
                console.log(`Búsqueda intento ${intento}:`, documento);

                const url = `${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento)}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                
                // Verificar errores del servidor
                if (data.error && !data.encontrado) {
                    throw new Error(data.error);
                }

                // Procesar respuesta exitosa
                if (data && (data.encontrado === true || data.encontrado === 'true')) {
                    return {
                        nombreCompleto: data.nombreCompleto || data.nombre || '',
                        documento: data.documento || documento,
                        curso: data.curso || '',
                        encontrado: true
                    };
                } else if (data && data.length > 0) {
                    const estudiante = data[0];
                    return {
                        nombreCompleto: estudiante.nombreCompleto || estudiante.nombre || estudiante[1] || '',
                        documento: estudiante.documento || documento,
                        curso: estudiante.curso || estudiante[2] || '',
                        encontrado: true
                    };
                } else {
                    console.log('Estudiante no encontrado para documento:', documento);
                    return {encontrado: false};
                }

            } catch (error) {
                console.error(`Error en intento ${intento}:`, error);
                
                if (intento === reintentos) {
                    return { 
                        encontrado: false, 
                        error: `Error después de ${reintentos} intentos: ${error.message}` 
                    };
                }
                
                // Esperar antes del siguiente intento
                await new Promise(resolve => setTimeout(resolve, 1000 * intento));
            }
        }
    },

    async guardarPrestamo(item, datosEstudiante) {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: generarTimestamp(),
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
            const response = await fetch(SCRIPT_URL, {
                method: 'POST', 
                mode: 'no-cors', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datos)
            });
            
            console.log('Préstamo registrado:', datos);
            mostrarNotificacion(`Préstamo registrado: Equipo ${item.nombre}`, 'success');
            return { success: true };
            
        } catch (error) {
            console.error("Error al guardar préstamo:", error);
            mostrarNotificacion(`Error al registrar préstamo: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    },

    async guardarDevolucion(item, comentario = '') {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: generarTimestamp(),
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
            const response = await fetch(SCRIPT_URL, {
                method: 'POST', 
                mode: 'no-cors', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datos)
            });
            
            console.log('Devolución registrada:', datos);
            mostrarNotificacion(`Devolución registrada: Equipo ${item.nombre}`, 'success');
            return { success: true };
            
        } catch (error) {
            console.error("Error al guardar devolución:", error);
            mostrarNotificacion(`Error al registrar devolución: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
};

// --- MODAL FUNCTIONS ---
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
                    console.log('Resultado de validación:', result);

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
                        if (result.error) {
                            info.textContent = `⚠ Error: ${result.error}`;
                        } else {
                            info.textContent = '⚠ Documento no encontrado - Verifique el número';
                        }
                        info.style.color = '#dc3545';
                    }
                } catch (error) {
                    console.error('Error en validación:', error);
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

        // Validar datos
        const errores = validarDatosPrestamo(doc, prof, mat);
        if (errores.length > 0) {
            alert('Errores encontrados:\n' + errores.join('\n'));
            return;
        }

        // Verificar si encontró el estudiante
        if (!datosEstudiante.encontrado && Object.keys(datosEstudiante).length === 0) {
            const confirmacion = confirm('No se encontró información del estudiante. ¿Desea continuar con el registro manual?');
            if (!confirmacion) return;

            // Datos mínimos para registro manual
            datosEstudiante = {
                documento: doc,
                nombreCompleto: 'Registro Manual',
                curso: 'Por verificar',
                encontrado: false
            };
        }

        // Actualizar item local
        item.documento = doc;
        item.profesor = prof;
        item.materia = mat;
        item.nombreCompleto = datosEstudiante.nombreCompleto;
        item.curso = datosEstudiante.curso;

        // Registrar préstamo en BaseB
        const resultado = await api.guardarPrestamo(item, datosEstudiante);
        
        if (resultado.success) {
            cerrarModal();
            actualizarVista();
        }
    }));

    container.innerHTML = '';
    container.appendChild(form);
    modal.style.display = 'block';
}

// ... (todo el código previo sin cambios)

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
        }
    }));

    container.innerHTML = '';
    container.appendChild(form);
    modal.style.display = 'block';
}

// ... (resto del código sin cambios)

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
        
        let equiposDevueltos = 0;
        const promesasDevolucion = [];
        
        items.forEach(item => {
            if (item.documento) {
                equiposDevueltos++;
                promesasDevolucion.push(
                    api.guardarDevolucion(item, comentarioMasivo || '').then(() => {
                        Object.assign(item, {
                            documento: "", 
                            profesor: "", 
                            materia: "",
                            nombreCompleto: "",
                            curso: ""
                        });
                    })
                );
            }
        });
        
        if (equiposDevueltos > 0) {
            mostrarNotificacion(`Procesando devolución de ${equiposDevueltos} equipos...`, 'info');
            
            Promise.all(promesasDevolucion).then(() => {
                mostrarNotificacion(`${equiposDevueltos} equipos devueltos correctamente`, 'success');
                actualizarVista();
            }).catch(error => {
                mostrarNotificacion(`Error en devolución masiva: ${error.message}`, 'error');
            });
        } else {
            mostrarNotificacion('No hay equipos prestados para devolver', 'info');
        }
    }
}

// Función para actualización manual
function actualizarManual() {
    ultimaActualizacion = 0; // Forzar actualización
    api.cargarEquipos();
    mostrarNotificacion('Actualizando equipos...', 'info');
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
    
    // Configurar actualización automática cada 30 segundos
    setInterval(() => api.cargarEquipos(), 30000);
    
    // Agregar botón de actualización manual si no existe
    const btnActualizar = document.getElementById('btnActualizarManual');
    if (!btnActualizar) {
        const btn = document.createElement('button');
        btn.id = 'btnActualizarManual';
        btn.textContent = '🔄 Actualizar';
        btn.onclick = actualizarManual;
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            z-index: 1000;
        `;
        document.body.appendChild(btn);
    }
});
