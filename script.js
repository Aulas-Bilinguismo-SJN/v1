// --- CONFIGURACIÓN ---
const CONFIG = {
    TOTAL_ITEMS: 50,
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyuGDm29g7Xs3OE_vF1NyQyMYcucZpWIwxL2KMJU5BYL4nZCvo1R86m8dSQFpYEW8UYcA/exec',
    SYNC_INTERVAL: 2000,
    LOCALE: 'es-ES'
};

// Estado de la aplicación
const state = {
    items: Array.from({length: CONFIG.TOTAL_ITEMS}, (_, i) => ({
        id: `item_${i+1}`,
        nombre: `${i+1}`,
        documento: "",
        profesor: "",
        materia: "",
        nombreCompleto: "",
        curso: ""
    })),
    syncInProgress: false,
    lastSyncTime: null
};

// --- UTILIDADES ---
const utils = {
    formatDateTime(date = new Date()) {
        const dateStr = date.toLocaleDateString(CONFIG.LOCALE, {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString(CONFIG.LOCALE, {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return `${dateStr} ${timeStr}`;
    },

    createItemStructure() {
        return {
            documento: "", 
            profesor: "", 
            materia: "",
            nombreCompleto: "",
            curso: ""
        };
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    validateDocument(documento) {
        return documento && documento.toString().trim() !== '';
    }
};

// --- API OPTIMIZADA ---
const api = {
    cache: new Map(),
    
    async request(url, options = {}) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    async cargarEquipos() {
        if (state.syncInProgress) return;
        
        state.syncInProgress = true;
        try {
            const data = await this.request(`${CONFIG.SCRIPT_URL}?action=getBaseB`);
            this.procesarDatosEquipos(data);
            state.lastSyncTime = new Date();
            actualizarVista(); // <---- llama a la función para renderizar
        } catch (error) {
            console.error("Error al cargar equipos:", error);
        } finally {
            state.syncInProgress = false;
        }
    },

    procesarDatosEquipos(data) {
        // Resetear items de forma eficiente
        state.items.forEach(item => Object.assign(item, utils.createItemStructure()));

        if (!Array.isArray(data)) return;

        // Procesar estados más recientes por equipo
        const estadosEquipos = data.reduce((acc, fila) => {
            if (!this.validarFilaDatos(fila)) return acc;

            const [timestamp, numeroEquipo, nombreCompleto, documento, curso, profesor, materia, tipo, comentario] = fila;
            const equipoKey = numeroEquipo.toString();

            // Solo mantener el registro más reciente
            if (!acc[equipoKey] || new Date(timestamp) > new Date(acc[equipoKey].timestamp)) {
                acc[equipoKey] = {
                    timestamp,
                    nombreCompleto: nombreCompleto || "",
                    documento: documento || "",
                    curso: curso || "",
                    profesor: profesor || "",
                    materia: materia || "",
                    tipo: tipo || "",
                    comentario: comentario || ""
                };
            }
            return acc;
        }, {});

        // Aplicar solo equipos en préstamo
        this.aplicarEstadosPrestamo(estadosEquipos);
    },

    validarFilaDatos(fila) {
        return Array.isArray(fila) && 
               fila.length >= 8 && 
               fila[1] && 
               fila[7];
    },

    aplicarEstadosPrestamo(estadosEquipos) {
        Object.entries(estadosEquipos)
            .filter(([, estado]) => estado.tipo === "Préstamo")
            .forEach(([numeroEquipo, estado]) => {
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
            });
    },

    async buscarEstudiante(documento) {
        if (!utils.validateDocument(documento)) {
            return {encontrado: false, error: 'Documento requerido'};
        }

        const docKey = documento.toString().trim();
        
        // Verificar cache
        if (this.cache.has(docKey)) {
            const cached = this.cache.get(docKey);
            if (Date.now() - cached.timestamp < 300000) { // Cache por 5 minutos
                return cached.data;
            }
        }

        try {
            const url = `${CONFIG.SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(docKey)}`;
            const data = await this.request(url);

            const result = data?.encontrado ? {
                nombreCompleto: data.nombreCompleto || 'Sin nombre',
                documento: data.documento || docKey,
                curso: data.curso || 'Sin curso',
                encontrado: true
            } : {
                encontrado: false, 
                error: data?.error || 'Estudiante no encontrado'
            };

            // Guardar en cache
            this.cache.set(docKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error al buscar estudiante:', error);
            return {encontrado: false, error: error.message};
        }
    },

    async guardarRegistro(item, datosEstudiante, tipo, comentario = '') {
        const datos = {
            action: 'saveToBaseB',
            marcaTemporal: utils.formatDateTime(),
            equipo: item.nombre,
            nombreCompleto: datosEstudiante?.nombreCompleto || item.nombreCompleto || '',
            documento: datosEstudiante?.documento || item.documento || '',
            curso: datosEstudiante?.curso || item.curso || '',
            profesorEncargado: item.profesor || '',
            materia: item.materia || '',
            tipo,
            comentario
        };

        try {
            await this.request(CONFIG.SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(datos)
            });
            
            console.log(`${tipo} registrado:`, datos);
            
            // Invalidar cache si es necesario
            if (datosEstudiante?.documento) {
                this.cache.delete(datosEstudiante.documento.toString());
            }
            
        } catch (error) {
            console.error(`Error al guardar ${tipo.toLowerCase()}:`, error);
            throw error;
        }
    },

    async guardarPrestamo(item, datosEstudiante) {
        return this.guardarRegistro(item, datosEstudiante, 'Préstamo');
    },

    async guardarDevolucion(item, comentario = '') {
        return this.guardarRegistro(item, null, 'Devuelto', comentario);
    }
};

// --- GESTIÓN DE UI ---
const ui = {
    elementos: {},

    init() {
        this.elementos.modal = document.getElementById('modalMetodos');
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Event listeners optimizados
        window.addEventListener('click', (e) => {
            if (e.target === this.elementos.modal) {
                this.cerrarModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cerrarModal();
            }
        });

        // Debounce para búsquedas
        this.busquedaDebounced = utils.debounce(this.realizarBusqueda.bind(this), 300);
    },

    cerrarModal() {
        if (this.elementos.modal) {
            this.elementos.modal.style.display = 'none';
        }
    },

    async realizarBusqueda(documento, callback) {
        if (!utils.validateDocument(documento)) {
            callback({encontrado: false, error: 'Documento requerido'});
            return;
        }

        try {
            const resultado = await api.buscarEstudiante(documento);
            callback(resultado);
        } catch (error) {
            callback({encontrado: false, error: 'Error en la búsqueda'});
        }
    },

    mostrarEstadoSincronizacion() {
        const statusElement = document.getElementById('sync-status');
        if (statusElement) {
            statusElement.textContent = state.syncInProgress ? 
                'Sincronizando...' : 
                `Última sync: ${state.lastSyncTime ? state.lastSyncTime.toLocaleTimeString() : 'Nunca'}`;
        }
    }
};

// --- FUNCIONES DE VISTA ---
// ¡NUEVO! Renderizar las casillas/equipos en el grid
function actualizarVista() {
    ui.mostrarEstadoSincronizacion();

    const malla = document.getElementById('malla');
    if (!malla) return;
    malla.innerHTML = '';

    state.items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'ramo';
        if (item.nombreCompleto) {
            // Si está prestado, color verde y nombre
            div.style.backgroundColor = 'var(--success)';
            div.innerHTML = `
                <div>Equipo ${item.nombre}</div>
                <div>Prestado a:<br>${item.nombreCompleto}</div>
            `;
        } else {
            div.innerHTML = `
                <div>Equipo ${item.nombre}</div>
                <div>Disponible</div>
            `;
        }
        malla.appendChild(div);
    });
}

// --- INICIALIZACIÓN ---
class PrestamosApp {
    constructor() {
        this.syncInterval = null;
    }

    async init() {
        console.log('Iniciando sistema de préstamos...');
        
        ui.init();
        
        try {
            await api.cargarEquipos();
            this.startAutoSync();
            console.log('Sistema inicializado correctamente');
        } catch (error) {
            console.error('Error durante la inicialización:', error);
        }
    }

    startAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        this.syncInterval = setInterval(async () => {
            try {
                await api.cargarEquipos();
            } catch (error) {
                console.error('Error en sincronización automática:', error);
            }
        }, CONFIG.SYNC_INTERVAL);
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}

// --- INICIALIZACIÓN GLOBAL ---
const prestamosApp = new PrestamosApp();

document.addEventListener('DOMContentLoaded', () => {
    prestamosApp.init();
});

// Cleanup al cerrar la página
window.addEventListener('beforeunload', () => {
    prestamosApp.stop();
});

// Exportar para uso global (si es necesario)
window.PrestamosSystem = {
    api,
    ui,
    state,
    utils,
    app: prestamosApp
};

// --- OPCIONAL ---
// Si quieres permitir que las casillas abran el modal al hacer clic,
// puedes agregar un eventListener en el render de cada casilla dentro de actualizarVista()
// por ejemplo:
// div.addEventListener('click', () => { /* abrirModal(item); */ });
