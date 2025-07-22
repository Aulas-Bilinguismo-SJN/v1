// --- CONFIGURACIÓN ---
const CONFIG = {
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyuGDm29g7Xs3OE_vF1NyQyMYcucZpWIwxL2KMJU5BYL4nZCvo1R86m8dSQFpYEW8UYcA/exec',
    TOTAL_ITEMS: 50,
    REFRESH_INTERVAL: 30000,
    VALIDATION_DELAY: 800,
    MESSAGE_DURATION: 3000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000
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
        this.isOnline = navigator.onLine;
        this.lastSuccessfulSync = null;
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

    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

// --- DIAGNÓSTICO DE CONECTIVIDAD ---
class ConnectivityDiagnostic {
    static async testConnection() {
        const tests = [
            { name: 'Internet básico', test: () => this.testBasicInternet() },
            { name: 'Google Apps Script', test: () => this.testGoogleScript() },
            { name: 'CORS y políticas', test: () => this.testCORS() }
        ];

        const results = [];
        
        for (const testCase of tests) {
            try {
                const result = await testCase.test();
                results.push({ name: testCase.name, status: 'OK', details: result });
            } catch (error) {
                results.push({ name: testCase.name, status: 'ERROR', error: error.message });
            }
        }

        return results;
    }

    static async testBasicInternet() {
        const response = await fetch('https://www.google.com/favicon.ico', { 
            mode: 'no-cors',
            cache: 'no-cache'
        });
        return 'Conectividad básica OK';
    }

    static async testGoogleScript() {
        // Probar con un timeout más corto para diagnóstico
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(`${CONFIG.SCRIPT_URL}?action=test`, {
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return 'Google Apps Script accesible';
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Timeout - El script no responde');
            }
            throw error;
        }
    }

    static async testCORS() {
        // Verificar si hay problemas de CORS
        try {
            const response = await fetch(CONFIG.SCRIPT_URL, {
                method: 'OPTIONS'
            });
            return 'CORS configurado correctamente';
        } catch (error) {
            if (error.message.includes('CORS')) {
                throw new Error('Problema de CORS detectado');
            }
            return 'CORS test inconcluso';
        }
    }

    static async showDiagnosticReport() {
        MessageSystem.show('Ejecutando diagnóstico de conectividad...', 'info');
        
        const results = await this.testConnection();
        let reportHTML = '<div style="background: white; color: black; padding: 20px; border-radius: 8px; max-width: 500px;">';
        reportHTML += '<h3 style="margin-top: 0;">Diagnóstico de Conectividad</h3>';
        
        results.forEach(result => {
            const statusColor = result.status === 'OK' ? '#28a745' : '#dc3545';
            reportHTML += `<div style="margin: 10px 0; padding: 8px; border-left: 4px solid ${statusColor};">`;
            reportHTML += `<strong>${result.name}:</strong> `;
            reportHTML += `<span style="color: ${statusColor}">${result.status}</span>`;
            if (result.error) {
                reportHTML += `<br><small style="color: #666">${result.error}</small>`;
            }
            reportHTML += '</div>';
        });
        
        reportHTML += '</div>';
        
        // Crear modal personalizado para el reporte
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
        `;
        modal.innerHTML = reportHTML;
        
        modal.addEventListener('click', () => modal.remove());
        document.body.appendChild(modal);
        
        setTimeout(() => modal.remove(), 10000);
    }
}

// --- API MEJORADA CON REINTENTOS ---
class EquipmentAPI {
    static async makeRequest(url, options = {}, retryCount = 0) {
        const defaultOptions = {
            headers: {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // Agregar timeout
            signal: AbortSignal.timeout(15000)
        };

        try {
            const response = await fetch(url, {...defaultOptions, ...options});
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Marcar último sync exitoso
            state.lastSuccessfulSync = new Date();
            
            return data;
        } catch (error) {
            // Lógica de reintentos
            if (retryCount < CONFIG.MAX_RETRIES && this.shouldRetry(error)) {
                console.log(`Reintento ${retryCount + 1}/${CONFIG.MAX_RETRIES} para: ${url}`);
                await Utils.sleep(CONFIG.RETRY_DELAY * (retryCount + 1));
                return this.makeRequest(url, options, retryCount + 1);
            }
            
            // Clasificar tipos de error
            if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                throw new Error('Timeout - El servidor no responde');
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Sin conexión a internet');
            } else if (error.message.includes('CORS')) {
                throw new Error('Error de CORS - Verificar configuración del script');
            }
            
            throw error;
        }
    }

    static shouldRetry(error) {
        // Reintentar en casos de timeout, problemas de red, pero no en errores HTTP 4xx
        return error.name === 'AbortError' || 
               error.name === 'TimeoutError' || 
               (error.name === 'TypeError' && error.message.includes('fetch'));
    }

    static async cargarEquipos() {
        try {
            // Mostrar indicador de carga si es el primer intento
            if (!state.lastSuccessfulSync) {
                MessageSystem.show('Cargando equipos...', 'info');
            }

            const data = await this.makeRequest(`${CONFIG.SCRIPT_URL}?action=getBaseB`);
            
            // Limpiar estado actual
            state.clearAllItems();
            
            if (!Array.isArray(data)) {
                UI.actualizarVista();
                MessageSystem.showWarning('No se encontraron datos de equipos');
                return;
            }

            // Procesar datos y mantener solo el estado más reciente por equipo
            const estadosEquipos = this.procesarDatosEquipos(data);
            this.aplicarEstadosAItems(estadosEquipos);
            
            UI.actualizarVista();
            
            // Mostrar éxito solo en la primera carga
            if (!state.lastSuccessfulSync) {
                MessageSystem.showSuccess('Equipos cargados correctamente');
            }
            
        } catch (error) {
            const errorMsg = `Error al cargar datos: ${error.message}`;
            MessageSystem.showError(errorMsg);
            console.error('Error cargando equipos:', error);
            
            // Ofrecer diagnóstico en caso de error persistente
            if (!state.lastSuccessfulSync) {
                setTimeout(() => {
                    if (confirm('¿Desea ejecutar un diagnóstico de conectividad?')) {
                        ConnectivityDiagnostic.showDiagnosticReport();
                    }
                }, 2000);
            }
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
        this.actualizarEstadoConexion();
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

    static actualizarEstadoConexion() {
        // Crear indicador de estado si no existe
        let indicator = document.getElementById('connection-status');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'connection-status';
            indicator.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                z-index: 1000;
                cursor: pointer;
            `;
            document.body.appendChild(indicator);
        }

        const isConnected = state.isOnline && state.lastSuccessfulSync;
        const statusText = isConnected ? 'Conectado' : 'Sin conexión';
        const statusColor = isConnected ? '#28a745' : '#dc3545';

        indicator.textContent = statusText;
        indicator.style.backgroundColor = statusColor;
        indicator.style.color = 'white';
        
        // Agregar evento click para diagnóstico
        indicator.onclick = () => {
            if (!isConnected) {
                ConnectivityDiagnostic.showDiagnosticReport();
            }
        };
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
        this.setupConnectionMonitoring();
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

        // Prevenir pérdida de datos
        window.addEventListener('beforeunload', (e) => {
            const equiposOcupados = state.getOccupiedItems().length;
            if (equiposOcupados > 0) {
                e.preventDefault();
                e.returnValue = `Hay ${equiposOcupados} equipos prestados. ¿Está seguro de salir?`;
            }
        });

        // Agregar botón de diagnóstico manual
        this.addDiagnosticButton();
    }

    static setupConnectionMonitoring() {
        // Eventos de conectividad
        window.addEventListener('online', () => {
            state.isOnline = true;
            MessageSystem.showSuccess('Conexión restaurada');
            UI.actualizarVista();
            EquipmentAPI.cargarEquipos();
        });

        window.addEventListener('offline', () => {
            state.isOnline = false;
            MessageSystem.showError('Sin conexión a internet');
            UI.actualizarVista();
        });

        // Actualizar estado inicial
        state.isOnline = navigator.onLine;
    }

    static addDiagnosticButton() {
        // Crear botón de diagnóstico en el header o donde corresponda
        const diagnosticBtn = document.createElement('button');
        diagnosticBtn.textContent = '🔧 Diagnóstico';
        diagnosticBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 10px 15px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            z-index: 1000;
        `;
        diagnosticBtn.onclick = () => ConnectivityDiagnostic.showDiagnosticReport();
        document.body.appendChild(diagnosticBtn);
    }

    static async startApp() {
        try {
            // Mostrar mensaje de inicio
            MessageSystem.show('Iniciando sistema...', 'info');
            
            await EquipmentAPI.cargarEquipos();
            
            // Configurar actualización automática solo si hay conexión
            if (state.isOnline) {
                state.refreshInterval = setInterval(() => {
                    if (state.isOnline) {
                        EquipmentAPI.cargarEquipos();
                    }
                }, CONFIG.REFRESH_INTERVAL);
            }
            
            console.log('Sistema de gestión de equipos iniciado correctamente');
        } catch (error) {
            console.error('Error al iniciar la aplicación:', error);
            MessageSystem.showError('Error al inicializar el sistema');
            
            // Ofrecer modo offline o diagnóstico
            setTimeout(() => {
                if (confirm('¿Desea ver el diagnóstico de conectividad?')) {
                    ConnectivityDiagnostic.showDiagnosticReport();
                }
            }, 2000);
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
window.runDiagnostic = () => ConnectivityDiagnostic.showDiagnosticReport();

// --- INICIO DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => AppManager.init());

// Cleanup al descargar la página
window.addEventListener('beforeunload', () => AppManager.destroy());

// Agregar estilos CSS adicionales para el diagnóstico
const diagnosticStyles = document.createElement('style');
diagnosticStyles.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .form-help.validating {
        color: #007bff !important;
        font-style: italic;
    }
    
    .form-help.success {
        color: #28a745 !important;
    }
    
    .form-help.error {
        color: #dc3545 !important;
    }
    
    #connection-status:hover {
        opacity: 0.8;
        transform: scale(1.05);
        transition: all 0.2s;
    }
`;
document.head.appendChild(diagnosticStyles);
