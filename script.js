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

// --- API FUNCTIONS ---
const api = {
    // Sincroniza estado de equipos con BaseB (Google Sheets)
    async cargarEquipos() {
        try {
            const response = await fetch(`${SCRIPT_URL}?action=getBaseB`);
            const data = await response.json();

            // Resetear todos los items
            items.forEach(item => Object.assign(item, {
                documento: "", 
                profesor: "", 
                materia: "",
                nombreCompleto: "",
                curso: ""
            }));

            // Procesar registros para encontrar el estado más reciente de cada equipo
            const estadosEquipos = {};
            data?.forEach(fila => {
                // La estructura es: marcaTemporal, equipo, nombreCompleto, documento, curso, profesorEncargado, materia, tipo, comentario
                if (fila.length >= 8) {
                    const numeroEquipo = fila[1]?.toString();
                    const tipo = fila[7]?.toString();
                    const timestamp = fila[0];

                    if (numeroEquipo && tipo) {
                        // Solo guardar el registro más reciente por equipo
                        if (!estadosEquipos[numeroEquipo] || 
                            new Date(timestamp) > new Date(estadosEquipos[numeroEquipo].timestamp)) {
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

            // Solo los equipos que están en "Préstamo"
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

    // Sincroniza consulta de estudiante con BaseA (Google Sheets)
    async buscarEstudiante(documento) {
        try {
            if (!documento || documento.trim() === '') {
                return {encontrado: false, error: 'Documento requerido'};
            }
            const url = `${SCRIPT_URL}?action=getBaseA&documento=${encodeURIComponent(documento)}`;

            const response = await fetch(url);
            if (!response.ok) {
                console.error('Error en la respuesta:', response.status, response.statusText);
                return {encontrado: false, error: 'Error en la respuesta del servidor'};
            }
            const data = await response.json();

            // El endpoint devuelve {encontrado, documento, nombreCompleto, curso} o error
            if (data && data.encontrado) {
                return {
                    nombreCompleto: data.nombreCompleto || 'Sin nombre',
                    documento: data.documento || documento,
                    curso: data.curso || 'Sin curso',
                    encontrado: true
                };
            } else {
                return {encontrado: false, error: data?.error || 'No encontrado'};
            }
        } catch (error) {
            console.error('Error al buscar estudiante:', error);
            return {encontrado: false, error: error.message};
        }
    },

    // Guarda registro de préstamo en BaseB
    async guardarPrestamo(item, datosEstudiante) {
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

        try {
            await fetch(SCRIPT_URL, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datos)
            });
            console.log('Préstamo registrado:', datos);
        } catch (error) {
            console.error("Error al guardar préstamo:", error);
        }
    },

    // Guarda registro de devolución en BaseB
    async guardarDevolucion(item, comentario = '') {
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

        try {
            await fetch(SCRIPT_URL, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datos)
            });
            console.log('Devolución registrada:', datos);
        } catch (error) {
            console.error("Error al guardar devolución:", error);
        }
    }
};


// --- MODAL & UI FUNCTIONS ---
// [Las funciones de UI siguen igual, solo asegúrate que los campos usados coinciden con los datos recibidos/enviados y que las llamadas a api.* usan la estructura de arriba]

// ... [Las funciones crearInput, crearBotones, mostrarModalItem, mostrarModalDesmarcar, actualizarVista, crearGrilla, resetearMalla, cerrarModal, event listeners, etc., se mantienen igual.]

// --- EVENT LISTENERS ---
window.onclick = e => e.target === document.getElementById('modalMetodos') && cerrarModal();
document.addEventListener('keydown', e => e.key === 'Escape' && cerrarModal());
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, iniciando aplicación...');
    api.cargarEquipos();
    setInterval(api.cargarEquipos, 2000);
});
