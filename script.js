// --- CONFIGURACIÓN ---
const CONFIG = {
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxPkJVdzy3dmbyfT8jUbaBbETPQc4aDoUGJUVqcsCRYUR8iU48rVCpU2_Va_mz1wtKIJA/exec',
    TOTAL_ITEMS: 50,
    REFRESH_INTERVAL: 30000,
    VALIDATION_DELAY: 800,
    MESSAGE_DURATION: 3000
};

// --- ESTADO GLOBAL ---
class EquipmentState {
    constructor() {
        this.items = Array.from({length: CONFIG.TOTAL_ITEMS}, (_, i) => ({
            id: `item_${i+1}`,
            nombre: `${i+1}`,
            documento: "",
            profesor: "",
            materia: "",
            nombreCompleto: "",
            curso: ""
        }));
        this.validationTimer = null;
        this.refreshInterval = null;
    }

    findItem(id) {
        return this.items.find(item => item.id === id);
    }

    updateItem(id, updates) {
        const item = this.findItem(id);
        if (item) {
            Object.assign(item, updates);
            return true;
        }
        return false;
    }

    clearItem(id) {
        return this.updateItem(id, {
            documento: "",
            profesor: "",
            materia: "",
            nombreCompleto: "",
            curso: ""
        });
    }

    getOccupiedItems() {
        return this.items.filter(item => item.documento?.trim());
    }

    clearAllItems() {
        this.items.forEach(item => Object.assign(item, {
            documento: "",
            profesor: "",
            materia: "",
            nombreCompleto: "",
            curso: ""
        }));
    }
}

const state = new EquipmentState();

// --- UTILIDADES ---
class Utils {
    static parseSpanishDateTime(str) {
        if (!str?.trim()) return new Date('1970-01-01');
        
        const [datePart, timePart] = str.split(' ');
        if (!datePart || !timePart) return new Date('1970-01-01');
        
        const [day, month, year] = datePart.split('/').map(Number);
        const [hour, minute, second] = timePart.split(':').map(Number);
        
        if ([day, month, year, hour, minute, second].some(isNaN)) {
            return new Date('1970-01-01');
        }
        
        return new Date(year, month - 1, day, hour, minute, second);
    }

    static getCurrentTimestamp() {
        const now = new Date();
        const date = now.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const time = now.toLocaleTimeString('es-ES', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return `${date} ${time}`;
    }

    static validateField(value, fieldName) {
        if (!value?.toString().trim()) {
            throw new Error(`El campo ${fieldName} es obligatorio`);
        }
        return value.toString().trim();
    }

    static debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(null, args), delay);
        };
    }
}

// --- SISTEMA DE MENSAJES ---
class MessageSystem {
    static show(mensaje, tipo = 'info') {
        const colors = {
            'success': '#28a745',
            'error': '#dc3545',
            'warning': '#ffc107',
            'info': '#007bff'
        };

        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            font-weight: 500;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 350px;
            word-wrap: break-word;
            background-color: ${colors[tipo] || colors.info};
            animation: slideIn 0.3s ease-out;
        `;
        
        div.textContent = mensaje;
        document.body.appendChild(div);
        
        setTimeout(() => {
            if (div.parentNode) {
                div.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => div.remove(), 300);
            }
        }, CONFIG.MESSAGE_DURATION);
    }

    static showError(mensaje) {
        this.show(mensaje, 'error');
    }

    static showSuccess(mensaje) {
        this.show(mensaje, 'success');
    }

    static showWarning(mensaje) {
        this.show(mensaje, 'warning');
    }
}

// --- API MEJORADA ---
class EquipmentAPI {
    static async makeRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        try {
            const response = await fetch(url, {...defaultOptions, ...options});
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Sin conexión a internet');
            }
            throw error;
        }
    }

    static async cargarEquipos() {
        try {
            const data = await this.makeRequest(`${CONFIG.SCRIPT_URL}?action=getBaseB`);
            
            // Limpiar estado actual
            state.clearAllItems();
            
            if (!Array.isArray(data)) {
                UI.actualizarVista();
                return;
            }

            // Procesar datos y mantener solo el estado más reciente por equipo
            const estadosEquipos = this.procesarDatosEquipos(data);
            this.aplicarEstadosAItems(estadosEquipos);
            
            UI.actualizarVista();
        } catch (error) {
            MessageSystem.showError(`Error al cargar datos: ${error.message}`);
            console.error('Error cargando equipos:', error);
        }
    }

    static procesarDatosEquipos(data) {
        const estadosEquipos = {};
        
        data.forEach(fila => {
            if (!Array.isArray(fila) || fila.length < 8) return;
            
            const [marcaTemporal, equipo, nombreCompleto, documento, curso, profesorEncargado, materia, tipo] = fila;
            const numeroEquipo = equipo?.toString()?.trim();
            
            if (!numeroEquipo || !tipo) return;
            
            const fechaActual = Utils.parseSpanishDateTime(marcaTemporal);
            const estadoExistente = estadosEquipos[numeroEquipo];
            
            if (!estadoExistente || fechaActual > Utils.parseSpanishDateTime(estadoExistente.timestamp)) {
                estadosEquipos[numeroEquipo] = {
                    timestamp: marcaTemporal,
                    nombreCompleto: nombreCompleto?.toString()?.trim() || "",
                    documento: documento?.toString()?.trim() || "",
                    curso: curso?.toString()?.trim() || "",
                    profesor: profesorEncargado?.toString()?.trim() || "",
                    materia: materia?.toString()?.trim() || "",
                    tipo: tipo.toString().trim()
                };
            }
        });
        
        return estadosEquipos;
    }

    static aplicarEstadosAItems(estadosEquipos) {
        Object.entries(estadosEquipos).forEach(([numeroEquipo, estado]) => {
            if (estado.tipo === "Préstamo") {
                const item = state.items.find(i => i.nombre === numeroEquipo);
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
    }

    static async buscarEstudiante(documento) {
        try {
            const docTrim = Utils.validateField(documento, 'documento');
            
            const data = await this.makeRequest(
                `${CONFIG.SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(docTrim)}`
            );
            
            if (data?.encontrado) {
                return {
                    nombreCompleto: data.nombreCompleto || 'Sin nombre',
                    documento: data.documento || docTrim,
                    curso: data.curso || 'Sin curso',
                    encontrado: true
                };
            } else {
                return {
                    encontrado: false,
                    error: data?.error || 'Estudiante no encontrado'
                };
            }
        } catch (error) {
            return {
                encontrado: false,
                error: `Error de conexión: ${error.message}`
            };
        }
    }

    static async guardarOperacion(item, tipo, datosEstudiante = {}, comentario = '') {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: Utils.getCurrentTimestamp(),
            equipo: item.nombre,
            nombreCompleto: datosEstudiante.nombreCompleto || item.nombreCompleto || '',
            documento: datosEstudiante.documento || item.documento,
            curso: datosEstudiante.curso || item.curso || '',
            profesorEncargado: item.profesor,
            materia: item.materia,
            tipo,
            comentario: comentario.trim()
        };

        try {
            const resultado = await this.makeRequest(CONFIG.SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(datos)
            });
            
            if (!resultado.success) {
                throw new Error(resultado.error || 'Error desconocido del servidor');
            }
            
            MessageSystem.showSuccess(`${tipo} registrado correctamente`);
            return resultado;
        } catch (error) {
            MessageSystem.showError(`Error al registrar ${tipo.toLowerCase()}: ${error.message}`);
            throw error;
        }
    }
}

// --- COMPONENTES UI ---
class FormBuilder {
    static crearInput(id, label, type = 'text', placeholder = '', readonly = false, value = '') {
        const inputTag = type === 'textarea' ? 'textarea' : 'input';
        const typeAttr = type === 'textarea' ? '' : `type="${type}"`;
        const rowsAttr = type === 'textarea' ? 'rows="3"' : '';
        
        return `
            <div class="form-group">
                <label for="${id}">${label}:</label>
                <${inputTag} 
                    ${typeAttr} 
                    ${rowsAttr}
                    id="${id}" 
                    placeholder="${placeholder}" 
                    ${readonly ? 'readonly' : ''} 
                    value="${type !== 'textarea' ? value : ''}"
                >${type === 'textarea' ? value : ''}</${inputTag}>
                ${id === 'documento' ? '<small id="buscarInfo" class="form-help">Ingrese el documento para buscar automáticamente</small>' : ''}
            </div>
        `;
    }

    static crearBotones(guardarText, guardarClass, onGuardar) {
        const div = document.createElement('div');
        div.className = 'form-buttons';
        div.innerHTML = `
            <button id="btnGuardar" class="btn ${guardarClass}">
                ${guardarText}
            </button>
            <button id="btnCancelar" class="btn btn-secondary">
                Cancelar
            </button>
        `;
        
        div.querySelector('#btnGuardar').onclick = onGuardar;
        div.querySelector('#btnCancelar').onclick = () => ModalManager.cerrar();
        
        return div;
    }
}

// --- GESTOR DE MODALES ---
class ModalManager {
    static mostrarItem(itemId) {
        const item = state.findItem(itemId);
        if (!item) return;

        const tieneDocumento = item.documento?.trim();
        if (tieneDocumento) {
            return this.mostrarDevolverEquipo(itemId);
        } else {
            return this.mostrarPrestarEquipo(itemId);
        }
    }

    static mostrarPrestarEquipo(itemId) {
        const item = state.findItem(itemId);
        if (!item) return;

        const modal = document.getElementById('modalMetodos');
        const container = document.getElementById('listaMetodos');
        if (!modal || !container) return;

        this.configurarModal(`Equipo ${item.nombre}`, 'Complete la información del Préstamo:');

        const form = document.createElement('div');
        form.className = 'modal-form';
        form.innerHTML = [
            FormBuilder.crearInput('documento', 'Documento del Estudiante', 'text', 'Ingrese el número de documento...'),
            FormBuilder.crearInput('profesor', 'Profesor(a) Encargado', 'text', 'Ingrese el nombre del profesor(a)...', false, item.profesor),
            FormBuilder.crearInput('materia', 'Materia', 'text', 'Ingrese la materia...', false, item.materia)
        ].join('');

        this.configurarValidacionDocumento(form);
        
        form.appendChild(FormBuilder.crearBotones('Registrar Préstamo', 'btn-primary', 
            () => this.procesarPrestamo(item, form)
        ));

        container.innerHTML = '';
        container.appendChild(form);
        modal.style.display = 'block';
    }

    static mostrarDevolverEquipo(itemId) {
        const item = state.findItem(itemId);
        if (!item) return;

        const modal = document.getElementById('modalMetodos');
        const container = document.getElementById('listaMetodos');
        if (!modal || !container) return;

        this.configurarModal(`Devolver Equipo ${item.nombre}`, 'Información del Préstamo Activo:');

        const form = document.createElement('div');
        form.className = 'modal-form';
        form.innerHTML = `
            <div class="readonly-info">
                <div class="info-item">
                    <strong>Estudiante:</strong>
                    <div class="info-content">${item.nombreCompleto || 'Sin información'}</div>
                </div>
                <div class="info-item">
                    <strong>Documento:</strong>
                    <div class="info-content">${item.documento || 'Sin información'}</div>
                </div>
                <div class="info-item">
                    <strong>Curso:</strong>
                    <div class="info-content">${item.curso || 'Sin información'}</div>
                </div>
                <div class="info-item">
                    <strong>Profesor(a):</strong>
                    <div class="info-content">${item.profesor || 'Sin profesor'}</div>
                </div>
                <div class="info-item">
                    <strong>Materia:</strong>
                    <div class="info-content">${item.materia || 'Sin materia'}</div>
                </div>
            </div>
            ${FormBuilder.crearInput('comentario', 'Comentario de Devolución (opcional)', 'textarea', 'Observaciones sobre el estado del equipo...')}
        `;

        form.appendChild(FormBuilder.crearBotones('Registrar Devolución', 'btn-danger',
            () => this.procesarDevolucion(item)
        ));

        container.innerHTML = '';
        container.appendChild(form);
        modal.style.display = 'block';
    }

    static configurarModal(titulo, descripcion) {
        const modalHeader = document.querySelector('.modal-header h2');
        const modalBody = document.querySelector('.modal-body p');
        
        if (modalHeader) modalHeader.textContent = titulo;
        if (modalBody) modalBody.textContent = descripcion;
    }

    static configurarValidacionDocumento(form) {
        let datosEstudiante = {};
        
        const documentoInput = form.querySelector('#documento');
        const info = form.querySelector('#buscarInfo');
        
        if (!documentoInput || !info) return;

        const validarDocumento = Utils.debounce(async (documento) => {
            if (!documento?.trim() || documento.length < 3) {
                datosEstudiante = {};
                info.textContent = 'Ingrese el documento para buscar automáticamente';
                info.className = 'form-help';
                return;
            }

            info.textContent = 'Validando documento...';
            info.className = 'form-help validating';

            try {
                const result = await EquipmentAPI.buscarEstudiante(documento);
                
                if (result.encontrado) {
                    datosEstudiante = {
                        nombreCompleto: result.nombreCompleto,
                        documento: result.documento,
                        curso: result.curso,
                        encontrado: true
                    };
                    info.textContent = `✓ Estudiante: ${result.nombreCompleto} - Curso: ${result.curso}`;
                    info.className = 'form-help success';
                } else {
                    datosEstudiante = { encontrado: false };
                    info.textContent = `⚠ ${result.error || 'Documento no encontrado'}`;
                    info.className = 'form-help error';
                }
            } catch (error) {
                datosEstudiante = { encontrado: false };
                info.textContent = '⚠ Error en validación - Intente nuevamente';
                info.className = 'form-help error';
            }
        }, CONFIG.VALIDATION_DELAY);

        documentoInput.addEventListener('input', (e) => validarDocumento(e.target.value));
        
        // Almacenar referencia para usar en procesarPrestamo
        form.datosEstudiante = () => datosEstudiante;
    }

    static async procesarPrestamo(item, form) {
        try {
            const documento = Utils.validateField(document.getElementById('documento').value, 'Documento');
            const profesor = Utils.validateField(document.getElementById('profesor').value, 'Profesor');
            const materia = Utils.validateField(document.getElementById('materia').value, 'Materia');

            let datosEstudiante = form.datosEstudiante ? form.datosEstudiante() : {};

            // Validar datos del estudiante
            if (!datosEstudiante.encontrado && Object.keys(datosEstudiante).length === 0) {
                if (!confirm('No se encontró información del estudiante. ¿Desea continuar con el registro manual?')) {
                    return;
                }
                datosEstudiante = {
                    documento,
                    nombreCompleto: 'Registro Manual',
                    curso: 'Por verificar'
                };
            } else if (datosEstudiante.encontrado === false) {
                if (!confirm('No se encontró el estudiante en la base de datos. ¿Desea continuar con el registro manual?')) {
                    return;
                }
                datosEstudiante = {
                    documento,
                    nombreCompleto: 'Registro Manual',
                    curso: 'Por verificar'
                };
            }

            // Actualizar item temporalmente
            state.updateItem(item.id, {
                documento,
                profesor,
                materia,
                nombreCompleto: datosEstudiante.nombreCompleto,
                curso: datosEstudiante.curso
            });

            await EquipmentAPI.guardarOperacion(item, 'Préstamo', datosEstudiante);
            
            this.cerrar();
            UI.actualizarVista();
            
            // Refrescar después de un tiempo para asegurar consistencia
            setTimeout(() => EquipmentAPI.cargarEquipos(), 1000);
            
        } catch (error) {
            // Revertir cambios en caso de error
            state.clearItem(item.id);
            alert(`Error al registrar el préstamo: ${error.message}`);
        }
    }

    static async procesarDevolucion(item) {
        const comentario = document.getElementById('comentario')?.value?.trim() || '';
        
        if (!confirm(`¿Confirma la devolución del equipo ${item.nombre}?`)) {
            return;
        }

        try {
            await EquipmentAPI.guardarOperacion(item, 'Devuelto', {}, comentario);
            
            state.clearItem(item.id);
            
            this.cerrar();
            UI.actualizarVista();
            
            setTimeout(() => EquipmentAPI.cargarEquipos(), 1000);
            
        } catch (error) {
            alert(`Error al registrar la devolución: ${error.message}`);
        }
    }

    static cerrar() {
        const modal = document.getElementById('modalMetodos');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// --- INTERFAZ DE USUARIO ---
class UI {
    static actualizarVista() {
        this.crearGrilla();
    }

    static crearGrilla() {
        const contenedor = document.getElementById("malla");
        if (!contenedor) return;

        contenedor.innerHTML = state.items.map(item => {
            const ocupado = item.documento?.trim();
            return `
                <div class="ramo ${ocupado ? 'ocupado' : 'libre'}" 
                     onclick="ModalManager.mostrarItem('${item.id}')"
                     title="${ocupado ? `Prestado a: ${item.nombreCompleto}` : 'Disponible'}">
                    <div class="numero-equipo">${item.nombre}</div>
                    <div class="estado-icono">${ocupado ? '✓' : '○'}</div>
                    ${ocupado ? `<div class="info-estudiante">${item.nombreCompleto}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    static async resetearMalla() {
        const equiposOcupados = state.getOccupiedItems();
        
        if (!equiposOcupados.length) {
            alert("No hay equipos prestados para devolver.");
            return;
        }

        if (!confirm(`⚠️ ATENCIÓN: Esto registrará la devolución de ${equiposOcupados.length} equipos prestados. ¿Estás seguro?`)) {
            return;
        }

        const comentarioMasivo = prompt("Comentario para devolución masiva (opcional):", "Devolución masiva - Fin de jornada") || '';

        let procesados = 0;
        let errores = 0;

        for (const item of equiposOcupados) {
            try {
                await EquipmentAPI.guardarOperacion(item, 'Devuelto', {}, comentarioMasivo);
                state.clearItem(item.id);
                procesados++;
            } catch (error) {
                console.error(`Error al devolver equipo ${item.nombre}:`, error);
                errores++;
            }
        }

        // Actualizar vista y mostrar resultados
        this.actualizarVista();
        
        if (errores === 0) {
            MessageSystem.showSuccess(`Se devolvieron ${procesados} equipos correctamente`);
        } else {
            MessageSystem.showWarning(`Se devolvieron ${procesados} equipos. ${errores} equipos tuvieron errores.`);
        }

        // Refrescar datos
        setTimeout(() => EquipmentAPI.cargarEquipos(), 1000);
    }
}

// --- INICIALIZACIÓN Y EVENTOS ---
class AppManager {
    static init() {
        this.setupEventListeners();
        this.startApp();
    }

    static setupEventListeners() {
        // Cerrar modal con click fuera o ESC
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('modalMetodos')) {
                ModalManager.cerrar();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ModalManager.cerrar();
            }
        });

        // Eventos de conectividad
        window.addEventListener('online', () => {
            MessageSystem.showSuccess('Conexión restaurada');
            EquipmentAPI.cargarEquipos();
        });

        window.addEventListener('offline', () => {
            MessageSystem.showError('Sin conexión a internet');
        });

        // Prevenir pérdida de datos
        window.addEventListener('beforeunload', (e) => {
            const equiposOcupados = state.getOccupiedItems().length;
            if (equiposOcupados > 0) {
                e.preventDefault();
                e.returnValue = `Hay ${equiposOcupados} equipos prestados. ¿Está seguro de salir?`;
            }
        });
    }

    static async startApp() {
        try {
            await EquipmentAPI.cargarEquipos();
            
            // Configurar actualización automática
            state.refreshInterval = setInterval(() => {
                EquipmentAPI.cargarEquipos();
            }, CONFIG.REFRESH_INTERVAL);
            
            console.log('Sistema de gestión de equipos iniciado correctamente');
        } catch (error) {
            console.error('Error al iniciar la aplicación:', error);
            MessageSystem.showError('Error al inicializar el sistema');
        }
    }

    static destroy() {
        if (state.refreshInterval) {
            clearInterval(state.refreshInterval);
        }
        if (state.validationTimer) {
            clearTimeout(state.validationTimer);
        }
    }
}

// --- FUNCIONES GLOBALES PARA COMPATIBILIDAD ---
window.mostrarModalItem = (itemId) => ModalManager.mostrarItem(itemId);
window.resetearMalla = () => UI.resetearMalla();

// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => AppManager.init());

// Cleanup al descargar la página
window.addEventListener('beforeunload', () => AppManager.destroy());
