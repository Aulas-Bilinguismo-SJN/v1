// --- CONFIGURACIÓN ---
const items = Array.from({length: 50}, (_, i) => ({
    id: `item_${i+1}`, nombre: `${i+1}`, documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""
}));

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPkJVdzy3dmbyfT8jUbaBbETPQc4aDoUGJUVqcsCRYUR8iU48rVCpU2_Va_mz1wtKIJA/exec';

// --- UTILIDADES ---
const parseSpanishDateTime = str => {
    if (!str) return new Date('1970-01-01');
    const [datePart, timePart] = str.split(' ');
    if (!datePart || !timePart) return new Date('1970-01-01');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    return isNaN(day + month + year + hour + minute + second) ? new Date('1970-01-01') : new Date(year, month - 1, day, hour, minute, second);
};

const mostrarMensaje = (mensaje, tipo = 'info') => {
    const div = document.createElement('div');
    div.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 15px; border-radius: 5px; color: white; z-index: 10000; font-weight: bold; background-color: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : '#007bff'};`;
    div.textContent = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.parentNode?.removeChild(div), 3000);
};

const mostrarError = mensaje => mostrarMensaje(mensaje, 'error');

// --- API ---
const api = {
    async cargarEquipos() {
        try {
            const response = await fetch(`${SCRIPT_URL}?action=getBaseB`, {
                method: 'GET', headers: {'Cache-Control': 'no-cache'}
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const data = await response.json();
            items.forEach(item => Object.assign(item, {documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""}));
            
            if (!Array.isArray(data)) return actualizarVista();

            const estadosEquipos = {};
            data.forEach(fila => {
                if (!Array.isArray(fila) || fila.length < 8) return;
                const [marcaTemporal, equipo, nombreCompleto, documento, curso, profesorEncargado, materia, tipo] = fila;
                const numeroEquipo = equipo?.toString()?.trim();
                if (!numeroEquipo || !tipo) return;
                
                const fechaActual = parseSpanishDateTime(marcaTemporal);
                if (!estadosEquipos[numeroEquipo] || fechaActual > parseSpanishDateTime(estadosEquipos[numeroEquipo].timestamp)) {
                    estadosEquipos[numeroEquipo] = {
                        timestamp: marcaTemporal, nombreCompleto: nombreCompleto?.toString()?.trim() || "",
                        documento: documento?.toString()?.trim() || "", curso: curso?.toString()?.trim() || "",
                        profesor: profesorEncargado?.toString()?.trim() || "", materia: materia?.toString()?.trim() || "", tipo
                    };
                }
            });

            Object.entries(estadosEquipos).forEach(([numeroEquipo, estado]) => {
                if (estado.tipo === "Préstamo") {
                    const item = items.find(i => i.nombre === numeroEquipo);
                    if (item) Object.assign(item, {documento: estado.documento, profesor: estado.profesor, materia: estado.materia, nombreCompleto: estado.nombreCompleto, curso: estado.curso});
                }
            });
            actualizarVista();
        } catch (error) {
            mostrarError(`Error al cargar datos: ${error.message}`);
        }
    },

    async buscarEstudiante(documento) {
        try {
            if (!documento?.trim()) return {encontrado: false, error: 'Documento requerido'};
            const response = await fetch(`${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento.trim())}`, {
                method: 'GET', headers: {'Cache-Control': 'no-cache'}
            });
            if (!response.ok) return {encontrado: false, error: `Error del servidor: ${response.status}`};
            const data = await response.json();
            return data?.encontrado ? {nombreCompleto: data.nombreCompleto || 'Sin nombre', documento: data.documento || documento, curso: data.curso || 'Sin curso', encontrado: true} : {encontrado: false, error: data?.error || 'Estudiante no encontrado'};
        } catch (error) {
            return {encontrado: false, error: `Error de conexión: ${error.message}`};
        }
    },

    async guardarOperacion(item, tipo, datosEstudiante = {}, comentario = '') {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: new Date().toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric'}) + ' ' + new Date().toLocaleTimeString('es-ES', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'}),
            equipo: item.nombre, nombreCompleto: datosEstudiante.nombreCompleto || item.nombreCompleto || '',
            documento: datosEstudiante.documento || item.documento, curso: datosEstudiante.curso || item.curso || '',
            profesorEncargado: item.profesor, materia: item.materia, tipo, comentario
        };

        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: JSON.stringify(datos)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const resultado = await response.json();
            if (!resultado.success) throw new Error(resultado.error || 'Error desconocido');
            mostrarMensaje(`${tipo} registrado correctamente`, 'success');
        } catch (error) {
            mostrarError(`Error al registrar ${tipo.toLowerCase()}: ${error.message}`);
            throw error;
        }
    }
};

// --- MODAL FUNCTIONS ---
const crearInput = (id, label, type = 'text', placeholder = '', readonly = false, value = '') => 
    `<div><label for="${id}">${label}:</label>
    <${type === 'textarea' ? 'textarea' : 'input'} ${type === 'textarea' ? 'rows="3"' : `type="${type}"`} id="${id}" placeholder="${placeholder}" ${readonly ? 'readonly' : ''} value="${value}">${type === 'textarea' ? value : ''}</${type === 'textarea' ? 'textarea' : 'input'}>
    ${id === 'documento' ? '<small id="buscarInfo" style="color: #6c757d;">Ingrese el Documento para buscar automáticamente</small>' : ''}</div>`;

const crearBotones = (guardarText, guardarClass, onGuardar) => {
    const div = document.createElement('div');
    div.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';
    div.innerHTML = `<button id="btnGuardar" class="${guardarClass}" style="background-color: ${guardarClass === 'delete-modal-btn' ? '#dc3545' : '#007bff'}; color: white;">${guardarText}</button>
                     <button id="btnCancelar" style="background-color: #6c757d; color: white;">Cancelar</button>`;
    div.querySelector('#btnGuardar').onclick = onGuardar;
    div.querySelector('#btnCancelar').onclick = cerrarModal;
    return div;
};

function mostrarModalItem(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const tieneDocumento = item.documento && item.documento.trim() !== '';
    if (tieneDocumento) return mostrarModalDesmarcar(itemId);

    const modal = document.getElementById('modalMetodos');
    const container = document.getElementById('listaMetodos');
    if (!modal || !container) return;

    document.querySelector('.modal-header h2').textContent = `Equipo ${item.nombre}`;
    document.querySelector('.modal-body p').textContent = 'Complete la información del Préstamo:';

    const form = document.createElement('div');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 15px;';
    form.innerHTML = [
        crearInput('documento', 'Documento del Estudiante', 'text', 'Ingrese el número de documento...'),
        crearInput('profesor', 'Profesor(a) Encargado', 'text', 'Ingrese el nombre del profesor(a)...', false, item.profesor),
        crearInput('materia', 'Materia', 'text', 'Ingrese la materia...', false, item.materia)
    ].join('');

    let datosEstudiante = {}, timer;
    form.querySelector('#documento').oninput = async (e) => {
        const doc = e.target.value.trim();
        const info = document.getElementById('buscarInfo');
        clearTimeout(timer);
        datosEstudiante = {};

        if (doc.length >= 3) {
            info.textContent = 'Validando documento...';
            info.style.color = '#ffc107';
            timer = setTimeout(async () => {
                try {
                    const result = await api.buscarEstudiante(doc);
                    if (result.encontrado) {
                        datosEstudiante = {nombreCompleto: result.nombreCompleto, documento: result.documento, curso: result.curso, encontrado: true};
                        info.textContent = `✓ Estudiante: ${result.nombreCompleto} - Curso: ${result.curso}`;
                        info.style.color = '#28a745';
                    } else {
                        datosEstudiante = {encontrado: false};
                        info.textContent = `⚠ ${result.error || 'Documento no encontrado'}`;
                        info.style.color = '#dc3545';
                    }
                } catch (error) {
                    datosEstudiante = {encontrado: false};
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
        if (!doc || !prof || !mat) return alert('Complete todos los campos: Documento, Profesor y Materia');

        if (!datosEstudiante.encontrado && Object.keys(datosEstudiante).length === 0) {
            if (!confirm('No se encontró información del estudiante. ¿Desea continuar con el registro manual?')) return;
            datosEstudiante = {documento: doc, nombreCompleto: 'Registro Manual', curso: 'Por verificar'};
        } else if (datosEstudiante.encontrado === false) {
            if (!confirm('No se encontró el estudiante en la base de datos. ¿Desea continuar con el registro manual?')) return;
            datosEstudiante = {documento: doc, nombreCompleto: 'Registro Manual', curso: 'Por verificar'};
        }

        try {
            Object.assign(item, {documento: doc, profesor: prof, materia: mat, nombreCompleto: datosEstudiante.nombreCompleto, curso: datosEstudiante.curso});
            await api.guardarOperacion(item, 'Préstamo', datosEstudiante);
            cerrarModal();
            actualizarVista();
            setTimeout(() => api.cargarEquipos(), 1000);
        } catch (error) {
            Object.assign(item, {documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""});
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
    if (!modal || !container) return;

    const modalHeader = document.querySelector('.modal-header h2');
    const modalBody = document.querySelector('.modal-body p');
    if (modalHeader) modalHeader.textContent = `Devolver Equipo ${item.nombre}`;
    if (modalBody) modalBody.textContent = 'Información del Préstamo Activo:';

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
        if (!confirm(`¿Confirma la devolución del equipo ${item.nombre}?`)) return;

        try {
            await api.guardarOperacion(item, 'Devuelto', {}, comentario);
            Object.assign(item, {documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""});
            cerrarModal();
            actualizarVista();
            setTimeout(() => api.cargarEquipos(), 1000);
        } catch (error) {
            alert('Error al registrar la devolución. Intente nuevamente.');
        }
    }));

    container.innerHTML = '';
    container.appendChild(form);
    modal.style.display = 'block';
}

// --- UI FUNCTIONS ---
const actualizarVista = () => crearGrilla();

const crearGrilla = () => {
    const contenedor = document.getElementById("malla");
    if (!contenedor) return;
    contenedor.innerHTML = items.map(item => {
        const ocupado = item.documento && item.documento.trim() !== '';
        return `<div class="ramo" style="background-color: ${ocupado ? '#d4edda' : '#f8f9fa'}; border-color: ${ocupado ? '#28a745' : '#ccc'};" onclick="mostrarModalItem('${item.id}')">
                    <div style="font-weight: bold;">${item.nombre}</div>
                    <div style="color: ${ocupado ? 'green' : '#6c757d'};">${ocupado ? '✓' : '○'}</div>
                    ${ocupado ? `<div style="font-size: 0.8em; color: #666; margin-top: 5px;">${item.nombreCompleto}</div>` : ''}
                </div>`;
    }).join('');
};

const resetearMalla = () => {
    if (!confirm("⚠️ ATENCIÓN: Esto registrará la devolución de TODOS los equipos prestados. ¿Estás seguro?")) return;
    const comentarioMasivo = prompt("Comentario para devolución masiva (opcional):", "Devolución masiva - Fin de jornada");
    const equiposADevolver = items.filter(item => item.documento && item.documento.trim() !== '');
    
    if (!equiposADevolver.length) return alert("No hay equipos prestados para devolver.");

    let devueltos = 0;
    equiposADevolver.forEach(async item => {
        try {
            await api.guardarOperacion(item, 'Devuelto', {}, comentarioMasivo || '');
            Object.assign(item, {documento: "", profesor: "", materia: "", nombreCompleto: "", curso: ""});
            if (++devueltos === equiposADevolver.length) {
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
};

const cerrarModal = () => document.getElementById('modalMetodos').style.display = 'none';

// --- EVENT LISTENERS ---
window.onclick = e => e.target === document.getElementById('modalMetodos') && cerrarModal();
document.addEventListener('keydown', e => e.key === 'Escape' && cerrarModal());
document.addEventListener('DOMContentLoaded', () => {
    api.cargarEquipos();
    setInterval(api.cargarEquipos, 30000);
    window.addEventListener('online', () => {mostrarMensaje('Conexión restaurada', 'success'); api.cargarEquipos();});
    window.addEventListener('offline', () => mostrarError('Sin conexión a internet'));
});
